"""risk: high 이슈의 design · mr 은 서로 다른 승인자 2명(설계 08 §3.15 · DS-R26, HK-19 design §11).

    python3 -m unittest discover -s scripts/tests -p "test_risk_gates.py"
"""

import json
import re
import subprocess
import sys
import unittest

from sdd_fixture import SddCase

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))

from harness import approvals  # noqa: E402
from harness.sdd_frontmatter import update  # noqa: E402


class RiskGateTest(SddCase):
    def setUp(self):
        super().setUp()
        meta = self.root / ".agents/knots-sync.json"
        data = json.loads(meta.read_text())
        meta.write_text(json.dumps({**data, "flow": {"gates": ["requirements", "design", "tasks", "mr", "done"]}}))
        self.assert_ok(self.run_script("new-feature.sh", "--next", "card-payment", "--area", "payment"))
        self.folder = self.issue("DEMO-1-card-payment")
        self.set_field(self.folder / "requirements.md", "status", "approved")
        self.put(self.folder / "requirements.md", "risk", "high")
        self.approve("requirements", "kim@example.com")
        self.assert_ok(self.scaffold("DEMO-1", "--stage=design"))
        self.set_field(self.folder / "design.md", "status", "approved")
        self.put(self.folder / "design.md", "status", "approved")
        # design §13 은 새 템플릿이면 승인 앞 조건이다(설계 14 DO-R1) — 이 시험은 위험 두 사람 승인만 본다
        design = self.folder / "design.md"
        design.write_text(re.sub(r"## 13\. 배포 · 롤백.*?(?=\n## 14\.)", "## 13. 배포 · 롤백 (Migration / Rollout)\n\n배포 없음: 시험용 설계\n", design.read_text(encoding="utf-8"), flags=re.S), encoding="utf-8")

    def put(self, path, field, value):
        text = update(path.read_text(encoding="utf-8"), {field: value})
        path.write_text("\n".join(line for line in text.split("\n") if "[NEEDS CLARIFICATION" not in line), encoding="utf-8")

    def approve(self, gate, email):
        doc = self.folder / f"{gate}.md"
        entry = {"at": approvals.now_text(), "gate": gate, "decision": "approved", "approver": {"email": email, "name": None, "group": None},
                 "target": {"name": doc.name, "sha256": approvals.approval_sha(doc.read_bytes())}, "phrase": "확인", "path": "terminal",
                 "entryId": approvals.new_entry_id()}
        path = self.folder / "approvals.md"
        current = path.read_text(encoding="utf-8") if path.is_file() else None
        path.write_text(approvals.appended_text(current, "DEMO-1", entry), encoding="utf-8")

    def gate(self, name):
        r = subprocess.run([sys.executable, "-B", "scripts/harness/sdd_gates.py", "check", "DEMO-1", "--json"], cwd=self.root, env=self.env, capture_output=True, text=True, timeout=60)
        self.assertEqual(0, r.returncode, r.stderr)
        return next(g for g in json.loads(r.stdout)["gates"] if g["gate"] == name)

    def test_high_risk_design_needs_two_different_approvers(self):
        self.assertTrue(self.gate("requirements")["passed"], self.gate("requirements"))
        self.approve("design", "kim@example.com")
        design = self.gate("design")
        self.assertEqual(("partial", 2, False), (design["approval"], design["need"], design["passed"]))
        self.assertTrue(any("서로 다른 승인자" in r for r in design["reasons"]), design["reasons"])
        self.approve("design", "KIM@example.com")
        self.assertEqual("partial", self.gate("design")["approval"], "같은 사람(대소문자만 다름)은 한 명이다")
        self.approve("design", "lee@example.com")
        design = self.gate("design")
        self.assertEqual(("valid", True), (design["approval"], design["passed"]))
        self.assertEqual(1, self.gate("requirements")["need"], "requirements 는 risk high 여도 1명")

    def test_low_risk_needs_one_and_project_can_only_raise(self):
        self.put(self.folder / "requirements.md", "risk", "low")
        self.approve("requirements", "kim@example.com")
        self.approve("design", "kim@example.com")
        self.assertEqual(("valid", 1), (self.gate("design")["approval"], self.gate("design")["need"]))
        self.assertEqual(1, approvals.need_of({"risk": {"highApprovals": 1}}, "low", "design"))
        self.assertEqual(2, approvals.need_of({"risk": {"highApprovals": 1}}, "high", "design"))
        self.assertEqual(3, approvals.need_of({"risk": {"highApprovals": 3}}, "high", "mr"))


if __name__ == "__main__":
    unittest.main()
