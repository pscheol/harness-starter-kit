"""세션의 공지를 보관하고 수신자가 명시한 확인만 기록한다."""

import uuid

from .coordination_leases import require_session


def notify_sessions(state, sender, target, message, now):
    if sender:
        require_session(state, sender)
    if target:
        require_session(state, target)
    notice = {
        "id": uuid.uuid4().hex,
        "sender": sender,
        "target": target,
        "message": message,
        "created_at": now,
        "acknowledged_by": [],
        "trust": "untrusted",
    }
    return {**state, "notices": [*state["notices"], notice]}, notice


def inbox_notices(state, session_id, include_acknowledged=False):
    require_session(state, session_id)
    return [
        notice
        for notice in state["notices"]
        if notice["target"] in (None, session_id) and (include_acknowledged or session_id not in notice["acknowledged_by"])
    ]


def acknowledge_notices(state, session_id, notice_ids):
    available = {notice["id"] for notice in inbox_notices(state, session_id, True)}
    if not set(notice_ids) <= available:
        raise ValueError("notice is unknown or belongs to a different recipient")
    notices = [
        {
            **notice,
            "acknowledged_by": sorted(set(notice["acknowledged_by"]) | {session_id}),
        }
        if notice["id"] in notice_ids
        else notice
        for notice in state["notices"]
    ]
    return {**state, "notices": notices}
