"""승인 기록(approvals.md) 파서 fixture 시험 — 설계 06 §3.7, HK-23 design §2.

`tests/fixtures/approvals/cases.json` 은 Python 파서(템플릿 scripts/harness/approvals.py)와 관리 페이지 Node 파서(HK-17)가
같이 쓰는 입력 · 기대값이다. 여기서는 Python 쪽을 맞춘다.

    python3 -m unittest tests.test_approvals_fixtures
"""

from __future__ import annotations

import importlib
import json
import sys
import unittest
from pathlib import Path

KIT = Path(__file__).resolve().parents[1]
FIXTURES = KIT / "tests/fixtures/approvals"
SCRIPTS = KIT / "packages/templates/common/scripts"
PATHS = {"terminal", "dashboard", "jira", "aidlc"}


def load_parser():
    sys.path.insert(0, str(SCRIPTS))
    try:
        return importlib.import_module("harness.approvals")
    finally:
        sys.path.remove(str(SCRIPTS))


class ApprovalsFixtureTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = json.loads((FIXTURES / "cases.json").read_text(encoding="utf-8"))
        cls.approvals = load_parser()

    def text(self, relative):
        return (FIXTURES / relative).read_bytes().decode("utf-8")

    def test_fixture_covers_paths_reviews_and_error_codes(self):
        cases = self.document["cases"]
        self.assertGreaterEqual(len(cases), 20)
        entries = [entry for case in cases for entry in case["expect"]["entries"]]
        self.assertEqual({entry["path"] for entry in entries if entry["valid"]}, PATHS)
        self.assertTrue({"risk-accepted", "fix-required"} <= {entry["decision"] for entry in entries if entry["valid"]})
        states = {query["expect"] for case in cases for query in case["queries"]}
        self.assertEqual(states, {"none", "valid", "stale", "invalid"})
        seen = {code for entry in entries for code in entry["errors"]} | {error["code"] for case in cases for error in case["expect"]["errors"]}
        self.assertEqual(seen, set(self.document["errorCodes"]))
        self.assertGreaterEqual(len(self.document["docSha"]), 4)

    def test_parser_matches_every_case(self):
        for case in self.document["cases"]:
            with self.subTest(case=case["name"]):
                self.assertEqual(self.approvals.parse(self.text(case["input"])), case["expect"])

    def test_approval_state_queries(self):
        for case in self.document["cases"]:
            entries = case["expect"]["entries"]
            for query in case["queries"]:
                policy = {"approvers": query["approvers"], "groups": query["groups"]}
                with self.subTest(case=case["name"], query=query):
                    state = self.approvals.approval_state(entries, query["gate"], query["sha256"], policy)
                    self.assertEqual(state, query["expect"])

    def test_review_decision_queries(self):
        for case in self.document["cases"]:
            entries = case["expect"]["entries"]
            for query in case["reviews"]:
                policy = {"approvers": query["approvers"], "groups": query["groups"]}
                with self.subTest(case=case["name"], query=query):
                    decision = self.approvals.review_decision(entries, query["id"], query["fingerprint"], policy)
                    self.assertEqual(decision, query["expect"])

    def test_approval_sha_ignores_status_and_state_lines(self):
        for case in self.document["docSha"]:
            with self.subTest(case=case["name"]):
                self.assertEqual(self.approvals.approval_sha((FIXTURES / case["input"]).read_bytes()), case["expect"])

    def test_rendered_entry_parses_back(self):
        entry = {
            "at": "2026-11-23T14:05:12+09:00", "gate": "design", "decision": "approved",
            "approver": {"email": "kim@example.com", "name": "Kim", "group": "dev"},
            "target": {"name": "design.md", "sha256": "a" * 64, "fingerprint": None, "head": None},
            "phrase": "B안으로 반영해", "path": "terminal", "entryId": "01JDQ4ZK6B7Y0M9W2S3T4V5X6Y",
        }
        text = self.approvals.new_file_text("DEMO-1") + self.approvals.render_entry(entry)
        parsed = self.approvals.parse(text)
        self.assertEqual(parsed["errors"], [])
        self.assertEqual(len(parsed["entries"]), 1)
        self.assertTrue(parsed["entries"][0]["valid"], parsed["entries"][0])
        self.assertEqual(parsed["key"], "DEMO-1")
        for key in ("gate", "decision", "approver", "target", "phrase", "path", "entryId"):
            self.assertEqual(parsed["entries"][0][key], entry[key])


if __name__ == "__main__":
    unittest.main()
