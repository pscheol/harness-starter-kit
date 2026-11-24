"""불변식 · KEEP 시험 연결(설계 08 §3.16 · DS-R27 · DS-R28, HK-19 design §11).

    python3 -m unittest discover -s scripts/tests -p "test_invariants.py"
"""

import json
import subprocess
import sys
import unittest

from sdd_fixture import SddCase

REQUIREMENTS = """---
key: DEMO-1
area: room
type: feat
title: 회의실 예약
status: approved
created: 2026-11-24
---

# Requirements — DEMO-1 회의실 예약

- R1 (S-1.AC-1): 예약을 만들면 시스템은 시간 겹침을 거부한다.
- NFR-2: 동시 예약 100건/초

| ID | 동작 | 근거 | 지금 있는 시험 |
|---|---|---|---|
| KEEP-1 | 환불은 180일까지 | C-1 | RefundPolicyTest |
| KEEP-2 | 취소 알림은 한 번 | C-2 | 없음 |
"""

DESIGN = """---
key: DEMO-1
status: draft
---

# Design

### 4.5 도메인 모델

#### 불변식

| ID | 불변식(언제나 참) | 근거 | 지키는 곳 | 시험 |
|---|---|---|---|---|
| INV-1 | 같은 회의실 예약 시간은 겹치지 않는다 | R1 · NFR-2 | Reservation | P1 · T001 |
| INV-2 | 취소된 예약은 되살리지 않는다 | R9 | Reservation | |
| INV-3 | 예약자는 한 명이다 |  | Reservation | |

#### 엣지 케이스 질문

| ID | 질문 | 답 · 출처 | 반영 |
|---|---|---|---|
| EQ-1 | 시작한 예약을 취소하면? | 거부 · Q-4 답 A | INV-2 |
| EQ-2 | 지운 회의실이면? |  | |

## 5. Components & Interfaces

## 11. Testing Strategy

- INV-1: 겹치는 두 예약 시험

## 12. Correctness Properties (PBT)

- P1: INV-1 임의 시간 구간 두 개
"""

TASKS = """---
key: DEMO-1
state: active
---

# Tasks

- [ ] T001 [US1] 겹침 거부 속성 시험 — INV-1
- [ ] T002 [US1] 환불 기한 특성 시험 — KEEP-1
"""


class InvariantsTest(SddCase):
    def setUp(self):
        super().setUp()
        self.folder = self.root / ".agents/docs/issues/DEMO-1-room-booking"
        self.folder.mkdir(parents=True)
        (self.folder / "requirements.md").write_text(REQUIREMENTS, encoding="utf-8")
        (self.folder / "design.md").write_text(DESIGN, encoding="utf-8")
        (self.folder / "tasks.md").write_text(TASKS, encoding="utf-8")

    def run_check(self):
        r = subprocess.run([sys.executable, "-B", "scripts/harness/invariants.py", "DEMO-1", "--json"], cwd=self.root, env=self.env, capture_output=True, text=True, timeout=60)
        return r.returncode, json.loads(r.stdout)

    def test_findings_by_check_and_severity(self):
        code, out = self.run_check()
        self.assertEqual(1, code)
        self.assertEqual(["INV-1", "INV-2", "INV-3"], out["invariants"])
        self.assertEqual(["KEEP-1", "KEEP-2"], out["keeps"])
        got = sorted((f["severity"], f["check"], f["id"]) for f in out["findings"])
        self.assertEqual(sorted([
            ("MEDIUM", "근거 없는 불변식", "INV-2"),
            ("MEDIUM", "근거 없는 불변식", "INV-3"),
            ("HIGH", "INV → 시험", "INV-2"),
            ("HIGH", "INV → 시험", "INV-3"),
            ("HIGH", "KEEP → 시험", "KEEP-2"),
            ("HIGH", "답 없는 엣지 질문", "EQ-2"),
        ]), got)

    def test_not_applicable_skips_invariants_but_keeps_still_need_tests(self):
        (self.folder / "design.md").write_text("---\nkey: DEMO-1\nstatus: draft\n---\n\n### 4.5 도메인 모델\n\n해당 없음: 설정 화면만 바꾼다\n\n## 5. Components\n", encoding="utf-8")
        (self.folder / "tasks.md").write_text(TASKS + "- [ ] T003 알림 한 번 시험 — KEEP-2\n", encoding="utf-8")
        code, out = self.run_check()
        self.assertEqual((0, True, []), (code, out["notApplicable"], out["findings"]))


if __name__ == "__main__":
    unittest.main()
