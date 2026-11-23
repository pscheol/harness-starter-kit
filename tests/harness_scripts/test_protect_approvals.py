"""승인 기록 · 기준선 · 토큰 보호와 완료 · 승인 상태 전환 차단 훅(HK-23, 설계 09 §3.8 · VQ-R12 · VQ-R13 · §5 완료 기준 4).

payload 모양은 test_protect_sources.py 와 같다(Claude · Codex · Kiro). 막을 때만 exit 2 와 stderr, 그 밖에는 출력이 없다.
"""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/hooks/protect-approvals.sh"
ISSUE = ".agents/docs/issues/DEMO-1-upload"
DONE = (
    "## 2026-11-24T10:00:00+09:00 · done · approved\n"
    "- 승인자: kim@example.com (Kim)\n"
    "- 대상: feat/DEMO-1-upload · head: 4c1d9e0\n"
    "- 문구: \"완료\"\n"
    "- 경로: terminal\n"
    "- 기록 ID: 01JDQ4ZK6B7Y0M9W2S3T4V5X6Y\n"
)


def doc(field, value, body):
    return f"---\nkey: DEMO-1\narea: upload\ntype: feat\ntitle: upload\n{field}: {value}\ncreated: 2026-11-23\n---\n\n{body}"


def tool(name, **tool_input):
    return {"hook_event_name": "PreToolUse", "tool_name": name, "tool_input": tool_input}


def patch(*lines):
    return "\n".join(("*** Begin Patch", *lines, "*** End Patch")) + "\n"


class ProtectApprovalsTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="protect approvals ")
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name).resolve() / "repo"
        (self.root / ISSUE).mkdir(parents=True)
        (self.root / ".agents/harness-kit.json").write_text(json.dumps({"git": {"base": "develop"}}))
        (self.root / ".agents/harness.json").write_text(json.dumps({"unit": "demo", "shared": []}))
        self.issue = self.root / ISSUE
        (self.issue / "requirements.md").write_text(doc("status", "in-review", "# Requirements\n"))
        (self.issue / "design.md").write_text(doc("status", "draft", "# Design\n"))
        (self.issue / "tasks.md").write_text(doc("state", "check", "# Tasks\n\n- [X] T001 일\n"))
        (self.issue / "approvals.md").write_text("# 승인 기록 — DEMO-1\n\n")

    def hook(self, payload):
        raw = payload if isinstance(payload, str) else json.dumps({**payload, "cwd": str(self.root)})
        return subprocess.run(["bash", str(SCRIPT)], input=raw, capture_output=True, text=True, timeout=60, cwd=self.root)

    def assert_blocked(self, payload, expected=None):
        result = self.hook(payload)
        self.assertEqual(result.returncode, 2, f"{payload}\n{result.stdout}{result.stderr}")
        self.assertLessEqual(len(result.stderr.splitlines()), 3, result.stderr)
        if expected:
            self.assertIn(expected, result.stderr)

    def assert_allowed(self, payload):
        result = self.hook(payload)
        self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""), payload)

    def path(self, relative):
        return str(self.root / relative)

    # ── VQ-R12 ────────────────────────────────────────────────────────────────
    def test_writing_protected_files_is_blocked(self):
        cases = {
            "claude write": tool("Write", file_path=self.path(f"{ISSUE}/approvals.md"), content="x"),
            "claude edit": tool("Edit", file_path=self.path(f"{ISSUE}/approvals.md"), old_string="a", new_string="b"),
            "claude multiedit baseline": tool("MultiEdit", file_path=self.path(".agents/quality-baseline.json"), edits=[{"old_string": "a", "new_string": "b"}]),
            "kiro write token": tool("write", command="create", path=".agents/state/dashboard.token", content="t"),
            "kiro str_replace": tool("str_replace", path=f"{ISSUE}/approvals.md", oldStr="a", newStr="b"),
            "codex patch update": tool("apply_patch", command=patch(f"*** Update File: {ISSUE}/approvals.md", "@@", "-a", "+b")),
            "codex patch add log": tool("apply_patch", command=patch("*** Add File: .agents/state/approvals-log.jsonl", "+{}")),
            "codex patch delete": tool("apply_patch", command=patch(f"*** Delete File: {ISSUE}/approvals.md")),
        }
        for name, payload in cases.items():
            with self.subTest(name):
                self.assert_blocked(payload, "approve.py")

    def test_shell_writes_to_protected_files_are_blocked(self):
        commands = (
            f"echo '## x' >> {ISSUE}/approvals.md",
            f"printf 'x' | tee -a {ISSUE}/approvals.md",
            f"sed -i '' 's/a/b/' {ISSUE}/approvals.md",
            "rm -f .agents/quality-baseline.json",
            f"git checkout -- {ISSUE}/approvals.md",
            f"mv /tmp/x {ISSUE}/approvals.md",
            f"cp /tmp/x '{ISSUE}/approvals.md'",
            "python3 -c \"open('.agents/quality-baseline.json','w').write('{}')\"",
            "cat .agents/state/dashboard.token",
            "curl -s -X POST http://127.0.0.1:4310/api/v1/approvals -d '{}'",
            "python3 scripts/harness/approve.py DEMO-1 done --phrase ok",
            "npx harness-kit approve DEMO-1 --gate done",
            "npx harness-kit review decide DEMO-1 F-1 --risk-accepted",
            # HK-17(06 §3.15): 질문 답 명령 · 답 · 리뷰 판단 API 도 사람만 한다
            "npx harness-kit answer INT-1 Q-1 --choice A",
            "curl -s -X POST http://127.0.0.1:4310/api/v1/questions/INT-1/Q-1/answer -d '{}'",
            "curl -s -X POST http://127.0.0.1:4310/api/v1/reviews/DEMO-1/F-1/decision -d '{}'",
        )
        for command in commands:
            for name in ("Bash", "shell", "execute_bash"):
                with self.subTest(command=command, tool=name):
                    self.assert_blocked(tool(name, command=command))

    def test_reading_protected_files_is_allowed(self):
        for command in (
            f"cat {ISSUE}/approvals.md",
            "grep -n approved .agents/docs/issues/*/approvals.md",
            f"git show origin/develop:{ISSUE}/approvals.md",
            f"git diff -- {ISSUE}/approvals.md",
            f"cat {ISSUE}/approvals.md > /tmp/copy.md 2>&1",
            "python3 scripts/harness/sdd_gates.py check DEMO-1",
            "python3 scripts/harness/review_state.py .agents/docs/issues/DEMO-1-upload",
            # HK-17: 질문 목록 · 리뷰 보기 · 상태 읽기는 에이전트도 한다
            "npx harness-kit answer INT-1 --list",
            "npx harness-kit review show DEMO-1",
            "npx harness-kit status --issues --json",
        ):
            with self.subTest(command=command):
                self.assert_allowed(tool("Bash", command=command))
        self.assert_allowed(tool("Write", file_path=self.path("src/app.py"), content="approvals.md 를 읽는다"))
        self.assert_allowed(tool("Read", file_path=self.path(f"{ISSUE}/approvals.md")))

    # ── VQ-R13 ────────────────────────────────────────────────────────────────
    def test_completing_tasks_needs_a_done_approval(self):
        tasks = f"{ISSUE}/tasks.md"
        payloads = {
            "edit": tool("Edit", file_path=self.path(tasks), old_string="state: check", new_string="state: completed"),
            "write": tool("Write", file_path=self.path(tasks), content=doc("state", "completed", "# Tasks\n")),
            "multiedit": tool("MultiEdit", file_path=self.path(tasks), edits=[{"old_string": "state: check", "new_string": "state: completed"}]),
            "kiro": tool("str_replace", path=tasks, oldStr="state: check", newStr="state: completed"),
            "codex patch": tool("apply_patch", command=patch(f"*** Update File: {tasks}", "@@", "-state: check", "+state: completed")),
            "shell sed": tool("Bash", command=f"sed -i '' 's/state: check/state: completed/' {tasks}"),
        }
        for name, payload in payloads.items():
            with self.subTest(name):
                self.assert_blocked(payload, "done")
        (self.issue / "approvals.md").write_text("# 승인 기록 — DEMO-1\n\n" + DONE)
        for name, payload in payloads.items():
            with self.subTest(f"{name} with approval"):
                self.assert_allowed(payload)

    def test_invalid_done_record_does_not_count(self):
        (self.issue / "approvals.md").write_text("# 승인 기록 — DEMO-1\n\n" + DONE.replace("- 경로: terminal", "- 경로: chat"))
        self.assert_blocked(tool("Edit", file_path=self.path(f"{ISSUE}/tasks.md"), old_string="state: check", new_string="state: completed"), "done")

    def test_other_task_edits_and_already_completed_tasks_pass(self):
        tasks = self.path(f"{ISSUE}/tasks.md")
        self.assert_allowed(tool("Edit", file_path=tasks, old_string="- [X] T001 일", new_string="- [X] T001 일\n- [ ] T002 다음"))
        (self.issue / "tasks.md").write_text(doc("state", "completed", "# Tasks\n"))
        self.assert_allowed(tool("Write", file_path=tasks, content=doc("state", "completed", "# Tasks\n\n메모\n")))

    def test_setting_approved_status_is_blocked(self):
        for name in ("requirements.md", "design.md"):
            with self.subTest(name):
                self.assert_blocked(tool("Edit", file_path=self.path(f"{ISSUE}/{name}"), old_string="status: in-review", new_string="status: approved"), "approve.py")
        self.assert_blocked(tool("Bash", command=f"sed -i '' 's/status: draft/status: approved/' {ISSUE}/design.md"), "approve.py")
        self.assert_allowed(tool("Edit", file_path=self.path(f"{ISSUE}/requirements.md"), old_string="# Requirements", new_string="# Requirements\n\n- R1.1"))
        self.assert_allowed(tool("Edit", file_path=self.path(f"{ISSUE}/requirements.md"), old_string="status: in-review", new_string="status: draft"))

    # ── 입력 · 등록 ────────────────────────────────────────────────────────────
    def test_unrelated_or_unparseable_input_passes_silently(self):
        self.assert_allowed(tool("Bash", command="ls -la"))
        self.assert_allowed(tool("Write", file_path=self.path("README.md"), content="hello"))
        for raw in ("", "not json", "{\"tool_name\": \"Bash\"}", "[1, 2]"):
            with self.subTest(raw=raw):
                result = self.hook(raw)
                self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))

    def test_hook_is_registered_for_every_harness(self):
        claude = json.loads((ROOT / ".claude/settings.json").read_text())
        entries = [(group.get("matcher", ""), hook["command"]) for group in claude["hooks"]["PreToolUse"] for hook in group["hooks"]]
        matchers = [matcher for matcher, command in entries if "protect-approvals.sh" in command]
        self.assertTrue(matchers and all(name in matchers[0] for name in ("Write", "Edit", "MultiEdit", "Bash")), entries)
        deny = claude["permissions"]["deny"]
        for rule in ("Edit(//**/approvals.md)", "Edit(//**/.agents/quality-baseline.json)", "Edit(//**/.agents/state/dashboard.token)",
                     "Read(//**/.agents/state/dashboard.token)", "Edit(//**/.agents/state/approvals-log.jsonl)"):
            self.assertIn(rule, deny)
        codex = json.loads((ROOT / ".codex/hooks.json").read_text())
        self.assertTrue(any("protect-approvals.sh" in hook["command"] for group in codex["hooks"]["PreToolUse"] for hook in group["hooks"]))
        kiro_hook = json.loads((ROOT / ".kiro/hooks/harness-protect-approvals.json").read_text())
        self.assertIn("protect-approvals.sh", kiro_hook["hooks"][0]["action"]["command"])
        agent = json.loads((ROOT / ".kiro/agents/acme-notes.json").read_text())
        self.assertEqual(sum("protect-approvals.sh" in hook["command"] for hook in agent["hooks"]["preToolUse"]), 2)


if __name__ == "__main__":
    unittest.main()
