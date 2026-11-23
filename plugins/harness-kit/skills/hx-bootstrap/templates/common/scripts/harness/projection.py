#!/usr/bin/env python3
"""하네스 배치 — `.agents/` 원본에서 하네스 폴더의 복사본(mirror) · 생성물(render) · 병합(merge)을 만든다(HK-13).

    projection.py plan  [--root R] [--agents a,b] [--token K=V] [--json]   원하는 작업과 해시(쓰지 않는다)
    projection.py apply --root R --mode setup|update --lock L [--prev-lock P] [--agents a,b] [--token K=V]
                        [--force] [--accept-all] [--dry-run]                setup.sh · update.sh 용(v1 lock 줄을 L 에 덧붙인다)
    projection.py sync  [--root R] [--changed P]…                            lock 기준으로 다시 만든다(Node 없는 repair)

판정 · 형식은 CLI(packages/cli/src/projection)와 같다(design §4~§7). 표준 라이브러리만 쓴다. 모델을 부르지 않는다.
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import argparse  # noqa: E402
import hashlib  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import secrets  # noqa: E402
from dataclasses import dataclass, field  # noqa: E402
from pathlib import Path  # noqa: E402

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from projection_merge import (  # noqa: E402
    MERGE_KIND,
    MERGERS,
    claude_md_want,
    codex_config_want,
    gitattributes_want,
    settings_want,
)
from projection_render import (  # noqa: E402
    parse_policy,
    parse_role,
    parse_rule,
    parse_skill,
    render_claude_role,
    render_codex_role,
    render_cursor_command,
    render_cursor_rule,
    render_kiro_role,
    render_kiro_rule,
    render_kiro_skill_steering,
    resolve_model,
    skill_model_problem,
)

LOCK_REL = ".agents/harness-kit.lock"
META_REL = ".agents/harness-kit.json"
V1_HEADER = "# harness-kit lock v1"
HARNESSES = ("claude", "codex", "cursor", "kiro")
HARNESS_DIRS = (".claude/", ".codex/", ".cursor/", ".kiro/")
PROJECTION_OPS = ("mirror", "render", "merge")
FORBIDDEN_CLAUDE = {"model", "effortLevel", "modelSettings", "maxEffortLevel", "fallbackModel", "availableModels", "advisorModel"}
FORBIDDEN_ENV = {"ANTHROPIC_MODEL", "CLAUDE_CODE_EFFORT_LEVEL", "MAX_THINKING_TOKENS", "CLAUDE_CODE_SUBAGENT_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL_FORCE", "CLAUDE_CODE_SUBAGENT_EFFORT"}
FORBIDDEN_CODEX = {"model", "model_reasoning_effort", "model_reasoning_summary", "model_verbosity", "model_provider", "profile", "profiles",
                   "default_subagent_model", "default_subagent_reasoning_effort"}


class ProjectionError(Exception):
    """계획을 세울 수 없다(겹치는 배치 경로 · 금지 키)."""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def tree_sha(files) -> str:
    """상대 경로 사전순 '<경로>\\0<sha256>\\n' 의 sha256(02 §3.9)."""
    text = "".join(f"{rel}\0{sha256(data)}\n" for rel, data, *_ in sorted(files, key=lambda f: f[0].encode("utf-8")))
    return sha256(text.encode("utf-8"))


def ignored(name: str) -> bool:
    return name == ".DS_Store" or name.endswith((".new", ".bak")) or (name.startswith(".") and ".hk-" in name) or name == "__pycache__" or name.endswith(".pyc")


def byte_sorted(items):
    return sorted(items, key=lambda s: s.encode("utf-8"))


# ── 원본 보기 ────────────────────────────────────────────────────────────────


def regular(path: Path) -> bool:
    return path.is_file() and not path.is_symlink()


def walk_files(base: Path, rel: str = "") -> list[tuple[str, bytes, bool]]:
    """폴더 아래 일반 파일(링크 · 무시 이름 제외), 상대 경로 바이트 순."""
    out: list[tuple[str, bytes, bool]] = []
    if not base.is_dir() or base.is_symlink():
        return out
    for name in byte_sorted(os.listdir(base)):
        if ignored(name):
            continue
        p = base / name
        sub = f"{rel}/{name}" if rel else name
        if p.is_symlink():
            continue
        if p.is_dir():
            out += walk_files(p, sub)
        elif p.is_file():
            out.append((sub, p.read_bytes(), bool(p.stat().st_mode & 0o100)))
    return sorted(out, key=lambda f: f[0].encode("utf-8"))


def has_pending_new(base: Path) -> bool:
    if base.is_file():
        return Path(f"{base}.new").exists()
    for dirpath, _dirs, files in os.walk(base):
        if any(f.endswith(".new") for f in files):
            return True
    return False


@dataclass
class Sources:
    rules: list = field(default_factory=list)
    skills: list = field(default_factory=list)
    roles: list = field(default_factory=list)
    policy: object = None
    deferred: set = field(default_factory=set)


def load_sources(root: Path) -> Sources:
    src = Sources()
    rules = root / ".agents/rules"
    if rules.is_dir():
        for name in byte_sorted(os.listdir(rules)):
            p = rules / name
            if name.endswith(".md") and not ignored(name) and regular(p):
                rel = f".agents/rules/{name}"
                src.rules.append(parse_rule(rel, p.read_bytes()))
                if has_pending_new(p):
                    src.deferred.add(rel)
    skills = root / ".agents/skills"
    if skills.is_dir():
        for name in byte_sorted(os.listdir(skills)):
            p = skills / name
            if ignored(name) or name.startswith(".") or p.is_symlink() or not p.is_dir() or not regular(p / "SKILL.md"):
                continue
            rel = f".agents/skills/{name}"
            src.skills.append(parse_skill(rel, tuple(walk_files(p))))
            if has_pending_new(p):
                src.deferred.add(rel)
    roles = root / ".agents/roles"
    if roles.is_dir():
        for name in byte_sorted(os.listdir(roles)):
            p = roles / name
            if name.endswith(".md") and not ignored(name) and regular(p):
                rel = f".agents/roles/{name}"
                src.roles.append(parse_role(rel, p.read_bytes()))
                if has_pending_new(p):
                    src.deferred.add(rel)
    policy = root / ".agents/model-policy.json"
    src.policy = parse_policy(policy.read_text(encoding="utf-8") if regular(policy) else None)
    return src


# ── 원하는 작업(어댑터) ──────────────────────────────────────────────────────


@dataclass
class Want:
    path: str
    op: str
    harness: str
    source: str | None = None
    kind: str = ""
    data: bytes = b""
    files: tuple = ()
    executable: bool = False
    sha: str = ""
    from_sha: str = ""
    deferred: bool = False
    merge: dict | None = None


def stem(source: str) -> str:
    return source.rsplit("/", 1)[-1].removesuffix(".md")


def mirror_dir(path: str, harness: str, skill, deferred: set) -> Want:
    t = tree_sha(skill.files)
    return Want(path, "mirror", harness, skill.source, "dir", files=skill.files, sha=t, from_sha=t, deferred=skill.source in deferred)


def mirror_file(path: str, harness: str, rule, root: Path, deferred: set) -> Want:
    executable = bool((root / rule.source).stat().st_mode & 0o100) if (root / rule.source).exists() else False
    s = sha256(rule.data)
    return Want(path, "mirror", harness, rule.source, "file", data=rule.data, executable=executable, sha=s, from_sha=s, deferred=rule.source in deferred)


def render(path: str, harness: str, source: str, text: str, source_data: bytes, deferred: set) -> Want:
    data = text.encode("utf-8")
    return Want(path, "render", harness, source, "file", data=data, sha=sha256(data), from_sha=sha256(source_data), deferred=source in deferred)


def skill_data(skill) -> bytes:
    return next((b for rel, b, _ in skill.files if rel == "SKILL.md"), b"")


def build_wants(root: Path, spec: dict, tokens: dict, agents: list[str]) -> tuple[list[Want], list[dict]]:
    src = load_sources(root)
    findings: list[dict] = []
    skills = []
    for s in src.skills:
        if skill_model_problem(s):
            kit = s.source.rsplit("/", 1)[-1].startswith("hx-")
            findings.append({"kind": "skill-model-field", "severity": "error" if kit else "warn", "path": f"{s.source}/SKILL.md",
                             "hint": "context: fork 가 아닌 스킬에 model · effort 를 두지 않는다(그 턴의 사람 세션 모델이 바뀐다)"})
            if kit:
                continue
        skills.append(s)
    roles = []
    for r in src.roles:
        m = resolve_model(r, src.policy)
        if not m["ok"]:
            findings.append({"kind": "role-model-locked", "severity": "error", "path": r.source, "hint": m["error"]})
            continue
        roles.append((r, m["fields"]))
    d = src.deferred
    wants: list[Want] = []
    if "claude" in agents:
        wants += [mirror_dir(f".claude/skills/{stem(s.source)}", "claude", s, d) for s in skills]
        wants += [mirror_file(f".claude/rules/{stem(r.source)}.md", "claude", r, root, d) for r in src.rules]
        wants += [render(f".claude/agents/{stem(r.source)}.md", "claude", r.source, render_claude_role(r, f["claude"]), r.data, d) for r, f in roles]
        wants.append(Want("CLAUDE.md", "merge", "claude", kind="claude-md", merge=claude_md_want(spec)))
        wants.append(Want(".claude/settings.json", "merge", "claude", kind="settings", merge=settings_want(spec, tokens)))
    if "codex" in agents:
        wants += [render(f".codex/agents/{stem(r.source)}.toml", "codex", r.source, render_codex_role(r, f["codex"], spec), r.data, d) for r, f in roles]
        live = [{"name": stem(r.source), "description": r.description} for r, _ in roles if r.source not in d]
        keep = [stem(r.source) for r, _ in roles if r.source in d]
        wants.append(Want(".codex/config.toml", "merge", "codex", kind="codex-config", merge=codex_config_want(spec, live, keep)))
    if "cursor" in agents:
        wants += [render(f".cursor/commands/{stem(s.source)}.md", "cursor", f"{s.source}/SKILL.md", render_cursor_command(s), skill_data(s), d | {f"{x}/SKILL.md" for x in d}) for s in skills]
        wants += [render(f".cursor/rules/{stem(r.source)}.mdc", "cursor", r.source, render_cursor_rule(r), r.data, d) for r in src.rules]
    if "kiro" in agents:
        wants += [mirror_dir(f".kiro/skills/{stem(s.source)}", "kiro", s, d) for s in skills]
        wants += [render(f".kiro/steering/{stem(r.source)}.md", "kiro", r.source, render_kiro_rule(r), r.data, d) for r in src.rules]
        wants += [render(f".kiro/steering/{stem(s.source)}.md", "kiro", f"{s.source}/SKILL.md", render_kiro_skill_steering(s), skill_data(s), d | {f"{x}/SKILL.md" for x in d}) for s in skills]
        wants += [render(f".kiro/agents/{stem(r.source)}.json", "kiro", r.source, render_kiro_role(r, f["kiro"], spec), r.data, d) for r, f in roles]
    wants.append(Want(".gitattributes", "merge", "core", kind="gitattributes", merge=gitattributes_want(spec, agents)))
    seen: set[str] = set()
    for w in wants:
        if w.path in seen:
            raise ProjectionError(f"배치 경로가 겹친다: {w.path}")
        seen.add(w.path)
    for w in wants:
        if w.kind == "dir" and any(o.path.startswith(w.path + "/") for o in wants):
            raise ProjectionError(f"배치 경로가 겹친다: {w.path}")
    return wants, findings


def check_spec(spec: dict) -> None:
    def walk(v, path: str) -> None:
        if isinstance(v, dict):
            for k, x in v.items():
                if k in FORBIDDEN_CLAUDE and not path.endswith(".hook"):
                    raise ProjectionError(f"projection.json {path}.{k}: 사람 세션의 모델 키를 쓰지 않는다(12 §3.1)")
                if path.endswith(".env") and (k in FORBIDDEN_ENV or (k.startswith("ANTHROPIC_DEFAULT_") and k.endswith("_MODEL"))):
                    raise ProjectionError(f"projection.json {path}.{k}: 사람 세션의 모델 환경변수를 쓰지 않는다(12 §3.1)")
                walk(x, f"{path}.{k}")
        elif isinstance(v, list):
            for i, x in enumerate(v):
                walk(x, f"{path}[{i}]")

    walk({k: v for k, v in spec.get("claudeSettings", {}).items() if k != "hooks"}, "claudeSettings")
    cc = spec.get("codexConfig", {})
    for d in cc.get("defaults", []):
        if d.get("key") in FORBIDDEN_CODEX or d.get("table") in FORBIDDEN_CODEX:
            raise ProjectionError(f"projection.json codexConfig {d.get('table')}.{d.get('key')}: 사람 세션의 모델 키를 쓰지 않는다(12 §3.1)")
    for t in cc.get("tables", []):
        names = [t.get("table", "")] + [line.split("=", 1)[0].strip() for line in t.get("lines", []) if "=" in line]
        if any(n in FORBIDDEN_CODEX or n.startswith("profiles") for n in names):
            raise ProjectionError(f"projection.json codexConfig {t.get('table')}: 사람 세션의 모델 키를 쓰지 않는다(12 §3.1)")


def load_spec(path: Path = HERE / "projection.json") -> dict:
    spec = json.loads(path.read_text(encoding="utf-8"))
    if spec.get("schema") != "harness-kit.projection/v1":
        raise ProjectionError(f"모르는 projection.json schema: {spec.get('schema')}")
    check_spec(spec)
    return spec


def full_merge_want(kind: str, spec: dict, tokens: dict, src: Sources | None) -> dict:
    """원하지 않게 된 병합 파일을 뺄 때 쓰는 '킷 전부' 조각."""
    if kind == "claude-md":
        return claude_md_want(spec)
    if kind == "settings":
        return settings_want(spec, tokens)
    if kind == "codex-config":
        roles = [{"name": stem(r.source), "description": r.description} for r in (src.roles if src else [])]
        return codex_config_want(spec, roles)
    return gitattributes_want(spec, list(HARNESSES))


def records(wants: list[Want], root: Path) -> list[dict]:
    """TS planRecords 와 같은 모양(경로 바이트 순)."""
    out = []
    for w in sorted(wants, key=lambda w: w.path.encode("utf-8")):
        rec: dict = {"path": w.path, "op": w.op, "harness": w.harness}
        if w.op == "merge":
            cur = read_text(root, w.path)
            merge, _, _ = MERGERS[w.kind]
            r = merge(cur, w.merge)
            rec["kind"] = w.kind
            rec["keys"] = r["keys"] if r["ok"] else []
            rec["sha256"] = sha256(r["text"].encode("utf-8")) if r["ok"] else None
        else:
            rec["from"] = w.source
            rec["fromSha256"] = w.from_sha
            rec["sha256"] = w.sha
        if w.deferred:
            rec["deferred"] = True
        out.append(rec)
    return out


# ── 지금 상태 · 쓰기 ─────────────────────────────────────────────────────────


def read_text(root: Path, rel: str) -> str | None:
    p = root / rel
    return p.read_text(encoding="utf-8") if regular(p) else None


def blocked(root: Path, rel: str) -> bool:
    cur = root
    for part in rel.split("/")[:-1]:
        cur = cur / part
        if cur.is_symlink() or (cur.exists() and not cur.is_dir()):
            return True
    return False


def state(root: Path, w_path: str, is_dir: bool) -> dict:
    p = root / w_path
    if blocked(root, w_path):
        return {"kind": "other", "what": "상위 경로가 폴더가 아니다"}
    if p.is_symlink():
        return {"kind": "link"}
    if not p.exists():
        return {"kind": "none"}
    if is_dir:
        if not p.is_dir():
            return {"kind": "other", "what": "폴더 자리에 파일이 있다"}
        files = walk_files(p)
        return {"kind": "file", "sha": tree_sha(files), "files": {rel: data for rel, data, _ in files}}
    if not p.is_file():
        return {"kind": "other", "what": "같은 이름의 폴더가 있다"}
    data = p.read_bytes()
    return {"kind": "file", "sha": sha256(data), "data": data}


def write_atomic(path: Path, data: bytes, executable: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.hk-{secrets.token_hex(4)}"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o777 if executable else 0o666)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def remove_empty_dirs(base: Path, stop: Path) -> None:
    for dirpath, _dirs, _files in sorted(os.walk(base), key=lambda t: -len(t[0])):
        p = Path(dirpath)
        try:
            if p != stop and not any(p.iterdir()):
                p.rmdir()
        except OSError:
            pass
    cur = base
    while cur != stop and cur.exists():
        try:
            cur.rmdir()
        except OSError:
            break
        cur = cur.parent


def unlink_target(root: Path, rel: str) -> None:
    p = root / rel
    if p.is_symlink() or p.is_file():
        p.unlink()


def write_want(root: Path, w: Want) -> None:
    p = root / w.path
    if p.is_symlink():
        p.unlink()
    if w.kind != "dir":
        write_atomic(p, w.data, w.executable)
        return
    if p.exists() and not p.is_dir():
        p.unlink()
    wanted = {rel for rel, _, _ in w.files}
    for rel, _data, _ in walk_files(p):
        if rel not in wanted:
            (p / rel).unlink()
    for rel, data, executable in w.files:
        target = p / rel
        if target.is_file() and not target.is_symlink() and target.read_bytes() == data and bool(target.stat().st_mode & 0o100) == executable:
            continue
        write_atomic(target, data, executable)
    for dirpath, _dirs, _files in sorted(os.walk(p), key=lambda t: -len(t[0])):
        q = Path(dirpath)
        if q != p and not any(q.iterdir()):
            q.rmdir()


def delete_want_path(root: Path, rel: str, is_dir: bool) -> None:
    p = root / rel
    if is_dir and p.is_dir() and not p.is_symlink():
        for f, _d, _x in walk_files(p):
            (p / f).unlink()
        remove_empty_dirs(p, root)
    else:
        unlink_target(root, rel)
        remove_empty_dirs(p.parent, root)


def differing(w: Want, cur: dict) -> list[str]:
    """mirror 폴더에서 D 와 다른(또는 C 에 없는) 파일."""
    have = cur.get("files", {})
    return [rel for rel, data, _ in w.files if have.get(rel) != data]


def extra_files(w: Want, cur: dict) -> list[str]:
    wanted = {rel for rel, _, _ in w.files}
    return [rel for rel in cur.get("files", {}) if rel not in wanted]


# ── lock ─────────────────────────────────────────────────────────────────────


@dataclass
class Entry:
    path: str
    op: str
    owner: str = "kit"
    sha: str | None = None
    harness: str = ""
    source: str | None = None
    from_sha: str | None = None
    keys: list | None = None
    created: bool = False
    label: str = ""          # v1 copy 줄의 레이어 라벨(다시 적을 때)

    def v1_line(self) -> str:
        if self.op == "copy":
            return f"{self.sha or '-'}\t{self.label}\t{self.harness}\t{self.path}"
        label = "merge+" if self.op == "merge" and self.created else self.op
        sha = "-" if self.op == "merge" or self.owner != "kit" else (self.sha or "-")
        return f"{sha}\t{label}\t{self.harness or 'core'}\t{self.path}"

    def v2(self) -> dict:
        out: dict = {"path": self.path, "op": self.op, "owner": self.owner}
        if self.op == "merge" and self.owner == "kit":
            out["keys"] = list(self.keys or [])
            if self.created:
                out["createdByKit"] = True
            return out
        out["sha256"] = self.sha if self.owner == "kit" else None
        if self.owner == "kit" and self.source:
            out["from"] = self.source
            out["fromSha256"] = self.from_sha
        return out


def parse_v1_lines(text: str) -> list[Entry]:
    out: list[Entry] = []
    for line in text.split("\n")[1:]:
        line = line.rstrip("\r")
        if not line or line.startswith("#"):
            continue
        cols = line.split("\t")
        if len(cols) != 4:
            continue
        sha, label, harness, rel = cols
        op = label.rstrip("+") if label.rstrip("+") in PROJECTION_OPS else "copy"
        out.append(Entry(rel, op, "kit", None if sha == "-" else sha, harness, created=label == "merge+", label=label))
    return out


def read_lock(root: Path) -> tuple[str, list[Entry], dict | None]:
    p = root / LOCK_REL
    if not regular(p):
        return "missing", [], None
    text = p.read_text(encoding="utf-8")
    if text.startswith(V1_HEADER):
        return "v1", parse_v1_lines(text), None
    raw = json.loads(text)
    out = []
    for e in raw.get("entries", []):
        out.append(Entry(e["path"], e["op"], e.get("owner", "kit"), e.get("sha256"), "", e.get("from"), e.get("fromSha256"),
                         e.get("keys"), bool(e.get("createdByKit")), e.get("layer", "")))
    return "v2", out, raw


def _inline(v) -> str:
    if v is None or not isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        return "[" + ", ".join(_inline(x) for x in v) + "]"
    return "{" + ", ".join(f"{json.dumps(k, ensure_ascii=False)}: {_inline(x)}" for k, x in v.items()) + "}"


def _block(v, indent: str) -> str:
    if v is None or not isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    inner = indent + "  "
    if isinstance(v, list):
        if not v or all(x is None or not isinstance(x, (dict, list)) for x in v):
            return _inline(v)
        return "[\n" + ",\n".join(inner + _inline(x) for x in v) + "\n" + indent + "]"
    if not v:
        return "{}"
    return "{\n" + ",\n".join(f"{inner}{json.dumps(k, ensure_ascii=False)}: {_block(x, inner)}" for k, x in v.items()) + "\n" + indent + "}"


def format_json(value) -> str:
    """CLI core/json.ts formatJson 과 같은 바이트."""
    return _block(value, "") + "\n"


ENTRY_ORDER = ("path", "op", "owner", "sha256", "layer", "from", "fromSha256", "keys", "createdByKit")


def write_v2_lock(root: Path, raw: dict, entries: list[dict]) -> None:
    by_path = {e["path"]: e for e in entries}
    ordered = []
    for p in byte_sorted(by_path):
        e = by_path[p]
        ordered.append({**{k: e[k] for k in ENTRY_ORDER if k in e}, **{k: v for k, v in e.items() if k not in ENTRY_ORDER}})
    lock = {"schema": raw.get("schema"), "kit": raw.get("kit"), "packs": raw.get("packs", []), "entries": ordered}
    write_atomic(root / LOCK_REL, format_json(lock).encode("utf-8"), False)


# ── 판정 ─────────────────────────────────────────────────────────────────────


@dataclass
class Op:
    path: str
    op: str
    action: str
    reason: str = ""
    new_files: list = field(default_factory=list)
    backups: list = field(default_factory=list)


def owner_kind(owner: str) -> str:
    if owner in ("kit", "user"):
        return owner
    if owner.startswith("external:"):
        return "external"
    if owner.startswith("pack:"):
        return "pack"
    return "unknown"


class Engine:
    """설치 · update 판정과 적용(design §6.2 · §6.3). dry_run 이면 판정만 한다."""

    def __init__(self, root: Path, spec: dict, tokens: dict, agents: list[str], dry_run: bool = False):
        self.root = root
        self.spec = spec
        self.tokens = tokens
        self.agents = agents
        self.dry_run = dry_run
        self.wants, self.findings = build_wants(root, spec, tokens, agents)
        self.sources = load_sources(root)
        self.ops: list[Op] = []
        self.entries: list[Entry] = []

    def wants_by_path(self) -> dict[str, Want]:
        return {w.path: w for w in self.wants}

    def emit(self, op: Op, entry: Entry | None) -> None:
        self.ops.append(op)
        if entry is not None:
            self.entries.append(entry)

    def kit_entry(self, w: Want, sha: str | None = None) -> Entry:
        return Entry(w.path, w.op, "kit", w.sha if sha is None else sha, w.harness, w.source, w.from_sha)

    # merge(설치 · update 공통)
    def merge(self, w: Want, prev: Entry | None, claimed: list[Entry]) -> None:
        cur = read_text(self.root, w.path)
        p = self.root / w.path
        if cur is None and p.exists():
            self.emit(Op(w.path, "merge", "conflict", "일반 파일이 아니다"), prev)
            return
        merge, _, _ = MERGERS[w.kind]
        v1 = next((c for c in claimed if c.path == w.path), None)
        created = bool(prev and prev.created)
        if v1 is not None and cur is not None:
            unmodified = v1.sha is not None and sha256(cur.encode("utf-8")) == v1.sha
            if w.kind == "claude-md":
                lines = cur.split("\n")
                has_block = any(line.startswith("<!-- harness-kit:begin claude") for line in lines)
                if unmodified:
                    cur, created = None, True
                elif not has_block:
                    fresh = merge(None, w.merge)
                    self.emit(Op(w.path, "merge", "conflict", "v1 CLAUDE.md 를 사람이 고쳤다", new_files=[f"{w.path}.new"]), v1)
                    if not self.dry_run:
                        write_atomic(self.root / f"{w.path}.new", fresh["text"].encode("utf-8"), False)
                    return
            else:
                created = unmodified
        r = merge(cur, w.merge, prev.keys if prev and prev.keys is not None else None)
        if not r["ok"]:
            self.emit(Op(w.path, "merge", "conflict", r["reason"]), prev or Entry(w.path, "merge", "kit", harness=w.harness, keys=[]))
            return
        created = created or r["created"]
        action = "create" if cur is None and not p.exists() else ("same" if cur == r["text"] else "merge")
        if action != "same" and not self.dry_run:
            write_atomic(p, r["text"].encode("utf-8"), False)
        self.emit(Op(w.path, "merge", action), Entry(w.path, "merge", "kit", None, w.harness, keys=r["keys"], created=created))

    def install(self, w: Want, prev: Entry | None, force: bool) -> None:
        if w.op == "merge":
            self.merge(w, prev, [])
            return
        if w.deferred:
            self.emit(Op(w.path, w.op, "defer", "원본이 .new 대기 중이다"), prev)
            return
        cur = state(self.root, w.path, w.kind == "dir")
        if cur["kind"] == "none":
            action, entry = "create", self.kit_entry(w)
        elif cur["kind"] != "file":
            action, entry = "skip-user", prev or Entry(w.path, w.op, "user", None, w.harness)
            self.emit(Op(w.path, w.op, action, cur.get("what", "링크다")), entry)
            return
        elif cur["sha"] == w.sha:
            action, entry = "same", self.kit_entry(w)
        elif prev is not None and owner_kind(prev.owner) == "kit":
            self.emit(Op(w.path, w.op, "keep"), prev)
            return
        elif force:
            action, entry = "replace", self.kit_entry(w)
        else:
            self.emit(Op(w.path, w.op, "skip-user", "사람이 둔 파일이다"), Entry(w.path, w.op, "user", None, w.harness))
            return
        if action in ("create", "replace") and not self.dry_run:
            write_want(self.root, w)
        self.emit(Op(w.path, w.op, action), entry)

    def unmodified_claimed(self, w: Want, cur: dict, claimed: list[Entry]) -> bool:
        if w.kind != "dir":
            c = next((c for c in claimed if c.path == w.path), None)
            return c is not None and c.sha is not None and cur.get("sha") == c.sha
        shas = {c.path[len(w.path) + 1:]: c.sha for c in claimed if c.path.startswith(w.path + "/")}
        files = cur.get("files", {})
        return bool(shas) and all(rel in shas and shas[rel] is not None and sha256(data) == shas[rel] for rel, data in files.items())

    def update(self, w: Want, prev: Entry | None, claimed: list[Entry], accept_all: bool) -> None:
        if w.op == "merge":
            self.merge(w, prev, claimed)
            return
        if w.deferred:
            self.emit(Op(w.path, w.op, "defer", "원본이 .new 대기 중이다"), prev)
            for c in claimed:
                self.entries.append(c)
            return
        if prev is not None and owner_kind(prev.owner) != "kit":
            kind = owner_kind(prev.owner)
            self.emit(Op(w.path, w.op, {"user": "skip-user", "external": "skip-external", "pack": "skip-pack"}.get(kind, "skip-user")), prev)
            return
        cur = state(self.root, w.path, w.kind == "dir")
        tracked = prev is not None or bool(claimed)
        if cur["kind"] == "link":
            self.write(w, "replace", "symlink-found")
            return
        if cur["kind"] == "other":
            self.emit(Op(w.path, w.op, "skip-user", cur["what"]), prev or Entry(w.path, w.op, "user", None, w.harness))
            return
        if not tracked:
            if cur["kind"] == "none":
                self.write(w, "new")
            elif cur["sha"] == w.sha:
                self.emit(Op(w.path, w.op, "same"), self.kit_entry(w))
            else:
                self.emit(Op(w.path, w.op, "skip-user", "사람이 둔 파일이다"), Entry(w.path, w.op, "user", None, w.harness))
            return
        if cur["kind"] == "none":
            self.write(w, "restore")
            return
        if cur["sha"] == w.sha:
            self.emit(Op(w.path, w.op, "same"), self.kit_entry(w))
            return
        unmodified = (prev.sha is not None and cur["sha"] == prev.sha) if prev is not None else self.unmodified_claimed(w, cur, claimed)
        if unmodified:
            self.write(w, "update")
            return
        base = prev.sha if prev is not None else (next((c.sha for c in claimed if c.path == w.path), None) if w.kind != "dir" else None)
        if accept_all:
            backups = [f"{w.path}.bak"] if w.kind != "dir" else [f"{w.path}/{rel}.bak" for rel in differing(w, cur) + extra_files(w, cur) if rel in cur.get("files", {})]
            if not self.dry_run:
                for b in backups:
                    os.replace(self.root / b.removesuffix(".bak"), self.root / b)
            self.write(w, "replace", backups=backups)
            return
        new_files = [f"{w.path}.new"] if w.kind != "dir" else [f"{w.path}/{rel}.new" for rel in differing(w, cur)]
        if not self.dry_run:
            if w.kind != "dir":
                write_atomic(self.root / f"{w.path}.new", w.data, False)
            else:
                data = {rel: d for rel, d, _ in w.files}
                for n in new_files:
                    write_atomic(self.root / n, data[n[len(w.path) + 1: -len(".new")]], False)
        self.emit(Op(w.path, w.op, "conflict", "복사본 · 생성물을 직접 고쳤다 — 원본을 고친다", new_files=new_files), self.kit_entry(w, sha=base or ""))
        self.entries[-1].sha = base

    def write(self, w: Want, action: str, reason: str = "", backups: list | None = None) -> None:
        if not self.dry_run:
            write_want(self.root, w)
        self.emit(Op(w.path, w.op, action, reason, backups=backups or []), self.kit_entry(w))

    def drop(self, e: Entry, why: str = "") -> None:
        """원하지 않게 된 배치 항목 · retire(design §6.3). merge 는 킷 키를 뺀다."""
        if owner_kind(e.owner) != "kit":
            self.entries.append(e)
            return
        if e.op == "merge":
            kind = MERGE_KIND.get(e.path)
            cur = read_text(self.root, e.path)
            if kind is None or cur is None:
                self.ops.append(Op(e.path, "merge", "delete" if cur is None else "keep-modified", why))
                return
            merge, unmerge, _ = MERGERS[kind]
            want = full_merge_want(kind, self.spec, self.tokens, self.sources)
            keys = e.keys if e.keys is not None else merge(None, want)["keys"]
            r = unmerge(cur, keys, want)
            if not r["ok"]:
                self.emit(Op(e.path, "merge", "conflict", r["reason"]), e)
                return
            if r["empty"] and e.created:
                if not self.dry_run:
                    delete_want_path(self.root, e.path, False)
                self.ops.append(Op(e.path, "merge", "delete"))
            else:
                if r["text"] != cur and not self.dry_run:
                    write_atomic(self.root / e.path, r["text"].encode("utf-8"), False)
                self.ops.append(Op(e.path, "merge", "unmerge"))
            return
        p = self.root / e.path
        is_dir = p.is_dir() and not p.is_symlink()
        cur = state(self.root, e.path, is_dir)
        action = "retire" if e.op == "copy" else "delete"
        if cur["kind"] == "none":
            self.ops.append(Op(e.path, e.op, action, "파일이 이미 없다"))
            return
        if cur["kind"] == "file" and e.sha is not None and cur["sha"] == e.sha:
            if not self.dry_run:
                delete_want_path(self.root, e.path, is_dir)
            self.ops.append(Op(e.path, e.op, action, why))
            return
        self.emit(Op(e.path, e.op, "keep-modified", "사람이 고친 파일이다 — 지우지 않았다"), Entry(e.path, e.op, "user", None, e.harness, label=e.label))


def claims(w: Want, path: str) -> bool:
    return path == w.path or (w.kind == "dir" and path.startswith(w.path + "/"))


def replacement_deferred(path: str, wants: dict[str, Want]) -> bool:
    if path.startswith(".claude/commands/") and path.endswith(".md"):
        w = wants.get(f".claude/skills/{path[len('.claude/commands/'):-len('.md')]}")
        return bool(w and w.deferred)
    return False


def run_install(engine: Engine, prev: list[Entry], force: bool) -> None:
    by_path = {e.path: e for e in prev if e.op in PROJECTION_OPS}
    for w in sorted(engine.wants, key=lambda w: w.path.encode("utf-8")):
        engine.install(w, by_path.get(w.path), force)


def run_update(engine: Engine, prev: list[Entry], copy_now: set[str], accept_all: bool) -> None:
    wants = engine.wants_by_path()
    projection = {e.path: e for e in prev if e.op in PROJECTION_OPS}
    orphans = [e for e in prev if e.op == "copy" and e.path not in copy_now]
    claimed: dict[str, list[Entry]] = {}
    rest: list[Entry] = []
    for e in orphans:
        w = next((w for w in wants.values() if claims(w, e.path)), None)
        if w is not None:
            claimed.setdefault(w.path, []).append(e)
        else:
            rest.append(e)
    for w in sorted(engine.wants, key=lambda w: w.path.encode("utf-8")):
        engine.update(w, projection.get(w.path), claimed.get(w.path, []), accept_all)
    for path in byte_sorted(p for p in projection if p not in wants):
        engine.drop(projection[path], "원본이 없다")
    for e in sorted(rest, key=lambda e: e.path.encode("utf-8")):
        if not e.path.startswith(HARNESS_DIRS):
            continue
        if replacement_deferred(e.path, wants):
            engine.emit(Op(e.path, "copy", "defer", "바꿀 스킬 원본이 .new 대기 중이다"), e)
            continue
        engine.drop(e, "v1 포인터 — 복사본 · 생성물로 바뀌었다")


# ── 명령 ─────────────────────────────────────────────────────────────────────


def read_meta(root: Path) -> dict:
    try:
        meta = json.loads((root / META_REL).read_text(encoding="utf-8"))
        return meta if isinstance(meta, dict) else {}
    except (OSError, ValueError):
        return {}


def selection(root: Path, args) -> tuple[list[str], dict]:
    meta = read_meta(root)
    agents = [a for a in (args.agents.replace(",", " ").split() if args.agents else meta.get("agents") or []) if a in HARNESSES]
    tokens = {k: v for k, v in (meta.get("tokens") or {}).items() if isinstance(v, str)}
    for raw in args.token or []:
        k, _, v = raw.partition("=")
        tokens[k] = v
    return agents, tokens


ACTION_ORDER = ("create", "new", "restore", "update", "replace", "merge", "unmerge", "conflict", "keep-modified", "delete", "retire", "skip-user", "keep", "defer")


def summary(ops: list[Op]) -> str:
    counts = {a: sum(1 for o in ops if o.action == a) for a in ACTION_ORDER}
    shown = " · ".join(f"{a} {n}" for a, n in counts.items() if n)
    return f"  배치: {shown or '바꿀 것 없음'}"


def cmd_plan(args) -> int:
    root = Path(args.root).resolve()
    agents, tokens = selection(root, args)
    wants, findings = build_wants(root, load_spec(), tokens, agents)
    if args.json:
        print(json.dumps({"ops": records(wants, root), "findings": findings}, ensure_ascii=False, indent=2))
    else:
        for r in records(wants, root):
            print(f"  {r['op']:<7} {r['path']}")
    return 0


def cmd_apply(args) -> int:
    root = Path(args.root).resolve()
    agents, tokens = selection(root, args)
    engine = Engine(root, load_spec(), tokens, agents, dry_run=args.dry_run)
    prev = parse_v1_lines(Path(args.prev_lock).read_text(encoding="utf-8")) if args.prev_lock and Path(args.prev_lock).is_file() else []
    if args.mode == "setup":
        run_install(engine, prev, args.force)
    else:
        lock_text = Path(args.lock).read_text(encoding="utf-8") if Path(args.lock).is_file() else ""
        copy_now = {e.path for e in parse_v1_lines(lock_text) if e.op == "copy"}
        run_update(engine, prev, copy_now, args.accept_all)
    for f in engine.findings:
        print(f"  ✖ {f['kind']:<16} {f['path']} — {f['hint']}" if f["severity"] == "error" else f"  ⚠ {f['kind']:<16} {f['path']} — {f['hint']}")
    for o in engine.ops:
        if o.action in ("same", "keep"):
            continue
        extra = "".join(f"  → {n}" for n in o.new_files) + "".join(f"  (수정본 → {b})" for b in o.backups)
        print(f"  {o.action:<13} {o.path}{extra}{'  ' + o.reason if o.reason else ''}")
    print(summary(engine.ops))
    if not args.dry_run and args.lock:
        with open(args.lock, "a", encoding="utf-8") as handle:
            for e in sorted(engine.entries, key=lambda e: e.path.encode("utf-8")):
                handle.write(e.v1_line() + "\n")
    return 0


def cmd_sync(args) -> int:
    """lock 의 배치 항목을 지금 원본으로 다시 만든다. 사람이 고친 생성 파일은 건드리지 않고 한 줄로 알린다."""
    root = Path(args.root).resolve()
    agents, tokens = selection(root, args)
    fmt, entries, raw = read_lock(root)
    if fmt == "missing":
        print("lock 이 없다 — 설치는 harness-kit init", file=sys.stderr)
        return 1
    spec = load_spec()
    wants, _ = build_wants(root, spec, tokens, agents)
    changed = [c.rstrip("/") for c in args.changed or []]

    def chosen(source: str | None) -> bool:
        return not changed or any(source and (c == source or c.startswith(source + "/") or source.startswith(c + "/")) for c in changed)

    by_path = {e.path: e for e in entries}
    drifted: list[str] = []
    for w in wants:
        if w.deferred or (w.op != "merge" and not chosen(w.source)) or (w.op == "merge" and changed and w.kind != "codex-config"):
            continue
        e = by_path.get(w.path)
        if w.op == "merge":
            merge, _, _ = MERGERS[w.kind]
            cur = read_text(root, w.path)
            r = merge(cur, w.merge, e.keys if e and e.keys is not None else None)
            if r["ok"] and r["text"] != cur:
                write_atomic(root / w.path, r["text"].encode("utf-8"), False)
            if r["ok"]:
                by_path[w.path] = Entry(w.path, "merge", "kit", None, w.harness, keys=r["keys"], created=bool(e and e.created) or r["created"])
            continue
        if e is not None and owner_kind(e.owner) != "kit":
            continue
        cur = state(root, w.path, w.kind == "dir")
        if cur["kind"] == "other":
            continue
        if cur["kind"] == "file" and cur["sha"] != w.sha and e is not None and e.sha is not None and cur["sha"] != e.sha:
            drifted.append(w.path)
            continue
        if cur["kind"] == "file" and e is None and cur["sha"] != w.sha:
            continue
        if cur["kind"] != "file" or cur["sha"] != w.sha:
            write_want(root, w)
        by_path[w.path] = Entry(w.path, w.op, "kit", w.sha, w.harness, w.source, w.from_sha, label=e.label if e else "")
    wanted = {w.path for w in wants}
    for path, e in list(by_path.items()):
        if e.op in ("mirror", "render") and owner_kind(e.owner) == "kit" and path not in wanted and (not changed or chosen(e.source)):
            p = root / path
            is_dir = p.is_dir() and not p.is_symlink()
            cur = state(root, path, is_dir)
            if cur["kind"] == "none" or (cur["kind"] == "file" and e.sha is not None and cur["sha"] == e.sha):
                delete_want_path(root, path, is_dir)
                del by_path[path]
    if fmt == "v2":
        old = {e["path"]: e for e in raw.get("entries", [])}
        merged = []
        for path, e in by_path.items():
            base = old.get(path, {})
            if e.op in PROJECTION_OPS:
                merged.append(e.v2())
            else:
                merged.append(base)
        write_v2_lock(root, raw, merged)
    else:
        text = (root / LOCK_REL).read_text(encoding="utf-8")
        head = [l for l in text.split("\n") if l.startswith("#")]
        body = [l for l in text.split("\n")[1:] if l and not l.startswith("#") and (len(l.split("\t")) != 4 or l.split("\t")[1].rstrip("+") not in PROJECTION_OPS)]
        proj = [by_path[p].v1_line() for p in byte_sorted(by_path) if by_path[p].op in PROJECTION_OPS]
        write_atomic(root / LOCK_REL, ("\n".join(head + body + proj) + "\n").encode("utf-8"), False)
    if drifted:
        line = f"생성 파일을 직접 고쳤다: {drifted[0]}{f' 외 {len(drifted) - 1}' if len(drifted) > 1 else ''} — 원본을 고친 뒤 harness-kit repair"
        print(line.encode("utf-8")[:200].decode("utf-8", errors="ignore"), file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="projection.py", description="하네스 배치(mirror · render · merge)")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("plan", "apply", "sync"):
        p = sub.add_parser(name)
        p.add_argument("--root", default=str(HERE.parents[1]))
        p.add_argument("--agents")
        p.add_argument("--token", action="append")
        if name == "plan":
            p.add_argument("--json", action="store_true")
        if name == "apply":
            p.add_argument("--mode", choices=("setup", "update"), required=True)
            p.add_argument("--lock", required=True)
            p.add_argument("--prev-lock")
            p.add_argument("--force", action="store_true")
            p.add_argument("--accept-all", action="store_true")
            p.add_argument("--dry-run", action="store_true")
        if name == "sync":
            p.add_argument("--changed", action="append")
    args = parser.parse_args(argv)
    try:
        return {"plan": cmd_plan, "apply": cmd_apply, "sync": cmd_sync}[args.command](args)
    except ProjectionError as error:
        print(f"✖ {error}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
