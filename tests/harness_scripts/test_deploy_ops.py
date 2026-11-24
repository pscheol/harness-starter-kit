"""배포 기록 · deploy 게이트 · 자동 검증 배포(설계 14 §3.2 ~ §3.5, DO-R1 ~ DO-R8, 완료 기준 1 · 2 · 4 · 5 · 6).

    python3 -m unittest discover -s scripts/tests -p "test_deploy_ops.py"
"""

import json
import sys
import unittest
from pathlib import Path

from ops_fixture import GOOD_DESIGN, NO_DEPLOY_DESIGN, OpsCase

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import approvals, deploy_gate, deploy_record, rollout  # noqa: E402


class RolloutTest(unittest.TestCase):
    def test_empty_criteria_is_rejected_and_none_line_passes(self):
        bad = GOOD_DESIGN.replace("5xx 비율 1% 초과가 5분 이어짐", "(숫자로. 예: 5xx 비율 1% 초과가 5분 이어짐)")
        self.assertTrue(any("판단 기준" in item for item in rollout.problems(bad)), rollout.problems(bad))
        self.assertEqual([], rollout.problems(GOOD_DESIGN))
        self.assertEqual([], rollout.problems(NO_DEPLOY_DESIGN))

    def test_no_digit_and_unchecked_items_are_rejected(self):
        text = GOOD_DESIGN.replace("5xx 비율 1% 초과가 5분 이어짐", "에러가 많으면")
        self.assertTrue(any("숫자" in item for item in rollout.problems(text)))
        text = GOOD_DESIGN.replace("- [x] 로그: 개인정보 없음", "- [ ] 로그: 개인정보 없음")
        self.assertTrue(any("'로그'" in item for item in rollout.problems(text)))
        text = GOOD_DESIGN.replace("해당 없음: 새 비밀값 없음", "해당 없음: <이유>")
        self.assertTrue(any("'비밀값'" in item for item in rollout.problems(text)))

    def test_old_template_is_skipped(self):
        self.assertEqual([], rollout.problems("## 13. Migration / Rollout\n\n- 마이그레이션 순서\n"))
        self.assertEqual([], rollout.problems("## 1. 설계\n"))

    def test_unfilled_value_rows_and_infra_table(self):
        text = GOOD_DESIGN.replace("| 방식 | 단계적(10% → 100%, 30분 간격) |", "| 방식 | (한 번에 · 단계적) |")
        self.assertTrue(any("'방식'" in item for item in rollout.problems(text)))
        infra = "\n### 13.4 인프라\n| 항목 | 값 |\n|---|---|\n| IaC 도구 · 위치 | Terraform infra/ |\n| 바뀌는 자원 · 환경 | (자원) |\n"
        self.assertTrue(any("§13.4" in item for item in rollout.problems(GOOD_DESIGN + infra)))
        untouched = "\n### 13.4 인프라\n| 항목 | 값 |\n|---|---|\n| IaC 도구 · 위치 | (예: Terraform) |\n"
        self.assertEqual([], rollout.problems(GOOD_DESIGN + untouched))


class DesignGateTest(OpsCase):
    def test_design_gate_reports_rollout_problem(self):
        self.make_issue("DEMO-1", "pay-api", design=GOOD_DESIGN.replace("5xx 비율 1% 초과가 5분 이어짐", "(숫자로)"), done=False)
        self.init_git()
        r = self.run_py("sdd_gates.py", "check", "DEMO-1", "--json")
        design = next(g for g in json.loads(r.stdout)["gates"] if g["gate"] == "design")
        self.assertTrue(any("design §13" in reason and "판단 기준" in reason for reason in design["preconditions"]), design)

    def test_no_deploy_line_passes(self):
        self.make_issue("DEMO-1", "lib", design=NO_DEPLOY_DESIGN, done=False)
        self.init_git()
        r = self.run_py("sdd_gates.py", "check", "DEMO-1", "--json")
        design = next(g for g in json.loads(r.stdout)["gates"] if g["gate"] == "design")
        self.assertFalse(any("design §13" in reason for reason in design["preconditions"]), design)


class DeployPlanTest(OpsCase):
    def two_issues(self):
        self.make_issue("DEMO-1", "pay-api", intent="INT-7")
        self.make_issue("DEMO-2", "pay-method", intent="INT-7", design=GOOD_DESIGN.replace("- [x] 런북: https://wiki.example/runbooks/payment", "- [ ] 런북: 해당 없음: 기존 런북 그대로"))
        self.init_git()

    def test_plan_collects_design_rollout_of_all_done_issues(self):
        self.two_issues()
        r = self.run_py("deploy.py", "plan", "INT-7", "--json")
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)
        data = json.loads(r.stdout)
        self.assertRegex(data["record"], r"ops/deploys/\d{4}-\d{2}-\d{2}-INT-7\.md$")
        self.assertEqual(["DEMO-1", "DEMO-2"], data["issues"])
        record = deploy_record.load(self.root / ".agents/docs" / data["record"][len(".agents/docs/"):] if data["record"].startswith(".agents/docs/") else self.root / data["record"])
        self.assertEqual("planned", record.state)
        self.assertEqual(2, len(record.design_shas()))
        names = sorted({(name, key) for name, key, _ in record.checklist()})
        self.assertEqual(14, len(names), names)
        self.assertEqual({"로그", "지표", "알람", "SLO", "런북", "비밀값", "환경 차이"}, {name for name, _ in names})
        self.assertEqual("low", record.risk)
        self.assertEqual("none", record.rollback_test()["status"])

    def test_plan_names_not_done_issue_and_exits_1(self):
        self.make_issue("DEMO-1", "pay-api")
        self.make_issue("DEMO-2", "pay-method", done=False)
        self.init_git()
        r = self.run_py("deploy.py", "plan", "DEMO-1", "DEMO-2", "--tag", "v1.0.0")
        self.assertEqual(1, r.returncode, r.stdout + r.stderr)
        self.assertIn("DEMO-2", r.stdout)
        self.assertNotIn("DEMO-1\n", r.stdout)
        self.assertFalse((self.root / ".agents/docs/ops/deploys").exists())

    def test_same_day_same_key_gets_suffix(self):
        self.make_issue("DEMO-1", "pay-api")
        self.init_git()
        first = json.loads(self.run_py("deploy.py", "plan", "DEMO-1", "--json").stdout)
        second = json.loads(self.run_py("deploy.py", "plan", "DEMO-1", "--json").stdout)
        self.assertTrue(second["id"].endswith("-DEMO-1-2"), second)
        self.assertNotEqual(first["id"], second["id"])


class DeployGateTest(OpsCase):
    def prepare(self, risk="low", auto=False):
        self.deploy_config(auto)
        self.make_issue("DEMO-1", "pay-api", risk=risk)
        self.init_git()
        path = self.root / json.loads(self.run_py("deploy.py", "plan", "DEMO-1", "--json").stdout)["record"]
        sha = self.git("rev-parse", "--short=12", "HEAD").stdout.strip()
        text = path.read_text(encoding="utf-8")
        text = text.replace("- full: none", f"- full: passed · sha {sha} · https://ci.example/pipelines/1").replace("- quality-gate: none", f"- quality-gate: passed · sha {sha}")
        path.write_text(text, encoding="utf-8")
        return path

    def with_test(self, path, status="passed"):
        text = path.read_text(encoding="utf-8").replace("- 시험: none", f"- 시험: {status} · env verify · https://ci.example/pipelines/2 · 2026-11-30T16:20:00+09:00")
        path.write_text(text, encoding="utf-8")

    def check(self, path, *extra):
        return self.run_py("deploy.py", "check", str(path), "--json", *extra)

    def failed(self, path, *extra):
        return json.loads(self.check(path, *extra).stdout)["failed"]

    def approve(self, path, email, waiver=None):
        record = deploy_record.load(path)
        self.append(self.issue("DEMO-1-pay-api"), "DEMO-1", deploy_gate.approval_entry(record, {"email": email, "name": None, "group": None}, "확인", approvals.now_text(), "terminal", approvals.new_entry_id(), waiver))

    def test_missing_rollback_test_is_d3_and_waiver_fixes_it(self):
        path = self.prepare()
        r = self.check(path)
        self.assertEqual(1, r.returncode)
        self.assertEqual(["D3"], json.loads(r.stdout)["failed"])
        self.assertEqual(0, self.check(path, "--waive", "검증 환경에 PG 샌드박스가 없다").returncode)
        self.assertEqual(["D3"], self.failed(path, "--waive", "짧음"), "10자 미만 사유는 면제가 아니다")

    def test_high_risk_cannot_waive(self):
        path = self.prepare("high")
        self.assertEqual("high", deploy_record.load(path).risk)
        self.assertEqual(["D3"], self.failed(path, "--waive", "검증 환경에 PG 샌드박스가 없다"))

    def test_rollback_test_must_come_from_verification_env(self):
        path = self.prepare()
        self.with_test(path)
        self.assertEqual([], self.failed(path))
        path.write_text(path.read_text(encoding="utf-8").replace("env verify", "env production"), encoding="utf-8")
        self.assertEqual(["D3"], self.failed(path))

    def test_ci_and_checklist_conditions(self):
        path = self.prepare()
        self.with_test(path)
        text = path.read_text(encoding="utf-8")
        path.write_text(text.replace("- quality-gate: passed", "- quality-gate: failed"), encoding="utf-8")
        self.assertEqual(["D4"], self.failed(path))
        path.write_text(text.replace("| 체크 |", "| 미확인 |", 1), encoding="utf-8")
        self.assertEqual(["D5"], self.failed(path))
        path.write_text(text.replace("· sha ", "· sha 0000000", 1), encoding="utf-8")
        self.assertIn("D4", self.failed(path))

    def test_require_approved_and_plan_sha(self):
        path = self.prepare()
        self.with_test(path)
        self.assertEqual(["D6"], self.failed(path, "--require-approved"))
        self.approve(path, "kim@example.com")
        self.assertEqual(0, self.check(path, "--require-approved").returncode)
        with_result = path.read_text(encoding="utf-8").replace("상태: planned", "상태: succeeded · 롤백: 없음")
        path.write_text(with_result.replace("state: planned", "state: succeeded"), encoding="utf-8")
        self.assertEqual(0, self.check(path, "--require-approved").returncode, "결과 구간만 바꾸면 승인은 유지된다")
        path.write_text(path.read_text(encoding="utf-8").replace("| 스모크 |", "| 스모크 · 바뀜 |"), encoding="utf-8")
        r = self.check(path, "--require-approved")
        self.assertEqual(1, r.returncode)
        reasons = " ".join(json.loads(r.stdout)["conditions"][5]["reasons"])
        self.assertIn("승인 sha 불일치", reasons)

    def test_waiver_counts_only_when_in_approval_entry(self):
        path = self.prepare()
        path.write_text(path.read_text(encoding="utf-8").replace("- 시험: none", "- 시험: none (면제: 에이전트가 적은 문장)"), encoding="utf-8")
        self.approve(path, "kim@example.com")
        self.assertIn("D3", self.failed(path, "--require-approved"), "기록 본문의 면제 문장은 세지 않는다")
        self.approve(path, "kim@example.com", "검증 환경에 PG 샌드박스가 없다. 플래그 끄기로 되돌린다")
        self.assertEqual(0, self.check(path, "--require-approved").returncode)

    def test_high_risk_needs_two_different_emails(self):
        path = self.prepare("high")
        self.with_test(path)
        self.approve(path, "kim@example.com")
        r = self.check(path, "--require-approved")
        self.assertEqual((1, ["D6"]), (r.returncode, json.loads(r.stdout)["failed"]))
        self.approve(path, "KIM@example.com")
        self.assertEqual(1, self.check(path, "--require-approved").returncode, "같은 사람은 한 명이다")
        self.approve(path, "lee@example.com")
        self.assertEqual(0, self.check(path, "--require-approved").returncode)

    def test_d7_needs_auto_verify_result_when_enabled(self):
        path = self.prepare(auto=True)
        self.with_test(path)
        self.assertEqual(["D7"], self.failed(path))
        sha = deploy_record.load(path).commit["sha"]
        report = self.root / ".agents/reports/deploy"
        report.mkdir(parents=True)
        (report / f"auto-verify-{sha[:7]}.json").write_text(json.dumps({"sha": sha, "status": "passed"}), encoding="utf-8")
        self.assertEqual([], self.failed(path))
        self.deploy_config(False)
        (report / f"auto-verify-{sha[:7]}.json").unlink()
        self.assertEqual([], self.failed(path))

    def test_run_production_checks_approval_first(self):
        path = self.prepare()
        self.with_test(path)
        r = self.run_py("deploy.py", "run", "--env", "production", "--record", str(path))
        self.assertEqual(1, r.returncode)
        self.assertEqual([], self.calls(), "승인 전에는 배포 명령을 부르지 않는다")


class RecordFromCiTest(OpsCase):
    def test_record_fills_lines_and_rejects_other_sha(self):
        self.make_issue("DEMO-1", "pay-api")
        self.init_git()
        path = self.root / json.loads(self.run_py("deploy.py", "plan", "DEMO-1", "--json").stdout)["record"]
        sha = self.git("rev-parse", "HEAD").stdout.strip()
        (self.root / ".agents/state").mkdir(parents=True, exist_ok=True)
        verify = self.root / ".agents/state/verify-last.json"
        verify.write_text(json.dumps({"level": "full", "status": "passed", "head": {"sha": sha, "dirty": False}}), encoding="utf-8")
        reports = self.root / ".agents/reports"
        reports.mkdir(parents=True, exist_ok=True)
        (reports / "quality-gate-last.json").write_text(json.dumps({"status": "passed", "head": sha[:12]}), encoding="utf-8")
        r = self.run_py("deploy.py", "record", str(path), "--from-ci", "https://ci.example/pipelines/9")
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)
        check = deploy_record.load(path).verification()
        self.assertEqual(("passed", "passed"), (check["full"]["status"], check["gate"]["status"]))
        verify.write_text(json.dumps({"level": "full", "status": "passed", "head": {"sha": "f" * 40, "dirty": False}}), encoding="utf-8")
        r = self.run_py("deploy.py", "record", str(path), "--from-ci", str(verify))
        self.assertEqual(1, r.returncode)
        self.assertIn(("f" * 40), r.stderr)
        self.assertIn(deploy_record.load(path).commit["sha"], r.stderr)


class AutoVerifyTest(OpsCase):
    def push(self, name, history=None, resume=False):
        """base 에 커밋 하나를 더하고(병합) auto-verify 를 돈다. 이 호출 앞 · 뒤 배포 명령 수를 비교하려고 호출 줄 수를 돌려준다."""
        (self.root / f"change-{name}.txt").write_text(name, encoding="utf-8")
        self.commit(f"merge {name}")
        env = {}
        if history is not None:
            (self.root / ".agents/state").mkdir(parents=True, exist_ok=True)
            (self.root / ".agents/state/history.json").write_text(json.dumps(history), encoding="utf-8")
            env["HX_DEPLOY_HISTORY"] = str(self.root / ".agents/state/history.json")
        if resume:
            env["HX_DEPLOY_RESUME"] = "true"
        before = len(self.calls())
        r = self.run_py("deploy.py", "auto-verify", env=env)
        artifact = max((self.root / ".agents/reports/deploy").glob("auto-verify-*.json"), key=lambda p: json.loads(p.read_text())["seq"])
        return r, json.loads(artifact.read_text()), len(self.calls()) - before

    def test_two_failures_stop_then_resume(self):
        self.init_git()
        (self.root / "ops/fail-e2e").write_text("", encoding="utf-8")
        history = []
        r, out, _ = self.push("a", history)
        self.assertEqual((1, "failed", 1), (r.returncode, out["status"], out["consecutiveFailures"]), r.stdout + r.stderr)
        history.insert(0, {"status": "failed", "sha": out["sha"]})
        r, out, _ = self.push("b", history)
        self.assertEqual((1, "failed", 2), (r.returncode, out["status"], out["consecutiveFailures"]))
        history.insert(0, {"status": "failed", "sha": out["sha"]})
        r, out, count = self.push("c", history)
        self.assertEqual((1, "stopped", 0), (r.returncode, out["status"], count), "세 번째는 배포 명령을 부르지 않는다")
        history.insert(0, {"status": "stopped", "sha": out["sha"]})
        r, out, count = self.push("d", history)
        self.assertEqual(("stopped", 0), (out["status"], count), "멈춘 뒤에는 사람이 재개할 때까지 계속 멈춘다")
        (self.root / "ops/fail-e2e").unlink()
        history.insert(0, {"status": "stopped", "sha": out["sha"]})
        r, out, count = self.push("e", history, resume=True)
        self.assertEqual((0, "passed", 0), (r.returncode, out["status"], out["consecutiveFailures"]), r.stdout + r.stderr)
        self.assertGreater(count, 0)
        history.insert(0, {"status": "passed", "sha": out["sha"]})
        r, out, count = self.push("f", history)
        self.assertEqual((0, "passed"), (r.returncode, out["status"]))
        self.assertGreater(count, 0, "재개한 실행이 통과하면 다음 push 는 배포한다")

    def test_unreadable_history_stops_and_artifact_mode_reads_previous_output(self):
        self.init_git()
        r, out, count = self.push("a")
        self.assertEqual(("stopped", 0), (out["status"], count))
        self.assertIn("실패 수 모름", out["reason"])
        r, out, count = self.push("b", resume=True)
        self.assertEqual((0, "passed"), (r.returncode, out["status"]), r.stdout + r.stderr)
        self.assertGreater(count, 0)
        r, out, count = self.push("c")
        self.assertEqual("passed", out["status"], "산출물 방식: 직전 통과를 읽는다")
        self.assertIn("rollbackTest", out)

    def test_e2e_is_run_once_and_rollback_test_recorded(self):
        self.init_git()
        r, out, _ = self.push("a", [{"status": "passed", "sha": "1234567"}])
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)
        calls = self.calls()
        self.assertEqual(1, sum(1 for line in calls if line.startswith("e2e")))
        self.assertEqual({"status": "passed", "toSha": "1234567"}, out["rollbackTest"])
        self.assertEqual(["deploy", "smoke", "health", "e2e", "rollback", "health", "deploy", "health"], [line.split()[0] for line in calls])

    def test_disabled_is_off(self):
        self.deploy_config(False)
        self.init_git()
        r = self.run_py("deploy.py", "auto-verify")
        self.assertEqual(0, r.returncode)
        self.assertIn("꺼짐", r.stdout)
        self.assertEqual([], self.calls())

    def test_max_failures_is_capped_at_two(self):
        self.deploy_config(True, 3)
        self.init_git()
        r = self.check()
        self.assertNotEqual(0, r.returncode)
        self.assertIn("maxConsecutiveFailures", r.stdout + r.stderr)


class ProductionRunTest(OpsCase):
    def test_approved_record_deploys_and_writes_result_only(self):
        self.deploy_config(True)
        self.make_issue("DEMO-1", "pay-api")
        self.init_git()
        path = self.root / json.loads(self.run_py("deploy.py", "plan", "DEMO-1", "--json").stdout)["record"]
        sha = self.git("rev-parse", "--short=12", "HEAD").stdout.strip()
        text = path.read_text(encoding="utf-8")
        text = text.replace("- full: none", f"- full: passed · sha {sha} · https://ci/1").replace("- quality-gate: none", f"- quality-gate: passed · sha {sha}")
        text = text.replace("- 시험: none", "- 시험: passed · env verify · https://ci/2 · 2026-11-30T16:20:00+09:00")
        path.write_text(text, encoding="utf-8")
        report = self.root / ".agents/reports/deploy"
        report.mkdir(parents=True)
        (report / f"auto-verify-{sha[:7]}.json").write_text(json.dumps({"sha": sha, "status": "passed"}), encoding="utf-8")
        record = deploy_record.load(path)
        self.append(self.issue("DEMO-1-pay-api"), "DEMO-1", deploy_gate.approval_entry(record, {"email": "kim@example.com", "name": None, "group": None}, "확인", approvals.now_text(), "terminal", approvals.new_entry_id()))
        before = record.sha
        r = self.run_py("deploy.py", "run", "--env", "production", "--record", str(path))
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)
        self.assertEqual(["deploy", "smoke", "health"], [line.split()[0] for line in self.calls()])
        after = deploy_record.load(path)
        self.assertEqual(("succeeded", before), (after.state, after.sha), "결과 구간만 쓰고 승인은 유지된다")
        self.assertEqual(0, self.run_py("deploy.py", "check", str(path), "--require-approved").returncode)
        self.assertIsNotNone(after.finished_at())


if __name__ == "__main__":
    unittest.main()
