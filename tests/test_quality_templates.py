"""정적 분석 템플릿 시험(HK-16) — 스택별 analyzers.json · quality-gate.json · CI 셋업 자리 · Semgrep 규칙 미포함.

    python3 -m unittest tests.test_quality_templates

킷 원본(packages/templates)만 읽는다. 네트워크 · 분석기를 쓰지 않는다.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

KIT = Path(__file__).resolve().parents[1]
TEMPLATES = KIT / "packages/templates"
STACKS = ("jvm", "python", "go", "web", "electron")
COMMON = ("gitleaks", "semgrep", "osv-scanner", "jscpd", "lizard")
STACK_ANALYZERS = {
    "jvm": {"pmd", "checkstyle", "spotbugs", "detekt", "ktlint"},
    "python": {"ruff", "bandit", "mypy"},
    "web": {"eslint", "tsc"},
    "electron": {"eslint", "tsc"},
    "go": {"golangci-lint", "govulncheck"},
}
LEVELS = {"changed", "affected", "full"}
CONVERTERS = {"jscpd", "lizard", "mypy", "tsc"}


def registry(stack: str) -> dict:
    return json.loads((TEMPLATES / "stacks" / stack / "agents-root/analyzers.json").read_text())


class AnalyzerTemplateTest(unittest.TestCase):
    def test_every_stack_registers_the_same_common_analyzers(self):
        reference = None
        for stack in STACKS:
            data = registry(stack)
            self.assertEqual(data["schema"], "harness-kit.analyzers/v1")
            common = [entry for entry in data["analyzers"] if entry["layer"] == "common"]
            self.assertEqual([entry["id"] for entry in common], list(COMMON), stack)
            reference = reference or common
            self.assertEqual(common, reference, f"{stack}: 공통 분석기 정의가 다른 스택과 다르다")

    def test_stack_layer_defaults(self):
        for stack in STACKS:
            entries = [entry for entry in registry(stack)["analyzers"] if entry["layer"] != "common"]
            self.assertEqual({entry["id"] for entry in entries}, STACK_ANALYZERS[stack], stack)
            self.assertTrue(all(entry["layer"] == f"stack:{stack}" for entry in entries), stack)

    def test_entries_are_well_formed(self):
        for stack in STACKS:
            for entry in registry(stack)["analyzers"]:
                label = f"{stack}/{entry['id']}"
                self.assertTrue(set(entry["levels"]) <= LEVELS and entry["levels"], label)
                self.assertIn(entry["scope"], {"files", "modules", "repo", "lockfiles"}, label)
                self.assertIsInstance(entry["cmd"], list, label)
                self.assertTrue(entry.get("license"), label)
                sarif = entry["sarif"]
                self.assertTrue(sarif in {"native", "none"} or sarif.removeprefix("convert:") in CONVERTERS, label)
                if sarif.startswith("convert:"):
                    self.assertTrue(entry.get("stdout") or entry.get("raw"), f"{label}: 변환기 입력 자리가 없다")
                outputs = " ".join(entry["cmd"]) + " " + entry.get("stdout", "") + " ".join(entry.get("collect", []))
                if sarif == "native":
                    self.assertTrue("{out}" in outputs or entry.get("collect"), f"{label}: SARIF 출력 자리가 없다")
                if entry.get("category") == "dependency":
                    self.assertTrue(entry.get("trigger"), f"{label}: 의존성 분석기에 trigger 가 없다")

    def test_required_common_analyzers(self):
        entries = {entry["id"]: entry for entry in registry("python")["analyzers"]}
        self.assertEqual({name for name in COMMON if entries[name].get("required")}, {"gitleaks", "semgrep", "osv-scanner"})
        self.assertEqual(entries["gitleaks"]["category"], "secret")
        self.assertIn("--redact", entries["gitleaks"]["cmd"])

    def test_semgrep_rules_are_fetched_at_run_time(self):
        """VQ-R18: 킷은 Semgrep 규칙을 넣지 않는다."""
        for stack in STACKS:
            semgrep = next(entry for entry in registry(stack)["analyzers"] if entry["id"] == "semgrep")
            self.assertEqual(semgrep["rules"]["bundled"], False)
            self.assertTrue(semgrep["rules"]["source"].startswith("registry:"))
            self.assertIn("{rules}", semgrep["cmd"])
        for path in TEMPLATES.rglob("*"):
            if path.is_file() and path.suffix in {".yml", ".yaml"}:
                text = path.read_text(errors="replace")
                self.assertFalse("rules:" in text and "pattern" in text and "languages:" in text, f"{path}: Semgrep 규칙 파일처럼 보인다")

    def test_quality_gate_defaults(self):
        gate = json.loads((TEMPLATES / "common/agents-root/quality-gate.json").read_text())
        self.assertEqual(gate["schema"], "harness-kit.quality-gate/v1")
        self.assertEqual(gate["newIssues"], {"CRITICAL": 0, "HIGH": None, "MEDIUM": None, "LOW": None})
        self.assertEqual(gate["duplication"], {"newCodeMaxPercent": 3.0, "minChangedLines": 50})
        self.assertEqual(gate["complexity"], {"functionMaxCcn": 15, "mode": "new-or-worsened"})
        self.assertEqual(gate["dependencies"], {"blockAtSeverity": "CRITICAL"})
        self.assertEqual(gate["review"]["openMax"]["CRITICAL"], 0)
        self.assertEqual((gate["enforceAt"], gate["warnAt"]), (["affected", "full"], ["changed"]))


class CiTemplateTest(unittest.TestCase):
    def test_ci_files_and_stack_setup_actions(self):
        for relative in ("common/root/.github/workflows/harness-verify.yml", "common/root/.gitlab-ci.yml", "common/ci/harness-kit.gitlab-ci.yml", "common/ci/harness.gocd.yaml"):
            self.assertTrue((TEMPLATES / relative).is_file(), relative)
        for stack in STACKS:
            root = TEMPLATES / "stacks" / stack / "root/.github"
            self.assertTrue((root / "actions/harness-setup/action.yml").is_file(), stack)
            self.assertFalse((root / "workflows/verify.yml").exists(), f"{stack}: 옛 verify.yml 이 남아 있다")
            action = (root / "actions/harness-setup/action.yml").read_text()
            self.assertIn("using: composite", action)
            code = "\n".join(line for line in action.splitlines() if not line.lstrip().startswith("#"))
            self.assertNotIn("verify.sh", code, f"{stack}: 셋업 액션은 검증을 부르지 않는다")


if __name__ == "__main__":
    unittest.main()
