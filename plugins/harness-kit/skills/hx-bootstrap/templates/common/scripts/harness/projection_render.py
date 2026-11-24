"""배치 생성 형식 — 머리 해석 · 규칙 · 스킬 · 역할 · 모델 해석(HK-13 design §3 · §4).

TS `packages/cli/src/projection/{frontmatter,render}.ts` 와 같은 바이트를 낸다(시험이 묶는다). 표준 라이브러리만 쓴다.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

FM_KEY = re.compile(r"^([A-Za-z0-9_-]+):(.*)$")
LIST_ITEM = re.compile(r"^\s+-\s?(.*)$")
LOCKED_MIN = ("implement", "design", "review")
LOCKED_NAMES = ("worker", "reviewer", "designer")
HARNESSES = ("claude", "codex", "kiro")
CLAUDE_TOOLS = (("read", ("Read",)), ("search", ("Glob", "Grep")), ("shell", ("Bash",)), ("write", ("Edit", "Write")), ("web", ("WebFetch", "WebSearch")))
KIRO_TOOLS = (("read", "read"), ("search", "read"), ("shell", "shell"), ("write", "write"), ("web", "web"))
KIRO_RESOURCES = ("file://AGENTS.md", "file://.agents/rules/guardrails.md", "skill://.agents/skills/**/SKILL.md")
EFFORT_KEY = {"claude": "effort", "codex": "model_reasoning_effort"}


def gen_md(source: str) -> str:
    return f"<!-- harness-kit 생성 · 원본 {source} · 고칠 때는 원본을 고친다 -->"


def gen_toml(source: str) -> str:
    return f"# harness-kit 생성 · 원본 {source} · 고칠 때는 원본을 고친다"


def jstr(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


# ── 머리 ────────────────────────────────────────────────────────────────────


def split_frontmatter(text: str) -> tuple[str | None, str]:
    """`---` 로 열고 닫은 머리와 본문. 머리가 없거나 닫히지 않았으면 (None, 전체)."""
    if not text.startswith("---\n"):
        return None, text
    end = text.find("\n---\n", 3)
    if end < 0:
        return None, text
    return (text[4:end] if end >= 4 else ""), text[end + 5:]


def _split_flow(inner: str) -> list[str]:
    parts: list[str] = []
    cur = ""
    quote = ""
    for ch in inner:
        if quote:
            cur += ch
            if ch == quote:
                quote = ""
        elif ch in "\"'":
            quote = ch
            cur += ch
        elif ch == ",":
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip() or parts:
        parts.append(cur)
    return [p.strip() for p in parts if p.strip()]


def scalar(raw: str) -> str:
    v = raw.strip()
    if len(v) >= 2 and v[0] == v[-1] == '"':
        try:
            out = json.loads(v)
            return out if isinstance(out, str) else v[1:-1]
        except ValueError:
            return v[1:-1]
    if len(v) >= 2 and v[0] == v[-1] == "'":
        return v[1:-1].replace("''", "'")
    return v


def parse_frontmatter(block: str) -> dict:
    """YAML 부분: `키: 값`, 따옴표, `[…]` 흐름 목록, `{키: 값}` 흐름 표, 블록 목록(`  - 값`)."""
    out: dict = {}
    lines = block.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        i += 1
        m = FM_KEY.match(line)
        if not m:
            continue
        key, raw = m.group(1), m.group(2).strip()
        if raw == "":
            items: list[str] = []
            while i < len(lines) and LIST_ITEM.match(lines[i]):
                items.append(scalar(LIST_ITEM.match(lines[i]).group(1)))
                i += 1
            out[key] = items if items else ""
        elif raw.startswith("[") and raw.endswith("]"):
            out[key] = [scalar(p) for p in _split_flow(raw[1:-1])]
        elif raw.startswith("{") and raw.endswith("}"):
            table: dict[str, str] = {}
            for p in _split_flow(raw[1:-1]):
                k, sep, v = p.partition(":")
                if sep:
                    table[scalar(k)] = scalar(v)
            out[key] = table
        else:
            out[key] = scalar(raw)
    return out


def fm_str(fm: dict, key: str) -> str:
    v = fm.get(key)
    return v if isinstance(v, str) else ""


def fm_list(fm: dict, key: str) -> list[str]:
    v = fm.get(key)
    if isinstance(v, list):
        return [x for x in v if isinstance(x, str) and x != ""]
    if isinstance(v, str) and v != "":
        return [v]
    return []


# ── 원본 ────────────────────────────────────────────────────────────────────


def basename(path: str) -> str:
    return path.rsplit("/", 1)[-1]


@dataclass(frozen=True)
class Rule:
    name: str
    source: str
    data: bytes
    paths: tuple[str, ...] | None
    body: str


def parse_rule(source: str, data: bytes) -> Rule:
    text = data.decode("utf-8", errors="replace")
    block, body = split_frontmatter(text)
    paths = fm_list(parse_frontmatter(block), "paths") if block is not None else []
    return Rule(basename(source)[: -len(".md")], source, data, tuple(paths) if paths else None, body)


@dataclass(frozen=True)
class Skill:
    name: str
    source: str
    files: tuple[tuple[str, bytes, bool], ...]
    description: str
    body: str
    fm: dict = field(default_factory=dict)


def parse_skill(source: str, files: tuple[tuple[str, bytes, bool], ...]) -> Skill:
    data = next((b for rel, b, _ in files if rel == "SKILL.md"), b"")
    block, body = split_frontmatter(data.decode("utf-8", errors="replace"))
    fm = parse_frontmatter(block) if block is not None else {}
    return Skill(fm_str(fm, "name") or basename(source), source, files, fm_str(fm, "description"), body, fm)


@dataclass(frozen=True)
class Role:
    name: str
    source: str
    data: bytes
    description: str
    mode: str
    tools: tuple[str, ...]
    fm: dict
    body: str


def parse_role(source: str, data: bytes) -> Role:
    block, body = split_frontmatter(data.decode("utf-8", errors="replace"))
    fm = parse_frontmatter(block) if block is not None else {}
    tools = fm_list(fm, "tools") or ["read"]
    mode = "write" if fm_str(fm, "mode") == "write" else "read-only"
    return Role(fm_str(fm, "name") or basename(source)[: -len(".md")], source, data, fm_str(fm, "description"), mode, tuple(tools), fm, body)


# ── 모델 정책(12 §3.3 · §3.4) ───────────────────────────────────────────────


@dataclass(frozen=True)
class Policy:
    locked: tuple[str, ...]
    classes: dict
    tiers: dict


def parse_policy(text: str | None) -> Policy:
    try:
        raw = json.loads(text) if text is not None else None
    except ValueError:
        raw = None
    if not isinstance(raw, dict):
        return Policy((), {}, {})
    locked = tuple(x for x in raw.get("locked", []) if isinstance(x, str)) if isinstance(raw.get("locked"), list) else ()
    classes = raw.get("classes") if isinstance(raw.get("classes"), dict) else {}
    tiers = raw.get("tiers") if isinstance(raw.get("tiers"), dict) else {}
    return Policy(locked, classes, tiers)


def _direct(fm: dict, key: str) -> dict:
    v = fm.get(key)
    if isinstance(v, dict):
        return {k: x for k, x in v.items() if isinstance(x, str) and x != ""}
    return {}


def resolve_model(role: Role, policy: Policy) -> dict:
    """{'ok': True, 'locked': bool, 'fields': {harness: {...}}} 또는 {'ok': False, 'error': ...}."""
    cls = fm_str(role.fm, "class")
    locked = set(policy.locked) | set(LOCKED_MIN)
    has_model = any(k in role.fm for k in ("tier", "model", "effort"))
    if (cls and cls in locked) or role.name in LOCKED_NAMES:
        if has_model:
            return {"ok": False, "error": f"잠긴 역할 '{role.name}' 에는 tier · model · effort 를 둘 수 없다(12 MR-R3)"}
        return {"ok": True, "locked": True, "fields": {"claude": {"model": "inherit"}, "codex": {}, "kiro": {}}}
    tier = fm_str(role.fm, "tier") or (policy.classes.get(cls) if cls and isinstance(policy.classes.get(cls), str) else "") or "inherit"
    model = _direct(role.fm, "model")
    effort = _direct(role.fm, "effort")
    fields: dict[str, dict[str, str]] = {}
    for h in HARNESSES:
        base = policy.tiers.get(tier, {}).get(h) if tier != "inherit" and isinstance(policy.tiers.get(tier), dict) else None
        out: dict[str, str] = {}
        if isinstance(base, dict):
            out = {k: v for k, v in base.items() if isinstance(v, str)}
        if h in model:
            out["model"] = model[h]
        if h in effort and h in EFFORT_KEY:
            out[EFFORT_KEY[h]] = effort[h]
        if h == "kiro":
            out = {k: v for k, v in out.items() if k == "model"}
        if h == "claude" and "model" not in out:
            out = {"model": "inherit", **out}
        fields[h] = out
    return {"ok": True, "locked": False, "fields": fields}


# ── 생성 ────────────────────────────────────────────────────────────────────


def render_cursor_rule(r: Rule) -> str:
    globs = ",".join(r.paths) if r.paths else ""
    return f"---\ndescription:\nglobs:{' ' + globs if globs else ''}\nalwaysApply: {'false' if r.paths else 'true'}\n---\n{gen_md(r.source)}\n{r.body}"


def render_kiro_rule(r: Rule) -> str:
    if r.paths:
        pattern = jstr(r.paths[0]) if len(r.paths) == 1 else "[" + ", ".join(jstr(p) for p in r.paths) + "]"
        head = f"---\ninclusion: fileMatch\nfileMatchPattern: {pattern}\n---\n"
    else:
        head = "---\ninclusion: always\n---\n"
    return f"{head}{gen_md(r.source)}\n{r.body}"


def render_cursor_command(s: Skill) -> str:
    return f"---\ndescription: {s.description}\n---\n{gen_md(s.source + '/SKILL.md')}\n{s.body}"


def render_kiro_skill_steering(s: Skill) -> str:
    return f"---\ninclusion: manual\ndescription: {s.description}\n---\n{gen_md(s.source + '/SKILL.md')}\n{s.body}"


def claude_tools(tools: tuple[str, ...]) -> list[str]:
    return [name for key, names in CLAUDE_TOOLS if key in tools for name in names]


def kiro_tools(tools: tuple[str, ...]) -> list[str]:
    out: list[str] = []
    for key, name in KIRO_TOOLS:
        if key in tools and name not in out:
            out.append(name)
    return out


def with_newline(text: str) -> str:
    return text if text.endswith("\n") or text == "" else text + "\n"


def render_claude_role(r: Role, fields: dict) -> str:
    lines = ["---", f"name: {r.name}", f"description: {r.description}", f"tools: {', '.join(claude_tools(r.tools))}"]
    lines += [f"{k}: {v}" for k, v in fields.items()]
    lines += ["---", gen_md(r.source)]
    return "\n".join(lines) + "\n" + r.body


def _control(ch: str, keep: str) -> str:
    code = ord(ch)
    if ch in keep:
        return ch
    if code < 0x20 or code == 0x7F:
        return "\\u%04X" % code
    return ch


TOML_SHORT = {"\b": "\\b", "\t": "\\t", "\n": "\\n", "\f": "\\f", "\r": "\\r", '"': '\\"', "\\": "\\\\"}


def toml_string(value: str) -> str:
    return '"' + "".join(TOML_SHORT.get(ch) or _control(ch, "") for ch in value) + '"'


def toml_multiline(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"""', '""\\"')
    return "".join(_control(ch, "\n\t") for ch in escaped)


def render_codex_role(r: Role, fields: dict, spec: dict) -> str:
    lines = [
        gen_toml(r.source),
        f"name = {toml_string(r.name)}",
        f"description = {toml_string(r.description)}",
        f'sandbox_mode = "{"workspace-write" if r.mode == "write" else "read-only"}"',
    ]
    lines += [f"{k} = {toml_string(v)}" for k, v in fields.items()]
    lines += ["", 'developer_instructions = """']
    instructions = (spec["readOnlyLine"] + "\n" if r.mode != "write" else "") + with_newline(r.body)
    return "\n".join(lines) + "\n" + toml_multiline(instructions) + '"""\n'


def render_kiro_role(r: Role, fields: dict, hooks: dict) -> str:
    """hooks: 쓰기 역할에 넣는 Kiro CLI 훅(hooks.json 의 subagents 항목, HK-24)."""
    obj: dict = {
        "name": r.name,
        "description": r.description,
        "prompt": r.body,
        "tools": kiro_tools(r.tools),
        "allowedTools": ["read", "write"] if r.mode == "write" else ["read"],
        "resources": list(KIRO_RESOURCES),
    }
    if r.mode == "write" and hooks:
        obj["hooks"] = hooks
    obj.update(fields)
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


def skill_model_problem(s: Skill) -> bool:
    """`context: fork` 가 아닌 스킬 머리에 model · effort 가 있다(03 §3.6, 12 MR-R8)."""
    return ("model" in s.fm or "effort" in s.fm) and fm_str(s.fm, "context") != "fork"
