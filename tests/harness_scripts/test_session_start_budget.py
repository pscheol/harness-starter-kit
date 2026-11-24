"""세션 시작 출력 예산(설계 12 §3.8 · 03 §3.11 · §5 #7, HK-24 design §6).

고정 안내 ≤ 1,024 · 단위 안내 ≤ 1,024 · 바뀌는 상태(대기함 → 점유 → 세션 공지 → 업그레이드 공지) ≤ 512, 합계 ≤ 2,560바이트.

    python3 -m unittest discover -s scripts/tests -p "test_session_start_budget.py"
"""

import json
import re
import shutil
import subprocess
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_session_register import ROOT, SessionRegisterCase, clean_env, git  # noqa: E402

FIXED, UNIT, STATE, TOTAL = 1024, 1024, 512, 2560
NOTICE = ".agents/harness-upgrade-notice.md"


def iso(days=0):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat(timespec="seconds")


class SessionStartBudgetTest(SessionRegisterCase):
    def setUp(self):
        super().setUp()
        shutil.copy2(ROOT / "scripts/session-coordination.py", self.root / "scripts/session-coordination.py")
        (self.root / ".agents/harness.json").write_text(json.dumps({"unit": "demo", "title": "Demo"}), encoding="utf-8")
        git(self.root, "add", "-A")
        git(self.root, "commit", "-q", "-m", "coordination")
        self.tree = self.worktree("feat/DEMO-3-upload-cleanup", "DEMO-3-upload-cleanup")

    def start(self, sid="s-1", cwd=None, **env):
        cwd = cwd or self.tree
        payload = {"session_id": sid, "hook_event_name": "SessionStart", "cwd": str(cwd)}
        return subprocess.run(["bash", str(cwd / "scripts/hooks/session-start.sh")], cwd=cwd, input=json.dumps(payload),
                              env=clean_env(**{"KNS_HARNESS": "claude", **env}), capture_output=True, text=True, timeout=60)

    def fixed_text(self):
        source = (self.root / "scripts/hooks/session-start.sh").read_text(encoding="utf-8")
        return re.search(r"^cat <<'EOF'\n(.*?)^EOF$", source, re.S | re.M)[1]

    def kit_notice(self, expires):
        return f"---\nkitFrom: 1.0.8\nkitTo: 2.0.0\ndate: 2026-11-24\nexpires: {expires}\n---\n# 하네스 업데이트 1.0.8 → 2.0.0\n\n" + \
            "".join(f"- 본문 줄 {i} " + "가" * 40 + "\n" for i in range(12))

    def queue_item(self, filler=10):
        queue = self.root / ".agents/state/dispatch-queue"
        queue.mkdir(parents=True, exist_ok=True)
        data = {"schema": "knots-sync.dispatch/v1", "id": "01JDQ50000000000000000000A", "createdAt": iso(), "createdBy": "kim@example.com",
                "target": {"issue": "DEMO-3", "role": "implement", "harness": "any", "sessionId": None}, "kind": "doc-changed",
                "message": "[knots-sync 관리 페이지] 요청 " + "나" * filler, "paths": [".agents/docs/issues/DEMO-3-upload-cleanup/requirements.md"],
                "expiresAt": iso(7)}
        (queue / f"{data['id']}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    def test_fixed_text_is_within_1024_bytes(self):
        fixed = self.fixed_text()
        self.assertLessEqual(len(fixed.encode("utf-8")), FIXED)
        for needed in ("AGENTS.md", ".agents/docs/issues/", "--affected", "guardrails.md", "session-collaboration.md"):
            self.assertIn(needed, fixed)

    def test_long_unit_context_is_cut_at_a_line_with_a_pointer(self):
        (self.tree / ".agents/session-context.md").write_text("".join(f"- 단위 안내 {i:03d} " + "다" * 30 + "\n" for i in range(40)), encoding="utf-8")
        result = self.start()
        self.assertEqual(0, result.returncode, result.stderr)
        fixed = self.fixed_text().replace("{{PROJECT_NAME}}", "")
        unit = result.stdout.split("- 단위 안내 000", 1)[1]
        unit = "- 단위 안내 000" + unit.split("…(이하 생략: .agents/session-context.md)\n", 1)[0] + "…(이하 생략: .agents/session-context.md)\n"
        self.assertLessEqual(len(unit.encode("utf-8")), UNIT)
        self.assertIn("…(이하 생략: .agents/session-context.md)", result.stdout)
        self.assertLessEqual(len(result.stdout.encode("utf-8")), TOTAL)
        self.assertGreater(len(fixed), 0)

    def test_state_keeps_order_and_512_bytes_with_inbox_claims_and_notice(self):
        (self.tree / NOTICE).write_text(self.kit_notice("2099-01-01"), encoding="utf-8")
        self.queue_item()
        coordination = [sys.executable, str(self.tree / "scripts/session-coordination.py"), "--root", str(self.tree)]
        for number in range(6):
            files = [f"src/module_{number}/file_{i}.py" for i in range(8)]
            done = subprocess.run([*coordination, "register", "--session", f"other-{number}", "--client", "codex", "--issue", "DEMO-9", "--files", *files],
                                  cwd=self.tree, env=clean_env(), capture_output=True, text=True, timeout=30)
            self.assertEqual(0, done.returncode, done.stdout + done.stderr)
        result = self.start()
        self.assertEqual(0, result.returncode, result.stderr)
        out = result.stdout
        self.assertLessEqual(len(out.encode("utf-8")), TOTAL)
        state = out[out.index("대기 요청"):]
        self.assertLessEqual(len(state.encode("utf-8")), STATE, state)
        order = [state.index("대기 요청 1건"), state.index("명시적 파일 점유"), state.index("하네스 업데이트 1.0.8 → 2.0.0 · 읽을 것: .agents/harness-upgrade-notice.md")]
        self.assertEqual(order, sorted(order))
        self.assertIn("명시적 파일 점유 6건 · 확인:", state)
        self.assertNotIn("src/module_0/file_0.py", state)
        self.assertEqual(1, len(list((self.root / ".agents/state/dispatch-queue/consumed").glob("*.json"))))
        self.assertTrue((self.root / ".agents/state/sessions/s-1.json").is_file())

    def test_later_state_lines_drop_when_the_inbox_fills_the_budget(self):
        (self.tree / NOTICE).write_text(self.kit_notice("2099-01-01"), encoding="utf-8")
        self.queue_item(filler=120)
        out = self.start().stdout
        state = out[out.index("대기 요청"):]
        self.assertLessEqual(len(state.encode("utf-8")), STATE, state)
        self.assertIn("1) [knots-sync 관리 페이지]", state)
        self.assertNotIn("- 본문 줄 11", state)

    def test_notice_title_only_until_expiry(self):
        (self.tree / NOTICE).write_text(self.kit_notice("2026-12-24"), encoding="utf-8")
        title = "하네스 업데이트 1.0.8 → 2.0.0 · 읽을 것: .agents/harness-upgrade-notice.md"
        before = self.start(KNOTS_SYNC_TODAY="2026-12-24").stdout
        self.assertIn(title, before)
        self.assertNotIn("kitFrom", before)
        after = self.start(sid="s-2", KNOTS_SYNC_TODAY="2026-12-25").stdout
        self.assertNotIn("하네스 업데이트", after)

    def test_human_notice_gets_a_title_line_and_body_only_if_room(self):
        (self.tree / NOTICE).write_text("공동 작업 공지: 기능 파일을 덮지 않는다.\n" + "".join(f"- 줄 {i} " + "라" * 60 + "\n" for i in range(20)), encoding="utf-8")
        out = self.start().stdout
        self.assertIn("하네스 공지: 공동 작업 공지: 기능 파일을 덮지 않는다. · 읽을 것: .agents/harness-upgrade-notice.md", out)
        state = out[out.index("하네스 공지:"):]
        self.assertLessEqual(len(state.encode("utf-8")), STATE)
        self.assertIn("- 줄 0 ", state)
        self.assertNotIn("- 줄 19 ", state)

    def test_quiet_session_adds_only_one_unregistered_line(self):
        result = self.start()
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertFalse(result.stdout.lstrip().startswith(("{", "[")))
        tail = result.stdout[len(result.stdout.rsplit("full 통과가 아니다\n", 1)[0]) + len("full 통과가 아니다\n"):]
        self.assertEqual(1, len(tail.strip().splitlines()), tail)
        self.assertIn("파일 점유를 등록하지 않았다", tail)

    def test_design_session_gets_a_role_line_and_a_harness_warning(self):
        meta = self.tree / ".agents/knots-sync.json"
        data = json.loads(meta.read_text(encoding="utf-8")) if meta.is_file() else {}
        meta.write_text(json.dumps({**data, "roles": {"design": {"harness": "claude"}, "implement": {"harness": "codex"}}}), encoding="utf-8")
        same = self.start(sid="s-design", KNS_ROLE="design")
        self.assertEqual(0, same.returncode, same.stderr)
        self.assertIn("설계 세션: Intent 폴더", same.stdout)
        self.assertNotIn("roles.design.harness", same.stdout)
        other = self.start(sid="s-design-2", KNS_ROLE="design", KNS_HARNESS="codex")
        self.assertIn("⚠ 이 세션 하네스 codex ≠ roles.design.harness claude", other.stdout)
        self.assertLessEqual(len(other.stdout.encode("utf-8")), TOTAL)
        plain = self.start(sid="s-impl")
        self.assertNotIn("설계 세션", plain.stdout)

    def test_personal_model_tier_is_one_line_and_locked_is_ignored(self):
        local = self.tree / ".agents/local"
        local.mkdir(parents=True, exist_ok=True)
        (local / "model-policy.local.json").write_text(json.dumps({"classes": {"explore": "standard", "implement": "light"}}), encoding="utf-8")
        shutil.copy2(ROOT / ".agents/model-policy.json", self.tree / ".agents/model-policy.json")
        out = self.start(sid="s-personal").stdout
        self.assertIn("개인 설정: explore → standard(model: sonnet)", out)
        self.assertNotIn("implement → light", out)
        codex = self.start(sid="s-personal-codex", KNS_HARNESS="codex").stdout
        self.assertIn("explore → standard(effort medium)", codex)


if __name__ == "__main__":
    unittest.main()
