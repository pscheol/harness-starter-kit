"""로컬 상태 파일도 외부 입력으로 보고 구조와 경로를 검증한다."""

import math
import re

from .coordination_paths import normalize_claim_path, validate_session_id, validate_text

FINGERPRINT_PATTERN = re.compile(r"[0-7]{1,4}:[0-9a-f]{64}\Z")


def require_state(condition):
    if not condition:
        raise ValueError("coordination state is invalid; preserve it and investigate")


def valid_timestamp(value):
    if type(value) not in (int, float) or value <= 0:
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def validate_paths(root, paths):
    require_state(isinstance(paths, list) and all(isinstance(path, str) for path in paths))
    for path in paths:
        require_state(normalize_claim_path(root, path, check_filesystem=False) == path)
    require_state(len(paths) == len(set(paths)))


def validate_session(root, session_id, session):
    validate_session_id(session_id)
    require_state(isinstance(session, dict) and session.get("id") == session_id)
    require_state(session.get("client") in ("claude", "kiro", "codex"))
    require_state(isinstance(session.get("issue"), str))
    validate_text(session["issue"], "issue", 128)
    require_state(session.get("status") in ("active", "completed", "expired"))
    require_state(all(valid_timestamp(session.get(key)) for key in ("registered_at", "heartbeat_at", "expires_at")))
    ttl = session.get("ttl_seconds")
    require_state(type(ttl) is int and 1 <= ttl <= 86400)
    validate_paths(root, session.get("files"))
    validate_paths(root, session.get("taken_over_files", []))
    baseline = session.get("baseline")
    require_state(isinstance(baseline, dict))
    validate_paths(root, list(baseline))
    require_state(all(isinstance(value, str) and FINGERPRINT_PATTERN.fullmatch(value) for value in baseline.values()))


def validate_notice(notice, sessions):
    require_state(isinstance(notice, dict))
    require_state(isinstance(notice.get("id"), str) and bool(re.fullmatch(r"[0-9a-f]{32}", notice["id"])))
    require_state(valid_timestamp(notice.get("created_at")) and notice.get("trust") == "untrusted")
    require_state(isinstance(notice.get("message"), str))
    validate_text(notice["message"], "message", 8000)
    require_state("sender" in notice and "target" in notice)
    require_state(all(value is None or (isinstance(value, str) and value in sessions) for value in (notice["sender"], notice["target"])))
    acknowledged = notice.get("acknowledged_by")
    require_state(isinstance(acknowledged, list) and all(isinstance(owner, str) and owner in sessions for owner in acknowledged))
    require_state(len(acknowledged) == len(set(acknowledged)))


def validate_state(root, state, version):
    require_state(isinstance(state, dict) and type(state.get("version")) is int and state.get("version") == version)
    require_state(isinstance(state.get("sessions"), dict) and isinstance(state.get("notices"), list))
    for session_id, session in state["sessions"].items():
        validate_session(root, session_id, session)
    for notice in state["notices"]:
        validate_notice(notice, state["sessions"])
    notice_ids = [notice["id"] for notice in state["notices"]]
    require_state(len(notice_ids) == len(set(notice_ids)))
    return state
