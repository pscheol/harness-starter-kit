"""Kotlin 소스 색인과 operation 호출 경로 추적. 정적 분석 근사다.

주석과 문자열 내용을 공백으로 가린 사본(masked)에서 괄호 짝을 맞춰 클래스·메서드 본문을 자르고,
문자열 리터럴은 원문에서 읽는다. 생성자 주입 필드의 메서드 호출을 따라가며, 인터페이스면 같은 단위의 구현으로 넘어간다.
본문이 참조하는 엔티티(@Table)·리포지터리·문자열 속 `schema.table` 이 테이블이고, 캐시 어노테이션과 `CacheNames.X` 가 캐시다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

MAPPING_METHODS = {
    "GetMapping": "GET",
    "PostMapping": "POST",
    "PutMapping": "PUT",
    "PatchMapping": "PATCH",
    "DeleteMapping": "DELETE",
}
REPOSITORY_BASES = {
    "JpaRepository",
    "CrudRepository",
    "ListCrudRepository",
    "PagingAndSortingRepository",
    "ListPagingAndSortingRepository",
    "Repository",
    "JpaSpecificationExecutor",
}
CACHE_ANNOTATIONS = {"Cacheable", "CacheEvict", "CachePut"}
MEMBER_START = re.compile(
    r"(?:@|fun\b|val\b|var\b|override\b|private\b|public\b|internal\b|protected\b|open\b|abstract\b|suspend\b|inline\b"
    r"|operator\b|companion\b|class\b|object\b|interface\b|init\b|constructor\b|data\b|enum\b|lateinit\b|const\b|\})"
)
CONTINUATION_END = (".", "+", "-", "*", "/", "=", "(", ",", "?:", "&&", "||", "->", "?", ":", "[", "{")
CONTINUATION_START = (".", "?.", "?:", "+", "-", "*", "/", "&&", "||", ")", "]", "->", "as ", "as?", "?", ":")
CLASS_RE = re.compile(
    r"((?:(?:public|private|internal|protected|abstract|open|sealed|data|enum|annotation|inner|value|final|fun|expect|actual)\s+)*)"
    r"\b(class|interface|object)\s+([A-Za-z_]\w*)"
)
FUN_RE = re.compile(r"\bfun\s+(?:<[^>{}()]*>\s*)?(?:([\w.<>?, ]+?)\.)?([A-Za-z_]\w*|`[^`\n]+`)\s*\(")
PROPERTY_RE = re.compile(r"\b(?:val|var)\s+([A-Za-z_]\w*)\s*:\s*([A-Za-z_][\w.]*)")
PROPERTY_CALL_RE = re.compile(r"\b(?:val|var)\s+([A-Za-z_]\w*)\s*=\s*([A-Z]\w*)\s*\(")
FIELD_CALL_RE = re.compile(r"(?<![\w.])(?:this\s*\.\s*)?([a-z_]\w*)\s*\??\.\s*([a-zA-Z_]\w*)\s*(?:\(|\{)")
STATIC_CALL_RE = re.compile(r"(?<![\w.])([A-Z]\w*)\s*\.\s*([a-z_]\w*)\s*\(")
BARE_CALL_RE = re.compile(r"(?<![\w.:])([a-z_]\w*)\s*\(")
CONST_REF_RE = re.compile(r"(?<![\w.])([A-Z]\w*)\s*\.\s*([A-Z_][A-Z0-9_]*)\b")
IDENT_RE = re.compile(r"\b[A-Z]\w*")
WRITE_RE = re.compile(
    r"\b(persist|merge|remove|executeUpdate|batchUpdate|deleteFrom|insertInto|save\w*|delete\w*|insert\w*|update\w*|upsert\w*)\s*\("
)
SQL_WRITE_RE = re.compile(r"\b(insert\s+into|update|delete\s+from|merge\s+into)\b", re.IGNORECASE)
TABLE_REF_RE = re.compile(r"\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b")
REPO_WRITE_PREFIXES = ("save", "delete", "remove", "insert", "update", "flush")
CLIENT_TYPES = {"RestClient", "WebClient", "RestTemplate", "HttpClient"}
KEYWORDS = {
    "if", "when", "for", "while", "return", "throw", "catch", "try", "fun", "super", "this", "listOf", "setOf", "mapOf",
    "require", "check", "error", "println", "emptyList", "emptySet", "emptyMap", "let", "also", "apply", "run", "with",
    "takeIf", "takeUnless", "repeat", "lazy", "requireNotNull", "checkNotNull", "mutableListOf", "mutableMapOf",
    "mutableSetOf", "buildList", "buildMap", "buildSet", "arrayOf", "sequenceOf", "maxOf", "minOf", "to", "use",
}


# ───────────────────────────── 가리기 ─────────────────────────────


def _skip_template(text: str, i: int) -> int:
    """`${` 바로 뒤에서 시작해 짝이 맞는 `}` 다음 위치를 돌려준다. 안쪽 문자열도 건너뛴다."""
    depth, n = 1, len(text)
    while i < n and depth:
        c = text[i]
        if c == '"':
            i = _raw_string_end(text, i + 3) if text.startswith('"""', i) else _string_end(text, i + 1)
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        i += 1
    return i


def _string_end(text: str, i: int) -> int:
    n = len(text)
    while i < n:
        c = text[i]
        if c == "\\":
            i += 2
            continue
        if c == '"':
            return i + 1
        if c == "\n":
            return i
        if text.startswith("${", i):
            i = _skip_template(text, i + 2)
            continue
        i += 1
    return n


def _raw_string_end(text: str, i: int) -> int:
    n = len(text)
    while i < n:
        if text.startswith('"""', i):
            j = i + 3
            while j < n and text[j] == '"':
                j += 1
            return j
        if text.startswith("${", i):
            i = _skip_template(text, i + 2)
            continue
        i += 1
    return n


CHAR_LITERAL = re.compile(r"'(?:\\u[0-9a-fA-F]{4}|\\.|[^'\\\n])'")


def mask(text: str) -> tuple[str, list[tuple[int, int]]]:
    """주석·문자열 내용을 공백으로 바꾼 사본과 문자열 내용 구간 목록. 길이와 줄 위치는 원문과 같다."""
    out = list(text)
    strings: list[tuple[int, int]] = []
    i, n = 0, len(text)

    def blank(a: int, b: int) -> None:
        for k in range(a, min(b, n)):
            if out[k] != "\n":
                out[k] = " "

    while i < n:
        c = text[i]
        if c == "/" and text.startswith("//", i):
            j = text.find("\n", i)
            j = n if j < 0 else j
            blank(i, j)
            i = j
        elif c == "/" and text.startswith("/*", i):
            depth, j = 1, i + 2
            while j < n and depth:
                if text.startswith("/*", j):
                    depth, j = depth + 1, j + 2
                elif text.startswith("*/", j):
                    depth, j = depth - 1, j + 2
                else:
                    j += 1
            blank(i, j)
            i = j
        elif text.startswith('"""', i):
            j = _raw_string_end(text, i + 3)
            strings.append((i + 3, max(i + 3, j - 3)))
            blank(i + 3, j - 3)
            i = j
        elif c == '"':
            j = _string_end(text, i + 1)
            strings.append((i + 1, max(i + 1, j - 1)))
            blank(i + 1, j - 1)
            i = j
        elif c == "'":
            m = CHAR_LITERAL.match(text, i)
            if m:
                blank(i + 1, m.end() - 1)
                i = m.end()
            else:
                i += 1
        else:
            i += 1
    return "".join(out), strings


def _match_brace(masked: str, start: int, open_c: str = "{", close_c: str = "}") -> int:
    """`start` 가 여는 괄호일 때 짝이 되는 닫는 괄호의 위치. 없으면 끝."""
    depth = 0
    for i in range(start, len(masked)):
        c = masked[i]
        if c == open_c:
            depth += 1
        elif c == close_c:
            depth -= 1
            if depth == 0:
                return i
    return len(masked) - 1


def _split_top(text: str) -> list[str]:
    """괄호·꺾쇠 밖의 쉼표로 나눈다."""
    parts, depth, cur = [], 0, []
    for c in text:
        if c in "([<{":
            depth += 1
        elif c in ")]>}":
            depth -= 1
        if c == "," and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(c)
    if "".join(cur).strip():
        parts.append("".join(cur))
    return parts


# ───────────────────────────── 색인 ─────────────────────────────


@dataclass
class Annotation:
    name: str
    args: str  # 원문 괄호 안(없으면 "")
    strings: list[str]


@dataclass
class KMethod:
    name: str
    annotations: list[Annotation]
    body: str  # masked
    literals: list[str]
    line: int
    abstract: bool


@dataclass
class KClass:
    fqcn: str
    name: str
    package: str
    kind: str
    modifiers: str
    file: str
    line: int
    annotations: list[Annotation] = field(default_factory=list)
    supertypes: list[tuple[str, str]] = field(default_factory=list)  # (해석한 이름, 꺾쇠 안 원문)
    fields: dict[str, str] = field(default_factory=dict)
    methods: dict[str, list[KMethod]] = field(default_factory=dict)
    consts: dict[str, str] = field(default_factory=dict)
    flags: set[str] = field(default_factory=set)

    def annotation(self, name: str) -> Annotation | None:
        return next((a for a in self.annotations if a.name == name), None)

    @property
    def is_abstract(self) -> bool:
        return self.kind == "interface" or "abstract" in self.modifiers


@dataclass
class Endpoint:
    method: str
    path: str
    cls: str
    function: str
    file: str
    line: int


@dataclass
class KotlinIndex:
    root: Path
    classes: dict[str, KClass] = field(default_factory=dict)
    by_simple: dict[str, list[str]] = field(default_factory=dict)
    impls: dict[str, list[str]] = field(default_factory=dict)
    entities: dict[str, str] = field(default_factory=dict)  # 엔티티 fqcn → schema.table
    repositories: dict[str, str] = field(default_factory=dict)  # 리포지터리 fqcn → 엔티티 fqcn
    consts: dict[str, str] = field(default_factory=dict)  # "Obj.NAME" → 값
    functions: dict[str, list[KMethod]] = field(default_factory=dict)  # 최상위·확장 함수
    write_functions: set[str] = field(default_factory=set)
    versioned: set[str] = field(default_factory=set)  # @Version 칸이 있는 엔티티 fqcn

    def simple(self, name: str) -> list[KClass]:
        return [self.classes[f] for f in self.by_simple.get(name, [])]


def _annotations(orig: str, masked: str, start: int, end: int) -> list[Annotation]:
    found: list[Annotation] = []
    i = start
    while True:
        i = masked.find("@", i, end)
        if i < 0:
            break
        m = re.match(r"@(?:\w+:)?([\w.]+)", masked[i:end])
        if not m:
            i += 1
            continue
        name = m.group(1).split(".")[-1]
        j = i + m.end()
        k = j
        while k < end and masked[k] in " \t":
            k += 1
        args = ""
        if k < end and masked[k] == "(":
            close = _match_brace(masked, k, "(", ")")
            args = orig[k + 1 : close]
            j = close + 1
        found.append(Annotation(name, args, re.findall(r'"((?:[^"\\]|\\.)*)"', args)))
        i = j
    return found


def _depths(masked: str, start: int, end: int) -> list[int]:
    """start..end 각 위치의 중괄호 깊이(start 기준 0)."""
    depth, out = 0, []
    for i in range(start, end):
        c = masked[i]
        if c == "}":
            depth -= 1
        out.append(depth)
        if c == "{":
            depth += 1
    return out


def _next_line_start(masked: str, i: int) -> str:
    j = i + 1
    n = len(masked)
    while j < n:
        k = masked.find("\n", j)
        k = n if k < 0 else k
        line = masked[j:k].strip()
        if line:
            return line
        j = k + 1
    return ""


def _expression_end(masked: str, start: int, limit: int) -> int:
    """`= 식` 본문의 끝. 깊이 0에서 다음 줄이 새 선언으로 시작하면 거기서 끝난다."""
    depth = 0
    i = start
    while i < limit:
        c = masked[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            if depth == 0:
                return i
            depth -= 1
        elif c == "\n" and depth == 0:
            prev = masked[start:i].rstrip()
            nxt = _next_line_start(masked, i)
            if prev and not prev.endswith(CONTINUATION_END) and not nxt.startswith(CONTINUATION_START):
                if not nxt or MEMBER_START.match(nxt):
                    return i
        i += 1
    return limit


def _header(masked: str, pos: int, limit: int) -> tuple[int | None, int | None, int | None, int, int | None]:
    """클래스 이름 뒤 머리를 읽는다. (생성자 시작, 생성자 끝, 상위 형 시작, 머리 끝, 본문 시작)."""
    i = pos
    n = min(limit, len(masked))
    while i < n and masked[i] in " \t":
        i += 1
    if i < n and masked[i] == "<":
        i = _match_brace(masked, i, "<", ">") + 1
    ctor_start = ctor_end = super_start = body = None
    depth = 0
    while i < n:
        c = masked[i]
        if c == "(":
            depth += 1
            if depth == 1 and ctor_start is None and super_start is None:
                ctor_start = i
        elif c == ")":
            depth -= 1
            if depth == 0 and ctor_end is None and ctor_start is not None:
                ctor_end = i
        elif depth == 0:
            if c == "{":
                body = i
                return ctor_start, ctor_end, super_start, i, body
            if c == ":" and super_start is None:
                super_start = i + 1
            if c in "=;}":
                return ctor_start, ctor_end, super_start, i, None
            if c == "\n":
                prev = masked[pos:i].rstrip()
                nxt = _next_line_start(masked, i)
                if not (prev.endswith((",", ":", "(")) or nxt[:1] in (":", ",", "{", ")")):
                    return ctor_start, ctor_end, super_start, i, None
        i += 1
    return ctor_start, ctor_end, super_start, n, None


def _type_base(text: str) -> tuple[str, str]:
    text = text.strip()
    text = re.sub(r"\s+by\s+.*$", "", text, flags=re.S)
    generics = ""
    if "<" in text:
        generics = text[text.index("<") + 1 : text.rindex(">")] if ">" in text else ""
        text = text[: text.index("<")]
    text = re.sub(r"\(.*$", "", text, flags=re.S).strip().rstrip("?")
    return text, generics


class _FileContext:
    def __init__(self, package: str, imports: dict[str, str]):
        self.package = package
        self.imports = imports


def _parse_file(path: Path, rel: str, index: KotlinIndex, pending: list[tuple[KClass, _FileContext, list]]) -> None:
    orig = path.read_text(encoding="utf-8", errors="replace")
    masked, string_spans = mask(orig)
    pkg_m = re.search(r"^\s*package\s+([\w.]+)", masked, re.M)
    package = pkg_m.group(1) if pkg_m else ""
    imports: dict[str, str] = {}
    for m in re.finditer(r"^\s*import\s+([\w.]+)(?:\s+as\s+(\w+))?", masked, re.M):
        fq = m.group(1)
        imports[m.group(2) or fq.split(".")[-1]] = fq
    ctx = _FileContext(package, imports)
    line_starts = [0] + [i + 1 for i, c in enumerate(orig) if c == "\n"]

    def line_of(pos: int) -> int:
        lo, hi = 0, len(line_starts) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if line_starts[mid] <= pos:
                lo = mid
            else:
                hi = mid - 1
        return lo + 1

    def literals(start: int, end: int) -> list[str]:
        return [orig[a:b] for a, b in string_spans if a >= start and b <= end]

    decls = []
    for m in CLASS_RE.finditer(masked):
        before = masked[: m.start(2)].rstrip()
        if before.endswith("::") or before.endswith("."):
            continue
        if re.search(r"\bcompanion\s*$", masked[max(0, m.start(2) - 20) : m.start(2)]):
            continue
        decls.append(m)

    spans: list[tuple[int, int, KClass]] = []
    for m in decls:
        name = m.group(3)
        kind = m.group(2)
        ctor_s, ctor_e, sup_s, head_end, body = _header(masked, m.end(), len(masked))
        body_end = _match_brace(masked, body) if body is not None else head_end
        outer = [s for s in spans if s[0] < m.start() < s[1]]
        fq_prefix = outer[-1][2].fqcn if outer else package
        fqcn = f"{fq_prefix}.{name}" if fq_prefix else name
        win_start = max(
            [masked.rfind(c, 0, m.start()) for c in ("}", ";", "{")]
            + [mm.end() for mm in re.finditer(r"^\s*(?:import|package)\s+[\w.]+.*$", masked[: m.start()], re.M)]
            + [0]
        )
        cls = KClass(
            fqcn=fqcn,
            name=name,
            package=package,
            kind=kind,
            modifiers=m.group(1) or "",
            file=rel,
            line=line_of(m.start(2)),
            annotations=_annotations(orig, masked, win_start, m.start()),
        )
        params = []
        if ctor_s is not None and ctor_e is not None:
            for part in _split_top(masked[ctor_s + 1 : ctor_e]):
                pm = re.search(r"\b(val|var)\s+([A-Za-z_]\w*)\s*:\s*([^=]+)", part)
                if pm:
                    params.append((pm.group(2), _type_base(pm.group(3))[0]))
        sup_text = ""
        if sup_s is not None:
            sup_text = masked[sup_s : body if body is not None else head_end]
        supers = [_type_base(p) for p in _split_top(sup_text) if p.strip()]
        if re.search(r"@Version\b", masked[m.start() : body_end + 1]):
            cls.flags.add("version")
        spans.append((body if body is not None else m.start(), body_end, cls))
        pending.append((cls, ctx, [params, supers]))
        if body is None:
            continue
        _members(orig, masked, body, body_end, cls, literals, line_of)
        for cm in re.finditer(r"\bcompanion\s+object\b[^{\n]*\{", masked[body:body_end]):
            cstart = body + cm.end() - 1
            cend = _match_brace(masked, cstart)
            _members(orig, masked, cstart, cend, cls, literals, line_of)

    top = KClass(fqcn=f"{package}.<file:{path.name}>", name=f"<{path.name}>", package=package, kind="file", modifiers="", file=rel, line=1)
    _members(orig, masked, -1, len(masked), top, literals, line_of)
    for fname, methods in top.methods.items():
        index.functions.setdefault(fname, []).extend(m for m in methods if not m.abstract)
    for m in re.finditer(r"\bconst\s+val\s+([A-Z_][A-Z0-9_]*)\s*(?::\s*String)?\s*=\s*((?:[A-Z]\w*\.)?[A-Z_][A-Z0-9_]*)\s*$", masked, re.M):
        owner = [sp for sp in spans if sp[0] < m.start() < sp[1]]
        if owner:
            owner[-1][2].consts[m.group(1)] = "@ref:" + m.group(2)
    for m in re.finditer(r"\bconst\s+val\s+([A-Z_][A-Z0-9_]*)\s*(?::\s*String)?\s*=\s*\"", masked):
        q = m.end() - 1
        end = _string_end(orig, q + 1)
        value = orig[q + 1 : end - 1]
        owner = [s for s in spans if s[0] < m.start() < s[1]]
        if owner:
            owner[-1][2].consts[m.group(1)] = value
            index.consts[f"{owner[-1][2].name}.{m.group(1)}"] = value
        index.consts.setdefault(m.group(1), value)


def _members(orig, masked, body, body_end, cls: KClass, literals, line_of) -> None:
    depths = _depths(masked, body + 1, body_end)

    def depth_at(pos: int) -> int:
        return depths[pos - body - 1] if body + 1 <= pos < body_end else -1

    for pm in PROPERTY_RE.finditer(masked, body + 1, body_end):
        if depth_at(pm.start()) == 0:
            cls.fields.setdefault(pm.group(1), pm.group(2).split(".")[-1])
    for pm in PROPERTY_CALL_RE.finditer(masked, body + 1, body_end):
        if depth_at(pm.start()) == 0:
            cls.fields.setdefault(pm.group(1), pm.group(2))
    prev_end = body + 1
    for fm in FUN_RE.finditer(masked, body + 1, body_end):
        if depth_at(fm.start()) != 0:
            continue
        name = fm.group(2).strip("`")
        p_open = fm.end() - 1
        p_close = _match_brace(masked, p_open, "(", ")")
        i = p_close + 1
        abstract = True
        b_start = b_end = i
        depth = 0
        while i < body_end:
            c = masked[i]
            if c in "(<":
                depth += 1
            elif c in ")>":
                depth -= 1 if not (c == ">" and masked[i - 1] == "-") else 0
            elif depth <= 0:
                if c == "{":
                    b_start, b_end, abstract = i, _match_brace(masked, i), False
                    break
                if c == "=":
                    b_start, b_end, abstract = i, _expression_end(masked, i + 1, body_end), False
                    break
                if c == "\n":
                    nxt = _next_line_start(masked, i)
                    prev = masked[p_close:i].rstrip()
                    if not prev.endswith((":", ",")) and (not nxt or MEMBER_START.match(nxt)):
                        break
                if c == "}":
                    break
            i += 1
        anns = _annotations(orig, masked, prev_end, fm.start())
        method = KMethod(
            name=name,
            annotations=anns,
            body=masked[p_open : b_end + 1] if not abstract else masked[p_open : p_close + 1],
            literals=literals(p_open, b_end + 1) if not abstract else [],
            line=line_of(fm.start()),
            abstract=abstract,
        )
        cls.methods.setdefault(name, []).append(method)
        prev_end = max(b_end + 1, p_close + 1)


def _expand_consts(index: KotlinIndex, pending: list) -> None:
    """상수 값 속 `$NAME`·`${Obj.NAME}` 과 다른 상수를 가리키는 상수를 펼친다(네 번까지)."""
    pattern = re.compile(r"\$\{(?:([A-Z]\w*)\.)?([A-Z_][A-Z0-9_]*)\}|\$(?:([A-Z]\w*)\.)?([A-Z_][A-Z0-9_]*)")
    owners = {cls.name: cls for cls, _, _ in pending}

    def lookup(owner: str | None, key: str, here: KClass | None) -> str | None:
        if owner:
            return index.consts.get(f"{owner}.{key}")
        if here is not None and key in here.consts:
            return here.consts[key]
        return index.consts.get(key)

    for _ in range(4):
        changed = False
        for cls in owners.values():
            for key, value in list(cls.consts.items()):
                ref = re.fullmatch(r"@ref:(?:([A-Z]\w*)\.)?([A-Z_][A-Z0-9_]*)", value)
                if ref:
                    found = lookup(ref.group(1), ref.group(2), cls)
                    new = found if found is not None and not found.startswith("@ref:") else value
                else:
                    new = pattern.sub(lambda m: lookup(m.group(1) or m.group(3), m.group(2) or m.group(4), cls) or m.group(0), value)
                if new != value:
                    cls.consts[key] = new
                    index.consts[f"{cls.name}.{key}"] = new
                    if index.consts.get(key) == value:
                        index.consts[key] = new
                    changed = True
        if not changed:
            break


def _resolve(name: str, ctx: _FileContext, index: KotlinIndex) -> str:
    if "." in name:
        head = name.split(".")[0]
        if head in ctx.imports:
            return ctx.imports[head] + name[len(head) :]
        return name
    if name in ctx.imports:
        return ctx.imports[name]
    local = f"{ctx.package}.{name}" if ctx.package else name
    if local in index.classes:
        return local
    candidates = index.by_simple.get(name, [])
    if len(candidates) == 1:
        return candidates[0]
    return name


def index_sources(root: Path, source_dirs: list[Path] | None = None) -> KotlinIndex:
    """root 아래 `src/main/kotlin` 의 .kt 를 모두 읽는다(테스트·빌드 산출물 제외)."""
    index = KotlinIndex(root=root)
    pending: list[tuple[KClass, _FileContext, list]] = []
    files: list[Path] = []
    for base in source_dirs or [root]:
        for path in sorted(base.rglob("*.kt")):
            parts = path.parts
            if "test" in parts or "build" in parts or ".gradle" in parts or "testFixtures" in parts:
                continue
            if "main" not in parts:
                continue
            files.append(path)
    for path in files:
        _parse_file(path, path.relative_to(root).as_posix(), index, pending)
    _expand_consts(index, pending)
    for cls, _, _ in pending:
        index.classes[cls.fqcn] = cls
        index.by_simple.setdefault(cls.name, []).append(cls.fqcn)
    for cls, ctx, (params, supers) in pending:
        for pname, ptype in params:
            cls.fields[pname] = ptype
        cls.fields = {k: _resolve(v, ctx, index) for k, v in cls.fields.items()}
        cls.supertypes = [(_resolve(base, ctx, index), generics) for base, generics in supers if base]
        for base, _ in cls.supertypes:
            index.impls.setdefault(base, []).append(cls.fqcn)
        table = cls.annotation("Table")
        if cls.annotation("Entity") and table:
            schema = re.search(r'schema\s*=\s*"([^"]+)"', table.args)
            tname = re.search(r'name\s*=\s*"([^"]+)"', table.args)
            if tname:
                index.entities[cls.fqcn] = f"{schema.group(1)}.{tname.group(1)}" if schema else tname.group(1)
        if cls.annotation("Entity") and "version" in cls.flags:
            index.versioned.add(cls.fqcn)
        for base, generics in cls.supertypes:
            if base.split(".")[-1] in REPOSITORY_BASES and generics:
                entity = _resolve(_type_base(_split_top(generics)[0])[0], ctx, index)
                index.repositories[cls.fqcn] = entity
    index.write_functions = {n for n, ms in index.functions.items() if any(WRITE_RE.search(m.body) for m in ms)}
    for _ in range(4):
        if not index.write_functions:
            break
        calls = re.compile(r"\b(?:" + "|".join(map(re.escape, sorted(index.write_functions))) + r")\s*[({]")
        more = {n for n, ms in index.functions.items() if n not in index.write_functions and any(calls.search(m.body) for m in ms)}
        if not more:
            break
        index.write_functions |= more
    return index


# ───────────────────────────── 컨트롤러 ─────────────────────────────


def _resolve_path_expr(text: str, cls: KClass, index: KotlinIndex) -> str:
    """경로 문자열의 `$NAME`·`${NAME}`·`${Obj.NAME}` 을 상수 값으로 바꾼다. 모르면 `{NAME}` 으로 둔다."""

    def const(m: re.Match) -> str:
        owner, key = m.group(1) or m.group(3), m.group(2) or m.group(4)
        if owner:
            value = index.consts.get(f"{owner}.{key}")
            if value is not None:
                return value
        return cls.consts.get(key) or index.consts.get(key, "{" + key + "}")

    return re.sub(r"\$\{(?:([A-Z]\w*)\.)?([A-Z_][A-Z0-9_]*)\}|\$(?:([A-Z]\w*)\.)?([A-Z_][A-Z0-9_]*)", const, text)


def _mapping_paths(ann: Annotation, cls: KClass, index: KotlinIndex) -> list[str]:
    paths: list[str] = []
    for part in _split_top(ann.args):
        part = part.strip()
        named = re.match(r"(\w+)\s*=\s*(.*)$", part, re.S)
        key, value = (named.group(1), named.group(2)) if named else ("value", part)
        if key not in ("value", "path"):
            continue
        strs = re.findall(r'"((?:[^"\\]|\\.)*)"', value)
        if strs:
            paths.extend(_resolve_path_expr(s, cls, index) for s in strs)
        else:
            for ref in re.findall(r"([A-Z]\w*)\.([A-Z_][A-Z0-9_]*)", value):
                paths.append(index.consts.get(f"{ref[0]}.{ref[1]}", "{?}"))
    return paths or [""]


def _request_methods(ann: Annotation) -> list[str]:
    if ann.name in MAPPING_METHODS:
        return [MAPPING_METHODS[ann.name]]
    found = re.findall(r"RequestMethod\.(\w+)", ann.args)
    return found or ["GET", "POST", "PUT", "PATCH", "DELETE"]


def join_path(base: str, sub: str) -> str:
    path = "/" + "/".join(p for p in (base.strip("/"), sub.strip("/")) if p)
    return re.sub(r"/+", "/", path)


def normalize_path(path: str) -> str:
    path = re.sub(r"\{[^}/]*\}", "{}", path)
    return path.rstrip("/") or "/"


def _interface_methods(cls: KClass, index: KotlinIndex, name: str) -> list[KMethod]:
    out: list[KMethod] = []
    seen: set[str] = set()
    stack = [base for base, _ in cls.supertypes]
    while stack:
        fq = stack.pop()
        if fq in seen or fq not in index.classes:
            continue
        seen.add(fq)
        sup = index.classes[fq]
        out.extend(sup.methods.get(name, []))
        stack.extend(base for base, _ in sup.supertypes)
    return out


def endpoints(index: KotlinIndex) -> list[Endpoint]:
    found: list[Endpoint] = []
    for cls in index.classes.values():
        if not (cls.annotation("RestController") or cls.annotation("Controller")):
            continue
        base_ann = cls.annotation("RequestMapping")
        if base_ann is None:
            for iface in [index.classes.get(b) for b, _ in cls.supertypes]:
                if iface and iface.annotation("RequestMapping"):
                    base_ann = iface.annotation("RequestMapping")
        bases = _mapping_paths(base_ann, cls, index) if base_ann else [""]
        for name, methods in cls.methods.items():
            for method in methods:
                anns = [a for a in method.annotations if a.name in MAPPING_METHODS or a.name == "RequestMapping"]
                if not anns:
                    for im in _interface_methods(cls, index, name):
                        anns = [a for a in im.annotations if a.name in MAPPING_METHODS or a.name == "RequestMapping"]
                        if anns:
                            break
                for ann in anns:
                    for verb in _request_methods(ann):
                        for base in bases:
                            for sub in _mapping_paths(ann, cls, index):
                                found.append(Endpoint(verb, join_path(base, sub), cls.fqcn, name, cls.file, method.line))
    found.sort(key=lambda e: (e.path, e.method, e.cls, e.function))
    return found


# ───────────────────────────── 호출 경로 ─────────────────────────────


@dataclass
class CacheUse:
    name: str
    operation: str
    key: str
    where: str


@dataclass
class LockUse:
    kind: str  # pessimistic | optimistic | advisory | skip-locked
    detail: str
    where: str


@dataclass
class Trace:
    tables: dict[str, set[str]] = field(default_factory=dict)
    caches: list[CacheUse] = field(default_factory=list)
    clients: list[str] = field(default_factory=list)
    workflows: list[str] = field(default_factory=list)
    locks: list[LockUse] = field(default_factory=list)
    calls: list[tuple[str, str, str]] = field(default_factory=list)  # (호출 클래스, 대상 클래스, 메서드)
    table_sites: list[tuple[str, str, str]] = field(default_factory=list)  # (클래스, 테이블, R|W)
    visited: list[str] = field(default_factory=list)
    events: list[tuple[str, str, str, str]] = field(default_factory=list)  # 방문 순서: (call|table|cache, 주체, 대상, 내용)

    def add_table(self, table: str, mode: str, where: str) -> None:
        self.tables.setdefault(table, set()).add(mode)
        site = (where, table, mode)
        if site not in self.table_sites:
            self.table_sites.append(site)
            self.events.append(("table", where, table, mode))

    def add_call(self, caller: str, callee: str, method: str) -> None:
        call = (caller, callee, method)
        if call not in self.calls:
            self.calls.append(call)
            self.events.append(("call", caller, callee, method))

    def add_caches(self, uses: list[CacheUse]) -> None:
        for use in uses:
            self.caches.append(use)
            self.events.append(("cache", use.where.split(".")[0], use.name, use.operation))

    def add_lock(self, kind: str, detail: str, where: str) -> None:
        lock = LockUse(kind, detail, where)
        if lock not in self.locks:
            self.locks.append(lock)


def _cache_uses(anns: list[Annotation], index: KotlinIndex, where: str) -> list[CacheUse]:
    uses: list[CacheUse] = []
    for ann in anns:
        if ann.name not in CACHE_ANNOTATIONS:
            continue
        names = [index.consts.get(f"{a}.{b}", index.consts.get(b, b)) for a, b in re.findall(r"(\w+)\.([A-Z_][A-Z0-9_]*)", ann.args)]
        names += re.findall(r'(?:cacheNames|value)\s*=\s*\[\s*"([^"]+)"', ann.args)
        key = re.search(r'key\s*=\s*"((?:[^"\\]|\\.)*)"', ann.args)
        for name in dict.fromkeys(names):
            uses.append(CacheUse(name, ann.name, key.group(1) if key else "", where))
    return uses


def _targets(index: KotlinIndex, fq: str) -> list[KClass]:
    cls = index.classes.get(fq)
    if cls is None:
        return []
    out: list[KClass] = []
    seen: set[str] = set()
    stack = [fq]
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        c = index.classes.get(cur)
        if c is None:
            continue
        if not c.is_abstract or c.methods:
            out.append(c)
        stack.extend(index.impls.get(cur, []))
    if not cls.is_abstract:
        out = [cls] + [c for c in out if c.fqcn != cls.fqcn]
    return out


def _is_client(cls: KClass | None, type_name: str) -> bool:
    simple = type_name.split(".")[-1]
    if simple in CLIENT_TYPES:
        return True
    if cls is None:
        return False
    return cls.name.endswith("Client") and ("client" in cls.package or ".acl" in cls.package)


def _is_mapper(cls: KClass) -> bool:
    """형 변환만 하는 클래스. 엔티티를 참조해도 DB 에 닿지 않는다."""
    return cls.name.endswith(("Mapper", "Mappers")) or ".mapper" in cls.package


def _is_persistence(cls: KClass) -> bool:
    return ".persistence" in cls.package or cls.name.endswith(("PersistenceAdapter", "JdslQueries", "Queries"))


DIRTY_ASSIGN_RE = re.compile(r"(?<![\w.])[a-z]\w*\.(?!lockMode\b|flushMode\b|maxResults\b|firstResult\b)[a-z]\w*\s*(?:=|\+=|-=)(?!=)")
LOCK_PATTERNS = (
    (re.compile(r"\block\s*=\s*true\b"), "pessimistic", "lock = true"),
    (re.compile(r"PESSIMISTIC_(?:WRITE|READ|FORCE_INCREMENT)"), "pessimistic", "LockModeType.PESSIMISTIC"),
    (re.compile(r"OPTIMISTIC(?:_FORCE_INCREMENT)?\b"), "optimistic", "LockModeType.OPTIMISTIC"),
)
SQL_LOCK_PATTERNS = (
    (re.compile(r"\bfor\s+update\s+skip\s+locked\b", re.I), "skip-locked", "FOR UPDATE SKIP LOCKED"),
    (re.compile(r"\bfor\s+(?:no\s+key\s+)?update\b", re.I), "pessimistic", "FOR UPDATE"),
    (re.compile(r"\bpg_(?:try_)?advisory(?:_xact)?_lock\b", re.I), "advisory", "pg_advisory_lock"),
)


def trace(index: KotlinIndex, cls_fqcn: str, method: str, known_tables: set[str] | None = None, max_depth: int = 8) -> Trace:
    """`cls.method` 에서 시작해 닿는 테이블·캐시·외부 호출·잠금을 모은다."""
    result = Trace()
    seen: set[tuple[str, str]] = set()
    tables = known_tables or set(index.entities.values())
    entity_by_simple = {fq.split(".")[-1]: t for fq, t in index.entities.items()}
    versioned = {fq.split(".")[-1] for fq in index.versioned}
    repo_by_simple = {fq.split(".")[-1]: index.entities.get(e) for fq, e in index.repositories.items()}
    write_call = (
        re.compile(r"\b(?:" + "|".join(map(re.escape, sorted(index.write_functions))) + r")\s*[({]") if index.write_functions else None
    )

    def direct_tables(m: KMethod) -> set[str]:
        found = {entity_by_simple[i] for i in IDENT_RE.findall(m.body) if i in entity_by_simple}
        for lit in m.literals:
            for schema, table in TABLE_REF_RE.findall(lit):
                name = f"{schema}.{table}"
                if name in tables:
                    found.add(name)
        return found

    def is_dirty_write(cls: KClass, m: KMethod) -> bool:
        """JPA 변경 감지 쓰기: 영속 어댑터가 잠가 읽은 엔티티 필드에 대입하고 flush 한다."""
        if not _is_persistence(cls) or not DIRTY_ASSIGN_RE.search(m.body):
            return False
        return "flush(" in m.body or bool(re.search(r"\block\s*=\s*true\b", m.body))

    def is_write(cls: KClass, m: KMethod) -> bool:
        if WRITE_RE.search(m.body) or (write_call and write_call.search(m.body)):
            return True
        return is_dirty_write(cls, m)

    def locks(cls: KClass, m: KMethod, where: str, local: set[str]) -> None:
        for pattern, kind, label in LOCK_PATTERNS:
            if pattern.search(m.body):
                result.add_lock(kind, label, where)
        for lit in m.literals:
            for pattern, kind, label in SQL_LOCK_PATTERNS:
                if pattern.search(lit):
                    result.add_lock(kind, label, where)
        for ident in set(IDENT_RE.findall(m.body)) & versioned:
            result.add_lock("optimistic", f"@Version {entity_by_simple[ident]}", where)

    reached_memo: dict[tuple[str, str], set[str]] = {}

    def visit(cls: KClass, name: str, depth: int) -> set[str]:
        """방문하고 이 메서드에서 닿는 테이블 집합을 돌려준다. 이미 본 메서드는 기억한 집합을 돌려준다."""
        key = (cls.fqcn, name)
        if key in seen or depth > max_depth:
            return reached_memo.get(key, set())
        seen.add(key)
        reached: set[str] = set()
        reached_memo[key] = reached
        methods = cls.methods.get(name, [])
        if not methods:
            parent = next((index.classes[b] for b, _ in cls.supertypes if b in index.classes and index.classes[b].kind == "class"), None)
            if parent is not None:
                reached |= visit(parent, name, depth)
            return reached
        where = f"{cls.name}.{name}"
        result.visited.append(where)
        for m in methods:
            result.add_caches(_cache_uses(m.annotations, index, where))
            for im in _interface_methods(cls, index, name):
                result.add_caches(_cache_uses(im.annotations, index, where))
            if m.abstract:
                continue
            writes = is_write(cls, m)
            local_tables = set() if _is_mapper(cls) else direct_tables(m)
            locks(cls, m, where, local_tables)
            from_calls: set[str] = set()
            for sm in STATIC_CALL_RE.finditer(m.body):
                for obj in index.simple(sm.group(1)):
                    if obj.kind == "object" or obj.name == cls.name:
                        if writes and _is_mapper(obj):
                            for om in obj.methods.get(sm.group(2), []):
                                local_tables |= direct_tables(om)
                        if obj.name != cls.name:
                            from_calls |= visit(obj, sm.group(2), depth + 1)
            for table in sorted(local_tables):
                result.add_table(table, "W" if writes else "R", cls.name)
            reached |= local_tables
            for lit in m.literals:
                if SQL_WRITE_RE.search(lit):
                    for schema, table in TABLE_REF_RE.findall(lit):
                        if f"{schema}.{table}" in tables:
                            result.add_table(f"{schema}.{table}", "W", cls.name)
                            reached.add(f"{schema}.{table}")
            for a, b in CONST_REF_RE.findall(m.body):
                if a == "CacheNames":
                    value = index.consts.get(f"{a}.{b}", b)
                    if not any(c.name == value and c.where == where for c in result.caches):
                        result.add_caches([CacheUse(value, "direct", "", where)])
            for wf in re.findall(r"newWorkflowStub\(\s*([A-Z]\w*)::class", m.body):
                if wf not in result.workflows:
                    result.workflows.append(wf)
            for fm in FIELD_CALL_RE.finditer(m.body):
                recv, callee = fm.group(1), fm.group(2)
                ftype = cls.fields.get(recv)
                if not ftype:
                    continue
                if ftype in index.repositories or ftype.split(".")[-1] in repo_by_simple:
                    table = index.entities.get(index.repositories.get(ftype, "")) or repo_by_simple.get(ftype.split(".")[-1])
                    if table:
                        mode = "W" if callee.startswith(REPO_WRITE_PREFIXES) else "R"
                        result.add_table(table, mode, cls.name)
                        from_calls.add(table)
                    repo = index.classes.get(ftype)
                    for rm in repo.methods.get(callee, []) if repo else []:
                        for ann in rm.annotations:
                            if ann.name == "Lock":
                                result.add_lock("pessimistic" if "PESSIMISTIC" in ann.args else "optimistic", "@Lock", f"{repo.name}.{callee}")
                            if ann.name != "Query":
                                continue
                            for text in ann.strings:
                                for schema, tname in TABLE_REF_RE.findall(text):
                                    if f"{schema}.{tname}" in tables:
                                        mode = "W" if SQL_WRITE_RE.search(text) else "R"
                                        result.add_table(f"{schema}.{tname}", mode, repo.name)
                                        from_calls.add(f"{schema}.{tname}")
                    continue
                target_cls = index.classes.get(ftype)
                simple = ftype.split(".")[-1]
                if target_cls is None and simple in CLIENT_TYPES:
                    label = f"{cls.name}({simple})"
                    if label not in result.clients and not _is_client(cls, cls.fqcn):
                        result.clients.append(label)
                    continue
                if _is_client(target_cls, ftype):
                    label = f"{simple}.{callee}"
                    if label not in result.clients:
                        result.clients.append(label)
                if simple == "WorkflowClient":
                    continue
                for target in _targets(index, ftype):
                    if writes and _is_mapper(target):
                        for tm in target.methods.get(callee, []):
                            for table in sorted(direct_tables(tm)):
                                result.add_table(table, "W", cls.name)
                                reached.add(table)
                    if target.methods.get(callee) or any(index.classes.get(b) for b, _ in target.supertypes):
                        if target.methods.get(callee) and not target.is_abstract:
                            result.add_call(cls.name, target.name, callee)
                        from_calls |= visit(target, callee, depth + 1)
            for bm in BARE_CALL_RE.finditer(m.body):
                callee = bm.group(1)
                if callee in KEYWORDS or callee == name and len(methods) == 1:
                    continue
                if callee in cls.methods:
                    from_calls |= visit(cls, callee, depth)
            reached |= from_calls
            if is_dirty_write(cls, m):
                for table in sorted(from_calls):
                    result.add_table(table, "W", cls.name)
        return reached

    start = index.classes.get(cls_fqcn)
    if start is not None:
        visit(start, method, 0)
    return result
