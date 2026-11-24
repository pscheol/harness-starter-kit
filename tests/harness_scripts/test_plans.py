"""기획물 검사 · 와이어프레임 검사(설계 08 §3.8 · DS-R15 · DS-R16, HK-19 design §7).

    python3 -m unittest discover -s scripts/tests -p "test_plans.py"
"""

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TPL = ROOT / ".agents/docs/_spec-templates/plans"


class PlansCase(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="plans ")
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name).resolve() / "repo"
        shutil.copytree(ROOT / "scripts/harness", self.root / "scripts/harness", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(ROOT / ".agents/docs/_spec-templates", self.root / ".agents/docs/_spec-templates")
        (self.root / ".agents/harness-kit.json").write_text("{}", encoding="utf-8")
        self.plans = self.root / ".agents/docs/intents/INT-1-pay/plans"
        (self.plans / "screens").mkdir(parents=True)

    def fill(self, rel):
        text = (TPL / rel).read_text(encoding="utf-8")
        for k, v in {"INTENT_KEY": "INT-1", "TITLE": "결제", "HARNESS": "claude", "CREATED": "2026-11-24", "SCREEN_ID": "SCR-01", "SCREEN_NAME": "결제"}.items():
            text = text.replace("{{" + k + "}}", v)
        (self.plans / rel).write_text(text, encoding="utf-8")
        return self.plans / rel

    def run_script(self, name, *args):
        return subprocess.run([sys.executable, "-B", f"scripts/harness/{name}", *args], cwd=self.root, capture_output=True, text=True, timeout=60)


class PlanCheckTest(PlansCase):
    def test_filled_templates_pass_and_missing_headings_fail(self):
        for rel in ("requirements-doc.md", "screens/index.md", "design-plan.md", "backlog.md"):
            self.fill(rel)
        r = self.run_script("plan_check.py", str(self.plans))
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)
        path = self.plans / "design-plan.md"
        path.write_text(path.read_text(encoding="utf-8").replace("## 접근성 기준\n", "").replace("generatedWith: template:plans/design-plan", "generatedWith: magic"), encoding="utf-8")
        backlog = self.plans / "backlog.md"
        backlog.write_text(backlog.read_text(encoding="utf-8").replace("<!-- BACKLOG:END -->", ""), encoding="utf-8")
        r = self.run_script("plan_check.py", str(self.plans))
        self.assertEqual(1, r.returncode)
        for needle in ("필수 제목 '## 접근성 기준'", "generatedWith 는 skill:", "BACKLOG:BEGIN … END"):
            self.assertIn(needle, r.stdout)


class WireframeCheckTest(PlansCase):
    def test_template_wireframe_passes_when_index_lists_elements(self):
        index = self.fill("screens/index.md")
        index.write_text(index.read_text(encoding="utf-8") + "| SCR-01 | EL-1 | 제목 | 보임 | — | — | — |\n| SCR-01 | EL-2 | 본문 | 보임 | 안내 | 스피너 | 다시 |\n", encoding="utf-8")
        html = self.fill("screens/_wireframe.html").rename(self.plans / "screens/SCR-01-pay.html")
        r = self.run_script("wireframe_check.py", str(html))
        self.assertEqual(0, r.returncode, r.stdout)

    def test_external_requests_missing_state_and_unknown_element_fail(self):
        self.fill("screens/index.md")
        html = self.plans / "screens/SCR-02-bad.html"
        html.write_text('<html><head><link href="https://cdn.example/x.css"></head><body><section data-state="default" data-el="EL-9"></section>'
                        '<script>fetch("/api")</script><style>@import url(//fonts.example/x.css);</style></body></html>', encoding="utf-8")
        r = self.run_script("wireframe_check.py", str(html))
        self.assertEqual(1, r.returncode)
        for needle in ("외부 참조", "fetch", "@import", "Content-Security-Policy", 'data-state="empty"', "EL-9 가 index.md"):
            self.assertIn(needle, r.stdout)

    def test_size_limit(self):
        self.fill("screens/index.md")
        html = self.plans / "screens/SCR-03-big.html"
        html.write_text("x" * (200 * 1024 + 1), encoding="utf-8")
        self.assertIn("200KB 이하", self.run_script("wireframe_check.py", str(html)).stdout)


if __name__ == "__main__":
    unittest.main()
