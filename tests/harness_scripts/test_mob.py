"""몹 정리 세션(설계 08 §3.14 · DS-R24, HK-19 design §10).

    python3 -m unittest discover -s scripts/tests -p "test_mob.py"
"""

import json
import shutil
import subprocess
import sys
import unittest

from sdd_fixture import SddCase

QUESTIONS = """---
target: INT-1
status: open
round: 2
---

# 질문

## Q-1 · 범위 · 답할 직무: po · 막는 게이트: intent
넣는가?

- A. 넣는다 — 영향: 하나
- B. 뺀다 — 영향: 둘
- 권장: B — 근거: 없다
- 답:

## Q-2 · 기술 · 답할 직무: dev · 막는 게이트: intent
나누는가?

- A. 나눈다 — 영향: 하나
- B. 안 나눈다 — 영향: 둘
- 권장: A — 근거: 없다
- 답:
"""


class MobTest(SddCase):
    def setUp(self):
        super().setUp()
        meta = self.root / ".agents/knots-sync.json"
        data = json.loads(meta.read_text())
        meta.write_text(json.dumps({**data, "groups": {"po": ["lee@example.com"], "dev": ["kim@example.com"]}, "approvers": {"intent": ["po"]}}))
        shutil.rmtree(self.root / ".agents/docs/intents", ignore_errors=True)
        self.folder = self.root / ".agents/docs/intents/INT-1-pay"
        self.folder.mkdir(parents=True)
        (self.folder / "intent.md").write_text("---\nid: INT-1\ntitle: 결제\nstatus: draft\nkind: product\nrisk: low\n---\n\n# Intent\n", encoding="utf-8")
        (self.folder / "questions.md").write_text(QUESTIONS, encoding="utf-8")
        subprocess.run(["git", "init", "-q"], cwd=self.root, env=self.env, check=True)

    def mob(self, *args):
        r = subprocess.run([sys.executable, "-B", "scripts/harness/mob.py", *args, "--json"], cwd=self.root, env=self.env, capture_output=True, text=True, timeout=60)
        return r.returncode, json.loads(r.stdout)

    def test_start_needs_every_answering_group_and_an_intent_approver(self):
        code, out = self.mob("start", "INT-1", "--attendees", "kim@example.com")
        self.assertEqual(3, code)
        self.assertIn("po", out["error"])
        self.assertIn("approvers.intent", out["error"])
        self.assertFalse((self.folder / "mob.json").exists())
        code, out = self.mob("start", "INT-1", "--attendees", "kim@example.com,lee@example.com", "--timebox", "20")
        self.assertEqual(0, code, out)
        s = out["session"]
        self.assertEqual(("sdd@example.com", 20, [{"round": 2, "startedAt": s["at"], "endedAt": None}]), (s["facilitator"], s["timeboxMin"], s["rounds"]))
        self.assertEqual([{"email": "kim@example.com", "group": "dev"}, {"email": "lee@example.com", "group": "po"}], s["attendees"])
        code, out = self.mob("start", "INT-1", "--attendees", "lee@example.com,kim@example.com")
        self.assertEqual((3, True), (code, "이미 열려" in out["error"]))

    def test_next_closes_the_round_and_close_ends_without_sending_anything(self):
        self.assertEqual(0, self.mob("start", "INT-1", "--attendees", "kim@example.com,lee@example.com")[0])
        code, out = self.mob("next", "INT-1")
        self.assertEqual((0, 2), (code, out["ended"]))
        self.assertEqual([2, 3], [r["round"] for r in out["session"]["rounds"]])
        self.assertIn("npx knots-sync dispatch --to INT-1:design --kind answers-ready", out["suggest"])
        self.assertFalse((self.root / ".agents/state/dispatch-queue").exists(), "회차를 닫아도 요청을 보내지 않는다")
        text = (self.folder / "questions.md").read_text(encoding="utf-8").replace("- 답:\n\n## Q-2", "- 답: B · lee@example.com · 2026-11-24T10:00:00+09:00\n\n## Q-2").replace("- 답:\n", "- 답: A · kim@example.com · 2026-11-24T10:01:00+09:00\n")
        (self.folder / "questions.md").write_text(text, encoding="utf-8")
        code, out = self.mob("close", "INT-1")
        self.assertEqual(0, code, out)
        self.assertTrue(out["session"]["closedAt"])
        self.assertIn("답이 모두 권장안과 같고 메모 · 의견이 0건이다", out["warnings"])
        self.assertEqual((3, False), (self.mob("next", "INT-1")[0], self.mob("status", "INT-1")[1]["open"]))


if __name__ == "__main__":
    unittest.main()
