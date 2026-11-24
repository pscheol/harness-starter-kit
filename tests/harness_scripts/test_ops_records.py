"""운영 기록 · 접수 · 규칙 후보 · /ops 데이터(설계 14 §3.7 ~ §3.9 · §3.11 · §3.12, DO-R9 ~ DO-R11 · R14 · R15 · R16, 완료 기준 7 · 8 · 10).

    python3 -m unittest discover -s scripts/tests -p "test_ops_records.py"
"""

import json
import re
import sys
import unittest
from pathlib import Path

from ops_fixture import OpsCase

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import approvals, ops_records, rule_candidates  # noqa: E402

RECORD = """---
kind: ops-record
topic: payment-v2-week1
period: { from: 2026-12-01, to: 2026-12-07 }
deploys: []
intents: [INT-7]
created: 2026-12-08
---

# 운영 기록 — 결제 개편 1주차

## 1. 목표 대비 실측
| ID | 지표 | 목표 | 실측 | 판정 | 출처 |
|---|---|---|---|---|---|
| INT-7 SC-1 | 결제 실패율 | ≤ 0.5% | 0.42% | 충족 | https://grafana.example/d/pay?from=1764514800000&to=1765119600000 |
| HDRV3D-12 NFR-1 | 결제 API p95 | ≤ 300ms | 340ms | 미달 | ci:artifacts/perf.json |

## 2. 전달 지표
<!-- METRICS:BEGIN — harness-kit metrics 가 쓴다. 손으로 고치지 않는다 -->
| 지표 | 기준선 | 이 기간 | 계산 방법 |
|---|---|---|---|
<!-- METRICS:END -->

## 3. 장애
### INC-1 · 등급 2 · 2026-12-03
- 감지: 알람 링크 · 2026-12-03T14:10+09:00
- 영향: 카드 결제 일부 실패(약 40분)
- 원인 배포: ops/deploys/2026-12-01-INT-7.md
- 조치: 플래그 끄기
- 런북: https://wiki.example/runbooks/payment
- 후속 이슈:

## 5. 다음 Intent 후보
| ID | 후보 | 근거 | 종류 | 접수 |
|---|---|---|---|---|
| NX-1 | 결제 API p95 개선 | HDRV3D-12 NFR-1 | change | — |

## 6. 배운 것
| ID | 내용 | 규칙 후보 |
|---|---|---|
| L-1 | 배포 전 PG 토큰 만료 설정을 확인하지 않았다 | .agents/rules/payment.md |
"""
NAME = "2026-12-08-payment-v2-week1"


class OpsRecordTest(OpsCase):
    def write_record(self, text=RECORD):
        path = self.root / ops_records.RECORDS / f"{NAME}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def test_source_less_measure_fails_fast(self):
        self.write_record()
        self.assert_ok(self.check())
        bad = RECORD.replace("ci:artifacts/perf.json", "—")
        self.write_record(bad)
        result = self.check()
        self.assertNotEqual(0, result.returncode)
        self.assertRegex(result.stdout + result.stderr, rf"{NAME}\.md:\d+: HDRV3D-12 NFR-1 실측 값 340ms 에 출처가 없다")

    def test_link_without_fixed_period_is_not_a_source(self):
        self.write_record(RECORD.replace("?from=1764514800000&to=1765119600000", "?orgId=1"))
        result = self.check()
        self.assertNotEqual(0, result.returncode)
        self.assertIn("INT-7 SC-1", result.stdout + result.stderr)

    def test_missed_metric_without_followup_warns_only(self):
        self.write_record(RECORD.replace("| change | —", "| change | —").replace("HDRV3D-12 NFR-1 | change", "HDRV3D-99 | change"))
        result = self.check()
        self.assert_ok(result)
        self.assertIn("미달 지표 HDRV3D-12 NFR-1", result.stderr)

    def test_duplicate_id_fails(self):
        self.write_record(RECORD.replace("## 5. 다음 Intent 후보", "### INC-1 · 등급 3 · 2026-12-04\n- 영향: 중복\n\n## 5. 다음 Intent 후보"))
        self.assertNotEqual(0, self.check().returncode)

    def test_ops_new_fills_targets_from_intent(self):
        folder = self.root / ".agents/docs/intents/INT-7-payment"
        folder.mkdir(parents=True)
        (folder / "intent.md").write_text("---\nid: INT-7\ntitle: 결제 개편\nstatus: approved\n---\n\n## 3. 성공 지표\n\n| 지표 | 현재 | 목표 | 재는 곳 |\n|---|---|---|---|\n| 결제 실패율 | 1.2% | ≤ 0.5% | grafana |\n\n## 7. NFR\n\n| ID | 항목 | 기준(숫자) | 관련 스토리 |\n|---|---|---|---|\n| NFR-1 | 결제 API p95 | ≤ 300ms | S-1 |\n", encoding="utf-8")
        deploys = self.root / ".agents/docs/ops/deploys"
        deploys.mkdir(parents=True)
        (deploys / "2026-12-01-INT-7.md").write_text("---\nkind: deploy\nkey: INT-7\nenv: production\nstate: succeeded\nissues: [DEMO-1]\ncommit: { base: develop, sha: abc1234 }\nrisk: low\ncreated: 2026-12-01\n---\n", encoding="utf-8")
        r = self.run_py("ops_records.py", "new", "--topic", "payment-v2-week1", "--from", "2026-12-01", "--to", "2026-12-07", "--json")
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)
        path = self.root / json.loads(r.stdout)["record"]
        text = path.read_text(encoding="utf-8")
        self.assertIn("deploys: [ops/deploys/2026-12-01-INT-7.md]", text)
        self.assertIn("| INT-7 SC-1 | 결제 실패율 | ≤ 0.5% |", text)
        self.assertIn("| INT-7 NFR-1 | 결제 API p95 | ≤ 300ms |", text)
        self.assertEqual("2026-12-07-payment-v2-week1.md", path.name)


class IntakeFromOpsTest(OpsCase):
    def setUp(self):
        super().setUp()
        path = self.root / ops_records.RECORDS / f"{NAME}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(RECORD, encoding="utf-8")
        self.path = path
        self.init_git()

    def intake(self, ref, *extra):
        return self.run_py("intake.py", "ops", ref, "--json", *extra)

    def test_incident_makes_bug_issue_and_changes_one_record_line(self):
        r = self.intake(f"ops:ops/records/{NAME}.md#INC-1", "--kind", "bug")
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)
        data = json.loads(r.stdout)
        self.assertFalse(data["existing"])
        folder = self.root / data["folder"]
        self.assertTrue((folder / "requirements.md").is_file())
        self.assertIn('"type": "ops"', (folder / "intake.md").read_text(encoding="utf-8"))
        self.assertIn("source:", (folder / "requirements.md").read_text(encoding="utf-8"))
        stat = self.git("diff", "--numstat", "--", f".agents/docs/ops/records/{NAME}.md").stdout.split()
        self.assertEqual(["1", "1"], stat[:2], "운영 기록 diff 는 한 줄이다")
        self.assertRegex(self.path.read_text(encoding="utf-8"), r"- 후속 이슈: DEMO-\d+")
        again = json.loads(self.intake(f"ops:ops/records/{NAME}.md#INC-1").stdout)
        self.assertTrue(again["existing"])

    def test_candidate_makes_intent_once(self):
        r = self.intake(f"ops:ops/records/{NAME}.md#NX-1")
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)
        data = json.loads(r.stdout)
        folder = self.root / data["folder"]
        text = (folder / "intake.md").read_text(encoding="utf-8")
        self.assertIn('source: {"type": "ops"', text)
        self.assertIn("HDRV3D-12 NFR-1", text)
        self.assertRegex(self.path.read_text(encoding="utf-8"), r"\| NX-1 \| 결제 API p95 개선 \| HDRV3D-12 NFR-1 \| change \| INT-\d+ \|")
        count = len(list((self.root / ".agents/docs/intents").glob("INT-*")))
        again = json.loads(self.intake(f"ops:ops/records/{NAME}.md#NX-1").stdout)
        self.assertTrue(again["existing"])
        self.assertEqual(count, len(list((self.root / ".agents/docs/intents").glob("INT-*"))))

    def test_wrong_kind_and_missing_id(self):
        self.assertNotEqual(0, self.intake(f"ops:ops/records/{NAME}.md#INC-1", "--kind", "feature").returncode)
        self.assertEqual(2, self.intake(f"ops:ops/records/{NAME}.md#INC-9").returncode)
        self.assertNotEqual(0, self.intake("ops:nothing#NX-1").returncode)


class RuleCandidateTest(OpsCase):
    def issue_with_review(self, key, name, rule="guardrails"):
        folder = self.write_new_issue(f"{key}-{name}", area="payment", req="approved")
        (folder / "review.md").write_text(f"# 리뷰 처리\n\n| ID | 심각도 | 지문 | 처리 | 점검 | 규칙 |\n|---|---|---|---|---|---|\n| F-1 | MEDIUM | abcdef123456 | 수용 | RV-RULE | {rule} |\n", encoding="utf-8")
        return folder

    def test_candidates_from_approval_mark_and_repeated_review(self):
        marked = self.write_new_issue("DEMO-1-pay", area="payment", req="in-review")
        entry = {**self.entry("requirements", "kim@example.com", "requirements.md", "a" * 64), "decision": "changes-requested", "ruleCandidate": True, "phrase": "토큰 만료를 적게 한다"}
        self.append(marked, "DEMO-1", entry)
        self.issue_with_review("DEMO-2", "refund-api")
        self.issue_with_review("DEMO-3", "cancel-api")
        self.init_git()
        r = self.run_py("rule_candidates.py", "candidates", "--json")
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)
        made = json.loads(r.stdout)
        self.assertEqual(2, len(made), made)
        files = sorted((self.root / rule_candidates.FOLDER).glob("RC-*.md"))
        self.assertEqual(2, len(files))
        review = next(rule_candidates.read(p) for p in files if "review" in p.name)
        self.assertEqual((".agents/rules/guardrails.md", "proposed"), (review["target"], review["status"]))
        self.assertEqual(2, len(review["sources"]))
        self.assertEqual("새 규칙 후보가 없다", self.run_py("rule_candidates.py", "candidates").stdout.strip(), "이미 있는 출처는 건너뛴다")

    def test_single_review_is_not_enough(self):
        self.issue_with_review("DEMO-2", "refund-api")
        self.init_git()
        self.assertEqual([], json.loads(self.run_py("rule_candidates.py", "candidates", "--json").stdout))

    def test_accepted_without_rule_change_fails_fast(self):
        self.issue_with_review("DEMO-2", "refund-api")
        self.issue_with_review("DEMO-3", "cancel-api")
        self.init_git()
        self.run_py("rule_candidates.py", "candidates")
        self.commit("candidates")
        candidate = next((self.root / rule_candidates.FOLDER).glob("RC-*.md"))
        candidate.write_text(re.sub(r"^status: proposed", "status: accepted", candidate.read_text(encoding="utf-8"), flags=re.M), encoding="utf-8")
        r = self.check()
        self.assertNotEqual(0, r.returncode)
        self.assertIn("DO-R15", r.stdout + r.stderr)
        (self.root / ".agents/rules/guardrails.md").write_text((self.root / ".agents/rules/guardrails.md").read_text(encoding="utf-8") + "\n- 토큰 만료를 확인한다\n", encoding="utf-8")
        self.assert_ok(self.check())

    def test_promote_needs_proposal_text_and_human(self):
        self.issue_with_review("DEMO-2", "refund-api")
        self.issue_with_review("DEMO-3", "cancel-api")
        self.init_git()
        self.run_py("rule_candidates.py", "candidates")
        self.commit("candidates")
        ident = rule_candidates.read(next((self.root / rule_candidates.FOLDER).glob("RC-*.md")))["id"]
        r = self.run_py("rule_candidates.py", "promote", ident)
        self.assertEqual(1, r.returncode)
        self.assertIn("제안 규칙", r.stderr)
        r = self.run_py("rule_candidates.py", "promote", ident, env={"CLAUDECODE": "1"})
        self.assertEqual(3, r.returncode, "에이전트 세션은 승격하지 못한다")
        path = next((self.root / rule_candidates.FOLDER).glob("RC-*.md"))
        text = path.read_text(encoding="utf-8").replace("(규칙 파일에 들어갈 문장. 조건과 숫자로. 사람이나 에이전트 세션이 쓴다)", "PG 연동 변경은 토큰 만료 설정을 design §13.3 에 적는다.")
        path.write_text(text, encoding="utf-8")
        r = self.run_py("rule_candidates.py", "promote", ident)
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)
        self.assertIn("PG 연동 변경은", (self.root / ".agents/rules/guardrails.md").read_text(encoding="utf-8"))
        self.assertEqual("accepted", rule_candidates.read(path)["status"])
        self.assert_ok(self.check())

    def test_reject_records_reason(self):
        self.issue_with_review("DEMO-2", "refund-api")
        self.issue_with_review("DEMO-3", "cancel-api")
        self.init_git()
        self.run_py("rule_candidates.py", "candidates")
        path = next((self.root / rule_candidates.FOLDER).glob("RC-*.md"))
        ident = rule_candidates.read(path)["id"]
        self.assertEqual(0, self.run_py("rule_candidates.py", "reject", ident, "--reason", "이번만의 사정").returncode)
        data = rule_candidates.read(path)
        self.assertEqual("rejected", data["status"])
        self.assertIn("이번만의 사정", data["body"])


class OpsReportTest(OpsCase):
    def test_report_has_all_parts(self):
        path = self.root / ops_records.RECORDS / f"{NAME}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(RECORD, encoding="utf-8")
        self.make_issue("DEMO-1", "pay-api")
        self.init_git()
        self.run_py("deploy.py", "plan", "DEMO-1")
        r = self.run_py("ops_report.py", "--today", "2026-12-10")
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)
        data = json.loads(r.stdout)
        self.assertEqual({"deploys", "records", "incidents", "candidates", "delivery", "autoVerify", "ruleCandidates", "todo"}, set(data))
        self.assertEqual("planned", data["deploys"][0]["state"])
        self.assertEqual(("INC-1", 2, "ops/deploys/2026-12-01-INT-7.md"), (data["incidents"][0]["id"], data["incidents"][0]["grade"], data["incidents"][0]["cause"]))
        self.assertEqual("NX-1", data["candidates"][0]["id"])
        self.assertEqual(["HDRV3D-12 NFR-1"], data["candidates"][0]["evidence"])
        self.assertEqual("미달", data["records"][0]["metrics"][1]["verdict"])
        self.assertTrue(data["autoVerify"]["enabled"])
        self.assertTrue(any(item["kind"] == "deploy-approval" for item in data["todo"]), data["todo"])
        self.assertEqual(r.stdout, self.run_py("ops_report.py", "--today", "2026-12-10").stdout, "같은 입력이면 같은 출력")


if __name__ == "__main__":
    unittest.main()
