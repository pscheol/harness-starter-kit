"""주인별 훅 · 검사 파일 합치기(HK-14 design §1 · §4), Python 판. 킷 템플릿의 모듈을 직접 불러 본다.

    python3 -m unittest tests.test_layer_files
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

KIT = Path(__file__).resolve().parents[1]
SCRIPTS = KIT / "packages/templates/common/scripts"
sys.path.insert(0, str(SCRIPTS / "harness"))
sys.path.insert(0, str(SCRIPTS))

import floor  # noqa: E402
from harness import verify_planner  # noqa: E402
from projection_hooks import HooksError, hook_doc_paths, merge_hook_docs  # noqa: E402

SPEC = json.loads((SCRIPTS / "harness/projection.json").read_text(encoding="utf-8"))
KIT_HOOKS = (KIT / "packages/templates/common/agents-root/hooks.json").read_text(encoding="utf-8")
BASE = {"event": "stop", "script": "scripts/hooks/x.sh", "timeoutSec": 5, "owner": "user"}


def doc(hooks):
    return json.dumps({"schema": "harness-kit.hooks/v1", "hooks": hooks})


class HookDocsTest(unittest.TestCase):
    def test_order_and_merge_rules_match_the_ts_side(self):
        self.assertEqual([".agents/hooks.d/acme.json", ".agents/hooks.d/zeta.json", ".agents/hooks.d/project.json"],
                         hook_doc_paths(["project.json", "zeta.json", "acme.json", ".x.json", "notes.md"]))
        project = doc([{**BASE, "id": "harness-session-idle", "timeoutSec": 30}, {**BASE, "id": "harness-verify-gate"}, {**BASE, "id": "harness-my-lint"}])
        hooks, findings = merge_hook_docs([(".agents/hooks.json", KIT_HOOKS), (".agents/hooks.d/project.json", project)], SPEC["hookMap"], floor.FLOOR_HOOKS)
        by_id = {h["id"]: h for h in hooks}
        self.assertEqual(30, by_id["harness-session-idle"]["timeoutSec"])
        self.assertEqual("scripts/hooks/verify-gate.sh", by_id["harness-verify-gate"]["script"])
        self.assertEqual("harness-my-lint", hooks[-1]["id"])
        self.assertEqual(["floor-override"], [f["kind"] for f in findings])
        with self.assertRaises(HooksError):
            merge_hook_docs([(".agents/hooks.json", KIT_HOOKS), (".agents/hooks.d/acme.json", doc([{**BASE, "id": "harness-session-idle", "owner": "pack:acme"}]))],
                            SPEC["hookMap"], floor.FLOOR_HOOKS)


class VerifyChecksTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        (self.root / ".agents/verify-checks.d").mkdir(parents=True)

    def write(self, rel, checks):
        (self.root / rel).write_text(json.dumps({"checks": checks}), encoding="utf-8")

    def check(self, ident, path="docs/*"):
        return {"id": ident, "paths": [path], "command": ["true"]}

    def test_kit_then_packs_then_project(self):
        self.write(".agents/verify-checks.json", [self.check("feature-docs")])
        self.write(".agents/verify-checks.d/acme.json", [self.check("acme-license", "**/package.json")])
        self.write(".agents/verify-checks.d/project.json", [self.check("feature-docs", "site/*"), self.check("api-snapshot")])
        checks = verify_planner.load_path_checks(self.root)
        self.assertEqual(["feature-docs", "acme-license", "api-snapshot"], [c["id"] for c in checks])
        self.assertEqual(["site/*"], checks[0]["paths"])

    def test_pack_duplicate_id_and_bad_shape_fail_loudly(self):
        self.write(".agents/verify-checks.json", [self.check("feature-docs")])
        self.write(".agents/verify-checks.d/acme.json", [self.check("feature-docs")])
        with self.assertRaisesRegex(ValueError, "다른 층"):
            verify_planner.load_path_checks(self.root)
        self.write(".agents/verify-checks.d/acme.json", [{"id": "x", "paths": "docs/*", "command": ["true"]}])
        with self.assertRaisesRegex(ValueError, "verify-checks.d/acme.json"):
            verify_planner.load_path_checks(self.root)


if __name__ == "__main__":
    unittest.main()
