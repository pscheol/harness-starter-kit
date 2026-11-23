"""세션마다 실리는 양이 v1.0.8 설치본보다 늘지 않는다(HK-13 R9, design §11, README 원칙 10).

    python3 -m unittest tests.test_context_budget

하네스마다 진입 파일(AGENTS.md + CLAUDE.md) + 늘 싣는 규칙 + 스킬 · 역할 설명 바이트를 `check_layout.py --context` 로 잰다.
기준은 v1.0.8(e181b6f) 설치본을 같은 코드로 잰 값이다(커밋이 없으면 design §11 표).
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from projection_kit import CHECK_LAYOUT, KIT, TOKENS, V108_CONTEXT, extract_v108  # noqa: E402
from test_cli_parity import base_env  # noqa: E402

SETUP = KIT / "plugins/harness-kit/skills/hx-bootstrap/setup.sh"
TEMPLATES = KIT / "packages/templates"
STACKS = ("jvm", "python", "go", "web", "electron")


def install(setup: Path, stack: str, target: Path) -> None:
    r = subprocess.run(["bash", str(setup), f"--stack={stack}", "--agents=all", "--modules=none", str(target)],
                       env=base_env(TOKENS), capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError(r.stdout[-1500:] + r.stderr[-1500:])


def context(root: Path) -> dict[str, dict[str, int]]:
    r = subprocess.run([sys.executable, "-B", str(CHECK_LAYOUT), "--root", str(root), "--context", "--json"], capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(r.stdout + r.stderr)
    return json.loads(r.stdout)["context"]


class ContextBudgetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="hk-budget-")).resolve()
        old_setup = extract_v108(cls.tmp / "v108")
        cls.before: dict[str, dict[str, int]] = {}
        cls.after: dict[str, dict[str, dict[str, int]]] = {}
        for stack in STACKS:
            if old_setup:
                old = cls.tmp / "old" / stack / "acme-notes"
                install(old_setup, stack, old)
                cls.before[stack] = {h: v["total"] for h, v in context(old).items()}
            else:
                cls.before[stack] = V108_CONTEXT[stack]
            new = cls.tmp / "new" / stack / "acme-notes"
            install(SETUP, stack, new)
            cls.after[stack] = context(new)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_v108_measure_matches_design_table(self):
        self.assertEqual(self.before, V108_CONTEXT)

    def test_session_context_does_not_grow(self):
        for stack in STACKS:
            for h, v in self.after[stack].items():
                with self.subTest(stack=stack, harness=h):
                    self.assertLessEqual(v["total"], self.before[stack][h], v)

    def test_kit_rules_have_paths(self):
        bare = sorted(p.relative_to(TEMPLATES).as_posix() for p in TEMPLATES.rglob("agents-rules/*.md")
                      if not re.match(r"^---\n(?:.*\n)*?paths:", p.read_text(encoding="utf-8")))
        self.assertEqual(bare, [], "paths 없는 킷 규칙(늘 실린다)")
        for stack in STACKS:
            with self.subTest(stack=stack):
                self.assertEqual(self.after[stack]["claude"]["rules"], 0)
                self.assertEqual(self.after[stack]["kiro"]["rules"], 0)
                self.assertEqual(self.after[stack]["cursor"]["rules"], 0)


if __name__ == "__main__":
    unittest.main()
