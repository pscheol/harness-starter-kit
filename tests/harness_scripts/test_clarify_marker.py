"""미해결 질문 표지(HK-22b) — 템플릿 안내문의 [NEEDS CLARIFICATION 은 표지가 아니다. 새 이슈 문서를 승인할 수 있어야 한다."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from harness import intent, sdd_gates  # noqa: E402

TEMPLATES = ROOT / ".agents/docs/_spec-templates"


class ClarifyMarkerTest(unittest.TestCase):
    def test_only_colon_markers_outside_code_count(self):
        for check in (sdd_gates.has_clarify, intent.has_clarify):
            with self.subTest(check=check.__module__):
                self.assertTrue(check("- R1 [NEEDS CLARIFICATION: 보관 기간]"))
                self.assertFalse(check("> [NEEDS CLARIFICATION] 규약: 미확정이면 `[NEEDS CLARIFICATION: 구체 질문]` 을 남긴다"))

    def test_installed_templates_have_no_open_marker(self):
        for stage in ("requirements", "design"):
            text = (TEMPLATES / stage / "_template.md").read_text(encoding="utf-8")
            with self.subTest(stage=stage):
                self.assertIn("[NEEDS CLARIFICATION", text)
                self.assertFalse(sdd_gates.has_clarify(text))


if __name__ == "__main__":
    unittest.main()
