"""이슈별 SDD와 기존 stage 폴더가 같은 승인·상태 규칙을 따른다."""

import fcntl
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

SHARED = Path(__file__).resolve().parents[2]
# 배포된 단위에서는 SHARED 가 단위 폴더 전체다. 의존성·빌드 산출물을 복사하지 않고(domain-app 은 node_modules 만 수 GB 다),
# 실제 명세 폴더(`*-specs`)도 빼서 테스트가 만든 demo 명세만 센다 — 단위의 미해결 마커·보드가 결과에 섞이지 않는다.
COPY_IGNORE = (
    ".git",
    "node_modules",
    ".next",
    ".next-*",
    "build",
    "dist",
    "out",
    ".gradle",
    ".kotlin",
    ".venv",
    ".venv-*",
    "__pycache__",
    "*.pyc",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".dart_tool",
    "Pods",
    "*-specs",
)
sys.path.insert(0, str(SHARED / "scripts"))
from harness import sdd_board, sdd_layout

sys.path.pop(0)


class IssueSddTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="issue sdd ")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "unit"
        shutil.copytree(SHARED, self.root, ignore=shutil.ignore_patterns(*COPY_IGNORE))
        self.docs = self.root / ".agents/docs"
        self.docs.mkdir(exist_ok=True)
        (self.docs / "specs-index.md").write_text("# 색인\n\n사람이 작성한 본문\n")
        self.scripts = self.root / "scripts"

    def run_script(self, script, *arguments):
        interpreter = sys.executable if script.endswith(".py") else "bash"
        return subprocess.run(
            [interpreter, str(self.scripts / script), *arguments],
            cwd=self.root.parent,
            text=True,
            capture_output=True,
            timeout=20,
        )

    def scaffold(self, *arguments):
        return self.run_script("new-feature.sh", "demo", *arguments)

    def assert_ok(self, result):
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def assert_fails(self, result, expected):
        self.assertNotEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn(expected, result.stdout + result.stderr)

    def issue(self, key="1-feat-sample"):
        return self.docs / "demo-specs/issues" / key

    def approve(self, path):
        path.write_text("# 승인 문서\n\n| 상태 | approved |\n")

    def write_issue(self, state="active", key="1-feat-sample", checked=True):
        issue = self.issue(key)
        (issue / "tasks").mkdir(parents=True, exist_ok=True)
        self.approve(issue / "requirements.md")
        self.approve(issue / "design.md")
        task = issue / "tasks" / f"{state}.md"
        task.write_text(f"# Tasks\n\n| 상태 | {state} |\n\n- [{'X' if checked else ' '}] T001 예시\n")
        return task

    def test_default_scaffold_creates_only_issue_requirements(self):
        self.assert_ok(self.scaffold("sample"))
        self.assertTrue((self.issue() / "requirements.md").is_file())
        self.assertFalse((self.issue() / "design.md").exists())
        self.assertFalse((self.issue() / "tasks/active.md").exists())
        self.assertFalse((self.docs / "demo-specs/requirements/1-feat-sample.md").exists())
        self.assertIn("1-feat-sample", (self.docs / "demo-specs/index.md").read_text())
        self.assertIn("사람이 작성한 본문", (self.docs / "specs-index.md").read_text())

    def test_issue_stages_require_exact_approval(self):
        self.assert_ok(self.scaffold("sample"))
        requirement = self.issue() / "requirements.md"
        requirement.write_text("| 상태 | approved later |\n")
        self.assert_fails(self.scaffold("sample", "--stage=design"), "approved")
        self.approve(requirement)
        self.assert_ok(self.scaffold("sample", "--stage=design"))
        self.assert_fails(self.scaffold("sample", "--stage=tasks"), "approved")
        self.approve(self.issue() / "design.md")
        self.assert_ok(self.scaffold("sample", "--stage=tasks"))
        task = self.issue() / "tasks/active.md"
        self.assertIn("../requirements.md", task.read_text())
        self.assertIn("../design.md", task.read_text())
        self.assertNotIn("`check/`", task.read_text())
        self.assertNotIn("`completed/`", task.read_text())
        prerequisite = self.run_script("check-sdd-prerequisites.sh", "demo", "sample", "--stage", "implement")
        self.assert_ok(prerequisite)
        self.assertIn("BASE=.agents/docs/demo-specs/issues/1-feat-sample\n", prerequisite.stdout)
        self.assert_ok(self.run_script("board.sh", "--check"))

    def test_legacy_opt_out_and_continuation_preserve_layout(self):
        self.assert_ok(self.scaffold("legacy", "--legacy"))
        requirement = self.docs / "demo-specs/requirements/1-feat-legacy.md"
        self.assertTrue(requirement.is_file())
        self.approve(requirement)
        self.assert_ok(self.scaffold("legacy", "--stage=design"))
        design = self.docs / "demo-specs/design/1-feat-legacy.md"
        self.approve(design)
        self.assert_ok(self.scaffold("legacy", "--stage=tasks"))
        self.assertTrue((self.docs / "demo-specs/tasks/active/1-feat-legacy.md").is_file())
        self.assertFalse((self.docs / "demo-specs/issues/1-feat-legacy").exists())
        prerequisite = self.run_script("check-sdd-prerequisites.sh", "demo", "legacy", "--stage", "implement")
        self.assert_ok(prerequisite)
        self.assertIn("BASE=.agents/docs/demo-specs\n", prerequisite.stdout)
        self.assert_ok(self.scaffold("modern"))
        self.assertTrue((self.issue("2-feat-modern") / "requirements.md").exists())

    def test_number_allocator_includes_superseded_and_both_layouts(self):
        self.write_issue("superseded", "8-feat-old")
        legacy = self.docs / "demo-specs/tasks/superseded/12-fix-earlier.md"
        legacy.parent.mkdir(parents=True)
        legacy.write_text("| 상태 | superseded |\n")
        self.assert_ok(self.scaffold("sample"))
        self.assertTrue((self.issue("13-feat-sample") / "requirements.md").exists())
        self.assert_fails(self.scaffold("conflict", "--number=8"), "number")

    def test_same_name_is_rejected_without_creating_another_issue(self):
        self.assert_ok(self.scaffold("sample"))
        self.assert_fails(self.scaffold("sample"), "already")
        self.assertEqual(1, len(list((self.docs / "demo-specs/issues").iterdir())))

    def test_ambiguous_short_name_requires_full_key(self):
        self.write_issue(key="1-feat-sample")
        self.write_issue(key="2-fix-sample")
        self.assert_fails(self.scaffold("sample", "--stage=design"), "ambiguous")
        self.assert_ok(self.scaffold("1-feat-sample", "--stage=design"))

    def test_explicit_stage_does_not_overwrite_existing_document(self):
        self.write_issue()
        design = self.issue() / "design.md"
        before = design.read_bytes()
        self.assert_ok(self.scaffold("1-feat-sample", "--stage=design"))
        self.assertEqual(before, design.read_bytes())

    def test_tasks_are_not_recreated_after_review_completion_or_supersession(self):
        for state in ("check", "completed", "superseded"):
            with self.subTest(state=state):
                key = f"1-feat-{state}"
                self.write_issue(state, key)
                self.assert_fails(self.scaffold(key, "--stage=tasks"), f"already in {state}")

    def test_all_option_does_not_bypass_stage_approval(self):
        self.assert_fails(self.scaffold("sample", "--all"), "승인")
        self.assertFalse((self.docs / "demo-specs").exists())

    def test_path_traversal_and_invalid_number_are_rejected(self):
        self.assert_fails(self.run_script("new-feature.sh", "../escape", "sample"), "slug")
        self.assert_fails(self.scaffold("../escape"), "이름")
        self.assert_fails(self.scaffold("sample", "--number=-1"), "number")
        self.assert_fails(self.run_script("check-sdd-prerequisites.sh", "../escape", "sample"), "slug")
        self.assert_fails(self.run_script("board.sh", "../escape"), "slug")

    def test_scaffold_and_board_refuse_symlink_targets(self):
        outside = self.root.parent / "outside"
        outside.mkdir()
        (self.docs / "demo-specs").symlink_to(outside, target_is_directory=True)
        self.assert_fails(self.scaffold("sample"), "symlink")
        self.assert_fails(self.run_script("board.sh", "demo"), "symlink")
        self.assertEqual([], list(outside.iterdir()))

    def test_board_keeps_index_body_and_is_read_only_when_checking(self):
        self.assert_ok(self.scaffold("sample"))
        index = self.docs / "demo-specs/index.md"
        index.write_text(index.read_text() + "\n사용자 기록\n")
        before = index.read_bytes()
        self.approve(self.issue() / "requirements.md")
        (self.issue() / "design.md").write_text("| 상태 | draft |\n")
        self.assert_fails(self.run_script("board.sh", "--check"), "보드")
        self.assertEqual(before, index.read_bytes())
        self.assert_ok(self.run_script("board.sh"))
        self.assertIn("사용자 기록", index.read_text())
        self.assert_ok(self.run_script("board.sh", "--check"))

    def test_plan_checker_reads_issue_state_and_task_ids(self):
        task = self.write_issue("check", checked=False)
        self.assert_fails(self.run_script("check_harness.py", "--plans-only"), "unchecked task")
        task.write_text("| 상태 | active |\n- [X] T001 일\n- [X] T001 중복\n")
        result = self.run_script("check_harness.py", "--plans-only")
        self.assert_fails(result, "state mismatch")
        self.assertIn("duplicate task ID", result.stderr)
        task.write_text("| 상태 | check |\n- [X] T001 일\n")
        self.assert_ok(self.run_script("check_harness.py", "--plans-only"))

    def test_plan_checker_rejects_same_key_in_both_layouts(self):
        self.write_issue()
        legacy = self.docs / "demo-specs/tasks/check/1-feat-sample.md"
        legacy.parent.mkdir(parents=True)
        legacy.write_text("| 상태 | check |\n- [X] T001 일\n")
        self.assert_fails(self.run_script("check_harness.py", "--plans-only"), "duplicate")

    def test_root_fallback_checker_supports_issue_layout(self):
        task = self.write_issue()
        (self.scripts / "check_harness.py").unlink()
        task.write_text("| 상태 | completed |\n- [X] T001 일\n")
        self.assert_fails(self.run_script("check-exec-plan-status.sh"), "state mismatch")

    def write_legacy_task(self, key, state, body):
        spec = self.docs / "demo-specs"
        task = spec / "tasks" / state / f"{key}.md"
        task.parent.mkdir(parents=True, exist_ok=True)
        task.write_text(body)
        (spec / "index.md").write_text("# 기존 실행 계획\n")
        self.assert_ok(self.run_script("board.sh"))
        return task

    def test_root_legacy_retains_state_only_scope(self):
        (self.scripts / "check_harness.py").unlink()
        self.write_legacy_task("old-plan", "completed", "| 상태 | completed |\n- [ ] 완료되지 않은 이전 체크\n")
        self.assert_ok(self.run_script("check-exec-plan-status.sh"))

    def test_root_legacy_accepts_annotated_status_and_still_rejects_mismatch(self):
        (self.scripts / "check_harness.py").unlink()
        task = self.write_legacy_task("old-plan", "completed", "상태: completed — 기존 계획의 설명\n")
        self.assert_ok(self.run_script("check-exec-plan-status.sh"))
        task.write_text("| 상태 | completed — 기존 계획의 설명 |\n")
        self.assert_ok(self.run_script("check-exec-plan-status.sh"))
        task.write_text("상태: active — 아직 진행 중\n")
        self.assert_fails(self.run_script("check-exec-plan-status.sh"), "state mismatch")

    def test_root_issue_keeps_strict_prerequisite_and_completion_checks(self):
        (self.scripts / "check_harness.py").unlink()
        task = self.write_issue("completed", checked=False)
        (self.issue() / "requirements.md").unlink()
        (self.issue() / "design.md").unlink()
        result = self.run_script("check-exec-plan-status.sh")
        self.assert_fails(result, "missing requirements")
        self.assertIn("missing design", result.stderr)
        self.assertIn("unchecked task", result.stderr)
        self.approve(self.issue() / "requirements.md")
        self.approve(self.issue() / "design.md")
        task.write_text("| 상태 | completed — 설명 |\n- [X] T001 완료\n")
        self.assert_fails(self.run_script("check-exec-plan-status.sh"), "state mismatch")

    def test_unit_legacy_keeps_strict_prerequisite_filename_and_completion_checks(self):
        self.write_legacy_task("old-plan", "completed", "| 상태 | completed |\n- [ ] 이전 체크\n")
        result = self.run_script("check-exec-plan-status.sh")
        self.assert_fails(result, "invalid task filename")
        self.assertIn("missing requirements", result.stderr)
        self.assertIn("missing design", result.stderr)
        self.assertIn("missing numbered tasks", result.stderr)
        self.assertIn("unchecked task", result.stderr)

    def test_unit_legacy_keeps_exact_status_validation(self):
        self.write_legacy_task("1-feat-old-plan", "completed", "| 상태 | completed — 설명 |\n- [X] T001 이전 체크\n")
        self.assert_fails(self.run_script("check-exec-plan-status.sh"), "state mismatch")

    def test_root_legacy_checks_non_template_underscore_file_status(self):
        (self.scripts / "check_harness.py").unlink()
        self.write_legacy_task("_previous-plan", "completed", "상태: active\n")
        self.assert_fails(self.run_script("check-exec-plan-status.sh"), "state mismatch")

    def test_legacy_template_exclusion_preserves_existing_harness_scope(self):
        self.write_legacy_task("_template", "active", "상태: completed\n")
        self.assert_fails(self.run_script("check-exec-plan-status.sh"), "invalid task filename")
        (self.scripts / "check_harness.py").unlink()
        self.assert_ok(self.run_script("check-exec-plan-status.sh"))

    def test_issue_freshness_is_read_only(self):
        task = self.write_issue(checked=False)
        requirement = self.issue() / "requirements.md"
        requirement.write_text("| 상태 | draft |\n[NEEDS CLARIFICATION: 질문]\n")
        old = time.time() - 30 * 86400
        os.utime(requirement, (old, old))
        os.utime(task, (old, old))
        before = requirement.read_bytes()
        result = self.run_script("check-spec-freshness.sh", "--days", "14")
        self.assert_ok(result)
        self.assertIn("정체 스펙=1", result.stdout)
        self.assertIn("미해결 마커=1", result.stdout)
        self.assertIn("정체 tasks=1", result.stdout)
        self.assertEqual(before, requirement.read_bytes())

    def test_concurrent_scaffolds_allocate_distinct_numbers_and_consistent_boards(self):
        processes = [
            subprocess.Popen(
                ["bash", str(self.scripts / "new-feature.sh"), "demo", f"sample-{index}"],
                cwd=self.root.parent,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            for index in range(6)
        ]
        for process in processes:
            output, errors = process.communicate(timeout=20)
            self.assertEqual(0, process.returncode, output + errors)
        folders = list((self.docs / "demo-specs/issues").iterdir())
        self.assertEqual(6, len(folders))
        self.assertEqual(set(range(1, 7)), {int(folder.name.split("-", 1)[0]) for folder in folders})
        self.assert_ok(self.run_script("board.sh", "--check"))

    def test_board_check_waits_for_writer_and_does_not_create_workspace_state(self):
        self.assert_ok(self.scaffold("sample"))
        key = hashlib.sha256(str(self.root.resolve()).encode()).hexdigest()[:24]
        lock_path = Path(tempfile.gettempdir()) / f"harness-sdd.{os.getuid()}.{key}.lock"
        before = {path.relative_to(self.root): path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
        with lock_path.open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            process = subprocess.Popen(
                ["bash", str(self.scripts / "board.sh"), "--check"],
                cwd=self.root.parent,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            time.sleep(0.15)
            observed = process.poll()
            fcntl.flock(lock, fcntl.LOCK_UN)
            output, errors = process.communicate(timeout=20)
        self.assertIsNone(observed, "board --check must wait until a concurrent writer finishes")
        self.assertEqual(0, process.returncode, output + errors)
        after = {path.relative_to(self.root): path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
        self.assertEqual(before, after)

    def test_symlinked_issue_document_and_board_index_are_rejected(self):
        self.write_issue()
        outside = self.root.parent / "outside.md"
        outside.write_text("| 상태 | approved |\n")
        requirement = self.issue() / "requirements.md"
        requirement.unlink()
        requirement.symlink_to(outside)
        self.assert_fails(self.scaffold("1-feat-sample", "--stage=design"), "symlink")
        self.assert_fails(self.run_script("check_harness.py", "--plans-only"), "symlink")
        self.assert_fails(self.run_script("board.sh"), "symlink")
        requirement.unlink()
        self.approve(requirement)
        index = self.docs / "demo-specs/index.md"
        index.symlink_to(outside)
        self.assert_fails(self.run_script("board.sh"), "symlink")
        self.assertEqual("| 상태 | approved |\n", outside.read_text())

    def test_board_preserves_concurrent_index_content_and_mode_changes(self):
        self.assert_ok(self.scaffold("sample"))
        (self.issue() / "design.md").write_text("| 상태 | draft |\n")
        index = self.docs / "demo-specs/index.md"
        original_write = sdd_board.atomic_write
        for change in ("body", "mode"):
            with self.subTest(change=change):
                index.chmod(0o644)
                changed_content = index.read_bytes() + "\nClaude가 새로 작성한 기록\n".encode()

                def concurrent_edit(root, destination, text, change=change, changed_content=changed_content, **arguments):
                    if destination == index:
                        if change == "body":
                            index.write_bytes(changed_content)
                        else:
                            index.chmod(0o600)
                    return original_write(root, destination, text, **arguments)

                with (
                    mock.patch.object(sdd_board, "atomic_write", side_effect=concurrent_edit),
                    self.assertRaisesRegex(ValueError, "concurrent"),
                ):
                    sdd_board.update_boards(self.root, "demo")
                if change == "body":
                    self.assertEqual(changed_content, index.read_bytes())
                else:
                    self.assertEqual(0o600, index.stat().st_mode & 0o777)
        index.chmod(0o640)
        sdd_board.update_boards(self.root, "demo")
        self.assertEqual(0o640, index.stat().st_mode & 0o777)
        self.assertIn("Claude가 새로 작성한 기록", index.read_text())

    def test_board_atomic_replace_anchors_directory_during_symlink_race(self):
        self.assert_ok(self.scaffold("sample"))
        (self.issue() / "design.md").write_text("| 상태 | draft |\n")
        spec = self.docs / "demo-specs"
        moved = self.docs / "saved-demo-specs"
        outside = self.root.parent / "unrelated"
        outside.mkdir()
        external_index = outside / "index.md"
        external_index.write_text("다른 디렉터리의 문서\n")
        original_replace = sdd_layout.os.replace

        def replace_after_directory_swap(source, destination, **arguments):
            self.assertIn("src_dir_fd", arguments)
            self.assertIn("dst_dir_fd", arguments)
            if destination == "index.md":
                spec.rename(moved)
                spec.symlink_to(outside, target_is_directory=True)
            return original_replace(source, destination, **arguments)

        with mock.patch.object(sdd_layout.os, "replace", side_effect=replace_after_directory_swap):
            sdd_board.update_boards(self.root, "demo")
        self.assertEqual("다른 디렉터리의 문서\n", external_index.read_text())
        self.assertIn("🎨 설계 (1)", (moved / "index.md").read_text())


if __name__ == "__main__":
    unittest.main()
