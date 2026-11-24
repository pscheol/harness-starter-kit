"""에이전트 세션의 전체 검증(full) 차단 — 판정 · 설정 · 보조 점검 · 하네스 등록(HK-2, 설계 01 R2)."""

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOOK = ROOT / "scripts/hooks/block-full-verify.sh"
CHECKER = ROOT / "scripts/hooks/block_full_verify.py"

BLOCKED = [
    "bash scripts/verify.sh --full",
    "cd sub && bash scripts/verify.sh --fast --full",
    "HARNESS_VERIFY_LEVEL=full bash scripts/verify.sh",
    "export HARNESS_VERIFY_LEVEL=full; bash scripts/verify.sh",
    "python3 scripts/verify-changed.py --level full",
    "bash scripts/verify-entry.sh --full",
]
ALLOWED = [
    "bash scripts/verify.sh",
    "bash scripts/verify.sh --affected",
    "bash scripts/verify.sh --affected --plan",
    "echo --full",
    "grep -- --full README.md",
    "HARNESS_VERIFY_LEVEL=fullish bash scripts/verify.sh",
]


def payload(command, tool="Bash"):
    return json.dumps({"hook_event_name": "PreToolUse", "tool_name": tool, "tool_input": {"command": command}})


class BlockFullVerifyTest(unittest.TestCase):
    def setUp(self):
        # 하네스 루트 하나를 임시로 만든다: 훅 두 파일 + 메타. 실제 설치본 메타를 건드리지 않는다.
        self.tmp = Path(tempfile.mkdtemp(prefix="hk-full-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        hooks = self.tmp / "scripts/hooks"
        hooks.mkdir(parents=True)
        shutil.copy2(HOOK, hooks / HOOK.name)
        shutil.copy2(CHECKER, hooks / CHECKER.name)
        (self.tmp / ".agents").mkdir()
        self.hook = hooks / HOOK.name
        self.checker = hooks / CHECKER.name

    def meta(self, value):
        data = {"schema": "knots-sync/v1"}
        if value is not None:
            data["verify"] = {"fullOnlyInCI": value}
        (self.tmp / ".agents/knots-sync.json").write_text(json.dumps(data), encoding="utf-8")

    def run_hook(self, stdin, env_extra=None):
        env = {k: v for k, v in os.environ.items() if k not in ("CI", "HARNESS_VERIFY_PARENT", "CLAUDECODE")}
        env.update(env_extra or {})
        return subprocess.run(["bash", str(self.hook)], input=stdin, capture_output=True, text=True, env=env, timeout=30)

    def test_blocks_full_requests(self):
        self.meta(None)
        for command in BLOCKED:
            with self.subTest(command=command):
                r = self.run_hook(payload(command))
                self.assertEqual(r.returncode, 2, r.stderr)
                self.assertIn("전체 검증(full)", r.stderr)

    def test_allows_other_commands(self):
        self.meta(None)
        for command in ALLOWED:
            with self.subTest(command=command):
                r = self.run_hook(payload(command))
                self.assertEqual(r.returncode, 0, r.stderr)
                self.assertEqual(r.stderr, "")

    def test_non_shell_tools_are_ignored(self):
        self.meta(None)
        r = self.run_hook(payload("bash scripts/verify.sh --full", tool="Write"))
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_kiro_shell_tool_names_are_checked(self):
        self.meta(None)
        for tool in ("shell", "execute_bash", "executeBash"):
            with self.subTest(tool=tool):
                self.assertEqual(self.run_hook(payload("bash scripts/verify.sh --full", tool=tool)).returncode, 2)

    def test_unparsable_input_passes(self):
        self.meta(None)
        for stdin in ("{not json", json.dumps({"tool_name": "Bash", "tool_input": {}}), ""):
            with self.subTest(stdin=stdin):
                self.assertEqual(self.run_hook(stdin).returncode, 0)

    def test_setting_can_turn_the_rule_off(self):
        self.meta(False)
        self.assertEqual(self.run_hook(payload("bash scripts/verify.sh --full")).returncode, 0)
        self.meta(True)
        self.assertEqual(self.run_hook(payload("bash scripts/verify.sh --full")).returncode, 2)

    def test_personal_layer_cannot_turn_the_rule_off(self):
        # 개인 층(.agents/local/)은 verify.* 를 바꾸지 못한다(설계 04 §3.6 · §5 #2). 공유 메타만 본다.
        self.meta(None)
        (self.tmp / ".agents/local").mkdir()
        (self.tmp / ".agents/local/knots-sync.local.json").write_text(json.dumps({"verify": {"fullOnlyInCI": False}, "flow": {"gates": []}}), encoding="utf-8")
        self.assertEqual(self.run_hook(payload("bash scripts/verify.sh --full")).returncode, 2)

    def test_missing_or_broken_meta_defaults_to_blocking(self):
        self.assertEqual(self.run_hook(payload("bash scripts/verify.sh --full")).returncode, 2)
        (self.tmp / ".agents/knots-sync.json").write_text("{broken", encoding="utf-8")
        self.assertEqual(self.run_hook(payload("bash scripts/verify.sh --full")).returncode, 2)

    def test_message_lists_scoped_commands_and_setting(self):
        r = self.run_hook(payload("bash scripts/verify.sh --full"))
        for expected in ("bash scripts/verify.sh\n", "bash scripts/verify.sh --affected\n",
                         "bash scripts/verify.sh --affected --plan", "verify.fullOnlyInCI"):
            self.assertIn(expected, r.stderr)
        self.assertNotIn("--full 로", r.stderr)

    def test_entry_check_only_blocks_agent_sessions(self):
        def entry(env):
            base = {k: v for k, v in os.environ.items() if k not in ("CI", "HARNESS_VERIFY_PARENT", "CLAUDECODE")}
            return subprocess.run(["python3", str(self.checker), "--entry-check"], capture_output=True, text=True,
                                  env={**base, **env}, timeout=30).returncode
        self.assertEqual(entry({"CLAUDECODE": "1"}), 3)
        self.assertEqual(entry({"CLAUDECODE": "1", "CI": "true"}), 0)
        self.assertEqual(entry({"CLAUDECODE": "1", "HARNESS_VERIFY_PARENT": "root"}), 0)
        self.assertEqual(entry({}), 0)
        self.meta(False)
        self.assertEqual(entry({"CLAUDECODE": "1"}), 0)


class InstalledWiringTest(unittest.TestCase):
    """설치본에서 verify.sh --full 보조 점검과 하네스 네 곳 등록을 본다."""

    def test_verify_full_stops_before_the_body_in_agent_sessions(self):
        env = {k: v for k, v in os.environ.items() if k not in ("CI", "HARNESS_VERIFY_PARENT")}
        env["CLAUDECODE"] = "1"
        r = subprocess.run(["bash", "scripts/verify.sh", "--full"], cwd=ROOT, capture_output=True, text=True,
                           env=env, timeout=60)
        self.assertEqual(r.returncode, 3, r.stdout[-2000:] + r.stderr[-2000:])
        self.assertIn("전체 검증(full)", r.stderr)

    def test_hook_is_registered_for_each_harness(self):
        places = [
            ROOT / ".claude/settings.json",
            ROOT / ".codex/hooks.json",
            ROOT / ".kiro/hooks/harness-block-full-verify.json",
        ]
        places += sorted((ROOT / ".kiro/agents").glob("*.json"))
        found = [p for p in places if p.is_file() and "block-full-verify.sh" in p.read_text(encoding="utf-8")]
        self.assertIn(ROOT / ".claude/settings.json", found)
        self.assertIn(ROOT / ".codex/hooks.json", found)
        self.assertIn(ROOT / ".kiro/hooks/harness-block-full-verify.json", found)
        self.assertTrue(any(p.parent.name == "agents" for p in found), "Kiro CLI 조율 에이전트 hooks.preToolUse")


if __name__ == "__main__":
    unittest.main()
