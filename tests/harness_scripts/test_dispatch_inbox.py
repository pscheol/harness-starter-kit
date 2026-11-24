"""대기함 소비(설계 06 §3.10, DB-R19, 완료 기준 11 · 14, HK-17 design §7).

세션 시작 · 프롬프트 제출 훅이 자기 세션에 맞는 항목이 있을 때만 건수와 첫 요청 한 줄을 512바이트 안에서 내고, 그 항목 하나만 consumed/ 로 옮긴다.

    python3 -m unittest discover -s scripts/tests -p "test_dispatch_inbox.py"
"""

import json
import subprocess
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_session_register import SessionRegisterCase, clean_env  # noqa: E402

TOKEN = "UNTRUSTED"


def iso(delta_days=0):
    return (datetime.now(timezone.utc) + timedelta(days=delta_days)).isoformat(timespec="seconds")


class DispatchInboxTest(SessionRegisterCase):
    def setUp(self):
        super().setUp()
        self.queue = self.root / ".agents/state/dispatch-queue"
        self.queue.mkdir(parents=True)
        self.tree = self.worktree("feat/DEMO-3-upload-cleanup", "DEMO-3-upload-cleanup")

    def item(self, ident, message="요청 글", issue="DEMO-3", role="implement", session=None, expires=7, paths=None):
        data = {"schema": "knots-sync.dispatch/v1", "id": ident, "createdAt": iso(), "createdBy": "kim@example.com",
                "target": {"issue": issue, "role": role, "harness": "any", "sessionId": session}, "kind": "doc-changed",
                "message": message, "paths": paths or [".agents/docs/issues/DEMO-3-upload-cleanup/requirements.md"], "expiresAt": iso(expires)}
        (self.queue / f"{ident}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    def start(self, sid="wt-1", event="SessionStart"):
        return self.hook({"session_id": sid, "hook_event_name": event, "cwd": str(self.tree)}, cwd=self.tree, KNS_HARNESS="claude")

    def waiting(self):
        return sorted(path.name for path in self.queue.glob("*.json"))

    def test_five_items_print_count_and_first_line_within_512_bytes_and_consume_one(self):
        for number in range(1, 6):
            self.item(f"01JDQ5000000000000000000{number:02d}", message=f"[knots-sync 관리 페이지] 요청 {number} " + "가" * 300)
        result = self.start()
        self.assertEqual(result.returncode, 0, result.stderr)
        output = result.stdout
        self.assertLessEqual(len(output.encode("utf-8")), 512)
        lines = output.strip().split("\n")
        self.assertEqual(len(lines), 3, output)
        self.assertTrue(lines[0].startswith("대기 요청 5건(UNTRUSTED"), lines[0])
        self.assertIn("승인이 아니다", lines[0])
        self.assertTrue(lines[1].startswith("1) [knots-sync 관리 페이지] 요청 1 "), lines[1])
        first_text = lines[1][3:].split(" · 경로: ")[0]
        self.assertLessEqual(len(first_text.encode("utf-8")), 200)
        self.assertIn("· 경로: .agents/docs/issues/DEMO-3-upload-cleanup/requirements.md", lines[1])
        self.assertEqual(lines[2], "나머지: npx knots-sync dispatch list")
        self.assertEqual(len(self.waiting()), 4)
        consumed = list((self.queue / "consumed").glob("*.json"))
        self.assertEqual([path.name for path in consumed], ["01JDQ500000000000000000001.json"])
        data = json.loads(consumed[0].read_text(encoding="utf-8"))
        self.assertEqual(data["consumedBy"], "wt-1")
        self.assertIn("consumedAt", data)
        again = self.start(event="UserPromptSubmit")
        self.assertIn("대기 요청 4건", again.stdout)
        self.assertEqual(len(self.waiting()), 3)

    def test_no_matching_item_prints_nothing_and_keeps_files(self):
        self.item("01JDQ5000000000000000000A1", issue="DEMO-8")
        self.item("01JDQ5000000000000000000A2", session="other-session")
        self.item("01JDQ5000000000000000000A3", role="review")
        before = self.waiting()
        result = self.start()
        self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))
        self.assertEqual(self.waiting(), before)

    def test_single_item_has_no_remainder_line_and_expired_items_move_to_expired(self):
        self.item("01JDQ5000000000000000000B1", expires=-1)
        self.item("01JDQ5000000000000000000B2", message="하나뿐인 요청")
        result = self.start()
        lines = result.stdout.strip().split("\n")
        self.assertEqual(len(lines), 2, result.stdout)
        self.assertTrue(lines[0].startswith("대기 요청 1건"))
        self.assertTrue((self.queue / "expired/01JDQ5000000000000000000B1.json").exists())
        self.assertEqual(self.waiting(), [])

    def test_session_targeted_item_goes_only_to_that_session(self):
        self.item("01JDQ5000000000000000000C1", session="wt-2", issue=None, role=None)
        self.assertEqual(self.start("wt-1").stdout, "")
        self.assertIn("대기 요청 1건", self.start("wt-2").stdout)

    def test_two_sessions_racing_for_one_item_never_both_take_it(self):
        self.start("wt-1")
        self.start("wt-2")
        script = self.root / "scripts/hooks/dispatch-inbox.py"
        duplicates = 0
        for round_number in range(100):
            ident = f"01JDQ6{round_number:020d}"
            self.item(ident)
            processes = [subprocess.Popen([sys.executable, "-B", str(script), "--root", str(self.tree), "--session", sid], cwd=self.tree,
                                          env=clean_env(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for sid in ("wt-1", "wt-2")]
            outputs = [process.communicate(timeout=30)[0] for process in processes]
            taken = sum(1 for output in outputs if "대기 요청" in output)
            self.assertEqual([process.returncode for process in processes], [0, 0])
            if taken != 1:
                duplicates += 1
        self.assertEqual(duplicates, 0)
        self.assertEqual(len(list((self.queue / "consumed").glob("*.json"))), 100)


if __name__ == "__main__":
    unittest.main()
