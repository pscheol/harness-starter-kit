"""정적 분석 시험이 같이 쓰는 fixture — git 리포 + 가짜 분석기(정해 둔 SARIF · 출력을 쓴다). 실제 분석기는 띄우지 않는다."""

import json
import subprocess
import sys

from verify_fixture import IDENTITY, SOURCE, VerifyFixture

sys.path.insert(0, str(SOURCE))

REPORTS = ".agents/reports"
FAKE = """#!/usr/bin/env python3
import json, os, sys, time
arguments = sys.argv[1:]
with open({records!r}, "a") as record:
    record.write(json.dumps({{"tool": {name!r}, "arguments": arguments, "cwd": os.getcwd()}}) + "\\n")
if arguments[:1] in (["--version"], ["version"]):
    print({version!r})
    sys.exit(0)
with open({spec!r}) as handle:
    spec = json.load(handle)
time.sleep(spec.get("sleep", 0))
if spec.get("sarif") is not None and "--out" in arguments:
    with open(arguments[arguments.index("--out") + 1], "w") as handle:
        json.dump(spec["sarif"], handle)
if spec.get("stdout"):
    sys.stdout.write(spec["stdout"])
sys.exit(spec.get("exit", 0))
"""


def result(rule, path, line, level="warning", message="문제", end=None, properties=None, partial=None, extra=()):
    """SARIF 결과 하나. extra 는 (경로, 시작, 끝) 위치를 더한다(jscpd 쌍)."""
    locations = [{"physicalLocation": {"artifactLocation": {"uri": path}, "region": {"startLine": line, "endLine": end or line}}}]
    for other, start, finish in extra:
        locations.append({"physicalLocation": {"artifactLocation": {"uri": other}, "region": {"startLine": start, "endLine": finish}}})
    item = {"ruleId": rule, "level": level, "message": {"text": message}, "locations": locations}
    if properties:
        item["properties"] = properties
    if partial is not None:
        item["partialFingerprints"] = partial
    return item


def sarif(results, tool="fake", rules=None):
    driver = {"name": tool, "rules": rules or []}
    return {"version": "2.1.0", "$schema": "https://json.schemastore.org/sarif-2.1.0.json", "runs": [{"tool": {"driver": driver}, "results": results}]}


def analyzer(name, **fields):
    """등록 항목 하나. 기본은 바꾼 파일 범위 · 세 레벨 · 선택 분석기 · SARIF 직접 출력."""
    entry = {
        "id": name, "layer": "common", "category": "security", "required": False,
        "levels": ["changed", "affected", "full"], "scope": "files",
        "cmd": [name, "--out", "{out}", "{targets}"], "sarif": "native", "timeoutSec": 30, "license": "MIT",
    }
    entry.update(fields)
    return entry


class QualityFixture(VerifyFixture):
    """git 리포(develop 브랜치) 하네스. self.registry() · self.fake_analyzer() 로 분석기를 놓는다."""

    def setUp(self):
        super().setUp()
        self.write(".agents/knots-sync.json", json.dumps({"git": {"base": "develop"}, "analyzers": {"semgrepRulesAcknowledged": True}}))
        self.git("init", "-q", "-b", "develop")
        self.write(".gitignore", ".agents/state/\n")

    def git(self, *arguments, cwd=None):
        result = subprocess.run(["git", *IDENTITY, *arguments], cwd=cwd or self.root, env=self.env, capture_output=True, text=True, timeout=30, check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result.stdout.strip()

    def commit(self, message="commit"):
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", message)
        return self.git("rev-parse", "HEAD")

    def registry(self, *entries):
        self.write(".agents/analyzers.json", json.dumps({"schema": "knots-sync.analyzers/v1", "analyzers": list(entries)}, ensure_ascii=False, indent=2))

    def gate_config(self, **overrides):
        config = {
            "schema": "knots-sync.quality-gate/v1",
            "newIssues": {"CRITICAL": 0, "HIGH": None, "MEDIUM": None, "LOW": None},
            "duplication": {"newCodeMaxPercent": 3.0, "minChangedLines": 50},
            "complexity": {"functionMaxCcn": 15, "mode": "new-or-worsened"},
            "coverage": {"newCodeMinPercent": None},
            "dependencies": {"blockAtSeverity": "CRITICAL"},
            "review": {"openMax": {"CRITICAL": 0, "HIGH": 0}},
            "enforceAt": ["affected", "full"],
            "warnAt": ["changed"],
        }
        for key, value in overrides.items():
            config[key] = value
        self.write(".agents/quality-gate.json", json.dumps(config, indent=2))

    def baseline(self, findings=None, accepted=None, commit=None):
        self.write(".agents/quality-baseline.json", json.dumps({
            "schema": "knots-sync.quality-baseline/v1", "commit": commit or "0000000", "createdAt": "2026-11-20T02:00:00Z",
            "findings": findings or {}, "metrics": {}, "accepted": accepted or [],
        }, indent=2))

    def fake_analyzer(self, name, results=(), sleep=0, exit_code=0, stdout=None, version="fake 1.2.3", write=True):
        """PATH 맨 앞의 가짜 분석기. --out 뒤 경로에 SARIF 를 쓴다(write=False 면 쓰지 않는다)."""
        spec = self.base / f"{name}.spec.json"
        spec.write_text(json.dumps({"sleep": sleep, "exit": exit_code, "stdout": stdout, "sarif": sarif(list(results), tool=name) if write else None}))
        path = self.bin / name
        path.write_text(FAKE.format(records=str(self.records), name=name, version=version, spec=str(spec)))
        path.chmod(0o755)
        return path

    def tool_calls(self, name):
        return [call for call in self.calls() if call.get("tool") == name]

    def quality(self, *arguments, extra=None):
        return subprocess.run(
            [sys.executable, str(self.root / "scripts/harness/quality.py"), *arguments],
            cwd=self.root, env={**self.env, **(extra or {})}, capture_output=True, text=True, timeout=120, check=False,
        )

    def report(self, name):
        return json.loads((self.root / REPORTS / name).read_text())

    def findings(self):
        return self.report("findings-latest.json")["findings"]

    def gate_result(self):
        return self.report("quality-gate-last.json")
