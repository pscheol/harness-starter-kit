"""훅 원본 hooks.json → 하네스별 훅, Python 판(HK-24 design §9). TS 시험(projection-hooks.test.ts)과 같은 fixture · 기대값을 본다.

    python3 -m unittest tests.test_projection_hooks
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # 템플릿 폴더에 __pycache__ 를 만들지 않는다
KIT = Path(__file__).resolve().parents[1]
HARNESS = KIT / "packages/templates/common/scripts/harness"
FIXTURE = KIT / "packages/cli/test/fixtures/hooks"
sys.path.insert(0, str(HARNESS))

from projection_hooks import (  # noqa: E402
    HooksError,
    kiro_cli_hooks,
    kiro_ide_files,
    kit_script_suffixes,
    parse_hooks,
    render_kiro_coordinator,
    settings_hooks,
)

SPEC = json.loads((HARNESS / "projection.json").read_text(encoding="utf-8"))
HM = SPEC["hookMap"]


class SharedFixtureTest(unittest.TestCase):
    def setUp(self):
        self.hooks = parse_hooks((FIXTURE / "hooks.json").read_text(encoding="utf-8"), HM)
        self.expected = json.loads((FIXTURE / "expected.json").read_text(encoding="utf-8"))

    def test_every_target_matches_the_shared_expectation(self):
        for modules in ([], ["jira-workflow"]):
            with self.subTest(modules=modules):
                want = self.expected["modules:" + ",".join(modules)]
                self.assertEqual(want["claude"], settings_hooks(self.hooks, "claude", HM, modules))
                self.assertEqual(want["codex"], settings_hooks(self.hooks, "codex", HM, modules))
                self.assertEqual(want["kiroIde"], [{"path": p, "text": t} for p, t in kiro_ide_files(self.hooks, HM, modules)])
                self.assertEqual(want["kiroCli"], kiro_cli_hooks(self.hooks, HM, modules))
                self.assertEqual(want["kiroRole"], kiro_cli_hooks(self.hooks, HM, modules, subagents_only=True))
                coordinator = render_kiro_coordinator(SPEC, {"PROJECT_SLUG": "acme", "PROJECT_NAME": "Acme"}, kiro_cli_hooks(self.hooks, HM, modules))
                self.assertEqual(want["coordinator"], coordinator)
        self.assertEqual(self.expected["suffixes"], kit_script_suffixes(self.hooks, HM))

    def test_invalid_documents_are_refused(self):
        base = {"id": "harness-x", "event": "stop", "script": "scripts/hooks/x.sh", "timeoutSec": 5, "owner": "kit"}
        bad = [
            {**base, "id": "x"}, {**base, "event": "boot"}, {**base, "tools": ["write"]}, {**base, "script": "scripts/../x.sh"},
            {**base, "timeoutSec": True}, {**base, "owner": "me"}, {**base, "model": "opus"},
            {**base, "env": {"ANTHROPIC_MODEL": {"claude": "x"}}}, {**base, "env": {"X": {"claude": "a b"}}}, {**base, "harnesses": []},
        ]
        for hook in bad:
            with self.subTest(hook=hook):
                with self.assertRaises(HooksError):
                    parse_hooks(json.dumps({"schema": "harness-kit.hooks/v1", "hooks": [hook]}), HM)
        with self.assertRaises(HooksError):
            parse_hooks(json.dumps({"schema": "harness-kit.hooks/v1", "hooks": [base, base]}), HM)
        self.assertIsNone(parse_hooks(None, HM))


class KitHooksTest(unittest.TestCase):
    def test_kit_hooks_json_is_valid_and_its_scripts_exist(self):
        hooks = parse_hooks((KIT / "packages/templates/common/agents-root/hooks.json").read_text(encoding="utf-8"), HM)
        for hook in hooks:
            self.assertTrue((KIT / "packages/templates/common" / hook["script"]).is_file(), hook["script"])
        self.assertEqual(["harness-session-start"], [h["id"] for h in hooks if h["event"] == "session-start"])

    def test_old_hook_templates_are_gone(self):
        common = KIT / "packages/templates/common"
        self.assertFalse((common / "codex/hooks.json").exists())
        self.assertEqual([], list((common / "kiro-hooks").glob("*.json")) if (common / "kiro-hooks").is_dir() else [])
        self.assertFalse((common / "kiro-agents/__PROJECT_SLUG__.json").exists())
        self.assertNotIn("kiroWriteHooks", SPEC)
        self.assertNotIn("hooks", SPEC["claudeSettings"])


if __name__ == "__main__":
    unittest.main()
