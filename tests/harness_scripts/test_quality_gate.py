"""분석기 실행 · 기준선 · 품질 게이트 · 지표(HK-16 VQ-R5 · R6 · R7 · R8 · R9 · R19, 설계 09 §3.3~§3.6 · §3.9)."""

import json
import re
import unittest
from datetime import date, timedelta

from quality_fixture import REPORTS, QualityFixture, analyzer, result


class AnalyzerSelectionTest(QualityFixture):
    def setUp(self):
        super().setUp()
        self.write("src/app.py", "x = 1\n")
        self.commit("base")
        self.gate_config()

    def test_only_registered_analyzers_run_at_matching_levels(self):
        """VQ-R5: 등록 파일에 있는 것만, levels 에 그 레벨이 있을 때만 돈다."""
        for name in ("sec-a", "mod-b", "off-c", "unlisted"):
            self.fake_analyzer(name)
        self.registry(
            analyzer("sec-a"),
            analyzer("mod-b", levels=["affected", "full"], scope="modules", cmd=["mod-b", "--out", "{out}", "{modules}"]),
            analyzer("off-c", enabled=False),
        )
        changed = self.quality("run", "--level", "changed", "--files", "src/app.py")
        self.assertEqual(changed.returncode, 0, changed.stdout + changed.stderr)
        self.assertEqual([call["tool"] for call in self.calls() if call["arguments"][:1] != ["--version"]], ["sec-a"])
        self.assertEqual(self.tool_calls("sec-a")[-1]["arguments"][-1], "src/app.py")
        affected = self.quality("run", "--level", "affected", "--files", "src/app.py")
        self.assertEqual(affected.returncode, 0, affected.stdout + affected.stderr)
        self.assertEqual(sorted({call["tool"] for call in self.calls()}), ["mod-b", "sec-a"])
        self.assertEqual(self.tool_calls("mod-b")[-1]["arguments"][-1], ".")
        self.assertEqual(self.tool_calls("unlisted"), [])

    def test_dependency_analyzer_runs_only_when_lockfile_changes(self):
        """VQ-R6: 의존성 분석기는 lock 파일이 바뀐 changed · affected 와 full 에서만 돈다."""
        self.fake_analyzer("deps")
        self.registry(analyzer("deps", category="dependency", scope="lockfiles", trigger=["**/uv.lock"], cmd=["deps", "--out", "{out}", "{lockfiles}"]))
        self.write("uv.lock", "version = 1\n")
        self.quality("run", "--level", "changed", "--files", "src/app.py")
        self.assertEqual(self.tool_calls("deps"), [])
        self.quality("run", "--level", "affected", "--files", "src/app.py")
        self.assertEqual(self.tool_calls("deps"), [])
        self.quality("run", "--level", "changed", "--files", "uv.lock")
        self.assertEqual(self.tool_calls("deps")[-1]["arguments"][-1], "uv.lock")
        self.commit("lock")
        self.quality("run", "--level", "full")
        self.assertEqual(len(self.tool_calls("deps")), 2)

    def test_required_missing_is_incomplete_locally_and_fails_in_ci(self):
        """VQ-R7: required 분석기가 없으면 로컬은 incomplete, CI 는 실패. 선택 분석기는 건너뛴다."""
        self.registry(analyzer("absent-required", required=True), analyzer("absent-optional"))
        local = self.quality("run", "--level", "changed", "--files", "src/app.py", "--summary")
        self.assertEqual(local.returncode, 2, local.stdout + local.stderr)
        self.assertIn("absent-required", local.stdout)
        self.assertRegex(local.stdout, r"absent-optional: 건너뜀")
        self.assertEqual(self.gate_result()["incomplete"], [{"analyzer": "absent-required", "reason": "not-installed"}])
        self.assertEqual(self.gate_result()["status"], "incomplete")
        ci = self.quality("run", "--level", "changed", "--files", "src/app.py", extra={"CI": "true"})
        self.assertEqual(ci.returncode, 1, ci.stdout + ci.stderr)
        check = next(item for item in self.gate_result()["checks"] if item["id"] == "analyzers.required")
        self.assertEqual(check["status"], "failed")

    def test_alternative_tool_takes_the_place(self):
        self.fake_analyzer("second-tool", [result("r", "src/app.py", 1)])
        self.registry(analyzer("first-tool", required=True, alternatives=["second-tool"]))
        run = self.quality("run", "--level", "changed", "--files", "src/app.py")
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertEqual(len(self.tool_calls("second-tool")), 1)
        self.assertEqual(self.report("findings-latest.json")["analyzers"]["first-tool"]["tool"], "second-tool")

    def test_timeout_old_version_and_missing_output_are_reported(self):
        self.fake_analyzer("slow", sleep=5)
        self.fake_analyzer("ancient", version="ancient 1.2.3")
        self.fake_analyzer("silent", write=False)
        self.registry(
            analyzer("slow", timeoutSec=1),
            analyzer("ancient", required=True, versionCmd=["ancient", "--version"], minVersion="2.0.0"),
            analyzer("silent", required=True),
        )
        run = self.quality("run", "--level", "changed", "--files", "src/app.py", "--summary")
        self.assertEqual(run.returncode, 2, run.stdout + run.stderr)
        reasons = {item["analyzer"]: item["reason"] for item in self.gate_result()["incomplete"]}
        self.assertEqual(reasons, {"slow": "timeout", "ancient": "version-too-old", "silent": "no-output"})

    def test_converter_turns_tool_output_into_sarif(self):
        """VQ-R8: SARIF 를 못 내는 도구는 킷 변환기가 바꾼다(stdout → {tmp} → convert:lizard)."""
        csv = '40,19,154,1,39,"f@1-39@src/app.py","src/app.py","f","f( x )",1,39\n'
        self.fake_analyzer("lizard-like", stdout=csv)
        self.registry(analyzer("lizard-like", category="complexity", cmd=["lizard-like", "--csv", "{targets}"], stdout="{tmp}/lizard.csv", sarif="convert:lizard", convertArgs=["--threshold", "{ccn}"]))
        run = self.quality("run", "--level", "changed", "--files", "src/app.py")
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertEqual([(item["ruleId"], item["properties"]["ccn"]) for item in self.findings()], [("lizard/ccn", 19)])


class BaselineGateTest(QualityFixture):
    def setUp(self):
        super().setUp()
        self.write("src/app.py", "query = 'SELECT ' + name\ntoken = 'AKIA0000'\nok = 1\n")
        self.commit("base")
        self.gate_config()
        self.fake_analyzer("scan", [result("sqli", "src/app.py", 1, level="error"), result("secret", "src/app.py", 2, properties={"security-severity": "9.8"})])
        self.registry(analyzer("scan"))

    def fingerprints(self):
        self.quality("run", "--level", "affected", "--files", "src/app.py")
        return {item["ruleId"]: item["fingerprint"] for item in self.findings()}

    def test_only_findings_missing_from_baseline_are_new(self):
        """VQ-R9: 기준선에 있는 HIGH 는 보고만, 기준선에 없는 CRITICAL 은 막는다."""
        fingerprints = self.fingerprints()
        self.baseline({"scan": {fingerprints["sqli"]: {"ruleId": "sqli", "path": "src/app.py", "severity": "HIGH"}}})
        run = self.quality("run", "--level", "affected", "--files", "src/app.py", "--summary")
        self.assertEqual(run.returncode, 1, run.stdout + run.stderr)
        self.assertEqual({item["ruleId"]: item["new"] for item in self.findings()}, {"sqli": False, "secret": True})
        gate = self.gate_result()
        self.assertEqual(gate["status"], "failed")
        critical = next(item for item in gate["checks"] if item["id"] == "newIssues.CRITICAL")
        self.assertEqual((critical["value"], critical["limit"], critical["status"]), (1, 0, "failed"))
        self.assertEqual(critical["items"], [f"scan:{fingerprints['secret']}"])
        self.assertIn("newIssues.CRITICAL", run.stdout)

    def test_accepted_until_future_passes_and_expired_is_ignored(self):
        fingerprints = self.fingerprints()
        known = {"scan": {fingerprints["sqli"]: {"ruleId": "sqli", "path": "src/app.py", "severity": "HIGH"}}}
        self.baseline(known, accepted=[{"fingerprint": fingerprints["secret"], "analyzer": "scan", "reason": "시험 고정값", "by": "kim@example.com", "until": (date.today() + timedelta(days=30)).isoformat()}])
        self.assertEqual(self.quality("run", "--level", "affected", "--files", "src/app.py").returncode, 0)
        self.assertEqual({item["ruleId"]: item.get("accepted") for item in self.findings()}["secret"], True)
        self.baseline(known, accepted=[{"fingerprint": fingerprints["secret"], "analyzer": "scan", "reason": "시험 고정값", "by": "kim@example.com", "until": "2020-01-31"}])
        self.assertEqual(self.quality("run", "--level", "affected", "--files", "src/app.py").returncode, 1)
        check = self.quality("check-config")
        self.assertEqual(check.returncode, 0, check.stdout + check.stderr)
        self.assertIn("accepted", check.stdout)

    def test_changed_level_warns_and_affected_level_fails(self):
        self.baseline({})
        changed = self.quality("run", "--level", "changed", "--files", "src/app.py", "--summary")
        self.assertEqual(changed.returncode, 0, changed.stdout + changed.stderr)
        self.assertEqual(self.gate_result()["status"], "warned")
        self.assertIn("warned", changed.stdout)
        self.assertEqual(self.quality("run", "--level", "affected", "--files", "src/app.py").returncode, 1)

    def test_without_baseline_the_gate_only_warns(self):
        run = self.quality("run", "--level", "affected", "--files", "src/app.py", "--summary")
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        gate = self.gate_result()
        self.assertEqual((gate["status"], gate["mode"]), ("warned", "warn-no-baseline"))
        self.assertIn("baseline --update", run.stdout)

    def test_dependency_block_severity(self):
        self.baseline({})
        self.fake_analyzer("deps", [result("GHSA-1", "uv.lock", 1, properties={"security-severity": "7.5"})])
        self.write("uv.lock", "version = 1\n")
        self.registry(analyzer("deps", category="dependency", scope="lockfiles", trigger=["uv.lock"], cmd=["deps", "--out", "{out}", "{lockfiles}"]))
        self.gate_config(dependencies={"blockAtSeverity": "HIGH"})
        self.assertEqual(self.quality("run", "--level", "affected", "--files", "uv.lock").returncode, 1)
        check = next(item for item in self.gate_result()["checks"] if item["id"] == "dependencies.blockAtSeverity")
        self.assertEqual((check["value"], check["status"]), (1, "failed"))
        self.gate_config(dependencies={"blockAtSeverity": "CRITICAL"})
        self.assertEqual(self.quality("run", "--level", "affected", "--files", "uv.lock").returncode, 0)


class NewCodeTest(QualityFixture):
    """새 코드 판정 — 복잡도(new-or-worsened) · 중복률(바뀐 줄 기준)."""

    def setUp(self):
        super().setUp()
        self.write("src/app.py", "".join(f"line_{i} = {i}\n" for i in range(1, 121)))
        self.commit("base")
        self.gate_config()

    def complexity(self, ccn, baseline_ccn=None):
        self.fake_analyzer("cx", [result("lizard/ccn", "src/app.py", 10, end=30, properties={"ccn": ccn, "function": "f"})])
        self.registry(analyzer("cx", category="complexity"))
        if baseline_ccn is None:
            self.baseline({})
        else:
            self.quality("run", "--level", "affected", "--files", "src/app.py")
            fingerprint = self.findings()[0]["fingerprint"]
            self.baseline({"cx": {fingerprint: {"ruleId": "lizard/ccn", "path": "src/app.py", "severity": "MEDIUM", "ccn": baseline_ccn}}})
        return self.quality("run", "--level", "affected", "--files", "src/app.py", "--summary")

    def test_complexity_new_or_worsened_function_fails(self):
        self.write("src/app.py", self.root.joinpath("src/app.py").read_text().replace("line_20 = 20", "line_20 = 2000"))
        self.assertEqual(self.complexity(19).returncode, 1)
        check = next(item for item in self.gate_result()["checks"] if item["id"] == "complexity.functionMaxCcn")
        self.assertEqual((check["value"], check["status"]), (1, "failed"))
        self.assertEqual(check["items"], ["src/app.py:f ccn 19"])
        self.assertEqual(self.complexity(22, baseline_ccn=20).returncode, 1)
        same = self.complexity(20, baseline_ccn=20)
        self.assertEqual(same.returncode, 0, same.stdout)
        check = next(item for item in self.gate_result()["checks"] if item["id"] == "complexity.functionMaxCcn")
        self.assertEqual(check["status"], "passed")

    def test_complexity_outside_changed_lines_is_not_judged(self):
        self.write("src/app.py", self.root.joinpath("src/app.py").read_text().replace("line_100 = 100", "line_100 = 1"))
        self.assertEqual(self.complexity(40).returncode, 0)

    def test_new_code_duplication_percent(self):
        text = self.root.joinpath("src/app.py").read_text()
        self.write("src/app.py", text + "".join(f"added_{i} = {i}\n" for i in range(60)))
        self.baseline({})
        self.fake_analyzer("dup", [result("jscpd/duplicate", "src/app.py", 121, end=130, extra=[("src/app.py", 1, 10)], properties={"lines": 10, "tokens": 50, "format": "python"})])
        self.registry(analyzer("dup", category="duplication", levels=["affected", "full"]))
        run = self.quality("run", "--level", "affected", "--files", "src/app.py")
        self.assertEqual(run.returncode, 1, run.stdout + run.stderr)
        check = next(item for item in self.gate_result()["checks"] if item["id"] == "duplication.newCodeMaxPercent")
        self.assertEqual((check["value"], check["limit"], check["status"]), (16.7, 3.0, "failed"))
        self.write("src/app.py", text + "".join(f"added_{i} = {i}\n" for i in range(10)))
        self.assertEqual(self.quality("run", "--level", "affected", "--files", "src/app.py").returncode, 0)
        check = next(item for item in self.gate_result()["checks"] if item["id"] == "duplication.newCodeMaxPercent")
        self.assertEqual(check["status"], "skipped")


class OutputTest(QualityFixture):
    def setUp(self):
        super().setUp()
        self.write("src/app.py", "x = 1\ny = 2\n")
        self.head = self.commit("base")
        self.gate_config()
        self.baseline({})
        self.fake_analyzer("scan", [result("r1", "src/app.py", 1, level="error"), result("r2", "src/app.py", 2, level="note")])
        self.registry(analyzer("scan"))

    def test_sarif_folder_latest_and_gitignore(self):
        """VQ-R8: 결과는 .agents/reports/sarif/<runId>/<분석기>.sarif 에 정규화한 SARIF 로 모인다."""
        self.assertEqual(self.quality("run", "--level", "affected", "--files", "src/app.py").returncode, 0)
        reports = self.root / REPORTS
        self.assertEqual((reports / ".gitignore").read_text(), "*\n")
        latest = self.report("findings-latest.json")
        self.assertRegex(latest["runId"], rf"^affected-\d{{14}}-{self.head[:7]}$")
        self.assertEqual(latest["head"], self.head)
        document = json.loads((reports / "sarif" / latest["runId"] / "scan.sarif").read_text())
        self.assertEqual(document["runs"][0]["results"][0]["locations"][0]["physicalLocation"]["artifactLocation"]["uriBaseId"], "%SRCROOT%")
        self.assertTrue((reports / "sarif/latest/scan.sarif").is_file())
        self.assertEqual(json.loads((reports / "sarif/latest/scan.sarif").read_text()), document)

    def test_metrics_record_every_run(self):
        """VQ-R19: 분석기별 문제 수(전체 · 새 것) · 중복률 · 복잡도 초과 함수 수 · 소요 시간."""
        for _ in range(2):
            self.quality("run", "--level", "affected", "--files", "src/app.py")
        metrics = self.report("metrics/latest.json")
        self.assertEqual(metrics["schema"], "harness-kit.metrics/v1")
        self.assertEqual(metrics["level"], "affected")
        self.assertEqual(metrics["head"], self.head[:7])
        scan = metrics["analyzers"]["scan"]
        self.assertEqual((scan["total"], scan["new"]), (2, 2))
        self.assertEqual(scan["bySeverity"], {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 0, "LOW": 1})
        self.assertIsInstance(scan["seconds"], float)
        for key in ("duplication", "complexity", "coverage", "gate", "seconds", "at", "branch"):
            self.assertIn(key, metrics)
        self.assertEqual(set(metrics["duplication"]), {"newCodePercent", "repoPercent"})
        self.assertEqual(set(metrics["complexity"]), {"functionsOverCcn", "newOrWorsened", "maxCcn"})
        daily = list((self.root / REPORTS / "metrics").glob("*.jsonl"))
        self.assertEqual(len(daily), 1)
        self.assertTrue(re.fullmatch(r"\d{4}-\d{2}-\d{2}\.jsonl", daily[0].name))
        self.assertEqual(len(daily[0].read_text().splitlines()), 2)

    def test_summary_stays_short_with_many_analyzers(self):
        entries = []
        for number in range(30):
            name = f"tool-{number:02d}"
            self.fake_analyzer(name, [result("r", "src/app.py", 1)])
            entries.append(analyzer(name))
        self.registry(*entries)
        run = self.quality("run", "--level", "affected", "--files", "src/app.py", "--summary")
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertLessEqual(len(run.stdout.splitlines()), 15)


if __name__ == "__main__":
    unittest.main()
