"""`worktree.py new` 와 Claude WorktreeCreate 훅의 만들기(설계 05 §3.3 · §3.13, HK-15 design §4). 표준 라이브러리만 쓴다."""

import os
import re
import sys
from pathlib import Path

from harness import worktree_prepare as prepare
from harness import worktree_state as state
from harness.worktree_repo import (
    AGENTS_DIR,
    ISSUE_NAME,
    WtError,
    find_issue,
    git_out,
    inside,
    local_branch_exists,
    real,
    remote_ref_exists,
    resolve_context,
    resolve_context_loose,
    run_git,
)

KEY_PREFIX = re.compile(r"^([A-Z][A-Z0-9]{1,9}-[0-9]+)")
FETCH_SECONDS = 10
AGENT_LIMIT_FACTOR = 2


def warn(message):
    print(f"⚠ {message}", file=sys.stderr)


def agent_created_by(environ=None):
    """세션 안에서 부르면 하네스 이름(세션 id 는 훅 입력에만 있다), 사람 터미널이면 human."""
    environ = os.environ if environ is None else environ
    if environ.get("CLAUDECODE") == "1" or environ.get("CLAUDE_CODE_MESSAGING_SOCKET"):
        return {"harness": "claude"}
    for key in sorted(environ):
        if key.startswith("CODEX_") and key != "CODEX_HOME" and environ.get(key):
            return {"harness": "codex"}
        if key.startswith("KIRO_") and key != "KIRO_HOME" and environ.get(key):
            return {"harness": "kiro"}
    return {"harness": "human"}


def existing_places(ctx, records):
    return [(rel, rec) for rel, rec in records if isinstance(rec.get("path"), str) and Path(rec["path"]).is_dir()]


def limit_message(ctx, records):
    lines = [f"이 리포(`{ctx.repo_id}`)에는 킷 worktree 가 이미 {len(records)}개 있다(상한 {ctx.max_per_repo}):"]
    for rel, rec in records:
        place = Path(rec["path"])
        finished = state.finish_state(ctx, place, rec, check_cwd=False)["finished"]
        used = state.last_used(ctx, place, rec) or "-"
        lines.append(f"  {rec.get('key') or rel}  마지막 사용 {used}  {'끝남 → wt done ' + str(rec.get('key') or rel) if finished else '진행 중'}")
    lines.append("끝낸 것은 `python3 scripts/harness/worktree.py done <이슈키>` 로 지운다")
    return "\n".join(lines)


def add_worktree(ctx, place, branch, base_ref, partial):
    """05 §3.3 의 7번. 새 브랜치는 --no-track(없으면 upstream 이 origin/<base> 가 되어 push 가 거부된다)."""
    place.parent.mkdir(parents=True, exist_ok=True)
    flags = ["--no-checkout"] if partial else []
    if local_branch_exists(ctx.main, branch):
        arguments = ["worktree", "add", *flags, str(place), branch]
    elif remote_ref_exists(ctx.main, f"origin/{branch}"):
        arguments = ["worktree", "add", *flags, "--track", "-b", branch, str(place), f"origin/{branch}"]
    else:
        arguments = ["worktree", "add", *flags, "--no-track", "-b", branch, str(place), base_ref]
    code, _, err = run_git(ctx.main, *arguments, timeout=120)
    if code != 0:
        raise WtError(f"git worktree add 실패: {err.strip()}", 3)


def fetch_base(ctx):
    code, _, err = run_git(ctx.main, "fetch", "origin", ctx.base, "--quiet", timeout=FETCH_SECONDS)
    if code != 0:
        warn(f"git fetch origin {ctx.base} 실패 — 캐시된 origin/{ctx.base} 를 쓴다 ({err.strip()[:120]})")


def prepare_place(ctx, place, branch, partial, folders, run_deps):
    """9번: .worktreeinclude → 의존성 → .env.worktree. 실패해도 worktree 는 둔다."""
    out = {"copied": [], "deps": [], "env": {}}
    try:
        if partial:
            prepare.apply_sparse(place, branch, folders)
        out["copied"] = prepare.copy_includes(ctx.main, place, folders if partial else None)
        out["deps"], cargo = prepare.handle_deps(ctx.main, place, run_deps)
    except WtError:
        raise
    except Exception as error:  # noqa: BLE001 - 준비 단계 실패가 만든 worktree 를 지우게 하지 않는다
        warn(f"worktree 준비 중 오류: {error}")
        cargo = False
    out["cargo"] = cargo
    return out


def create_issue(ctx, key, docs=False, only=(), run_deps=False, skip_design=False, created_by=None):
    issue = find_issue(ctx, key)
    design_check = "n/a"
    if not docs:
        if issue.design_status != "approved":
            if not skip_design:
                shown = issue.design_status or "없음"
                raise WtError(f"design 이 approved 가 아니다(지금 {shown}). 문서만 쓰려면 --docs", 1, "승인은 사람이 한다(approve.py · 관리 페이지)")
            warn("design 승인 검사를 건너뛴다(--skip-design-check) — 기록에 designCheck: skipped 로 남긴다")
            design_check = "skipped"
        else:
            design_check = "approved"
    records = existing_places(ctx, state.issue_records(ctx))
    if len(records) >= ctx.max_per_repo:
        raise WtError(limit_message(ctx, records), 3)
    place = ctx.place_for_issue(key, issue.slug)
    if place.exists():
        raise WtError(f"자리가 이미 있다: {place}", 3, "`wt list` 로 확인하거나 `wt done` 으로 끝낸다")
    fetch_base(ctx)
    base_ref = f"origin/{ctx.base}"
    if not remote_ref_exists(ctx.main, base_ref):
        raise WtError(f"{base_ref} 가 없다 — git.base({ctx.base}) 를 확인하거나 git fetch 한다", 3)
    base_sha = git_out(ctx.main, "rev-parse", base_ref)
    partial = docs or bool(only)
    folders = prepare.sparse_folders(only) if partial else None
    before = state.free_kb(place.parent if place.parent.exists() else ctx.root)
    add_worktree(ctx, place, issue.branch, base_ref, partial)
    prepared = prepare_place(ctx, place, issue.branch, partial, folders, run_deps)
    index = prepare.pick_index(state.used_port_indexes(ctx), ctx.max_per_repo)
    cargo_dir = f"{ctx.root}/.cargo-target" if prepared["cargo"] else None
    env = {}
    try:
        env = prepare.write_env(place, key, ctx.repo_name, index, cargo_dir)
    except OSError as error:
        warn(f".env.worktree 를 쓰지 못했다: {error}")
    delta = max(0, before - state.free_kb(place.parent))
    stamp = state.now_text()
    record = {
        "schema": state.SCHEMA, "kind": "issue", "key": key, "slug": issue.slug, "repo": ctx.repo_id, "path": str(place), "branch": issue.branch,
        "base": base_ref, "baseSha": base_sha, "docsOnly": bool(docs), "only": list(only), "designCheck": design_check, "portIndex": index,
        "createdAt": stamp, "createdBy": created_by or agent_created_by(), "diskDeltaKB": delta, "lastUsedAt": stamp,
    }
    state.write_record(ctx, ctx.relative(place), record)
    return {"path": str(place), "branch": issue.branch, "base": base_ref, "baseSha": base_sha, "key": key, "repo": ctx.repo_id, "copied": prepared["copied"],
            "deps": prepared["deps"], "env": env, "diskDeltaKB": delta, "designCheck": design_check, "docsOnly": bool(docs), "portIndex": index}


def render_new(result, issue_open_hint):
    base_short = result["baseSha"][:7] if result.get("baseSha") else "-"
    lines = [f"✔ worktree: {result['path']}", f"  브랜치   {result['branch']}  ({result['base']} {base_short} 에서)"]
    if result["copied"]:
        lines.append(f"  복사     {' · '.join(result['copied'][:6])} ({len(result['copied'])}개, .worktreeinclude)")
    env = result["env"]
    ports = {k: v for k, v in env.items() if k.endswith("_PORT")}
    if env:
        first = next(iter(ports.items()), None)
        shown = f"  (.env.worktree: {first[0]}={first[1]})" if first else ""
        lines.append(f"  포트     +{env.get('HARNESS_PORT_OFFSET', '0')}{shown}")
    for text in result["deps"]:
        lines.append(f"  의존성   {text}")
    lines.append(f"  늘어난 용량 {result['diskDeltaKB'] // 1024}MB")
    lines.append(f"  다음     {issue_open_hint}")
    return "\n".join(lines)


# ── Claude WorktreeCreate 훅 ─────────────────────────────────────────────────


def safe_agent_name(name):
    text = name.strip()
    prefix = "pr-" if text.startswith("#") else ""
    text = re.sub(r"[^A-Za-z0-9._-]+", "-", text).strip("-.")
    text = re.sub(r"\.{2,}", ".", text)
    return (prefix + text) if text else ""


def hook_create(payload):
    """stdout 에 쓸 worktree 경로를 돌려준다. 실패는 WtError(exit 1)."""
    name = payload.get("name")
    cwd = payload.get("cwd")
    if not isinstance(name, str) or not name.strip():
        raise WtError("훅 입력에 name 이 없다", 1)
    if not isinstance(cwd, str) or not os.path.isabs(cwd):
        raise WtError("훅 입력의 cwd 가 절대경로가 아니다", 1)
    sid = payload.get("session_id") if isinstance(payload.get("session_id"), str) else None
    created_by = {"harness": "claude", **({"sessionId": sid} if sid else {})}
    try:
        if ISSUE_NAME.match(name.strip()):
            return create_issue_for_hook(cwd, name.strip(), created_by)
        return create_agent(cwd, name, created_by)
    except WtError as error:
        raise WtError(str(error), 1, error.hint) from error


def create_issue_for_hook(cwd, name, created_by):
    ctx = resolve_context(cwd)
    key = KEY_PREFIX.match(name)[1]
    for _, rec in state.issue_records(ctx):
        if rec.get("key") == key and isinstance(rec.get("path"), str) and Path(rec["path"]).is_dir():
            return rec["path"]
    return create_issue(ctx, key, created_by=created_by)["path"]


def create_agent(cwd, name, created_by):
    ctx = resolve_context_loose(cwd)
    safe = safe_agent_name(name)
    if not safe:
        raise WtError(f"이름을 폴더 이름으로 쓸 수 없다: {name!r}", 1)
    place = ctx.place_for_agent(safe)
    rel = ctx.relative(place) if place.exists() else f"{AGENTS_DIR}/{safe}"
    if place.is_dir() and state.read_record(ctx, rel):
        return str(place)
    if place.exists():
        raise WtError(f"자리가 이미 있다: {place}", 1)
    records = existing_places(ctx, state.agent_records(ctx))
    if len(records) >= AGENT_LIMIT_FACTOR * ctx.max_per_repo:
        raise WtError(f"임시 worktree 가 이미 {len(records)}개다(상한 {AGENT_LIMIT_FACTOR * ctx.max_per_repo}). `worktree.py gc` 로 끝난 것을 정리한다", 1)
    start = git_out(Path(cwd), "rev-parse", "HEAD") or git_out(ctx.main, "rev-parse", "HEAD")
    if not start:
        raise WtError("시작점(HEAD)을 읽지 못했다", 1)
    branch = f"wt/{safe}"
    before = state.free_kb(ctx.root)
    add_worktree(ctx, place, branch, start, False)
    prepare_place(ctx, place, branch, False, None, False)
    stamp = state.now_text()
    state.write_record(ctx, rel, {
        "schema": state.SCHEMA, "kind": "agent", "key": None, "slug": safe, "repo": ctx.repo_id, "path": str(place), "branch": branch, "base": "HEAD",
        "baseSha": start, "docsOnly": False, "only": [], "designCheck": "n/a", "portIndex": None, "createdAt": stamp, "createdBy": created_by,
        "diskDeltaKB": max(0, before - state.free_kb(ctx.root)), "lastUsedAt": stamp,
    })
    return str(place)


def known_place(ctx, path):
    """root 아래의 킷 worktree 인지(경로가 root 안이고 가려는 폴더가 root 자신이 아니다)."""
    return inside(path, ctx.root) and real(path) != real(ctx.root)
