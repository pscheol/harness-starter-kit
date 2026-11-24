"""Next.js app 라우트와 화면이 부르는 API 를 정적으로 뽑는다.

`src/app/**/page.tsx` 가 화면이다. page 와 같은 경로의 layout 에서 import 를 따라가 닿는 파일을 모으고,
그 파일들의 API 호출 문자열을 operation 으로 바꾼다. 호출 형태는 설정(`api_calls`)이 정한다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

IMPORT_RE = re.compile(r"""(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)""")
OPENAPI_FETCH_RE = re.compile(r"\b\w+\.(GET|POST|PUT|PATCH|DELETE)\(\s*(['\"`])((?:(?!\2).)+)\2", re.S)
LOCAL_TEMPLATE_RE = re.compile(r"(?:const|let)\s+(\w+)\s*=\s*\([^)]*\)\s*(?::\s*\w+\s*)?=>\s*`([^`]*)`")
LOCAL_FUNCTION_RE = re.compile(r"function\s+(\w+)\s*\([^)]*\)\s*(?::\s*\w+\s*)?\{\s*return\s+`([^`]*)`")
LOCAL_STRING_RE = re.compile(r"(?:const|let)\s+(\w+)\s*=\s*['\"`](/[^'\"`$]*)['\"`]")
EXTENSIONS = (".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx")


@dataclass
class ApiCall:
    unit: str
    method: str
    path: str  # 정규화한 operation 경로({} 변수)
    file: str


@dataclass
class Screen:
    unit: str
    route: str
    page: str
    files: list[str] = field(default_factory=list)
    calls: list[ApiCall] = field(default_factory=list)  # 화면 코드에서 닿는 호출(셸 호출 제외)
    shell_calls: list[ApiCall] = field(default_factory=list)  # 같은 경로 layout 에서 닿는 호출


def route_of(page: Path, app_dir: Path) -> str:
    parts = []
    for part in page.parent.relative_to(app_dir).parts:
        if part.startswith("(") and part.endswith(")"):
            continue
        if part.startswith("@"):
            continue
        if part.startswith("[[...") or part.startswith("[..."):
            parts.append("{" + part.strip("[].") + "*}")
        elif part.startswith("["):
            parts.append("{" + part.strip("[]") + "}")
        else:
            parts.append(part)
    return "/" + "/".join(parts) if parts else "/"


def _resolve_import(spec: str, here: Path, src: Path) -> Path | None:
    if spec.startswith("@/"):
        base = src / spec[2:]
    elif spec.startswith("."):
        base = (here.parent / spec).resolve()
    else:
        return None
    if base.is_file():
        return base
    for ext in EXTENSIONS:
        candidate = Path(str(base) + ext)
        if candidate.is_file():
            return candidate
    return None


def reach(entry: list[Path], src: Path) -> list[Path]:
    seen: list[Path] = []
    stack = list(entry)
    visited: set[Path] = set()
    while stack:
        path = stack.pop()
        if path in visited or ".test." in path.name or "/test/" in path.as_posix():
            continue
        visited.add(path)
        seen.append(path)
        text = path.read_text(encoding="utf-8", errors="replace")
        for m in IMPORT_RE.finditer(text):
            target = _resolve_import(m.group(1) or m.group(2), path, src)
            if target is not None and target not in visited:
                stack.append(target)
    return seen


def normalize(path: str) -> str:
    path = path.split("?", 1)[0]
    path = re.sub(r"\$\{[^}]*\}", "{}", path)
    path = re.sub(r"\{[^}/]*\}", "{}", path)
    return re.sub(r"/+", "/", path).rstrip("/") or "/"


def _expand_locals(text: str, template: str) -> str:
    functions = {m.group(1): m.group(2) for m in LOCAL_TEMPLATE_RE.finditer(text)}
    functions |= {m.group(1): m.group(2) for m in LOCAL_FUNCTION_RE.finditer(text)}
    strings = {m.group(1): m.group(2) for m in LOCAL_STRING_RE.finditer(text)}
    for _ in range(3):
        before = template
        template = re.sub(r"\$\{(\w+)\([^)]*\)\}", lambda m: functions.get(m.group(1), m.group(0)), template)
        template = re.sub(r"\$\{(\w+)\}", lambda m: strings.get(m.group(1), m.group(0)), template)
        if template == before:
            break
    return template


def _call_args(text: str, start: int) -> str:
    depth, i = 0, start
    while i < len(text):
        c = text[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
            if depth < 0:
                return text[start:i]
        i += 1
    return text[start:]


def calls_in(path: Path, rel: str, rules: list[dict]) -> list[ApiCall]:
    text = path.read_text(encoding="utf-8", errors="replace")
    found: list[ApiCall] = []
    for rule in rules:
        if rule["style"] == "openapi-fetch":
            for m in OPENAPI_FETCH_RE.finditer(text):
                raw = m.group(3)
                if raw.startswith("/"):
                    found.append(ApiCall(rule["unit"], m.group(1), normalize(rule.get("prefix", "") + raw), rel))
        elif rule["style"] == "path-call":
            names = "|".join(map(re.escape, rule["functions"]))
            for m in re.finditer(rf"\b(?:{names})(?:<[^>()]*>)?\(\s*(['\"`])((?:(?!\1).)*)\1", text, re.S):
                raw = _expand_locals(text, m.group(2))
                if not raw.startswith("/"):
                    continue
                args = _call_args(text, m.end())
                method = re.search(r"method\s*:\s*['\"](\w+)['\"]", args)
                found.append(ApiCall(rule["unit"], (method.group(1) if method else "GET").upper(), normalize(rule.get("prefix", "") + raw), rel))
    return found


def _collect(files: list[Path], rules: list[dict], repo: Path, cache: dict[Path, list[ApiCall]]) -> list[ApiCall]:
    seen: dict[tuple[str, str, str], ApiCall] = {}
    for f in files:
        if f not in cache:
            cache[f] = calls_in(f, f.relative_to(repo).as_posix(), rules)
        for call in cache[f]:
            seen.setdefault((call.unit, call.method, call.path), call)
    return sorted(seen.values(), key=lambda c: (c.unit, c.path, c.method))


def screens(unit: str, root: Path, rules: list[dict], repo: Path) -> list[Screen]:
    src = root / "src"
    app = src / "app"
    if not app.is_dir():
        return []
    result: list[Screen] = []
    cache: dict[Path, list[ApiCall]] = {}
    for page in sorted(app.rglob("page.tsx")):
        layouts = [p / "layout.tsx" for p in [page.parent, *page.parent.parents] if p.is_relative_to(app) and (p / "layout.tsx").is_file()]
        page_files = reach([page], src)
        shell_files = reach(layouts, src) if layouts else []
        shell = _collect(shell_files, rules, repo, cache)
        shell_keys = {(c.unit, c.method, c.path) for c in shell}
        own = [c for c in _collect(page_files, rules, repo, cache) if (c.unit, c.method, c.path) not in shell_keys]
        result.append(
            Screen(
                unit=unit,
                route=route_of(page, app),
                page=page.relative_to(repo).as_posix(),
                files=sorted(f.relative_to(repo).as_posix() for f in page_files),
                calls=own,
                shell_calls=shell,
            )
        )
    result.sort(key=lambda sc: sc.route)
    return result
