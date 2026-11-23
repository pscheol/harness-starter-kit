"""/hx-review 의 결정적 부분 · 열린 리뷰 지적 · MR 요약 코멘트 하나(HK-23, 설계 09 §3.1 · §3.8 · VQ-R1~R4 · R17 · §5 완료 기준 2 · 3 · 10).

가짜 gh · glab 으로 돈다(네트워크 없음). 리뷰 판단(findings.json)은 모델 대신 시험이 쓴다.
"""

import json
import re
import subprocess
import sys

from review_fixture import MARKER, ReviewFixture, environment_without, finding
from verify_fixture import GATE_BODY

PASSING_BODY = GATE_BODY + 'echo "검증 통과"\nexit 0\n'
ULID = "01JDQ4ZK6B7Y0M9W2S3T4V5X6Y"


def risk_accepted(finding_id, fingerprint, email="harness@example.invalid", entry_id=ULID):
    return (
        f"## 2026-11-24T09:40:02+09:00 · review/{finding_id} · risk-accepted\n"
        f"- 승인자: {email} (harness)\n"
        f"- 대상: .agents/reports/review/DEMO-1.md · 지문: {fingerprint}\n"
        "- 문구: \"레거시 경로라 이번 MR 에서는 고치지 않는다\"\n"
        "- 경로: terminal\n"
        f"- 기록 ID: {entry_id}\n"
    )


class CollectTest(ReviewFixture):
    def setUp(self):
        super().setUp()
        self.head = self.push_branch({"src/upload/cleanup.py": "def cleanup(path):\n    if exists(path):\n        delete(path)\n    log(path)\n    return True\n"})

    def test_collect_reads_the_remote_branch_without_checkout(self):
        before = (self.git("rev-parse", "HEAD"), self.git("rev-parse", "--abbrev-ref", "HEAD"), self.git("status", "--porcelain"))
        run = self.review("collect", "#12")
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertLessEqual(len(run.stdout.splitlines()), 30, run.stdout)
        after = (self.git("rev-parse", "HEAD"), self.git("rev-parse", "--abbrev-ref", "HEAD"), self.git("status", "--porcelain"))
        self.assertEqual(before, after)
        self.assertEqual(after[1], "develop")
        state = self.state_dir()
        context = json.loads((state / "context.json").read_text())
        self.assertEqual((context["platform"], context["number"], context["headSha"], context["base"]), ("github", 12, self.head, "develop"))
        self.assertIn("log(path)", (state / "diff.patch").read_text())
        self.assertIn("R2.1", (state / "sdd/requirements.md").read_text())
        self.assertTrue((state / "sdd/design.md").is_file())
        self.assertTrue((state / "rules/pr-review-policy.md").is_file())
        self.assertIn("src/upload/cleanup.py", (state / "files.tsv").read_text())
        self.assertIn("스캔 결과 없음", (state / "scan.txt").read_text())
        self.assertIn("findings.json", run.stdout)

    def test_collect_uses_local_scan_results_for_the_same_head(self):
        self.write(".agents/reports/findings-latest.json", json.dumps({
            "head": self.head, "level": "affected",
            "findings": [{"analyzer": "semgrep", "ruleId": "sqli", "path": "src/upload/cleanup.py", "startLine": 2, "severity": "HIGH", "new": True, "message": "문자열 SQL"}],
        }))
        run = self.review("collect", "feat/DEMO-1-upload", "--platform", "github")
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        scan = (self.state_dir() / "scan.txt").read_text()
        self.assertIn("HIGH 1", scan)
        self.assertIn("sqli", scan)

    def test_branch_without_issue_key_is_refused(self):
        state = self.forge()
        state["prs"]["12"]["headRefName"] = "feature/no-key"
        self.state.write_text(json.dumps(state))
        run = self.review("collect", "#12")
        self.assertEqual(run.returncode, 2, run.stdout + run.stderr)
        self.assertIn("이슈 키", run.stdout + run.stderr)


class PublishTest(ReviewFixture):
    def setUp(self):
        super().setUp()
        self.push_branch({"src/upload/cleanup.py": "def cleanup(path):\n    if exists(path):\n        delete(path)\n    log(path)\n    return True\n"})

    def report(self):
        return self.report_path().read_text()

    def test_report_has_findings_with_fingerprints_and_comment_is_single(self):
        many = [finding()] + [finding("LOW", "RV-DOC", line=index + 1, title=f"작은 지적 {index}") for index in range(4)]
        many += [finding("MEDIUM", "RV-TEST", line=4, title=f"시험 지적 {index}") for index in range(3)]
        publish = self.published(many)
        self.assertLessEqual(len(publish.stdout.splitlines()), 10, publish.stdout)
        report = self.report()
        self.assertRegex(report, r"(?m)^verdict: changes-required$")
        self.assertRegex(report, r"(?m)^counts: \{ CRITICAL: 0, HIGH: 1, MEDIUM: 3, LOW: 4 \}$")
        self.assertIn("## F-1 · HIGH · RV-EDGE", report)
        self.assertEqual(len(re.findall(r"(?m)^## F-\d+ · ", report)), 7)
        self.assertIn("## 나머지", report)
        for label in ("- 위치: src/upload/cleanup.py:2", "- 근거:", "- 실패 시나리오:", "- 권고:", "- 지문: "):
            self.assertIn(label, report)
        self.assertRegex(report, r"- 지문: [0-9a-f]{64}")
        comments = self.kit_comments()
        self.assertEqual(len(comments), 1)
        body = comments[0]["body"]
        self.assertIn("<!-- section:review -->", body)
        self.assertIn("<!-- section:scan -->", body)
        self.assertIn("changes-required", body)
        self.assertIn("F-1", body)
        again = self.review("publish", self.key)
        self.assertEqual(again.returncode, 0, again.stdout + again.stderr)
        self.assertEqual(len(self.kit_comments()), 1)

    def test_ids_follow_fingerprints_across_reviews_and_line_moves(self):
        self.published([finding(), finding("MEDIUM", "RV-TEST", line=4, title="시험이 없다")])
        first = self.report()
        fingerprint = re.search(r"## F-1 · HIGH · RV-EDGE\n(?:- .*\n)*?- 지문: ([0-9a-f]{64})", first).group(1)
        padding = "".join(f"# 줄 {index}\n" for index in range(50))
        self.push_branch({"src/upload/cleanup.py": padding + "def cleanup(path):\n    if exists(path):\n        delete(path)\n    log(path)\n    return True\n"}, "padding")
        self.published([finding("LOW", "RV-DOC", line=1, title="새 지적"), finding(line=52)])
        second = self.report()
        self.assertIn(f"- 지문: {fingerprint}", second)
        self.assertRegex(second, r"## F-1 · HIGH · RV-EDGE")
        self.assertRegex(second, r"## F-3 · LOW · RV-DOC")
        self.assertNotIn("F-2", re.sub(r"<!--.*?-->", "", second, flags=re.S))

    def test_coverage_finding_for_unimplemented_requirement_is_reported(self):
        self.published([finding("HIGH", "RV-COV", path=".agents/docs/issues/DEMO-1-upload/requirements.md", line=11,
                                title="R2.1 을 구현한 코드와 시험이 없다", evidence="requirements R2.1 · diff 에 동시 실행 처리 없음")])
        self.assertIn("RV-COV", self.report())
        self.assertIn("R2.1", self.report())
        self.assertIn("R2.1", self.kit_comments()[0]["body"])

    def test_invalid_findings_are_refused(self):
        self.review("collect", "#12")
        self.write_findings([finding(severity="BLOCKER")])
        self.assertEqual(self.review("publish", self.key).returncode, 2)
        self.write_findings([finding(check="RV-STYLE")])
        self.assertEqual(self.review("publish", self.key).returncode, 2)
        self.write_findings([finding(path="src/none.py")])
        self.assertEqual(self.review("publish", self.key).returncode, 2)
        self.assertFalse(self.report_path().exists())

    def test_gitlab_merge_request_gets_one_note(self):
        self.published([finding()], mr="!7")
        self.published([finding()], mr="!7")
        notes = self.kit_comments("7")
        self.assertEqual(len(notes), 1)
        calls = [call for call in self.forge()["calls"] if call[:1] == ["api"]]
        self.assertTrue(any(call[1:3] == ["-X", "PUT"] or "PUT" in call for call in calls), calls)

    def test_duplicate_kit_comments_are_merged_into_one(self):
        state = self.forge()
        scan = f"{MARKER}\n### harness-kit 요약\n<!-- section:review -->\n(아직 없음)\n<!-- /section:review -->\n<!-- section:scan -->\n스캔 줄\n<!-- /section:scan -->\n"
        state["comments"] = [
            {"id": 501, "mr": "12", "body": scan, "at": "2026-11-23T00:00:01Z"},
            {"id": 502, "mr": "12", "body": scan.replace("스캔 줄", "다른 스캔 줄"), "at": "2026-11-23T00:00:02Z"},
            {"id": 503, "mr": "12", "body": "사람 코멘트", "at": "2026-11-23T00:00:03Z"},
        ]
        self.state.write_text(json.dumps(state))
        self.published([finding()])
        comments = self.forge()["comments"]
        self.assertEqual([comment["id"] for comment in comments], [501, 503])
        self.assertIn("F-1", comments[0]["body"])
        self.assertIn("스캔 줄", comments[0]["body"])

    def test_comment_failure_keeps_the_report(self):
        self.review("collect", "#12")
        self.write_findings([finding()])
        state = self.forge()
        state["broken"] = True
        self.state.write_text(json.dumps(state))
        run = self.review("publish", self.key)
        self.assertEqual(run.returncode, 1, run.stdout + run.stderr)
        self.assertTrue(self.report_path().is_file())
        self.assertIn("코멘트", run.stdout + run.stderr)


class ReviewStateTest(ReviewFixture):
    def setUp(self):
        super().setUp()
        self.push_branch({"src/upload/cleanup.py": "def cleanup(path):\n    if exists(path):\n        delete(path)\n    log(path)\n    return True\n"})
        self.published([
            finding("HIGH", "RV-EDGE", line=2, title="잠금 없음"),
            finding("MEDIUM", "RV-TEST", line=4, title="시험 없음"),
            finding("HIGH", "RV-RULE", line=3, title="권한 검사 없음"),
        ])
        report = self.report_path().read_text()
        self.fp = dict(re.findall(r"## (F-\d+) · \w+ · [\w-]+\n(?:- .*\n)*?- 지문: ([0-9a-f]{64})", report))

    def state(self, *arguments, cwd=None):
        return self.script("review_state.py", *arguments, cwd=cwd)

    def test_open_counts_follow_review_md_and_risk_acceptance(self):
        folder = self.root / self.folder
        first = self.state(str(folder), "--json")
        self.assertEqual(first.returncode, 1, first.stdout + first.stderr)
        self.assertEqual(json.loads(first.stdout)["open"], {"CRITICAL": 0, "HIGH": 2, "MEDIUM": 1, "LOW": 0})
        self.write(f"{self.folder}/review.md", (
            "# 리뷰 처리 — DEMO-1\n\n| ID | 심각도 | 지문 | 처리 | 커밋 | 사유 |\n|---|---|---|---|---|---|\n"
            f"| F-2 | MEDIUM | {self.fp['F-2'][:12]} | 거절 제안 | — | 다음 이슈에서 |\n"
            f"| F-3 | HIGH | {self.fp['F-3'][:12]} | 수용 | abc1234 | 권한 검사 추가 |\n"
            f"| F-1 | HIGH | {self.fp['F-1'][:12]} | 거절 제안 | — | 레거시 |\n"
        ))
        second = json.loads(self.state(str(folder), "--json").stdout)
        self.assertEqual(second["open"], {"CRITICAL": 0, "HIGH": 2, "MEDIUM": 0, "LOW": 0})
        self.write(f"{self.folder}/approvals.md", "# 승인 기록 — DEMO-1\n\n" + risk_accepted("F-1", self.fp["F-1"]))
        third = self.state(str(folder), "--json")
        self.assertEqual(third.returncode, 1)
        states = {item["id"]: item["state"] for item in json.loads(third.stdout)["findings"]}
        self.assertEqual(states, {"F-1": "risk-accepted", "F-2": "rejected", "F-3": "open"})
        self.write(f"{self.folder}/approvals.md", "# 승인 기록 — DEMO-1\n\n" + risk_accepted("F-1", self.fp["F-1"]) + "\n"
                   + risk_accepted("F-3", self.fp["F-3"], entry_id="01JDS1A2B3C4D5E6F7G8H9JKMN"))
        fourth = self.state(str(folder), "--json")
        self.assertEqual(fourth.returncode, 0, fourth.stdout)
        self.assertEqual(json.loads(fourth.stdout)["open"]["HIGH"], 0)

    def test_report_is_found_from_a_worktree_of_the_issue_branch(self):
        worktree = self.base / "wt"
        self.git_ok("worktree", "add", "-q", str(worktree), self.branch)
        run = self.state(str(worktree / self.folder), "--json", cwd=worktree)
        self.assertEqual(run.returncode, 1, run.stdout + run.stderr)
        self.assertEqual(json.loads(run.stdout)["open"]["HIGH"], 2)

    def test_gate_check_refuses_mr_with_open_high_findings(self):
        run = self.script("sdd_gates.py", "check", self.key, "--json")
        gates = {gate["gate"]: gate for gate in json.loads(run.stdout)["gates"]}
        self.assertFalse(gates["mr"]["passed"])
        self.assertTrue(any("리뷰" in reason and "HIGH 2" in reason for reason in gates["mr"]["reasons"]), gates["mr"])


class FullVerifyBlocksOpenFindingsTest(ReviewFixture):
    """완료 기준 3: 열린 HIGH 가 있으면 verify.sh --full 이 exit 1, review/F-1 · risk-accepted 를 더하면 통과."""

    def setUp(self):
        super().setUp()
        self.gate(PASSING_BODY)
        self.gate_config()
        self.commit("gate")
        self.git("push", "-q", "origin", "develop")
        self.push_branch({"src/upload/cleanup.py": "def cleanup(path):\n    if exists(path):\n        delete(path)\n    log(path)\n    return True\n"})
        self.published([finding("HIGH", "RV-EDGE", line=2)])
        report = self.report_path().read_text()
        self.fingerprint = re.search(r"- 지문: ([0-9a-f]{64})", report).group(1)

    def test_full_fails_then_passes_after_risk_acceptance(self):
        full = self.run_gate("--full")
        self.assertEqual(full.returncode, 1, full.stdout + full.stderr)
        self.assertIn("review.openMax.HIGH", full.stdout)
        self.write(f"{self.folder}/approvals.md", "# 승인 기록 — DEMO-1\n\n" + risk_accepted("F-1", self.fingerprint))
        again = self.run_gate("--full")
        self.assertEqual(again.returncode, 0, again.stdout + again.stderr)

    def test_affected_on_the_issue_branch_fails_with_open_findings(self):
        self.git("checkout", "-q", self.branch)
        affected = self.run_cli("--level", "affected", "--files", "src/upload/cleanup.py", "--summary")
        self.assertEqual(affected.returncode, 1, affected.stdout + affected.stderr)
        self.assertIn("review.openMax.HIGH", affected.stdout)
        changed = self.run_cli("--files", "src/upload/cleanup.py", "--summary")
        self.assertEqual(changed.returncode, 0, changed.stdout + changed.stderr)


class CiScanSectionTest(ReviewFixture):
    """CI affected 끝에 요약 코멘트 scan 구간을 고친다(09 §3.7 표 "보고"). 실패해도 판정은 그대로다."""

    def setUp(self):
        super().setUp()
        self.gate(PASSING_BODY)
        self.commit("gate")
        self.git("push", "-q", "origin", "develop")
        self.push_branch({"src/upload/cleanup.py": "def cleanup(path):\n    return True\n"})
        self.git("checkout", "-q", self.branch)
        event = self.base / "event.json"
        event.write_text(json.dumps({"pull_request": {"number": 12}}))
        self.ci = {"CI": "true", "GITHUB_ACTIONS": "true", "GITHUB_EVENT_NAME": "pull_request", "GITHUB_EVENT_PATH": str(event),
                   "GITHUB_HEAD_REF": self.branch, "GITHUB_BASE_REF": "develop", "HX_BASE_REF": "origin/develop"}

    def affected(self, extra):
        return self.run_cli("--level", "affected", "--files", "src/upload/cleanup.py", "--summary", env={**self.env, **extra})

    def test_affected_in_ci_writes_the_scan_section_once(self):
        first = self.affected(self.ci)
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        second = self.affected(self.ci)
        self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
        comments = self.kit_comments()
        self.assertEqual(len(comments), 1)
        self.assertIn("<!-- section:scan -->", comments[0]["body"])
        self.assertIn("affected", comments[0]["body"])
        self.assertIn("MR 요약 코멘트", first.stdout)

    def test_missing_cli_is_one_warning_line_and_keeps_the_exit_code(self):
        (self.bin / "gh").unlink()
        (self.bin / "glab").unlink()
        run = self.affected({**self.ci, "PATH": environment_without([str(self.bin)])})
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        warnings = [line for line in (run.stdout + run.stderr).splitlines() if "MR 요약 코멘트" in line]
        self.assertEqual(len(warnings), 1, run.stdout + run.stderr)

    def test_local_affected_does_not_touch_the_forge(self):
        run = self.affected({})
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertEqual(self.forge()["calls"], [])


if __name__ == "__main__":
    import unittest

    unittest.main()
