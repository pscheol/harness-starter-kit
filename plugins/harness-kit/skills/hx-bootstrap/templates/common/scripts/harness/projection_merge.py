"""배치 병합 규칙 — CLAUDE.md 블록 · settings.json · .codex/hooks.json · config.toml · .gitattributes(HK-13 design §5, HK-24, 03 §3.5).

결과: {'ok': True, 'text', 'keys', 'created'} 또는 {'ok': False, 'reason'}. 빼기: {'ok': True, 'text', 'empty'}.
TS `packages/cli/src/projection/merge.ts` 와 같은 바이트를 낸다(시험이 묶는다). 표준 라이브러리만 쓴다.
"""

from __future__ import annotations

import json
import re

from projection_render import toml_string

CLAUDE_BEGIN = "<!-- harness-kit:begin claude"
CLAUDE_END = "<!-- harness-kit:end claude -->"
GEN_BEGIN = "# harness-kit:begin generated"
GEN_BEGIN_LINE = "# harness-kit:begin generated — .agents/ 원본에서 만든 파일이다. 고칠 때는 원본을 고친다"
GEN_END = "# harness-kit:end generated"
AGENTS_LINE = "@AGENTS.md"
HARNESS_ORDER = ("claude", "codex", "cursor", "kiro")
TABLE_HEADER = re.compile(r"^\s*\[\[?\s*([^\[\]]+?)\s*\]\]?\s*(?:#.*)?$")


def fail(reason: str) -> dict:
    return {"ok": False, "reason": reason}


def split_lines(text: str) -> list[str]:
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return lines


def join_lines(lines: list[str]) -> str:
    return "\n".join(lines) + "\n" if lines else ""


def strip_trailing_blank(lines: list[str]) -> list[str]:
    out = list(lines)
    while out and out[-1].strip() == "":
        out.pop()
    return out


def all_blank(lines: list[str], comments: bool = False) -> bool:
    return all(not l.strip() or (comments and l.lstrip().startswith("#")) for l in lines)


# ── 표지 블록(CLAUDE.md · .gitattributes) ───────────────────────────────────


def find_block(lines: list[str], begin: str, end: str) -> tuple[int, int] | None | str:
    b = next((i for i, l in enumerate(lines) if l.startswith(begin)), -1)
    if b < 0:
        return None
    e = next((i for i in range(b + 1, len(lines)) if lines[i].strip() == end), -1)
    if e < 0:
        return "unclosed"
    return b, e


def append_block(lines: list[str], block: list[str]) -> list[str]:
    out = list(lines)
    if out and out[-1].strip() != "":
        out.append("")
    return out + block


def claude_md_want(spec: dict) -> dict:
    return {"block": list(spec["claudeBlock"])}


def merge_claude_md(cur: str | None, want: dict, prev: list[str] | None = None) -> dict:
    block = want["block"]
    if cur is None:
        return {"ok": True, "text": join_lines([AGENTS_LINE, "", *block]), "keys": ["line:@AGENTS.md", "block:claude"], "created": True}
    prev = prev or []
    lines = split_lines(cur)
    found = find_block(lines, CLAUDE_BEGIN, CLAUDE_END)
    if found == "unclosed":
        return fail("CLAUDE.md 킷 블록의 끝 표지가 없다")
    has_line = any(l == AGENTS_LINE for l in lines)
    keys: list[str] = []
    if found is not None:
        b, e = found
        insert = [AGENTS_LINE, ""] if not has_line else []
        lines = lines[:b] + insert + block + lines[e + 1:]
        if not has_line or "line:@AGENTS.md" in prev:
            keys.append("line:@AGENTS.md")
    else:
        if not has_line:
            lines = append_block(lines, [AGENTS_LINE, ""])
            keys.append("line:@AGENTS.md")
        elif "line:@AGENTS.md" in prev:
            keys.append("line:@AGENTS.md")
        lines = append_block(lines, block)
    keys.append("block:claude")
    return {"ok": True, "text": join_lines(lines), "keys": keys, "created": False}


def unmerge_claude_md(cur: str, keys: list[str], want: dict) -> dict:
    lines = split_lines(cur)
    found = find_block(lines, CLAUDE_BEGIN, CLAUDE_END)
    if found == "unclosed":
        return fail("CLAUDE.md 킷 블록의 끝 표지가 없다")
    if found is not None and "block:claude" in keys:
        b, e = found
        lines = lines[:b] + lines[e + 1:]
    if "line:@AGENTS.md" in keys and AGENTS_LINE in lines:
        lines.pop(lines.index(AGENTS_LINE))
    lines = strip_trailing_blank(lines)
    return {"ok": True, "text": join_lines(lines), "empty": all_blank(lines)}


def missing_claude_md(cur: str, keys: list[str], want: dict) -> list[str]:
    lines = split_lines(cur)
    found = find_block(lines, CLAUDE_BEGIN, CLAUDE_END)
    out = []
    for k in keys:
        if k == "line:@AGENTS.md" and AGENTS_LINE not in lines:
            out.append(k)
        elif k == "block:claude" and not isinstance(found, tuple):
            out.append(k)
    return out


def gitattributes_want(spec: dict, agents: list[str]) -> dict:
    patterns = [p for h in HARNESS_ORDER if h in agents for p in spec["gitattributes"].get(h, [])]
    return {"lines": [GEN_BEGIN_LINE, *[f"{p} linguist-generated=true" for p in patterns], GEN_END]}


def merge_gitattributes(cur: str | None, want: dict, prev: list[str] | None = None) -> dict:
    block = want["lines"]
    if cur is None:
        return {"ok": True, "text": join_lines(block), "keys": ["block:generated"], "created": True}
    lines = split_lines(cur)
    found = find_block(lines, GEN_BEGIN, GEN_END)
    if found == "unclosed":
        return fail(".gitattributes 킷 블록의 끝 표지가 없다")
    if found is None:
        lines = append_block(lines, block)
    else:
        b, e = found
        lines = lines[:b] + block + lines[e + 1:]
    return {"ok": True, "text": join_lines(lines), "keys": ["block:generated"], "created": False}


def unmerge_gitattributes(cur: str, keys: list[str], want: dict) -> dict:
    lines = split_lines(cur)
    found = find_block(lines, GEN_BEGIN, GEN_END)
    if found == "unclosed":
        return fail(".gitattributes 킷 블록의 끝 표지가 없다")
    if isinstance(found, tuple):
        lines = lines[: found[0]] + lines[found[1] + 1:]
    lines = strip_trailing_blank(lines)
    return {"ok": True, "text": join_lines(lines), "empty": all_blank(lines)}


def missing_gitattributes(cur: str, keys: list[str], want: dict) -> list[str]:
    found = find_block(split_lines(cur), GEN_BEGIN, GEN_END)
    return [k for k in keys if k == "block:generated" and not isinstance(found, tuple)]


# ── settings.json · .codex/hooks.json ────────────────────────────────────────


def _sub(value: str, tokens: dict) -> str:
    for k, v in tokens.items():
        if v:
            value = value.replace("{{kit:" + k + "}}", v).replace("{{" + k + "}}", v)
    return value


def settings_want(spec: dict, tokens: dict, hooks: list[dict] | None = None, suffixes: list[str] | None = None) -> dict:
    """권한 거부(projection.json) + 훅(hooks.json 에서 만든 것, HK-24)."""
    return {"deny": [_sub(d, tokens) for d in spec["claudeSettings"]["deny"]], "hooks": [dict(h) for h in hooks or []],
            "suffixes": list(suffixes or [])}


def codex_hooks_want(hooks: list[dict] | None = None, suffixes: list[str] | None = None) -> dict:
    return {"hooks": [dict(h) for h in hooks or []], "suffixes": list(suffixes or [])}


def _command(h: object) -> str | None:
    return h.get("command") if isinstance(h, dict) and isinstance(h.get("command"), str) else None


def _has_id(cmd: str, hook_id: str) -> bool:
    return bool(re.search(rf"(?:^|\s){re.escape(hook_id)}(?:\s|$)", cmd))


def _script_suffixes(script: str | None) -> list[str]:
    return [script, "_ " + script.rsplit("/", 1)[-1]] if script else []


def is_kit_hook(h: object, ids: list[str], suffixes: list[str]) -> bool:
    """킷 항목: 명령에 킷 훅 id 가 낱말로 있거나, 명령이 킷 스크립트 꼬리로 끝난다(v1 · HK-13 판 명령)."""
    cmd = _command(h)
    if cmd is None:
        return False
    tail = cmd.rstrip()
    return any(_has_id(cmd, i) for i in ids) or any(tail.endswith(s) for s in suffixes)


def hook_matches(h: object, hook_id: str, script: str | None) -> bool:
    cmd = _command(h)
    if cmd is None:
        return False
    tail = cmd.rstrip()
    return _has_id(cmd, hook_id) or any(tail.endswith(s) for s in _script_suffixes(script))


def _strip(arr: list, is_kit) -> tuple[list, int | None]:
    out: list = []
    first: int | None = None
    for g in arr:
        items = g.get("hooks") if isinstance(g, dict) else None
        if not isinstance(items, list):
            out.append(g)
            continue
        kept = [h for h in items if not is_kit(h)]
        if len(kept) == len(items):
            out.append(g)
            continue
        if kept:
            out.append({**g, "hooks": kept})
        elif first is None:
            first = len(out)
    return out, first


def _desired_groups(hooks: list[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for h in hooks:
        groups = out.setdefault(h["event"], [])
        matcher = h.get("matcher")
        group = next((g for g in groups if g.get("matcher") == matcher), None)
        if group is None:
            group = ({"matcher": matcher} if matcher else {}) | {"hooks": []}
            groups.append(group)
        group["hooks"].append(dict(h["hook"]))
    return out


def _dump(data: object) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def _parse_object(cur: str) -> dict | str:
    try:
        data = json.loads(cur)
    except ValueError as error:
        return f"JSON 을 해석할 수 없다: {error}"
    return data if isinstance(data, dict) else "최상위가 객체가 아니다"


def _prev_ids(prev: list[str]) -> list[str]:
    return [k.split(":", 1)[1] for k in prev if k.startswith("hooks.") and ":" in k]


def _merge_hooks(data: dict, want: dict, prev: list[str]) -> str | None:
    """data["hooks"] 의 킷 항목만 바꾼다(03 §3.5). 오류면 이유."""
    hooks = data.get("hooks")
    if hooks is not None and not isinstance(hooks, dict):
        return "hooks 가 객체가 아니다"
    ids = [h["id"] for h in want["hooks"]] + _prev_ids(prev)
    suffixes = list(want.get("suffixes") or []) + [s for h in want["hooks"] for s in _script_suffixes(h.get("script"))]
    desired = _desired_groups(want["hooks"])
    src = hooks or {}
    out_hooks: dict = {}
    for event in [*src.keys(), *[e for e in desired if e not in src]]:
        arr = src.get(event, [])
        if not isinstance(arr, list):
            if event in desired:
                return f"hooks.{event} 가 배열이 아니다"
            out_hooks[event] = arr
            continue
        new_arr, first = _strip(arr, lambda h: is_kit_hook(h, ids, suffixes))
        groups = desired.get(event, [])
        at = first if first is not None else len(new_arr)
        new_arr = new_arr[:at] + groups + new_arr[at:]
        if not new_arr and arr:
            continue
        out_hooks[event] = new_arr
    if hooks is not None or out_hooks:
        data["hooks"] = out_hooks
    return None


def _hook_keys(want: dict) -> list[str]:
    return [f"hooks.{h['event']}:{h['id']}" for h in want["hooks"]]


def merge_settings(cur: str | None, want: dict, prev: list[str] | None = None) -> dict:
    prev = prev or []
    data = {} if cur is None else _parse_object(cur)
    if isinstance(data, str):
        return fail(data)
    perms = data.get("permissions")
    if perms is not None and not isinstance(perms, dict):
        return fail("permissions 가 객체가 아니다")
    deny = (perms or {}).get("deny")
    if deny is not None and not isinstance(deny, list):
        return fail("permissions.deny 가 배열이 아니다")
    if data.get("hooks") is not None and not isinstance(data.get("hooks"), dict):
        return fail("hooks 가 객체가 아니다")
    prev_deny = [k[len("permissions.deny:"):] for k in prev if k.startswith("permissions.deny:")]
    new_deny = [v for v in (deny or []) if not (v in prev_deny and v not in want["deny"])]
    for v in want["deny"]:
        if v not in new_deny:
            new_deny.append(v)
    if deny is not None or new_deny:
        perms = dict(perms or {})
        perms["deny"] = new_deny
        data["permissions"] = perms
    error = _merge_hooks(data, want, prev)
    if error:
        return fail(error)
    keys = [f"permissions.deny:{v}" for v in want["deny"]] + _hook_keys(want)
    return {"ok": True, "text": _dump(data), "keys": keys, "created": cur is None}


def merge_codex_hooks(cur: str | None, want: dict, prev: list[str] | None = None) -> dict:
    data = {} if cur is None else _parse_object(cur)
    if isinstance(data, str):
        return fail(data)
    error = _merge_hooks(data, want, prev or [])
    if error:
        return fail(error)
    return {"ok": True, "text": _dump(data), "keys": _hook_keys(want), "created": cur is None}


def _scripts_by_id(want: dict) -> dict[str, str]:
    return {h["id"]: h.get("script") for h in want["hooks"]}


def _unmerge_hooks(data: dict, keys: list[str], want: dict) -> None:
    by_id = _scripts_by_id(want)
    ids = [k.split(":", 1)[1] for k in keys if k.startswith("hooks.") and ":" in k]
    hooks = data.get("hooks")
    if not isinstance(hooks, dict):
        return
    out: dict = {}
    for event, arr in hooks.items():
        if not isinstance(arr, list):
            out[event] = arr
            continue
        new_arr, _ = _strip(arr, lambda h: any(hook_matches(h, i, by_id.get(i)) for i in ids))
        if not new_arr and arr:
            continue
        out[event] = new_arr
    if out or not hooks:
        data["hooks"] = out
    else:
        del data["hooks"]


def unmerge_settings(cur: str, keys: list[str], want: dict) -> dict:
    data = _parse_object(cur)
    if isinstance(data, str):
        return fail(data)
    _unmerge_hooks(data, keys, want)
    deny_vals = [k[len("permissions.deny:"):] for k in keys if k.startswith("permissions.deny:")]
    perms = data.get("permissions")
    if isinstance(perms, dict) and isinstance(perms.get("deny"), list):
        deny = perms["deny"]
        kept = [v for v in deny if v not in deny_vals]
        perms = dict(perms)
        if kept or not deny:
            perms["deny"] = kept
        else:
            del perms["deny"]
        if perms or not data["permissions"]:
            data["permissions"] = perms
        else:
            del data["permissions"]
    return {"ok": True, "text": _dump(data), "empty": data == {}}


def unmerge_codex_hooks(cur: str, keys: list[str], want: dict) -> dict:
    data = _parse_object(cur)
    if isinstance(data, str):
        return fail(data)
    _unmerge_hooks(data, keys, want)
    return {"ok": True, "text": _dump(data), "empty": data == {}}


def _missing_hooks(data: dict, keys: list[str], want: dict) -> list[str]:
    by_id = _scripts_by_id(want)
    hooks = data.get("hooks") if isinstance(data.get("hooks"), dict) else {}
    out = []
    for k in keys:
        if not (k.startswith("hooks.") and ":" in k):
            continue
        event, hook_id = k[len("hooks."):].split(":", 1)
        arr = hooks.get(event)
        items = [h for g in arr if isinstance(g, dict) and isinstance(g.get("hooks"), list) for h in g["hooks"]] if isinstance(arr, list) else []
        if not any(hook_matches(h, hook_id, by_id.get(hook_id)) for h in items):
            out.append(k)
    return out


def missing_settings(cur: str, keys: list[str], want: dict) -> list[str]:
    data = _parse_object(cur)
    if isinstance(data, str):
        return list(keys)
    deny = (data.get("permissions") or {}).get("deny") if isinstance(data.get("permissions"), dict) else None
    hook_missing = set(_missing_hooks(data, keys, want))
    out = []
    for k in keys:
        if k.startswith("permissions.deny:"):
            if not isinstance(deny, list) or k[len("permissions.deny:"):] not in deny:
                out.append(k)
        elif k in hook_missing:
            out.append(k)
    return out


def missing_codex_hooks(cur: str, keys: list[str], want: dict) -> list[str]:
    data = _parse_object(cur)
    if isinstance(data, str):
        return list(keys)
    return _missing_hooks(data, keys, want)


# ── config.toml ──────────────────────────────────────────────────────────────


def codex_config_want(spec: dict, roles: list[dict], keep: list[str] | None = None) -> dict:
    cc = spec["codexConfig"]
    ordered = sorted(roles, key=lambda r: r["name"].encode("utf-8"))
    return {"header": list(cc["header"]), "defaults": [dict(d) for d in cc["defaults"]], "tables": [dict(t) for t in cc["tables"]],
            "roles": [{"name": r["name"], "description": r["description"]} for r in ordered], "keep": list(keep or [])}


def _tables(lines: list[str]) -> list[tuple[str, int, int]]:
    """(이름, 머리 줄, 내용 끝 줄+1). 끝의 빈 줄 · 주석은 다음 표 몫이다."""
    heads = [(i, m.group(1)) for i, l in enumerate(lines) if (m := TABLE_HEADER.match(l))]
    out = []
    for n, (i, name) in enumerate(heads):
        j = heads[n + 1][0] if n + 1 < len(heads) else len(lines)
        last = i
        for k in range(i + 1, j):
            s = lines[k].strip()
            if s and not s.startswith("#"):
                last = k
        out.append((name, i, last + 1))
    return out


def _find_table(lines: list[str], name: str) -> tuple[str, int, int] | None:
    return next((t for t in _tables(lines) if t[0] == name), None)


def _key_line(lines: list[str], table: tuple[str, int, int], key: str) -> int:
    pat = re.compile(rf'^\s*(?:{re.escape(key)}|"{re.escape(key)}")\s*=')
    return next((k for k in range(table[1] + 1, table[2]) if pat.match(lines[k])), -1)


def _remove_table(lines: list[str], table: tuple[str, int, int]) -> list[str]:
    start = table[1]
    while start > 0 and lines[start - 1].strip() == "":
        start -= 1
    return lines[:start] + lines[table[2]:]


def _role_table(role: dict) -> list[str]:
    name = role["name"]
    return [f"[agents.{name}]", f"description = {toml_string(role['description'])}", f"config_file = {toml_string('agents/' + name + '.toml')}"]


def _key_kinds(want: dict) -> tuple[set[str], set[str]]:
    defaults = {f"toml:{d['table']}.{d['key']}" for d in want["defaults"]}
    tables = {f"toml:{t['table']}" for t in want["tables"]}
    return defaults, tables


def merge_codex_config(cur: str | None, want: dict, prev: list[str] | None = None) -> dict:
    prev = prev or []
    lines = split_lines(join_lines(want["header"]) if cur is None else cur)
    keys: list[str] = []
    for d in want["defaults"]:
        key = f"toml:{d['table']}.{d['key']}"
        t = _find_table(lines, d["table"])
        if t is None:
            lines = append_block(lines, [f"[{d['table']}]", d["line"]])
            keys.append(key)
        elif _key_line(lines, t, d["key"]) < 0:
            lines = lines[: t[2]] + [d["line"]] + lines[t[2]:]
            keys.append(key)
        elif key in prev:
            keys.append(key)
    for tb in want["tables"]:
        key = f"toml:{tb['table']}"
        if _find_table(lines, tb["table"]) is None:
            lines = append_block(lines, [f"[{tb['table']}]", *tb["lines"]])
            keys.append(key)
        elif key in prev:
            keys.append(key)
    defaults, tables = _key_kinds(want)
    wanted = {f"toml:agents.{r['name']}" for r in want["roles"]}
    keep = {f"toml:agents.{n}" for n in want["keep"]}
    for k in prev:
        if k.startswith("toml:agents.") and k not in defaults and k not in tables and k not in wanted and k not in keep:
            t = _find_table(lines, k[len("toml:"):])
            if t is not None:
                lines = _remove_table(lines, t)
    for k in sorted(keep, key=lambda x: x.encode("utf-8")):
        if k in prev and _find_table(lines, k[len("toml:"):]) is not None:
            keys.append(k)
    for r in want["roles"]:
        block = _role_table(r)
        t = _find_table(lines, f"agents.{r['name']}")
        lines = append_block(lines, block) if t is None else lines[: t[1]] + block + lines[t[2]:]
        keys.append(f"toml:agents.{r['name']}")
    return {"ok": True, "text": join_lines(lines), "keys": keys, "created": cur is None}


def unmerge_codex_config(cur: str, keys: list[str], want: dict) -> dict:
    lines = split_lines(cur)
    defaults, tables = _key_kinds(want)
    for k in keys:
        name = k[len("toml:"):]
        if k in defaults:
            table, key = name.rsplit(".", 1)
            t = _find_table(lines, table)
            if t is None:
                continue
            at = _key_line(lines, t, key)
            if at >= 0:
                lines = lines[:at] + lines[at + 1:]
                t = _find_table(lines, table)
                if t is not None and all_blank(lines[t[1] + 1: t[2]], comments=True):
                    lines = _remove_table(lines, t)
        else:
            t = _find_table(lines, name)
            if t is not None:
                lines = _remove_table(lines, t)
    lines = strip_trailing_blank(lines)
    return {"ok": True, "text": join_lines(lines), "empty": all_blank(lines, comments=True)}


def missing_codex_config(cur: str, keys: list[str], want: dict) -> list[str]:
    lines = split_lines(cur)
    defaults, _ = _key_kinds(want)
    out = []
    for k in keys:
        name = k[len("toml:"):]
        if k in defaults:
            table, key = name.rsplit(".", 1)
            t = _find_table(lines, table)
            if t is None or _key_line(lines, t, key) < 0:
                out.append(k)
        elif _find_table(lines, name) is None:
            out.append(k)
    return out


MERGERS = {
    "claude-md": (merge_claude_md, unmerge_claude_md, missing_claude_md),
    "settings": (merge_settings, unmerge_settings, missing_settings),
    "codex-hooks": (merge_codex_hooks, unmerge_codex_hooks, missing_codex_hooks),
    "codex-config": (merge_codex_config, unmerge_codex_config, missing_codex_config),
    "gitattributes": (merge_gitattributes, unmerge_gitattributes, missing_gitattributes),
}

MERGE_KIND = {"CLAUDE.md": "claude-md", ".claude/settings.json": "settings", ".codex/hooks.json": "codex-hooks", ".codex/config.toml": "codex-config",
              ".gitattributes": "gitattributes"}
