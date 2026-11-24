"""보존 기한 밖의 세션 · 공지 기록을 지운다(설계 05 §3.10 · §3.12, HK-15). 점유 저장소(state.json)가 커지는 것을 막는다.

- 세션: 마지막 heartbeat 가 sessions_days 일보다 오래됐으면 지운다(살아 있다고 적혀 있어도 그 기간 신호가 없으면 죽은 기록이다).
- 공지: 만든 지 notices_days 일이 지났거나 지워진 세션이 받는 공지를 지운다. 지워진 세션이 보낸 공지는 발신자만 비운다.
- 남는 기록의 구조 검증(coordination_schema)은 그대로 통과한다.
"""

DAY_SECONDS = 86400


def prune_state(state, now, sessions_days, notices_days):
    """(새 상태, 요약). 입력 상태는 바꾸지 않는다."""
    session_cutoff = now - sessions_days * DAY_SECONDS
    notice_cutoff = now - notices_days * DAY_SECONDS
    kept = {sid: session for sid, session in state["sessions"].items() if session["heartbeat_at"] >= session_cutoff}
    removed_sessions = sorted(set(state["sessions"]) - set(kept))
    notices = []
    for notice in state["notices"]:
        if notice["created_at"] < notice_cutoff or (notice["target"] is not None and notice["target"] not in kept):
            continue
        notices.append(
            {
                **notice,
                "sender": notice["sender"] if notice["sender"] in kept else None,
                "acknowledged_by": [owner for owner in notice["acknowledged_by"] if owner in kept],
            }
        )
    summary = {
        "sessionsRemoved": len(removed_sessions),
        "noticesRemoved": len(state["notices"]) - len(notices),
        "sessionsKept": len(kept),
        "noticesKept": len(notices),
    }
    return {**state, "sessions": kept, "notices": notices}, summary
