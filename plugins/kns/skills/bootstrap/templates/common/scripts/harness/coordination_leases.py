"""세션 소유권과 만료된 점유의 명시적 인수를 처리한다."""

from .coordination_paths import paths_overlap
from .coordination_snapshots import extend_baseline, snapshot_paths


def require_session(state, session_id):
    if session_id not in state["sessions"]:
        raise ValueError(f"unknown session: {session_id}; register explicitly before claiming files")
    return state["sessions"][session_id]


def require_live_session(session, now):
    if session["status"] != "active":
        raise ValueError("session is not active; claim files explicitly to resume")
    if session["expires_at"] <= now:
        raise ValueError("session lease expired; inspect status and use claim --takeover-expired explicitly")


def public_session(session, now):
    return {
        **{key: value for key, value in session.items() if key != "baseline"},
        "expired": session["expires_at"] <= now,
    }


def conflicting_sessions(state, session_id, claimed_paths):
    return {
        owner_id: owner
        for owner_id, owner in state["sessions"].items()
        if owner_id != session_id and any(paths_overlap(path, owned) for path in claimed_paths for owned in owner["files"])
    }


def validate_conflicts(conflicts, now, takeover_expired):
    for owner_id, owner in conflicts.items():
        if owner["expires_at"] > now:
            raise ValueError(f"file lease conflict with live session {owner_id}: {', '.join(owner['files'])}")
        if not takeover_expired:
            raise ValueError(f"file lease conflict with expired session {owner_id}; use --takeover-expired after review")


def remove_expired_conflicts(sessions, conflicts, claimed_paths):
    updated = dict(sessions)
    for owner_id, owner in conflicts.items():
        remaining = [path for path in owner["files"] if not any(paths_overlap(path, requested) for requested in claimed_paths)]
        removed = [path for path in owner["files"] if path not in remaining]
        updated[owner_id] = {
            **owner,
            "files": remaining,
            "status": owner["status"] if remaining else "expired",
            "taken_over_files": sorted(set(owner.get("taken_over_files", [])) | set(removed)),
        }
    return updated


def register_session(
    root,
    state,
    session_id,
    client,
    issue,
    claimed_paths,
    ttl_seconds,
    now,
    takeover_expired,
):
    if session_id in state["sessions"]:
        raise ValueError(f"session already registered: {session_id}; use claim, heartbeat or release")
    conflicts = conflicting_sessions(state, session_id, claimed_paths)
    validate_conflicts(conflicts, now, takeover_expired)
    session = {
        "id": session_id,
        "client": client,
        "issue": issue,
        "status": "active",
        "files": claimed_paths,
        "ttl_seconds": ttl_seconds,
        "registered_at": now,
        "heartbeat_at": now,
        "expires_at": now + ttl_seconds,
        "baseline": snapshot_paths(root, claimed_paths),
    }
    sessions = {
        **remove_expired_conflicts(state["sessions"], conflicts, claimed_paths),
        session_id: session,
    }
    return {**state, "sessions": sessions}, session


def claim_files(root, state, session_id, claimed_paths, now, takeover_expired):
    session = require_session(state, session_id)
    if session["expires_at"] <= now and not takeover_expired:
        raise ValueError("own session lease expired; use --takeover-expired explicitly after inspection")
    conflicts = conflicting_sessions(state, session_id, claimed_paths)
    validate_conflicts(conflicts, now, takeover_expired)
    all_paths = sorted(set(session["files"]) | set(claimed_paths))
    minimal_paths = [path for path in all_paths if not any(path.startswith(other + "/") for other in all_paths if path != other)]
    updated = {
        **session,
        "files": minimal_paths,
        "baseline": extend_baseline(root, session, claimed_paths),
        "status": "active",
        "heartbeat_at": now,
        "expires_at": now + session["ttl_seconds"],
    }
    sessions = {
        **remove_expired_conflicts(state["sessions"], conflicts, claimed_paths),
        session_id: updated,
    }
    return {**state, "sessions": sessions}, updated


def release_files(state, session_id, paths):
    session = require_session(state, session_id)
    if paths and any(path not in session["files"] for path in paths):
        raise ValueError("release accepts only exact lease paths owned by this session")
    remaining = [path for path in session["files"] if paths and path not in paths]
    updated = {
        **session,
        "files": remaining,
        "status": "active" if remaining else "completed",
    }
    return {**state, "sessions": {**state["sessions"], session_id: updated}}, updated


def heartbeat_session(state, session_id, now):
    session = require_session(state, session_id)
    require_live_session(session, now)
    updated = {
        **session,
        "heartbeat_at": now,
        "expires_at": now + session["ttl_seconds"],
    }
    return {**state, "sessions": {**state["sessions"], session_id: updated}}, updated
