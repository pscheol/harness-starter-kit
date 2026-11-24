"""`.vscode/settings.json` 병합 — `git.detectWorktrees: true` 한 줄(HK-15 design §6, 설계 05 R6.1).

JSONC(주석 · 후행 쉼표 허용)를 다시 쓰지 않고 한 줄만 더하고 뺀다. 다른 키 · 주석 · 들여쓰기는 바이트 그대로 둔다.
결과 모양은 projection_merge 와 같다: merge → {'ok', 'text', 'keys', 'created'}, unmerge → {'ok', 'text', 'empty'}, missing → 키 목록.
TS `packages/cli/src/projection/vscode.ts` 와 같은 바이트를 낸다(시험이 묶는다). 표준 라이브러리만 쓴다.
"""

from __future__ import annotations

import json

KEY = "git.detectWorktrees"
LOCK_KEY = "jsonc:git.detectWorktrees"
LINE_BODY = '"git.detectWorktrees": true'
PUNCT = "{}[],:"
DEFAULT_INDENT = "  "


def want() -> dict:
    return {"key": KEY, "value": "true"}


def fail(reason: str) -> dict:
    return {"ok": False, "reason": reason}


def tokenize(text: str):
    """(토큰 [(종류, 시작, 끝)], 주석이 있는가). 종류는 'str' · 'lit' · 구두점 한 글자. 문법이 틀리면 None."""
    toks, i, n, comment = [], 0, len(text), False
    while i < n:
        c = text[i]
        if c in " \t\r\n﻿":
            i += 1
        elif text.startswith("//", i):
            comment = True
            end = text.find("\n", i)
            i = n if end < 0 else end + 1
        elif text.startswith("/*", i):
            comment = True
            end = text.find("*/", i + 2)
            if end < 0:
                return None
            i = end + 2
        elif c == '"':
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            if j >= n:
                return None
            toks.append(("str", i, j + 1))
            i = j + 1
        elif c in PUNCT:
            toks.append((c, i, i + 1))
            i += 1
        else:
            j = i
            while j < n and text[j] not in " \t\r\n﻿" + PUNCT + '"' and not text.startswith(("//", "/*"), j):
                j += 1
            toks.append(("lit", i, j))
            i = j
    return toks, comment


def scan(text: str):
    """최상위 객체의 구조. 객체가 아니거나 문법이 틀리면 None."""
    tokenized = tokenize(text)
    if tokenized is None:
        return None
    toks, comment = tokenized
    if not toks or toks[0][0] != "{":
        return None
    depth, close = 0, -1
    for index, (kind, _, _) in enumerate(toks):
        if kind in "{[":
            depth += 1
        elif kind in "}]":
            depth -= 1
            if depth == 0:
                close = index
                break
            if depth < 0:
                return None
    if close < 0 or toks[close][0] != "}" or close != len(toks) - 1:
        return None
    members, pos = [], 1
    while pos < close:
        kind, start, end = toks[pos]
        if kind == ",":
            pos += 1
            continue
        if kind != "str" or pos + 2 >= close or toks[pos + 1][0] != ":":
            return None
        try:
            key = json.loads(text[start:end])
        except ValueError:
            return None
        local, j = 0, pos + 2
        while j < close:
            k = toks[j][0]
            if k in "{[":
                local += 1
            elif k in "}]":
                local -= 1
            elif k == "," and local == 0:
                break
            j += 1
        members.append({"key": key, "kidx": pos, "ks": start, "vs": toks[pos + 2][1], "ve": toks[j - 1][2], "jidx": j})
        pos = j
    return {"toks": toks, "comment": comment, "close": close, "members": members}


def find_member(scanned):
    return next((m for m in reversed(scanned["members"]) if m["key"] == KEY), None)


def is_true(text: str, member) -> bool:
    return text[member["vs"]:member["ve"]] == "true"


def line_start(text: str, index: int) -> int:
    return text.rfind("\n", 0, index) + 1


def indent_of(text: str, scanned) -> str:
    members = scanned["members"]
    if not members:
        return DEFAULT_INDENT
    first = members[0]["ks"]
    prefix = text[line_start(text, first):first]
    return prefix if prefix and not prefix.strip() else DEFAULT_INDENT


def merge(cur, wanted=None, prev=None) -> dict:
    prev = prev or []
    if cur is None:
        return {"ok": True, "text": '{\n  "git.detectWorktrees": true\n}\n', "keys": [LOCK_KEY], "created": True}
    scanned = scan(cur)
    if scanned is None:
        return fail(".vscode/settings.json 을 JSONC 객체로 읽지 못했다")
    found = find_member(scanned)
    if found is not None:
        keep = [LOCK_KEY] if is_true(cur, found) and LOCK_KEY in prev else []
        return {"ok": True, "text": cur, "keys": keep, "created": False}
    toks, close = scanned["toks"], scanned["close"]
    close_at = toks[close][1]
    edits = []
    if close > 1 and toks[close - 1][0] != ",":
        edits.append((toks[close - 1][2], 0, ","))
    line = indent_of(cur, scanned) + LINE_BODY
    close_line = line_start(cur, close_at)
    if close_line > toks[0][1] and not cur[close_line:close_at].strip():
        edits.append((close_line, 1, line + "\n"))
    else:
        edits.append((close_at, 1, "\n" + line + "\n"))
    text = cur
    for at, _, piece in sorted(edits, reverse=True):
        text = text[:at] + piece + text[at:]
    return {"ok": True, "text": text, "keys": [LOCK_KEY], "created": False}


def blank_after(text: str, index: int) -> int:
    """index 뒤가 공백뿐인 줄 끝(줄 바꿈 포함)이면 그 위치, 아니면 -1."""
    end = text.find("\n", index)
    rest = text[index:] if end < 0 else text[index:end]
    if rest.strip():
        return -1
    return len(text) if end < 0 else end + 1


def unmerge(cur: str, keys: list, wanted=None) -> dict:
    scanned = scan(cur)
    if LOCK_KEY not in keys:
        return {"ok": True, "text": cur, "empty": scanned is not None and not scanned["members"] and not scanned["comment"]}
    if scanned is None:
        return fail(".vscode/settings.json 을 JSONC 객체로 읽지 못했다")
    found = find_member(scanned)
    if found is None or not is_true(cur, found):
        return {"ok": True, "text": cur, "empty": False}
    toks = scanned["toks"]
    start, end = found["ks"], found["ve"]
    trailing = toks[found["jidx"]][0] == ","
    if trailing:
        end = toks[found["jidx"]][2]
    edits = []
    own_line = not cur[line_start(cur, start):start].strip()
    after = blank_after(cur, end)
    if own_line and after >= 0:
        start, end = line_start(cur, start), after
    elif own_line:
        start = line_start(cur, start)
    if not trailing and found["kidx"] > 1 and toks[found["kidx"] - 1][0] == ",":
        edits.append((toks[found["kidx"] - 1][1], toks[found["kidx"] - 1][2]))
    edits.append((start, end))
    text = cur
    for at, stop in sorted(edits, reverse=True):
        text = text[:at] + text[stop:]
    after_scan = scan(text)
    empty = after_scan is not None and not after_scan["members"] and not after_scan["comment"]
    return {"ok": True, "text": text, "empty": empty}


def missing(cur: str, keys: list, wanted=None) -> list:
    if LOCK_KEY not in keys:
        return []
    scanned = scan(cur)
    found = find_member(scanned) if scanned is not None else None
    return [LOCK_KEY] if found is None or not is_true(cur, found) else []
