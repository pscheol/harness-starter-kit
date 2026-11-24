#!/usr/bin/env python3
"""v1 lock 첫 update 의 구별 불가 파일 병합(HK-25 R1). update.sh 가 부른다. 설치되지 않는다(플러그인 kns:update 안).

    python3 -B v1_merge.py <설치 경로> <지금 파일 C> <킷 판 D> <결과 파일>

stdout 한 단어: kit(결과 = D) · lines(줄 병합) · keys(키 병합) · new(병합하지 않는다 — 결과를 쓰지 않는다).
표시 줄 없는 v1 lock(v1.0.8)에서 sha(C) = B ≠ sha(D) 인 파일만 넘긴다. 같은 규칙을 CLI core/v1-merge.ts 가 쓴다
(packages/cli/test/fixtures/v1-merge 가 두 구현의 바이트를 묶는다). 표준 라이브러리만 쓴다.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True

MERGE_BEGIN = "<!-- knots-sync: 설치 전 내용(병합) -->"
MERGE_END = "<!-- /knots-sync -->"
KIT_HEADER = "HARNESS STARTER KIT"
KIT_FOLDERS = (".agents/rules/", ".agents/skills/", ".agents/roles/")
HEADER_LINES = 20
MAX_CELLS = 1_000_000


# ── 갈래 ─────────────────────────────────────────────────────────────────────


def extension(rel: str) -> str:
    name = rel.rsplit("/", 1)[-1]
    return name[name.rfind("."):].lower() if "." in name else ""


def decode(data: bytes) -> str | None:
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def has_kit_header(text: str) -> bool:
    return any(KIT_HEADER in line for line in text.split("\n")[:HEADER_LINES])


def plan(rel: str, current: bytes, kit: bytes) -> tuple[str, bytes | None]:
    """design §2.2 의 갈래. (종류, 결과 바이트) — new 면 결과가 없다."""
    if rel.startswith(KIT_FOLDERS):
        return "kit", kit
    ext = extension(rel)
    if ext in (".md", ".txt"):
        text = decode(current)
        if text is not None and has_kit_header(text):
            return "kit", kit
        merged = merge_lines(current, kit)
        return ("lines", merged) if merged is not None else ("new", None)
    if ext == ".json":
        merged = merge_json(current, kit)
        return ("keys", merged) if merged is not None else ("new", None)
    return "new", None


# ── 줄 병합(design §2.3) ─────────────────────────────────────────────────────


def significant(line: str) -> bool:
    return any(("A" <= ch <= "Z") or ("a" <= ch <= "z") or ("0" <= ch <= "9") or ord(ch) >= 0x80 for ch in line)


def blank(line: str) -> bool:
    return all(ch in " \t\r" for ch in line)


def split_lines(text: str) -> tuple[list[str], bool]:
    lines = text.split("\n")
    if lines[-1] == "":
        return lines[:-1], True
    return lines, False


def lcs_pairs(a: list[str], b: list[str]) -> list[tuple[int, int]] | None:
    """a · b 의 LCS 짝(앞 · 뒤 같은 줄을 먼저 짝짓는다). 칸 수가 MAX_CELLS 를 넘으면 None."""
    head = 0
    while head < len(a) and head < len(b) and a[head] == b[head]:
        head += 1
    tail = 0
    while tail < len(a) - head and tail < len(b) - head and a[len(a) - 1 - tail] == b[len(b) - 1 - tail]:
        tail += 1
    mid_a = a[head:len(a) - tail]
    mid_b = b[head:len(b) - tail]
    n, m = len(mid_a), len(mid_b)
    if n * m > MAX_CELLS:
        return None
    pairs = [(i, i) for i in range(head)]
    if n and m:
        table = [[0] * (m + 1) for _ in range(n + 1)]
        for i in range(n - 1, -1, -1):
            row, below = table[i], table[i + 1]
            x = mid_a[i]
            for j in range(m - 1, -1, -1):
                row[j] = below[j + 1] + 1 if x == mid_b[j] else (below[j] if below[j] >= row[j + 1] else row[j + 1])
        i = j = 0
        while i < n and j < m:
            if mid_a[i] == mid_b[j]:
                pairs.append((head + i, head + j))
                i += 1
                j += 1
            elif table[i + 1][j] >= table[i][j + 1]:
                i += 1
            else:
                j += 1
    pairs += [(len(a) - tail + k, len(b) - tail + k) for k in range(tail)]
    return pairs


def frontmatter_end(lines: list[str]) -> int:
    if not lines or lines[0] != "---":
        return 0
    for k in range(1, len(lines)):
        if lines[k] == "---":
            return k + 1
    return 0


def merge_lines(current: bytes, kit: bytes) -> bytes | None:
    c_text, d_text = decode(current), decode(kit)
    if c_text is None or d_text is None:
        return None
    c, _ = split_lines(c_text)
    d, eol = split_lines(d_text)
    in_c = {line for line in c if significant(line)}
    in_d = {line for line in d if significant(line)}
    ca = [i for i, line in enumerate(c) if line in in_d]
    da = [j for j, line in enumerate(d) if line in in_c]
    pairs = lcs_pairs([c[i] for i in ca], [d[j] for j in da])
    if pairs is None:
        return None
    anchors = [(ca[x], da[y]) for x, y in pairs]
    fm_end = frontmatter_end(d)
    blocks: list[tuple[int, list[str]]] = []
    prev_c = -1
    for k in range(len(anchors) + 1):
        next_c, next_d = anchors[k] if k < len(anchors) else (len(c), len(d))
        run = [line for line in c[prev_c + 1:next_c] if not (significant(line) and line in in_d)]
        if any(significant(line) for line in run):
            while run and blank(run[0]):
                run.pop(0)
            while run and blank(run[-1]):
                run.pop()
            blocks.append((max(next_d, fm_end), run))
        prev_c = next_c
    out: list[str] = []
    bi = 0
    for p in range(len(d) + 1):
        while bi < len(blocks) and blocks[bi][0] == p:
            out += [MERGE_BEGIN, *blocks[bi][1], MERGE_END]
            bi += 1
        if p < len(d):
            out.append(d[p])
    return ("\n".join(out) + ("\n" if eol else "")).encode("utf-8")


# ── 키 병합(design §2.4) ─────────────────────────────────────────────────────


class Raw(str):
    """숫자 원래 글자."""


class Obj:
    def __init__(self, pairs: list[tuple[str, object]]):
        self.pairs = pairs


class Bad(ValueError):
    pass


def _obj(pairs: list[tuple[str, object]]) -> Obj:
    keys = [k for k, _ in pairs]
    if len(set(keys)) != len(keys):
        raise Bad("같은 키")
    return Obj(pairs)


def _constant(name: str) -> object:
    raise Bad(name)


def _check_str(s: str) -> None:
    try:
        s.encode("utf-8")
    except UnicodeEncodeError as err:
        raise Bad("짝 없는 서로게이트") from err


def _walk_strings(v: object) -> None:
    if isinstance(v, Obj):
        for k, x in v.pairs:
            _check_str(k)
            _walk_strings(x)
    elif isinstance(v, list):
        for x in v:
            _walk_strings(x)
    elif isinstance(v, str) and not isinstance(v, Raw):
        _check_str(v)


def parse_json(data: bytes) -> Obj | None:
    text = decode(data)
    if text is None:
        return None
    try:
        v = json.loads(text, object_pairs_hook=_obj, parse_int=Raw, parse_float=Raw, parse_constant=_constant)
        _walk_strings(v)
    except (ValueError, RecursionError):
        return None
    return v if isinstance(v, Obj) else None


def merge_obj(c: Obj, d: Obj) -> tuple[Obj, bool]:
    """(결과, 사람 키가 있었나)."""
    c_map = dict(c.pairs)
    d_keys = {k for k, _ in d.pairs}
    out: list[tuple[str, object]] = []
    extra = False
    for k, dv in d.pairs:
        cv = c_map.get(k)
        if isinstance(cv, Obj) and isinstance(dv, Obj):
            merged, more = merge_obj(cv, dv)
            out.append((k, merged))
            extra = extra or more
        else:
            out.append((k, dv))
    for k, cv in c.pairs:
        if k not in d_keys:
            out.append((k, cv))
            extra = True
    return Obj(out), extra


def dump(v: object, level: int = 0) -> str:
    pad = "  " * (level + 1)
    end = "  " * level
    if isinstance(v, Obj):
        if not v.pairs:
            return "{}"
        body = ",\n".join(f"{pad}{json.dumps(k, ensure_ascii=False)}: {dump(x, level + 1)}" for k, x in v.pairs)
        return "{\n" + body + "\n" + end + "}"
    if isinstance(v, list):
        if not v:
            return "[]"
        return "[\n" + ",\n".join(pad + dump(x, level + 1) for x in v) + "\n" + end + "]"
    if isinstance(v, Raw):
        return str(v)
    if v is True:
        return "true"
    if v is False:
        return "false"
    if v is None:
        return "null"
    return json.dumps(v, ensure_ascii=False)


def merge_json(current: bytes, kit: bytes) -> bytes | None:
    c, d = parse_json(current), parse_json(kit)
    if c is None or d is None:
        return None
    merged, extra = merge_obj(c, d)
    if not extra:
        return kit
    return (dump(merged) + "\n").encode("utf-8")


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print("사용: v1_merge.py <설치 경로> <지금 파일> <킷 판> <결과 파일>", file=sys.stderr)
        return 2
    rel, current, kit, out = argv
    kind, data = plan(rel, Path(current).read_bytes(), Path(kit).read_bytes())
    if data is not None:
        Path(out).write_bytes(data)
    print(kind)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
