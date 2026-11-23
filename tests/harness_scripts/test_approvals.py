"""사람 터미널 승인 · 승인 기록 덧붙이기 전용 · done 승인 없는 완료(HK-23, 설계 09 §3.8 · VQ-R13 · R14 · R15 · §5 완료 기준 4 · 5 · 6).

approve.py 의 성공 경로는 의사 터미널(os.openpty)에서, 부모 사슬을 끊은 손자 프로세스로 돈다. 그래야 이 시험을
에이전트 세션 안에서 돌려도 결과가 같다(approve.py 는 부모 프로세스 이름도 본다).
"""

import json
import os
import re
import select
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from review_fixture import without_agent_markers
from sdd_fixture import SddCase, frontmatter_text

FOLDER = "DEMO-1-upload"
ULIDS = ("01JDQ4ZK6B7Y0M9W2S3T4V5X6Y", "01JDS1A2B3C4D5E6F7G8H9JKMN", "01JDT0PQRSTVWXYZ0123456789", "01JDV9ZYXWVTSRQPNMKJHGFEDC")
FAKE_GATE = "#!/usr/bin/env bash\necho fake gate\nexit 0\n"


def entry(gate, decision="approved", target="feat/DEMO-1-upload · head: 4c1d9e0", email="sdd@example.com", entry_id=ULIDS[0], path="terminal",
          at="2026-11-24T10:00:00+09:00", phrase="확인"):
    return (
        f"## {at} · {gate} · {decision}\n"
        f"- 승인자: {email} (sdd test)\n"
        f"- 대상: {target}\n"
        f"- 문구: \"{phrase}\"\n"
        f"- 경로: {path}\n"
        f"- 기록 ID: {entry_id}\n"
    )


def approvals_text(*entries):
    return "# 승인 기록 — DEMO-1\n\n<!-- 덧붙이기만 한다. -->\n\n" + "\n".join(entries)


def run_in_terminal(argv, typed, env, cwd, timeout=60):
    """의사 터미널에서 argv 를 돌려 (exit code, 화면 출력)을 돌려준다. 손자 프로세스가 돌려 부모 사슬이 시험 러너에서 끊긴다."""
    master, slave = os.openpty()
    status_file = Path(tempfile.mkstemp(prefix="approve-status-")[1])
    status_file.write_text("")
    middle = os.fork()
    if middle == 0:
        try:
            os.close(master)
            if os.fork() > 0:
                os._exit(0)
            parent = os.getppid()
            for _ in range(500):
                if os.getppid() != parent:
                    break
                time.sleep(0.01)
            code = subprocess.call(argv, stdin=slave, stdout=slave, stderr=slave, env=env, cwd=cwd)
            status_file.write_text(str(code))
        finally:
            os._exit(0)
    os.close(slave)
    os.waitpid(middle, 0)
    os.write(master, typed.encode("utf-8") + b"\n")
    output, deadline = b"", time.monotonic() + timeout
    while time.monotonic() < deadline:
        ready, _, _ = select.select([master], [], [], 0.2)
        if ready:
            try:
                chunk = os.read(master, 4096)
            except OSError:
                chunk = b""
            if not chunk:
                break
            output += chunk
        elif status_file.read_text():
            break
    for _ in range(100):
        if status_file.read_text():
            break
        time.sleep(0.05)
    os.close(master)
    code = status_file.read_text()
    status_file.unlink()
    return (int(code) if code else None), output.decode("utf-8", "replace")


class ApprovalCase(SddCase):
    prefix = "DEMO"

    def setUp(self):
        super().setUp()
        self.env = without_agent_markers(self.env)
        self.issue_dir = self.write_new_issue(FOLDER, req="in-review", design="draft", tasks="active")
        self.approvals = self.issue_dir / "approvals.md"

    def approve(self, *arguments, extra=None):
        return subprocess.run(
            [sys.executable, str(self.scripts / "harness/approve.py"), *arguments],
            cwd=self.root, env={**self.env, **(extra or {})}, input="", capture_output=True, text=True, timeout=60,
        )

    def approve_tty(self, *arguments, typed="DEMO-1", extra=None):
        argv = [sys.executable, str(self.scripts / "harness/approve.py"), *arguments]
        return run_in_terminal(argv, typed, {**self.env, **(extra or {})}, str(self.root))

    def log_lines(self):
        log = self.root / ".agents/state/approvals-log.jsonl"
        return [json.loads(line) for line in log.read_text().splitlines()] if log.is_file() else []


class ApproveCommandTest(ApprovalCase):
    def test_agent_session_is_refused(self):
        for marker in ({"CLAUDECODE": "1"}, {"CLAUDE_CODE_MESSAGING_SOCKET": "/tmp/x.sock"}, {"CODEX_SANDBOX": "seatbelt"}):
            with self.subTest(marker=marker):
                run = self.approve("DEMO-1", "requirements", "--phrase", "확정", extra=marker)
                self.assertEqual(run.returncode, 3, run.stdout + run.stderr)
                self.assertIn("에이전트 세션", run.stdout + run.stderr)
        self.assertFalse(self.approvals.exists())

    def test_without_a_terminal_is_refused(self):
        run = self.approve("DEMO-1", "requirements", "--phrase", "확정")
        self.assertEqual(run.returncode, 3, run.stdout + run.stderr)
        self.assertIn("TTY", run.stdout + run.stderr)
        self.assertFalse(self.approvals.exists())

    def test_parent_process_named_claude_is_refused(self):
        child = f"import subprocess, sys; sys.exit(subprocess.call([sys.executable, {str(self.scripts / 'harness/approve.py')!r}, 'DEMO-1', 'requirements', '--phrase', 'x']))"
        command = f"exec -a claude {shlex.quote(sys.executable)} -c {shlex.quote(child)}"
        code, output = run_in_terminal(["bash", "-c", command], "DEMO-1", self.env, str(self.root))
        self.assertEqual(code, 3, output)
        self.assertIn("에이전트 세션", output)

    def test_terminal_approval_records_entry_status_and_log(self):
        code, output = self.approve_tty("DEMO-1", "requirements", "--phrase", "요구사항 확정")
        self.assertEqual(code, 0, output)
        self.assertIn("확인하려면 이슈 키를 입력한다", output)
        text = self.approvals.read_text()
        self.assertTrue(text.startswith("# 승인 기록 — DEMO-1\n"))
        self.assertRegex(text, r"(?m)^## \S+ · requirements · approved$")
        self.assertIn("- 승인자: sdd@example.com (sdd test)", text)
        self.assertIn("- 경로: terminal", text)
        self.assertIn('- 문구: "요구사항 확정"', text)
        sha = re.search(r"sha256: ([0-9a-f]{64})", text).group(1)
        self.assertEqual(self.field(self.issue_dir / "requirements.md", "status"), "approved")
        log = self.log_lines()
        self.assertEqual(len(log), 1)
        self.assertEqual((log[0]["gate"], log[0]["sha256"], log[0]["path"]), ("requirements", sha, "terminal"))
        self.assertIn(log[0]["entryId"], text)
        gates = json.loads(self.run_script("harness/sdd_gates.py", "check", "DEMO-1", "--json", cwd=self.root).stdout)
        self.assertTrue(next(g for g in gates["gates"] if g["gate"] == "requirements")["passed"])

    def test_wrong_confirmation_changes_nothing(self):
        before = (self.issue_dir / "requirements.md").read_bytes()
        code, output = self.approve_tty("DEMO-1", "requirements", "--phrase", "확정", typed="DEMO-2")
        self.assertEqual(code, 1, output)
        self.assertFalse(self.approvals.exists())
        self.assertEqual((self.issue_dir / "requirements.md").read_bytes(), before)
        self.assertEqual(self.log_lines(), [])

    def test_design_needs_an_approved_requirements_record(self):
        code, output = self.approve_tty("DEMO-1", "design", "--phrase", "설계 확정")
        self.assertEqual(code, 1, output)
        self.assertIn("requirements", output)
        self.assertFalse(self.approvals.exists())
        self.assertEqual(self.approve_tty("DEMO-1", "requirements", "--phrase", "확정")[0], 0)
        code, output = self.approve_tty("DEMO-1", "design", "--phrase", "설계 확정")
        self.assertEqual(code, 0, output)
        self.assertEqual(self.field(self.issue_dir / "design.md", "status"), "approved")

    def test_approver_outside_the_gate_list_is_refused(self):
        meta = self.root / ".agents/harness-kit.json"
        data = json.loads(meta.read_text())
        data["approvers"] = {"requirements": ["po"]}
        data["groups"] = {"po": ["someone@example.com"]}
        meta.write_text(json.dumps(data))
        code, output = self.approve_tty("DEMO-1", "requirements", "--phrase", "확정")
        self.assertEqual(code, 1, output)
        self.assertIn("승인자", output)
        data["groups"] = {"po": ["sdd@example.com"]}
        meta.write_text(json.dumps(data))
        code, output = self.approve_tty("DEMO-1", "requirements", "--phrase", "확정")
        self.assertEqual(code, 0, output)
        self.assertIn("· 그룹: po", self.approvals.read_text())

    def test_open_clarification_is_refused(self):
        requirements = self.issue_dir / "requirements.md"
        requirements.write_text(requirements.read_text() + "\n- [NEEDS CLARIFICATION: 보존 기간]\n")
        code, output = self.approve_tty("DEMO-1", "requirements", "--phrase", "확정")
        self.assertEqual(code, 1, output)
        self.assertIn("NEEDS CLARIFICATION", output)

    def test_approved_document_without_record_can_be_recorded_once(self):
        self.set_field(self.issue_dir / "requirements.md", "status", "approved")
        code, output = self.approve_tty("DEMO-1", "requirements", "--phrase", "기록으로 남긴다")
        self.assertEqual(code, 0, output)
        code, output = self.approve_tty("DEMO-1", "requirements", "--phrase", "또")
        self.assertEqual(code, 1, output)
        self.assertIn("이미", output)

    def test_unsupported_gate_and_usage(self):
        self.assertEqual(self.approve_tty("DEMO-1", "deploy", "--phrase", "x")[0], 2)
        self.assertEqual(self.approve_tty("DEMO-1", "requirements")[0], 2)
        self.assertEqual(self.approve_tty("DEMO-9", "requirements", "--phrase", "x")[0], 2)


class PreCommitAppendOnlyTest(ApprovalCase):
    """완료 기준 5 앞부분: approvals.md 의 기존 줄을 바꾼 커밋을 pre-commit 이 거부한다. 덧붙이기는 통과한다."""

    def setUp(self):
        super().setUp()
        (self.scripts / "verify.sh").write_text(FAKE_GATE)
        self.approvals.write_text(approvals_text(entry("requirements", target="requirements.md · sha256: " + "a" * 64)))
        self.init_git()
        self.git("config", "--local", "core.hooksPath", "scripts/git-hooks")
        self.env = {**self.env, "HARNESS_VERIFY_LEVEL": "fast"}

    def commit_result(self, *paths, extra=None):
        self.git("add", "-A")
        return subprocess.run(["git", "commit", "-q", "-m", "change", *paths], cwd=self.root, env={**self.env, **(extra or {})},
                              input="", capture_output=True, text=True, timeout=120)

    def test_changing_or_deleting_lines_is_refused(self):
        original = self.approvals.read_text()
        self.approvals.write_text(original.replace('"확인"', '"바꾼 문구"'))
        run = self.commit_result()
        self.assertNotEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertIn("approvals.md", run.stdout + run.stderr)
        self.assertIn("기존 줄", run.stdout + run.stderr)
        self.approvals.write_text(original.replace("- 경로: terminal\n", ""))
        self.assertNotEqual(self.commit_result().returncode, 0)
        self.approvals.unlink()
        self.assertNotEqual(self.commit_result().returncode, 0)

    def test_appending_a_valid_entry_passes_and_a_malformed_one_is_refused(self):
        original = self.approvals.read_text()
        self.approvals.write_text(original + "\n" + entry("design", target="design.md · sha256: " + "b" * 64, entry_id=ULIDS[1]))
        run = self.commit_result()
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.approvals.write_text(self.approvals.read_text() + "\n" + entry("tasks", target="tasks.md · sha256: " + "c" * 64, entry_id=ULIDS[2], path="chat"))
        refused = self.commit_result()
        self.assertNotEqual(refused.returncode, 0, refused.stdout + refused.stderr)
        self.assertIn("unknown-path", refused.stdout + refused.stderr)

    def test_agent_session_needs_a_local_log_record_for_new_entries(self):
        new = entry("design", target="design.md · sha256: " + "b" * 64, entry_id=ULIDS[1])
        self.approvals.write_text(self.approvals.read_text() + "\n" + new)
        refused = self.commit_result(extra={"CLAUDECODE": "1"})
        self.assertNotEqual(refused.returncode, 0, refused.stdout + refused.stderr)
        self.assertIn("approvals-log.jsonl", refused.stdout + refused.stderr)
        log = self.root / ".agents/state/approvals-log.jsonl"
        log.parent.mkdir(parents=True, exist_ok=True)
        log.write_text(json.dumps({"entryId": ULIDS[1], "gate": "design", "path": "terminal"}) + "\n")
        passed = self.commit_result(extra={"CLAUDECODE": "1"})
        self.assertEqual(passed.returncode, 0, passed.stdout + passed.stderr)

    def test_partial_commit_with_temporary_index_is_checked(self):
        self.approvals.write_text(self.approvals.read_text().replace('"확인"', '"몰래 바꿈"'))
        run = subprocess.run(["git", "commit", "-q", "-m", "partial", str(self.approvals)], cwd=self.root, env=self.env,
                             input="", capture_output=True, text=True, timeout=120)
        self.assertNotEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertIn("기존 줄", run.stdout + run.stderr)

    def test_completing_tasks_without_done_approval_is_refused_at_commit(self):
        tasks = self.issue_dir / "tasks.md"
        self.set_field(tasks, "state", "completed")
        run = self.commit_result()
        self.assertNotEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertIn("done", run.stdout + run.stderr)


class FastCheckTest(ApprovalCase):
    """완료 기준 4 · 5 뒷부분: 훅을 건너뛴 커밋을 fast(check_harness.py)가 base 대비로 거부한다."""

    def setUp(self):
        super().setUp()
        self.approvals.write_text(approvals_text(entry("requirements", target="requirements.md · sha256: " + "a" * 64)))
        self.init_git()
        self.git("update-ref", "refs/remotes/origin/develop", "HEAD")
        self.git("checkout", "-q", "-b", "feat/DEMO-1-upload")

    def test_clean_branch_passes(self):
        self.assert_ok(self.check())

    def test_line_change_committed_without_hooks_fails_fast(self):
        self.approvals.write_text(self.approvals.read_text().replace('"확인"', '"바꾼 문구"'))
        self.commit("skip hooks")
        result = self.check()
        self.assert_fails(result, "approvals.md")
        self.assertIn("기존 줄", result.stdout + result.stderr)

    def test_malformed_entry_fails_fast(self):
        self.approvals.write_text(self.approvals.read_text() + "\n" + entry("design", target="design.md", entry_id=ULIDS[1]))
        self.assert_fails(self.check(), "bad-target")

    def test_completed_without_done_approval_fails_until_recorded(self):
        tasks = self.issue_dir / "tasks.md"
        self.set_field(tasks, "state", "completed")
        self.commit("complete without approval")
        self.assert_fails(self.check(), "done")
        self.approvals.write_text(self.approvals.read_text() + "\n" + entry("done", entry_id=ULIDS[3]))
        self.assert_ok(self.check())

    def test_done_record_by_someone_outside_approvers_does_not_count(self):
        meta = self.root / ".agents/harness-kit.json"
        data = json.loads(meta.read_text())
        data["approvers"] = {"done": ["qa"]}
        data["groups"] = {"qa": ["qa@example.com"]}
        meta.write_text(json.dumps(data))
        self.set_field(self.issue_dir / "tasks.md", "state", "completed")
        self.approvals.write_text(self.approvals.read_text() + "\n" + entry("done", entry_id=ULIDS[3]))
        self.assert_fails(self.check(), "done")

    def test_legacy_and_already_completed_tasks_pass(self):
        legacy = self.write_new_issue("DEMO-2-old", tasks="active")
        text = (legacy / "tasks.md").read_text().replace("state: active", "state: completed\nlegacy: .agents/docs/demo-specs/tasks/completed/2.md")
        (legacy / "tasks.md").write_text(text)
        self.assert_ok(self.check())
        self.git("checkout", "-q", "develop")
        done = self.write_new_issue("DEMO-3-done", tasks="completed")
        self.commit("done before HK-23")
        self.git("update-ref", "refs/remotes/origin/develop", "HEAD")
        self.git("checkout", "-q", "-b", "feat/DEMO-3-more")
        (done / "tasks.md").write_text((done / "tasks.md").read_text() + "\n메모\n")
        self.commit("edit completed tasks")
        self.assert_ok(self.check())
