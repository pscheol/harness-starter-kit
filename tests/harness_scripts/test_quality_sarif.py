"""SARIF 정규화 · 지문 · 변환기(HK-16 VQ-R8 · VQ-R10, 설계 09 §3.5 · 완료 기준 7 · 8)."""

import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

from quality_fixture import QualityFixture, analyzer, result, sarif
from verify_fixture import SOURCE

from harness.quality_baseline import classify
from harness.sarif import sarif_io
from harness.sarif.normalize import normalize_document

CONVERTERS = SOURCE / "harness/sarif"
TODAY = date(2026, 11, 23)
JSCPD = {
    "duplicates": [
        {"format": "python", "lines": 12, "tokens": 90,
         "firstFile": {"name": "/repo/src/b.py", "start": 3, "end": 14},
         "secondFile": {"name": "/repo/src/a.py", "start": 1, "end": 12}},
        {"format": "python", "lines": 11, "tokens": 80,
         "firstFile": {"name": "/repo/src/a.py", "start": 30, "end": 40},
         "secondFile": {"name": "/repo/src/c.py", "start": 2, "end": 12}},
    ],
    "statistics": {"total": {"lines": 400, "duplicatedLines": 23, "percentage": 5.75}},
}
LIZARD_ROWS = [
    '39,19,154,1,39,"complex_fn@1-39@src/a.py","src/a.py","complex_fn","complex_fn( x )",1,39',
    '2,1,11,2,2,"simple@42-43@src/a.py","src/a.py","simple","simple( a , b )",42,43',
    '50,31,300,3,52,"parse@3-55@src/b.py","src/b.py","parse","parse( a , b , c )",3,55',
]
LIZARD_HEADER = "NLOC,CCN,token,PARAM,length,location,file,function,long_name,start,end"
MYPY = "\n".join(json.dumps(item) for item in (
    {"file": "src/b.py", "line": 7, "column": 4, "message": "Incompatible return value", "hint": None, "code": "return-value", "severity": "error"},
    {"file": "src/a.py", "line": 2, "column": 0, "message": "Unused ignore", "hint": None, "code": "unused-ignore", "severity": "note"},
)) + "\n"
TSC = "src/b.ts(4,7): error TS2322: Type 'string' is not assignable to type 'number'.\nsrc/a.ts(10,1): error TS2304: Cannot find name 'foo'.\n   continued message line\n"


class NormalizeTest(QualityFixture):
    def normalize(self, results, entry=None, mirror=None):
        return normalize_document(sarif(results), entry or analyzer("fake"), self.root, mirror=mirror)

    def test_paths_become_repo_relative_with_srcroot_and_outside_results_drop(self):
        for name in ("a", "b", "c"):
            self.write(f"src/{name}.py", "x = 1\n")
        document, findings = self.normalize([
            result("r1", "src/a.py", 1),
            result("r1", str(self.root / "src/b.py"), 1),
            result("r1", (self.root / "src/c.py").as_uri(), 1),
            result("r1", "/etc/hosts", 1),
            result("r1", "../outside.py", 1),
        ])
        self.assertEqual([item["path"] for item in findings], ["src/a.py", "src/b.py", "src/c.py"])
        locations = [item["locations"][0]["physicalLocation"]["artifactLocation"] for item in document["runs"][0]["results"]]
        self.assertEqual(locations, [{"uri": f"src/{name}.py", "uriBaseId": "%SRCROOT%"} for name in ("a", "b", "c")])

    def test_mirror_folder_paths_map_back_to_repo(self):
        self.write("src/a.py", "token = 'x'\n")
        mirror = Path(tempfile.mkdtemp(dir=self.base))
        _, findings = self.normalize([result("r1", str(mirror / "src/a.py"), 1)], mirror=mirror)
        self.assertEqual([item["path"] for item in findings], ["src/a.py"])

    def test_severity_table(self):
        self.write("src/a.py", "\n".join(f"line{i}" for i in range(12)) + "\n")
        rules = [{"id": "default-error", "defaultConfiguration": {"level": "error"}}, {"id": "cvss-rule", "properties": {"security-severity": "9.1"}}]
        document = sarif([
            result("s95", "src/a.py", 1, properties={"security-severity": "9.5"}),
            result("s70", "src/a.py", 2, properties={"security-severity": "7.0"}),
            result("s40", "src/a.py", 3, properties={"security-severity": "4.0"}),
            result("s39", "src/a.py", 4, properties={"security-severity": "3.9"}),
            result("e", "src/a.py", 5, level="error"),
            result("w", "src/a.py", 6, level="warning"),
            result("n", "src/a.py", 7, level="note"),
            result("none", "src/a.py", 8, level="none"),
            {**result("default-error", "src/a.py", 9), "level": None},
            {key: value for key, value in result("plain", "src/a.py", 10).items() if key != "level"},
            result("cvss-rule", "src/a.py", 11, level="note"),
            result("mapped.rule", "src/a.py", 12, level="error"),
        ], rules=rules)
        entry = analyzer("fake", severityMap={"mapped.*": "LOW"})
        _, findings = normalize_document(document, entry, self.root)
        severity = {item["ruleId"]: item["severity"] for item in findings}
        self.assertEqual(severity, {
            "s95": "CRITICAL", "s70": "HIGH", "s40": "MEDIUM", "s39": "LOW", "e": "HIGH", "w": "MEDIUM", "n": "LOW",
            "none": "LOW", "default-error": "HIGH", "plain": "MEDIUM", "cvss-rule": "CRITICAL", "mapped.rule": "LOW",
        })
        _, secrets = normalize_document(sarif([result("generic", "src/a.py", 1, level="note")]), analyzer("leaks", category="secret"), self.root)
        self.assertEqual(secrets[0]["severity"], "CRITICAL")

    def test_fingerprints_survive_fifty_lines_added_above(self):
        """완료 기준 7: 줄 50개를 위에 더해도 기준선 문제 20건은 새 문제 0건이다."""
        lines = [f"query_{i} = 'SELECT * FROM t' + user_{i}" for i in range(20)]
        self.write("src/legacy.py", "\n".join(lines) + "\n")
        _, before = self.normalize([result("sqli", "src/legacy.py", i + 1, level="error") for i in range(20)])
        baseline = {"findings": {"fake": {item["fingerprint"]: {"ruleId": item["ruleId"], "path": item["path"], "severity": item["severity"]} for item in before}}, "accepted": []}
        self.write("src/legacy.py", "\n".join(f"# 머리 줄 {i}" for i in range(50)) + "\n" + "\n".join(lines) + "\n")
        _, after = self.normalize([result("sqli", "src/legacy.py", i + 51, level="error") for i in range(20)])
        self.assertEqual(len(after), 20)
        self.assertEqual(sorted(item["fingerprint"] for item in after), sorted(baseline["findings"]["fake"]))
        classified = classify(after, baseline, renames={}, today=TODAY)
        self.assertEqual(sum(item["new"] for item in classified), 0)

    def test_renamed_file_keeps_baseline_findings(self):
        """완료 기준 7: 파일 이름만 바꾼 fixture 도 새 문제 0건이다."""
        self.write("src/old_name.py", "password = 'hunter2'\nother = 1\n")
        commit = self.commit("base")
        _, before = self.normalize([result("hardcoded", "src/old_name.py", 1, level="error")])
        baseline = {"commit": commit, "findings": {"fake": {before[0]["fingerprint"]: {"ruleId": "hardcoded", "path": "src/old_name.py", "severity": "HIGH"}}}, "accepted": []}
        self.git("mv", "src/old_name.py", "src/new_name.py")
        _, after = self.normalize([result("hardcoded", "src/new_name.py", 1, level="error")])
        self.assertNotEqual(after[0]["fingerprint"], before[0]["fingerprint"])
        from harness.quality_git import renamed_paths

        renames = renamed_paths(self.root, commit)
        self.assertEqual(renames, {"src/new_name.py": "src/old_name.py"})
        self.assertEqual(sum(item["new"] for item in classify(after, baseline, renames=renames, today=TODAY)), 0)

    def test_same_content_twice_gets_distinct_ordinals(self):
        self.write("src/a.py", "eval(x)\nok = 1\neval(x)\n")
        _, findings = self.normalize([result("eval", "src/a.py", 3), result("eval", "src/a.py", 1)])
        self.assertEqual(len({item["fingerprint"] for item in findings}), 2)
        self.write("src/a.py", "# 새 줄\neval(x)\nok = 1\neval(x)\n")
        _, moved = self.normalize([result("eval", "src/a.py", 2), result("eval", "src/a.py", 4)])
        self.assertEqual({item["fingerprint"] for item in moved}, {item["fingerprint"] for item in findings})

    def test_empty_partial_fingerprints_fall_back_to_content(self):
        self.write("src/a.py", "key_a = 'AKIA1'\nkey_b = 'AKIA2'\n")
        empty = {"commitSha": "", "email": "", "author": "", "date": "", "commitMessage": ""}
        _, findings = self.normalize([result("aws", "src/a.py", 1, partial=empty), result("aws", "src/a.py", 2, partial=empty)])
        self.assertEqual(len({item["fingerprint"] for item in findings}), 2)
        tool = {"primaryLocationLineHash": "abc123:1"}
        _, first = self.normalize([result("x", "src/a.py", 1, partial=tool)])
        _, second = self.normalize([result("x", "src/a.py", 2, partial=tool)])
        self.assertEqual(first[0]["fingerprint"], second[0]["fingerprint"])
        _, content = self.normalize([result("x", "src/a.py", 1, partial=tool)], entry=analyzer("fake", fingerprint="content"))
        self.assertNotEqual(content[0]["fingerprint"], first[0]["fingerprint"])

    def test_normalized_document_is_sarif_and_records_fingerprint(self):
        self.write("src/a.py", "x = 1\n")
        document, findings = self.normalize([result("r", "src/a.py", 1)])
        self.assertEqual(sarif_io.structure_errors(document), [])
        stored = document["runs"][0]["results"][0]["partialFingerprints"]["knotsSync/v1"]
        self.assertEqual(stored, findings[0]["fingerprint"])
        _, again = normalize_document(document, analyzer("fake"), self.root)
        self.assertEqual(again[0]["fingerprint"], findings[0]["fingerprint"])


class ConverterTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="converter ")
        self.addCleanup(directory.cleanup)
        self.base = Path(directory.name)

    def convert(self, name, text, *extra):
        source = self.base / f"{name}.in"
        source.write_text(text)
        outputs = []
        for attempt in (1, 2):
            target = self.base / f"{name}-{attempt}.sarif"
            run = subprocess.run([sys.executable, str(CONVERTERS / f"{name}.py"), "--in", str(source), "--out", str(target), *extra], capture_output=True, text=True, timeout=60, check=False)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            outputs.append(target.read_bytes())
        self.assertEqual(outputs[0], outputs[1], f"{name}: 두 번 돌린 출력 바이트가 다르다")
        document = json.loads(outputs[0])
        self.assertEqual(sarif_io.structure_errors(document), [], name)
        self.assertEqual(document["version"], "2.1.0")
        keys = [(sarif_io.primary_uri(item), sarif_io.primary_line(item), item["ruleId"]) for item in document["runs"][0]["results"]]
        self.assertEqual(keys, sorted(keys), f"{name}: 경로 → 줄 → 규칙 순서가 아니다")
        return document

    def test_jscpd_pairs_become_two_location_results(self):
        document = self.convert("jscpd", json.dumps(JSCPD))
        results = document["runs"][0]["results"]
        self.assertEqual(len(results), 2)
        self.assertTrue(all(item["ruleId"] == "jscpd/duplicate" and item["level"] == "warning" for item in results))
        self.assertTrue(all(len(item["locations"]) == 2 for item in results))
        self.assertEqual(results[0]["properties"], {"lines": 11, "tokens": 80, "format": "python"})
        self.assertEqual(document["runs"][0]["properties"]["percentage"], 5.75)

    def test_lizard_reports_functions_over_threshold_with_or_without_header(self):
        for text in ("\n".join(LIZARD_ROWS) + "\n", LIZARD_HEADER + "\n" + "\n".join(LIZARD_ROWS) + "\n"):
            document = self.convert("lizard", text, "--threshold", "15")
            results = document["runs"][0]["results"]
            self.assertEqual([item["properties"]["function"] for item in results], ["complex_fn", "parse"])
            self.assertEqual([item["properties"]["ccn"] for item in results], [19, 31])
            self.assertTrue(all(item["ruleId"] == "lizard/ccn" for item in results))
            self.assertEqual(results[0]["locations"][0]["physicalLocation"]["region"], {"startLine": 1, "endLine": 39})
            self.assertEqual(document["runs"][0]["properties"], {"functions": 3, "maxCcn": 31, "overThreshold": 2, "threshold": 15})

    def test_mypy_and_tsc(self):
        mypy = self.convert("mypy", MYPY)["runs"][0]["results"]
        self.assertEqual([(item["ruleId"], item["level"]) for item in mypy], [("mypy/unused-ignore", "note"), ("mypy/return-value", "error")])
        tsc = self.convert("tsc", TSC)["runs"][0]["results"]
        self.assertEqual([(item["ruleId"], sarif_io.primary_uri(item), sarif_io.primary_line(item)) for item in tsc], [("tsc/TS2304", "src/a.ts", 10), ("tsc/TS2322", "src/b.ts", 4)])
        self.assertTrue(all(item["level"] == "error" for item in tsc))

    def test_unreadable_input_exits_2(self):
        for name, text in (("jscpd", "{not json"), ("mypy", "{broken\n"), ("lizard", "a,b\n")):
            source = self.base / f"{name}.bad"
            source.write_text(text)
            run = subprocess.run([sys.executable, str(CONVERTERS / f"{name}.py"), "--in", str(source), "--out", str(self.base / "x.sarif")], capture_output=True, text=True, timeout=60, check=False)
            self.assertEqual(run.returncode, 2, f"{name}: {run.stdout}{run.stderr}")
        missing = subprocess.run([sys.executable, str(CONVERTERS / "tsc.py"), "--in", str(self.base / "absent"), "--out", str(self.base / "y.sarif")], capture_output=True, text=True, timeout=60, check=False)
        self.assertEqual(missing.returncode, 2)


if __name__ == "__main__":
    unittest.main()
