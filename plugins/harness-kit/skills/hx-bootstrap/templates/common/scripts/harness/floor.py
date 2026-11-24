#!/usr/bin/env python3
"""게이트 하한(설계 04 §3.8, HK-14 design §6). 설정 · 팩 · 개인 층으로 바꿀 수 없는 상수다.

CLI `packages/cli/src/core/floor.ts` 와 같은 값이다(시험이 묶는다).
"""

GATE_FLOOR = ("requirements", "design", "mr", "done")
FLOOR_HOOKS = ("harness-protect-sources", "harness-block-full-verify", "harness-verify-gate", "harness-protect-approvals")


def missing_floor_gates(gates):
    """flow.gates 에서 빠진 하한 게이트. flow.gates 가 없으면(기본 흐름) 빈 목록이다."""
    if not isinstance(gates, list):
        return []
    return [gate for gate in GATE_FLOOR if gate not in gates]
