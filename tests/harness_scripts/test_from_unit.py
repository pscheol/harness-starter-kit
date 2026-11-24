"""`/kns-specify --from-unit`(설계 08 §3.7 · DS-R9~R13) · 의존 계약 design 승인(DS-R10), HK-19 design §6.

    python3 -m unittest discover -s scripts/tests -p "test_from_unit.py"
"""

import json
import shutil
import subprocess
import sys
import unittest

from sdd_fixture import SddCase

INTENT = """---
id: INT-1
title: 결제 개편
status: approved
flow: kit
kind: product
profile: product
risk: high
areas: [payment, billing]
jira: null
answersSha256: null
created: 2026-11-24
---

# Intent INT-1 — 결제 개편

## 1. 목표

- 카드 결제를 토큰 결제로 바꾼다.

## 2. 범위 밖

- 환불(다음 Intent)

## 6. 스토리와 수용 기준

### S-1 결제 API 계약
- 스토리: 개발자로서 결제 API 를 쓴다.
- 도메인: payment
- S-1.AC-1: 결제를 요청하면 시스템은 결제 id 를 돌려준다.

### S-2 정산 알림
- 스토리: 정산 담당자로서 결제 완료를 받는다.
- 도메인: billing
- S-2.AC-1: 결제가 끝나면 시스템은 정산 알림을 보낸다.

## 7. NFR

| ID | 항목 | 기준(숫자) | 관련 스토리 |
|---|---|---|---|
| NFR-1 | 응답 시간 | p95 300ms | S-1 |
"""


def units():
    base = {"dependsOn": [], "provides": [], "consumes": [], "nfr": [], "risks": [], "issue": None, "planned": True, "repo": None}
    return {"schema": "knots-sync.units/v1", "intent": {"key": "INT-1", "title": "결제 개편", "doc": "intent.md"}, "source": {"kind": "kit"},
            "units": [
                {**base, "id": "U-1", "name": "payment-contract", "title": "결제 API 계약", "kind": "contract", "area": "payment", "stories": ["S-1"], "nfr": ["NFR-1"], "provides": ["api:payments.v2"], "order": 1},
                {**base, "id": "U-2", "name": "settlement-notice", "title": "정산 알림", "kind": "feature", "area": "billing", "stories": ["S-2"], "dependsOn": ["U-1"], "consumes": ["api:payments.v2"], "order": 2},
            ], "unassigned": []}


class FromUnitTest(SddCase):
    def setUp(self):
        super().setUp()
        meta = self.root / ".agents/knots-sync.json"
        data = json.loads(meta.read_text())
        data["flow"] = {"gates": ["requirements", "design", "tasks", "mr", "done"]}
        meta.write_text(json.dumps(data))
        shutil.rmtree(self.root / ".agents/docs/intents", ignore_errors=True)  # 임시 복사본 — 설치본에 남은 Intent 와 섞이지 않게
        self.intent = self.root / ".agents/docs/intents/INT-1-payment-revamp"
        self.intent.mkdir(parents=True)
        (self.intent / "intent.md").write_text(INTENT, encoding="utf-8")
        (self.intent / "units.json").write_text(json.dumps(units(), ensure_ascii=False), encoding="utf-8")
        for args in (("init", "-q"), ("add", "-A"), ("commit", "-q", "-m", "init")):
            subprocess.run(["git", *args], cwd=self.root, env=self.env, check=True, capture_output=True)

    def from_unit(self, target, *extra):
        r = subprocess.run([sys.executable, "-B", "scripts/harness/from_unit.py", target, "--json", *extra], cwd=self.root, env=self.env, capture_output=True, text=True, timeout=120)
        return r.returncode, json.loads(r.stdout or "{}") if r.stdout.strip() else {"error": r.stderr}

    def test_intent_gate_must_be_approved_when_in_flow(self):
        meta = self.root / ".agents/knots-sync.json"
        data = json.loads(meta.read_text())
        data["flow"] = {"gates": ["intent", "requirements", "design", "mr", "done"]}
        meta.write_text(json.dumps(data))
        code, out = self.from_unit("INT-1/U-1")
        self.assertEqual(3, code)
        self.assertIn("intent 게이트 승인이 없다", out["error"])

    def test_contract_first_then_requirements_are_filled_and_unit_linked(self):
        code, out = self.from_unit("INT-1/U-2")
        self.assertEqual(3, code)
        self.assertIn("U-1(contract) 부터", out["error"])
        code, out = self.from_unit("INT-1/U-1")
        self.assertEqual(0, code, out)
        self.assertEqual(("created", "DEMO-1"), (out["action"], out["issue"]))
        req = self.root / out["path"]
        text = req.read_text(encoding="utf-8")
        for needle in ("intent: INT-1", "unit: U-1", "dependsOn: []", "risk: high", "#### US-1 (S-1) 결제 API 계약", "R1 (S-1.AC-1): 결제를 요청하면", "| NFR-1 | 응답 시간 |", "- S-2 → U-2 에서 다룬다", "- 환불(다음 Intent)", "design 의 §6 계약 절이 필수다"):
            self.assertIn(needle, text)
        self.assertEqual("DEMO-1", json.loads((self.intent / "units.json").read_text(encoding="utf-8"))["units"][0]["issue"])
        code, again = self.from_unit("INT-1/U-1")
        self.assertEqual((0, "existing", out["path"].rsplit("/", 1)[0]), (code, again["action"], again["path"]))
        code, second = self.from_unit("INT-1/U-2")
        self.assertEqual(0, code, second)
        text = (self.root / second["path"]).read_text(encoding="utf-8")
        self.assertIn("dependsOn: [DEMO-1]", text)
        self.assertIn("- DEMO-1 (U-1 결제 API 계약) — api:payments.v2", text)
        self.assertEqual(0, self.check().returncode, self.check().stdout + self.check().stderr)

    def test_consumer_plan_waits_for_contract_design(self):
        self.assertEqual(0, self.from_unit("INT-1/U-1")[0])
        self.assertEqual(0, self.from_unit("INT-1/U-2")[0])
        consumer = self.issue("DEMO-2-settlement-notice")
        self.set_field(consumer / "requirements.md", "status", "approved")
        r = self.scaffold("DEMO-2", "--stage=design")
        self.assertEqual(1, r.returncode, r.stdout + r.stderr)
        self.assertIn("의존 계약 DEMO-1 의 design 이 승인되지 않았다", r.stdout + r.stderr)
        contract = self.issue("DEMO-1-payment-contract")
        self.set_field(contract / "requirements.md", "status", "approved")
        self.assert_ok(self.scaffold("DEMO-1", "--stage=design"))
        self.set_field(contract / "design.md", "status", "approved")
        self.assert_ok(self.scaffold("DEMO-2", "--stage=design"))

    def test_unit_repo_puts_the_issue_in_the_domain_folder_and_contract_stays_in_the_parent(self):
        domain = self.root / "domains/api"
        shutil.copytree(self.root / "scripts", domain / "scripts", ignore=shutil.ignore_patterns("tests", "__pycache__"))
        (domain / ".agents/docs").mkdir(parents=True)
        shutil.copytree(self.root / ".agents/docs/_spec-templates", domain / ".agents/docs/_spec-templates")
        shutil.copy2(self.root / ".agents/knots-sync.json", domain / ".agents/knots-sync.json")
        (self.root / "tools/harness").mkdir(parents=True, exist_ok=True)
        (self.root / "tools/harness/units.json").write_text(json.dumps({"schema": "knots-sync.deploy-units/v1", "units": [{"id": "knots-api", "path": "domains/api", "stack": "jvm"}]}))
        data = json.loads((self.intent / "units.json").read_text(encoding="utf-8"))
        for unit in data["units"]:
            unit["repo"] = "knots-api"
        (self.intent / "units.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        code, contract = self.from_unit("INT-1/U-1")
        self.assertEqual(0, code, contract)
        self.assertEqual((".", ".agents/docs/issues/DEMO-1-payment-contract/requirements.md"), (contract["repo"], contract["path"]))
        code, feature = self.from_unit("INT-1/U-2")
        self.assertEqual(0, code, feature)
        self.assertEqual("domains/api", feature["repo"])
        self.assertTrue(feature["path"].startswith("domains/api/.agents/docs/issues/"), feature["path"])
        self.assertTrue((self.root / feature["path"]).is_file())
        again = self.from_unit("INT-1/U-2")[1]
        self.assertEqual(("existing", feature["path"].rsplit("/", 1)[0]), (again["action"], again["path"]))
        data = json.loads((self.intent / "units.json").read_text(encoding="utf-8"))
        data["units"][1]["repo"] = "nope"
        data["units"][1]["issue"] = None
        (self.intent / "units.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        code, bad = self.from_unit("INT-1/U-2")
        self.assertEqual(3, code)
        self.assertIn("nope", bad["error"])

    def test_jira_module_needs_a_work_item_key(self):
        meta = self.root / ".agents/knots-sync.json"
        data = json.loads(meta.read_text())
        meta.write_text(json.dumps({**data, "modules": ["jira-workflow"]}))
        code, out = self.from_unit("INT-1/U-1")
        self.assertEqual(3, code)
        self.assertIn("--key", out["error"])


if __name__ == "__main__":
    unittest.main()
