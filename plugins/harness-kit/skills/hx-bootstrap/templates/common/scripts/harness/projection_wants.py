#!/usr/bin/env python3
"""하네스 배치 원본 · 원하는 결과(HK-13 design §2 · §4) — `.agents/` 를 읽어 하네스별 Want 목록과 해시를 만든다. 쓰지 않는다."""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import hashlib  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
from dataclasses import dataclass, field  # noqa: E402
from pathlib import Path  # noqa: E402

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from floor import FLOOR_HOOKS  # noqa: E402
from projection_hooks import (  # noqa: E402
    HOOKS_DIR,
    HOOKS_REL,
    HooksError,
    hook_doc_paths,
    merge_hook_docs,
    kiro_cli_hooks,
    kiro_ide_files,
    kit_script_suffixes,
    parse_hooks,
    render_kiro_coordinator,
    settings_hooks,
)
from projection_merge import (  # noqa: E402
    claude_md_want,
    codex_config_want,
    codex_hooks_want,
    gitattributes_want,
    MERGERS,
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
    hooks_text: str | None = None
    hooks_data: bytes = b""
    hook_docs: list = field(default_factory=list)   # [(경로, 내용)] hooks.d — 킷 hooks.json 뒤에 합친다(HK-14)
    modules: list = field(default_factory=list)


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
    hooks = root / HOOKS_REL
    if regular(hooks):
        data = hooks.read_bytes()
        src.hooks_text = data.decode("utf-8")
        src.hooks_data = HOOKS_REL.encode("utf-8") + b"\0" + data
        if has_pending_new(hooks):
            src.deferred.add(HOOKS_REL)
    folder = root / HOOKS_DIR
    if folder.is_dir() and not folder.is_symlink():
        for rel in hook_doc_paths(os.listdir(folder)):
            p = root / rel
            if regular(p):
                data = p.read_bytes()
                src.hook_docs.append((rel, data.decode("utf-8")))
                src.hooks_data += b"\n" + rel.encode("utf-8") + b"\0" + data
                if has_pending_new(p):
                    src.deferred.add(HOOKS_REL)
    modules = read_meta(root).get("modules")
    src.modules = [m for m in modules if isinstance(m, str)] if isinstance(modules, list) else []
    return src


def hooks_bundle_sha(root: Path) -> str | None:
    """훅 원본 묶음(hooks.json + hooks.d)의 sha256 — Kiro 훅 · 조율 에이전트 생성물의 원본 해시. hooks.json 이 없으면 None."""
    src = load_sources(root)
    return sha256(src.hooks_data) if src.hooks_text is not None else None


def load_hooks(src: Sources, spec: dict) -> tuple[list[dict] | None, list[dict]]:
    """킷 hooks.json + hooks.d(팩 · 프로젝트). hooks.json 이 없으면 (None, [])."""
    if src.hooks_text is None:
        return None, []
    try:
        return merge_hook_docs([(HOOKS_REL, src.hooks_text), *src.hook_docs], spec["hookMap"], FLOOR_HOOKS)
    except HooksError as error:
        raise ProjectionError(str(error)) from error


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
    parsed, hook_findings = load_hooks(src, spec)
    findings += hook_findings
    if parsed is None:
        findings.append({"kind": "hooks-missing", "severity": "error", "path": HOOKS_REL,
                         "hint": "훅 원본이 없어 하네스 훅을 만들지 않는다 — harness-kit repair 로 되살린다"})
    hooks = parsed or []
    hm = spec["hookMap"]
    suffixes = kit_script_suffixes(hooks, hm)
    d_hooks = {HOOKS_REL} & src.deferred
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
        wants.append(Want(".claude/settings.json", "merge", "claude", kind="settings",
                          merge=settings_want(spec, tokens, settings_hooks(hooks, "claude", hm, src.modules), suffixes)))
    if "codex" in agents:
        wants.append(Want(".codex/hooks.json", "merge", "codex", kind="codex-hooks",
                          merge=codex_hooks_want(settings_hooks(hooks, "codex", hm, src.modules), suffixes)))
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
        role_hooks = kiro_cli_hooks(hooks, hm, src.modules, subagents_only=True)
        wants += [render(f".kiro/agents/{stem(r.source)}.json", "kiro", r.source, render_kiro_role(r, f["kiro"], role_hooks), r.data, d) for r, f in roles]
        wants += [render(path, "kiro", HOOKS_REL, text, src.hooks_data, d_hooks) for path, text in kiro_ide_files(hooks, hm, src.modules)]
        slug = tokens.get("PROJECT_SLUG") or ""
        if slug and parsed is not None:
            coordinator = render_kiro_coordinator(spec, tokens, kiro_cli_hooks(hooks, hm, src.modules))
            wants.append(render(f".kiro/agents/{slug}.json", "kiro", HOOKS_REL, coordinator, src.hooks_data, d_hooks))
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
    if kind in ("settings", "codex-hooks"):
        hm = spec["hookMap"]
        try:
            hooks = (load_hooks(src, spec)[0] if src else None) or []
        except ProjectionError:
            hooks = []
        modules = [h["module"] for h in hooks if h.get("module")]
        if kind == "settings":
            return settings_want(spec, tokens, settings_hooks(hooks, "claude", hm, modules), kit_script_suffixes(hooks, hm))
        return codex_hooks_want(settings_hooks(hooks, "codex", hm, modules), kit_script_suffixes(hooks, hm))
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


def read_text(root: Path, rel: str) -> str | None:
    p = root / rel
    return p.read_text(encoding="utf-8") if regular(p) else None


def read_meta(root: Path) -> dict:
    try:
        meta = json.loads((root / META_REL).read_text(encoding="utf-8"))
        return meta if isinstance(meta, dict) else {}
    except (OSError, ValueError):
        return {}

