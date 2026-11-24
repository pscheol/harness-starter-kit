"""worktree 상태 기록 · 세션 기록 · 끝 조건 · 용량(설계 05 §3.8 · §3.10 · §3.11 · §3.14). 표준 라이브러리만 쓴다."""

import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from harness.worktree_repo import inside, read_json, real, run_git

SCHEMA = "harness-kit.worktree/v1"
LIVE_MINUTES = 30
DONE_MINUTES = 10
SESSION_DAYS = 7
SIZE_CACHE_SECONDS = 600
DU_SECONDS = 20
KIT_ENV_FILE = ".env.worktree"
DEPS_DIRS = ("node_modules", ".venv", "venv")
BUILD_DIRS = ("build", "dist", ".next", "target", "out", ".gradle")


def now_text():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_time(text):
    if not isinstance(text, str):
        return None
    try:
        value = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def age_seconds(text):
    value = parse_time(text)
    return None if value is None else (datetime.now(timezone.utc) - value).total_seconds()


# ── 상태 기록 ────────────────────────────────────────────────────────────────


def record_path(ctx, rel):
    return ctx.state_dir / f"{rel}.json"


def read_record(ctx, rel):
    return read_json(record_path(ctx, rel))


def write_record(ctx, rel, record):
    path = record_path(ctx, rel)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.hk-{os.getpid()}")
    tmp.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def delete_record(ctx, rel):
    path = record_path(ctx, rel)
    try:
        path.unlink()
    except FileNotFoundError:
        pass
    folder = path.parent
    while folder != ctx.state_dir and folder.is_dir() and not any(folder.iterdir()):
        folder.rmdir()
        folder = folder.parent


def all_records(ctx):
    """[(root 기준 상대 경로, 기록)] — 상태 폴더를 재귀로 읽는다."""
    out = []
    if not ctx.state_dir.is_dir():
        return out
    for path in sorted(ctx.state_dir.rglob("*.json")):
        data = read_json(path)
        out.append((path.relative_to(ctx.state_dir).as_posix()[: -len(".json")], data or {}))
    return out


def issue_records(ctx):
    return [(rel, rec) for rel, rec in all_records(ctx) if rec.get("kind") == "issue" and rec.get("repo") == ctx.repo_id]


def agent_records(ctx):
    return [(rel, rec) for rel, rec in all_records(ctx) if rec.get("kind") == "agent"]


def used_port_indexes(ctx):
    return {rec.get("portIndex") for _, rec in issue_records(ctx) if isinstance(rec.get("portIndex"), int)}


# ── 세션 ─────────────────────────────────────────────────────────────────────


def session_files(ctx):
    seen, out = set(), []
    for folder in (ctx.super, ctx.main):
        directory = folder / ".agents/state/sessions"
        if directory.is_dir() and real(directory) not in seen:
            seen.add(real(directory))
            out.extend(sorted(directory.glob("*.json")))
    return out


def sessions(ctx):
    out = []
    for path in session_files(ctx):
        data = read_json(path)
        if data is None:
            continue
        out.append({"id": str(data.get("id") or path.stem), "cwd": data.get("cwd"), "lastSeenAt": data.get("lastSeenAt"), "path": path})
    return out


def sessions_in(ctx, place, minutes=LIVE_MINUTES, exclude_id=None):
    """place 안에서 연 세션 중 lastSeenAt 이 minutes 분 안인 것."""
    live = []
    for s in sessions(ctx):
        if exclude_id and s["id"] == exclude_id:
            continue
        if not isinstance(s["cwd"], str) or not os.path.isabs(s["cwd"]) or not inside(s["cwd"], place):
            continue
        age = age_seconds(s["lastSeenAt"])
        if age is not None and age <= minutes * 60:
            live.append(s)
    return live


def last_seen_in(ctx, place):
    stamps = [parse_time(s["lastSeenAt"]) for s in sessions(ctx) if isinstance(s["cwd"], str) and os.path.isabs(s["cwd"]) and inside(s["cwd"], place)]
    stamps = [t for t in stamps if t is not None]
    return max(stamps) if stamps else None


def stale_session_files(ctx, days=SESSION_DAYS):
    out = []
    for s in sessions(ctx):
        age = age_seconds(s["lastSeenAt"])
        if age is not None and age > days * 86400:
            out.append(s["path"])
    return out


def last_used(ctx, place, record):
    stamps = [parse_time((record or {}).get("lastUsedAt"))]
    index = run_git(place, "rev-parse", "--git-path", "index")
    if index[0] == 0:
        path = Path(index[1].strip())
        path = path if path.is_absolute() else Path(place) / path
        try:
            stamps.append(datetime.fromtimestamp(path.stat().st_mtime, timezone.utc))
        except OSError:
            pass
    stamps.append(last_seen_in(ctx, place))
    stamps = [t for t in stamps if t is not None]
    return max(stamps).strftime("%Y-%m-%dT%H:%M:%SZ") if stamps else None


# ── 끝 조건(05 §3.11) ────────────────────────────────────────────────────────


def change_lines(place):
    code, out, _ = run_git(place, "status", "--porcelain")
    if code != 0:
        return None
    return [line for line in out.splitlines() if line.strip() and line[3:].strip() != KIT_ENV_FILE]


def unpushed_count(place, agent_branch=None):
    """push 안 된 커밋 수. 임시 worktree 는 다른 로컬 브랜치에 있는 커밋도 센 것으로 본다(05 §3.13)."""
    arguments = ["rev-list", "--count", "HEAD", "--not", "--remotes"]
    if agent_branch:
        arguments += [f"--exclude={agent_branch}", "--branches"]
    code, out, _ = run_git(place, *arguments)
    return int(out.strip()) if code == 0 and out.strip().isdigit() else None


def finish_state(ctx, place, record, exclude_session=None, check_cwd=True):
    """끝 조건 판정. {'finished': bool, 'changes': n, 'unpushed': n, 'sessions': [...], 'inside': bool, 'reasons': [...]}."""
    agent_branch = record.get("branch") if record and record.get("kind") == "agent" else None
    lines = change_lines(place)
    pushed = unpushed_count(place, agent_branch)
    live = sessions_in(ctx, place, DONE_MINUTES, exclude_session)
    here = check_cwd and inside(Path.cwd(), place)
    reasons = []
    if lines is None or pushed is None:
        reasons.append("git 상태를 읽지 못했다")
    if lines:
        reasons.append(f"커밋 안 된 변경 {len(lines)}개 (git status --porcelain)")
    if pushed:
        command = "git rev-list --count HEAD --not --remotes" if not agent_branch else "git rev-list --count HEAD --not --remotes --exclude=<임시 브랜치> --branches"
        reasons.append(f"push 안 된 커밋 {pushed}개 ({command})")
    if live:
        reasons.append(f"다른 세션 {len(live)}개가 {DONE_MINUTES}분 안에 이 worktree 를 썼다 (세션 {', '.join(s['id'] for s in live[:3])})")
    if here:
        reasons.append("부른 작업 폴더가 이 worktree 안이다 — 다른 폴더에서 실행한다")
    return {"finished": not reasons, "changes": len(lines or []), "unpushed": pushed or 0, "sessions": [s["id"] for s in live], "inside": here, "reasons": reasons}


# ── 용량 ─────────────────────────────────────────────────────────────────────


def du_kb(path):
    try:
        result = subprocess.run(["du", "-sk", str(path)], capture_output=True, text=True, timeout=DU_SECONDS, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    head = result.stdout.split("\t", 1)[0].strip()
    return int(head) if head.isdigit() else None


def free_gb(path):
    folder = Path(path)
    while not folder.exists() and folder != folder.parent:
        folder = folder.parent
    return shutil.disk_usage(folder).free / (1024 ** 3)


def free_kb(path):
    return int(free_gb(path) * 1024 * 1024)


def disk_breakdown(place, total_kb):
    """소스(추적 파일) · 의존성 · 빌드 · 그 밖(KB). 복제 파일은 논리 크기로 센다."""
    deps = build = 0
    for entry in sorted(Path(place).iterdir()) if Path(place).is_dir() else []:
        if entry.name in DEPS_DIRS and entry.is_dir():
            deps += du_kb(entry) or 0
        elif entry.name in BUILD_DIRS and entry.is_dir():
            build += du_kb(entry) or 0
        elif entry.is_dir() and entry.name not in (".git",):
            for inner in entry.iterdir():
                if inner.is_dir() and inner.name in DEPS_DIRS:
                    deps += du_kb(inner) or 0
                elif inner.is_dir() and inner.name in BUILD_DIRS:
                    build += du_kb(inner) or 0
    source = 0
    code, out, _ = run_git(place, "ls-files", "-z")
    if code == 0:
        for name in out.split("\0"):
            if name:
                try:
                    source += os.lstat(os.path.join(str(place), name)).st_size
                except OSError:
                    pass
    source_kb = (source + 1023) // 1024
    other = max(0, total_kb - source_kb - deps - build)
    return {"source": source_kb, "deps": deps, "build": build, "other": other}
