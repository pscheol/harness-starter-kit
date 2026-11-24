"""`worktree.py list · open · done · gc` 와 Claude WorktreeRemove 훅(설계 05 §3.8 · §3.9 · §3.11 · §3.12 · §3.13). 표준 라이브러리만 쓴다.

지우는 일은 끝 조건(커밋 · push · 다른 세션 · 부른 폴더)을 모두 통과한 worktree 에만 한다. gc 는 기본이 목록이다.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

from harness import worktree_state as state
from harness.worktree_repo import (
    AGENTS_DIR,
    WtError,
    choose_ide,
    inside,
    real,
    resolve_context_loose,
    run_git,
    worktree_list,
)

WARN_GB = 20.0
MIN_FREE_GB = 10.0


def env_float(name, default):
    try:
        return float(os.environ[name])
    except (KeyError, ValueError):
        return default


def warn(message):
    print(f"⚠ {message}", file=sys.stderr)


# ── 대상 찾기 ────────────────────────────────────────────────────────────────


def record_for_path(ctx, place):
    for rel, rec in state.all_records(ctx):
        if isinstance(rec.get("path"), str) and real(rec["path"]) == real(place):
            return rel, rec
    return None, None


def find_target(ctx, key=None, path=None):
    """(place, rel, record). 메인 폴더 · root 밖 · 킷 worktree 가 아니면 WtError(3)."""
    if path is None and key is None:
        path = Path.cwd()
        candidates = [Path(item["path"]) for item in worktree_list(ctx.main)[1:]]
        match = next((c for c in candidates if inside(path, c)), None)
        if match is None:
            raise WtError("킷 worktree 안이 아니다 — 이슈 키나 --path 를 준다", 3)
        path = match
    if path is not None:
        place = real(path)
        if place == real(ctx.main) or place == real(ctx.super):
            raise WtError("메인 폴더는 지우지 않는다", 3)
        if not inside(place, ctx.root) or place == real(ctx.root):
            raise WtError(f"킷이 만든 worktree 가 아니다(root {ctx.root} 밖): {place}", 3)
        rel, rec = record_for_path(ctx, place)
        if not place.is_dir():
            raise WtError(f"폴더가 없다: {place}", 3)
        return place, rel or place.relative_to(real(ctx.root)).as_posix(), rec or {}
    found = [(rel, rec) for rel, rec in state.all_records(ctx) if rec.get("key") == key and isinstance(rec.get("path"), str) and Path(rec["path"]).is_dir()]
    if not found:
        raise WtError(f"킷 worktree 가 없다: {key}", 3, "`worktree.py list` 로 확인한다")
    if len(found) > 1:
        raise WtError(f"{key} 가 여러 리포에 있다: " + ", ".join(rec.get("repo", "?") for _, rec in found), 3, "--path 로 고른다")
    rel, rec = found[0]
    return Path(rec["path"]), rel, rec


def main_of(place):
    items = worktree_list(place)
    return Path(items[0]["path"]) if items else None


# ── 지우기 ───────────────────────────────────────────────────────────────────


def branch_name(place, record):
    if record.get("branch"):
        return record["branch"]
    for item in worktree_list(place):
        if real(item["path"]) == real(place):
            return item["branch"]
    return None


def branch_deletable(main, branch, agent):
    arguments = ["rev-list", "--count", branch, "--not", "--remotes"]
    if agent:
        arguments += [f"--exclude={branch}", "--branches"]
    code, out, _ = run_git(main, *arguments)
    return code == 0 and out.strip() == "0"


def remove_worktree(ctx, place, rel, record, keep_branch=False):
    """끝 조건을 통과한 worktree 를 지운다(05 §3.11 의 3 · 4 · 5번). ignore 파일 때문에 거부되면 그때만 --force."""
    main = main_of(place) or ctx.main
    branch = branch_name(place, record)
    code, _, err = run_git(main, "worktree", "remove", str(place), timeout=120)
    if code != 0 and place.exists():
        code, _, err = run_git(main, "worktree", "remove", "--force", str(place), timeout=120)
    if code != 0:
        raise WtError(f"git worktree remove 실패: {err.strip()}", 3)
    deleted = False
    if branch and not keep_branch and branch_deletable(main, branch, record.get("kind") == "agent"):
        deleted = run_git(main, "branch", "-D", branch)[0] == 0
    state.delete_record(ctx, rel)
    parent = place.parent
    if parent != real(ctx.root) and inside(parent, ctx.root) and parent.is_dir() and not any(parent.iterdir()):
        parent.rmdir()
    return {"removed": True, "branchDeleted": deleted, "branch": branch}


def reasons_text(place, reasons, hint):
    return "\n".join([f"남김: {place.name}", *[f"- {reason}" for reason in reasons], f"→ {hint}"])


def done(ctx, key=None, path=None, keep_branch=False):
    place, rel, record = find_target(ctx, key, path)
    verdict = state.finish_state(ctx, place, record)
    label = record.get("key") or rel
    if not verdict["finished"]:
        return {"removed": False, "key": record.get("key"), "folder": place.name, "reasons": verdict["reasons"],
                "text": reasons_text(place, verdict["reasons"], f"커밋하고 push 한 뒤 다시 worktree.py done {label}")}
    result = remove_worktree(ctx, place, rel, record, keep_branch)
    note = None
    if record.get("repo") not in (None, "."):
        note = f"병합 뒤 메인 폴더에서 상위 포인터를 올린다: git -C {ctx.super} add {record['repo']} && git -C {ctx.super} commit"
    text = f"✔ 지움: {place.name}" + (f"\n  {note}" if note else "")
    return {"removed": True, "key": record.get("key"), "folder": place.name, "branchDeleted": result["branchDeleted"], "note": note, "text": text}


# ── Claude WorktreeRemove 훅 ─────────────────────────────────────────────────


def hook_remove(payload):
    """지우면 None, 지우지 않으면 WtError(exit 1)에 이유를 담는다."""
    path = payload.get("worktree_path")
    if not isinstance(path, str) or not os.path.isabs(path):
        raise WtError("훅 입력의 worktree_path 가 절대경로가 아니다", 1)
    if not Path(path).exists():
        return None
    ctx = resolve_context_loose(path)
    place = real(path)
    if not inside(place, ctx.root) or place == real(ctx.root):
        raise WtError("킷이 만든 worktree 가 아니다 — 폴더를 지우지 않는다", 1)
    rel, record = record_for_path(ctx, place)
    rel = rel or place.relative_to(real(ctx.root)).as_posix()
    if record is None:
        record = {"kind": "agent" if rel.startswith(f"{AGENTS_DIR}/") else "issue"}
    sid = payload.get("session_id") if isinstance(payload.get("session_id"), str) else None
    verdict = state.finish_state(ctx, place, record, exclude_session=sid, check_cwd=False)
    if not verdict["finished"]:
        raise WtError("\n".join(verdict["reasons"]), 1)
    remove_worktree(ctx, place, rel, record)
    return None


# ── open ─────────────────────────────────────────────────────────────────────


def open_ide(ctx, key, ide_flag=None):
    place, rel, record = find_target(ctx, key, None)
    ide = choose_ide(ctx, ide_flag)
    if ide == "idea":
        command = shutil.which("idea")
        arguments = [command, str(place)] if command else None
        if arguments is None and sys.platform == "darwin" and shutil.which("open"):
            arguments = ["open", "-na", "IntelliJ IDEA.app", "--args", str(place)]
    elif ide == "code":
        command = shutil.which("code")
        arguments = [command, "-n", str(place)] if command else None
    else:
        raise WtError(f"모르는 IDE: {ide} (code · idea)", 2)
    if arguments is None:
        raise WtError(f"{ide} 실행 파일을 찾지 못했다. 직접 연다: {place}", 5)
    process = subprocess.Popen(arguments, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        if process.wait(timeout=8) != 0:
            raise WtError(f"{ide} 실행 실패(exit {process.returncode}). 직접 연다: {place}", 5)
    except subprocess.TimeoutExpired:
        pass
    if rel and record:
        state.write_record(ctx, rel, {**record, "lastUsedAt": state.now_text()})
    return {"path": str(place), "ide": ide}


# ── list ─────────────────────────────────────────────────────────────────────


def row_for(ctx, rel, record, refresh, disk):
    place = Path(record["path"])
    verdict = state.finish_state(ctx, place, record, check_cwd=False)
    cached = record.get("sizeKB") if isinstance(record.get("sizeKB"), int) else None
    age = state.age_seconds(record.get("sizedAt"))
    size = cached
    if refresh or cached is None or age is None or age > state.SIZE_CACHE_SECONDS:
        measured = state.du_kb(place)
        if measured is not None:
            size = measured
            record = {**record, "sizeKB": measured, "sizedAt": state.now_text()}
            state.write_record(ctx, rel, record)
    row = {
        "key": record.get("key"), "folder": place.name, "kind": record.get("kind"), "repo": record.get("repo"), "branch": record.get("branch"),
        "path": str(place), "changes": verdict["changes"], "unpushed": verdict["unpushed"], "sizeKB": size or 0,
        "lastUsedAt": state.last_used(ctx, place, record), "sessions": len(state.sessions_in(ctx, place, state.LIVE_MINUTES)),
        "state": "finished" if verdict["finished"] else "progress",
    }
    if disk:
        row["disk"] = state.disk_breakdown(place, row["sizeKB"])
    return row


def list_worktrees(ctx, all_repos=False, disk=False, refresh=False):
    rows, missing = [], []
    for rel, record in state.all_records(ctx):
        if not all_repos and record.get("repo") != ctx.repo_id:
            continue
        if not isinstance(record.get("path"), str) or not Path(record["path"]).is_dir():
            missing.append(rel)
            continue
        rows.append(row_for(ctx, rel, record, refresh, disk))
    total_gb = sum(r["sizeKB"] for r in rows) / (1024 * 1024)
    free = state.free_gb(ctx.root)
    warnings = []
    if total_gb > env_float("HARNESS_WT_WARN_GB", WARN_GB):
        warnings.append(f"킷 worktree 합계 {total_gb:.1f}GB 가 {env_float('HARNESS_WT_WARN_GB', WARN_GB):g}GB 를 넘었다 — 끝난 것은 worktree.py done")
    if free < env_float("HARNESS_WT_MIN_FREE_GB", MIN_FREE_GB):
        warnings.append(f"디스크 여유 {free:.1f}GB 가 {env_float('HARNESS_WT_MIN_FREE_GB', MIN_FREE_GB):g}GB 아래다")
    return {"worktrees": rows, "missing": missing, "maxPerRepo": ctx.max_per_repo, "totalGB": round(total_gb, 2), "freeGB": round(free, 1), "warnings": warnings}


def size_text(kb):
    return f"{kb / 1024 / 1024:.1f}GB" if kb >= 1024 * 1024 else f"{kb / 1024:.0f}MB"


def render_list(data):
    lines = []
    by_repo = {}
    for row in data["worktrees"]:
        by_repo.setdefault((row["kind"] == "agent", row["repo"]), []).append(row)
    for (agent, repo), rows in sorted(by_repo.items(), key=lambda item: (item[0][0], str(item[0][1]))):
        lines.append("임시(_agents)" if agent else f"리포 {repo}  (상한 {data['maxPerRepo']})")
        lines.append("키            브랜치                              변경  안올림  용량    마지막 사용        세션  상태")
        for r in rows:
            label = r["key"] or r["folder"]
            status = f"끝남 → worktree.py done {label}" if r["state"] == "finished" else "진행"
            used = (r["lastUsedAt"] or "-").replace("T", " ").rstrip("Z")[:16]
            lines.append(f"{label:<13} {str(r['branch']):<35} {r['changes']:<5} {r['unpushed']:<7} {size_text(r['sizeKB']):<7} {used:<18} {r['sessions']:<5} {status}")
    if not data["worktrees"]:
        lines.append("킷 worktree 가 없다")
    lines.append(f"합계 {data['totalGB']}GB · 디스크 여유 {data['freeGB']}GB")
    for text in data["warnings"]:
        lines.append(f"⚠ 경고: {text}")
    if data["missing"]:
        lines.append(f"폴더가 사라진 기록 {len(data['missing'])}개 — worktree.py gc")
    return "\n".join(lines)


# ── gc ───────────────────────────────────────────────────────────────────────


def repo_mains(ctx):
    mains = {real(ctx.main)}
    for _, record in state.all_records(ctx):
        if isinstance(record.get("path"), str) and Path(record["path"]).is_dir():
            main = main_of(Path(record["path"]))
            if main is not None:
                mains.add(real(main))
    return sorted(mains)


def known_places(mains):
    known = set()
    for main in mains:
        known.update(real(item["path"]) for item in worktree_list(main))
    return known


def tree_has_files(folder):
    return any(files for _, _, files in os.walk(folder))


def unknown_folders(ctx, known, recorded):
    """root 아래에서 git 도 기록도 모르는 폴더. [(경로, 비었는가)]."""
    out = []
    if not ctx.root.is_dir():
        return out

    def walk(folder, depth):
        for entry in sorted(folder.iterdir()):
            if not entry.is_dir() or entry.name.startswith(".") or entry.is_symlink():
                continue
            place = real(entry)
            if place in known or place in recorded:
                continue
            below = any(k != place and inside(k, place) for k in known | recorded)
            if below and depth < 2:
                walk(entry, depth + 1)
            elif not below:
                out.append((place, not tree_has_files(entry)))

    walk(real(ctx.root), 0)
    return out


def gc(ctx, apply=False):
    removable, kept, orphans = [], [], []
    for rel, record in state.all_records(ctx):
        if not isinstance(record.get("path"), str):
            continue
        place = Path(record["path"])
        if not place.is_dir():
            orphans.append(rel)
            continue
        verdict = state.finish_state(ctx, place, record)
        (removable if verdict["finished"] else kept).append({"rel": rel, "key": record.get("key"), "folder": place.name, "kind": record.get("kind"),
                                                             "reasons": verdict["reasons"], "_place": place, "_record": record})
    mains = repo_mains(ctx)
    pruned = []
    for main in mains:
        code, out, err = run_git(main, "worktree", "prune", "--dry-run", "--verbose")
        pruned += [line.strip() for line in (out + err).splitlines() if line.strip()]
    recorded = {real(item["_place"]) for item in removable + kept}
    unknown = unknown_folders(ctx, known_places(mains) | recorded, recorded)
    stale = state.stale_session_files(ctx)
    result = {
        "applied": apply, "removable": [{k: v for k, v in item.items() if not k.startswith("_")} for item in removable],
        "kept": [{k: v for k, v in item.items() if not k.startswith("_")} for item in kept], "pruned": pruned,
        "orphanRecords": [str(state.record_path(ctx, rel)) for rel in orphans],
        "unknownFolders": [{"path": str(path), "empty": empty} for path, empty in unknown], "staleSessions": len(stale),
    }
    if not apply:
        return result
    removed, failed = [], []
    for item in removable:
        try:
            remove_worktree(ctx, item["_place"], item["rel"], item["_record"])
            removed.append(item["folder"])
        except WtError as error:
            failed.append({"folder": item["folder"], "reason": str(error)})
    for main in mains:
        run_git(main, "worktree", "prune")
    for rel in orphans:
        state.delete_record(ctx, rel)
    for path, empty in unknown:
        if empty:
            shutil.rmtree(path, ignore_errors=True)
    for path in stale:
        try:
            path.unlink()
        except OSError:
            pass
    result.update({"removed": removed, "failed": failed})
    return result


def render_gc(result):
    lines = []
    title = "정리함" if result["applied"] else "정리 대상(목록만 — 지우려면 사람이 `worktree.py gc --apply`)"
    lines.append(f"{title}")
    for item in result["removable"]:
        lines.append(f"  끝남   {item['key'] or item['rel']}  → {'지움' if result['applied'] else '지울 수 있다'}")
    for item in result["kept"]:
        lines.append(f"  남김   {item['key'] or item['rel']}: " + " / ".join(item["reasons"]))
    for line in result["pruned"]:
        lines.append(f"  git 이 아는데 폴더가 없다: {line}")
    for path in result["orphanRecords"]:
        lines.append(f"  worktree 없는 상태 기록: {path}")
    for item in result["unknownFolders"]:
        lines.append(f"  git 이 모르는 {'빈 ' if item['empty'] else ''}폴더: {item['path']}" + ("" if item["empty"] else " (파일이 있어 남긴다)"))
    if result["staleSessions"]:
        lines.append(f"  7일 지난 세션 기록 {result['staleSessions']}개")
    if len(lines) == 1:
        lines.append("  정리할 것이 없다")
    for item in result.get("failed", []):
        lines.append(f"  실패   {item['folder']}: {item['reason']}")
    return "\n".join(lines)
