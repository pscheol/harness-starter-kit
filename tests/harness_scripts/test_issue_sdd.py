"""이슈 단위 SDD(`.agents/docs/issues/<키>-<이름>/`)의 생성 · 승인 게이트 · 보드 · 상태 검사, 옛 두 구조 읽기."""

import fcntl
import hashlib
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from sdd_fixture import SHARED, SddCase, frontmatter_text

sys.path.insert(0, str(SHARED / "scripts"))
from harness import sdd_board, sdd_layout

sys.path.pop(0)


class IssueSddTest(SddCase):
    # ── 새 구조 생성 ──────────────────────────────────────────────────────────
    def test_next_scaffold_creates_only_requirements_with_frontmatter(self):
        self.assert_ok(self.scaffold("--next", "sample-flow", "--area", "demo"))
        issue = self.issue("DEMO-1-sample-flow")
        requirement = issue / "requirements.md"
        self.assertTrue(requirement.is_file())
        self.assertFalse((issue / "design.md").exists())
        self.assertFalse((issue / "tasks.md").exists())
        self.assertFalse((self.docs / "demo-specs").exists())
        text = requirement.read_text()
        self.assertTrue(text.startswith("---\n"))
        for field, value in (("key", "DEMO-1"), ("area", "demo"), ("type", "feat"), ("title", "sample-flow"), ("status", "draft")):
            self.assertEqual(value, self.field(requirement, field), field)
        self.assertRegex(self.field(requirement, "created"), r"^\d{4}-\d{2}-\d{2}$")
        self.assertNotRegex(text, r"(?m)^\|\s*상태\s*\|")
        self.assertIn("# Requirements — DEMO-1-sample-flow", text)
        board = self.index.read_text()
        self.assertIn("사람이 작성한 본문", board)
        self.assertIn("### demo (새 1 · 옛 0)", board)
        self.assertIn("| DEMO-1 | sample-flow | feat | draft | — | — | 요구 |", board)

    def test_weakened_flow_gates_do_not_lift_the_floor(self):
        # 게이트 하한(설계 04 §3.8 · §5 #7): 프로젝트가 flow.gates 에서 design 을 빼도 tasks 는 design 승인 없이 만들지 못한다.
        import json
        meta = self.root / ".agents/knots-sync.json"
        data = json.loads(meta.read_text(encoding="utf-8")) if meta.is_file() else {}
        data["flow"] = {"gates": ["requirements", "tasks", "mr", "done"]}
        meta.write_text(json.dumps(data), encoding="utf-8")
        self.assert_ok(self.scaffold("DEMO-14", "floor-check", "--area", "demo"))
        issue = self.issue("DEMO-14-floor-check")
        self.set_field(issue / "requirements.md", "status", "approved")
        self.assert_ok(self.scaffold("DEMO-14", "--stage=design"))
        self.assert_exit(self.scaffold("DEMO-14", "--stage=tasks"), 1, "approved")
        self.assertFalse((issue / "tasks.md").exists())

    def test_explicit_key_stages_follow_frontmatter_approval(self):
        self.assert_ok(self.scaffold("DEMO-12", "upload-cleanup", "--area", "upload", "--type", "fix"))
        issue = self.issue("DEMO-12-upload-cleanup")
        requirement = issue / "requirements.md"
        self.set_field(requirement, "status", "in-review")
        self.assert_exit(self.scaffold("DEMO-12", "--stage=design"), 1, "approved")
        self.assertFalse((issue / "design.md").exists())
        self.set_field(requirement, "status", "approved")
        self.assert_ok(self.scaffold("DEMO-12", "--stage=design"))
        design = issue / "design.md"
        for field, value in (("key", "DEMO-12"), ("area", "upload"), ("type", "fix"), ("status", "draft")):
            self.assertEqual(value, self.field(design, field), field)
        self.assert_exit(self.scaffold("DEMO-12-upload-cleanup", "--stage", "tasks"), 1, "approved")
        self.set_field(design, "status", "approved")
        self.assert_ok(self.scaffold("DEMO-12", "--stage=tasks"))
        task = issue / "tasks.md"
        self.assertEqual("active", self.field(task, "state"))
        self.assertIsNone(self.field(task, "status"))
        body = task.read_text()
        self.assertIn("requirements.md", body)
        self.assertIn("design.md", body)
        self.assertNotIn("tasks/active", body)
        self.assertFalse((issue / "tasks").exists())
        prerequisite = self.run_script("check-sdd-prerequisites.sh", "DEMO-12", "--stage", "implement")
        self.assert_ok(prerequisite)
        self.assertIn("BASE=.agents/docs/issues/DEMO-12-upload-cleanup\n", prerequisite.stdout)
        self.assertIn("TASKS=.agents/docs/issues/DEMO-12-upload-cleanup/tasks.md\n", prerequisite.stdout)
        self.assert_ok(self.run_script("board.sh", "--check"))

    def test_stage_needs_an_existing_issue_folder(self):
        self.assert_exit(self.scaffold("DEMO-5", "--stage=design"), 1, "DEMO-5")
        self.write_new_issue("DEMO-5-first-thing")
        self.write_new_issue("DEMO-5-second-thing")
        self.assert_exit(self.scaffold("DEMO-5", "--stage=design"), 1, "DEMO-5")

    def test_existing_documents_are_not_overwritten(self):
        issue = self.write_new_issue("DEMO-3-sample-flow", design="approved", tasks="completed")
        before = {name: (issue / name).read_bytes() for name in ("requirements.md", "design.md", "tasks.md")}
        for arguments in (("DEMO-3", "sample-flow", "--area", "demo"), ("DEMO-3", "--stage=design"), ("DEMO-3", "--stage=tasks")):
            with self.subTest(arguments=arguments):
                self.assert_exit(self.scaffold(*arguments), 0, "이미 있습니다")
        self.assertEqual(before, {name: (issue / name).read_bytes() for name in before})

    def test_next_with_same_name_does_not_create_another_issue(self):
        self.assert_ok(self.scaffold("--next", "sample-flow", "--area", "demo"))
        self.assert_exit(self.scaffold("--next", "sample-flow", "--area", "demo"), 0, "DEMO-1-sample-flow")
        self.assertEqual(["DEMO-1-sample-flow"], sorted(path.name for path in (self.docs / "issues").iterdir()))

    def test_dry_run_writes_nothing(self):
        before = self.tree_snapshot()
        result = self.scaffold("--next", "sample-flow", "--area", "demo", "--dry-run")
        self.assert_ok(result)
        self.assertIn("DEMO-1-sample-flow", result.stdout)
        self.assertEqual(before, self.tree_snapshot())

    def test_all_and_legacy_options_are_refused(self):
        self.assert_exit(self.scaffold("--next", "sample-flow", "--area", "demo", "--all"), 2, "승인")
        self.assert_exit(self.scaffold("demo", "sample-flow", "--legacy"), 2, "--legacy")
        self.assertFalse((self.docs / "issues").exists())
        self.assertFalse((self.docs / "demo-specs").exists())

    def test_path_traversal_and_invalid_values_are_rejected(self):
        self.assert_exit(self.scaffold("../escape", "sample-flow", "--area", "demo"), 2, "slug")
        self.assert_exit(self.scaffold("--next", "../escape", "--area", "demo"), 2, "이름")
        self.assert_exit(self.scaffold("--next", "sample-flow", "--area", "../escape"), 2, "영역")
        self.assert_exit(self.scaffold("--next", "sample-flow", "--area", "demo", "--number=3"), 2, "--number")
        self.assert_exit(self.scaffold("--next", "sample-flow", "--area", "demo", "--intent", "3"), 2, "intent")
        self.assert_exit(self.scaffold("--next", "sample-flow", "--area", "demo", "--unit", "U-0"), 2, "unit")
        self.assert_fails(self.run_script("check-sdd-prerequisites.sh", "../escape", "sample"), "slug")
        self.assert_fails(self.run_script("board.sh", "../escape"), "slug")
        self.assert_fails(self.run_script("board.sh", "--area", "../escape"), "영역")

    def test_intent_and_unit_fields_are_written_and_inherited(self):
        self.assert_ok(self.scaffold("--next", "sample-flow", "--area", "demo", "--intent", "INT-3", "--unit", "U-2"))
        requirement = self.issue("DEMO-1-sample-flow") / "requirements.md"
        self.assertEqual("INT-3", self.field(requirement, "intent"))
        self.assertEqual("U-2", self.field(requirement, "unit"))
        self.set_field(requirement, "status", "approved")
        self.assert_ok(self.scaffold("DEMO-1", "--stage=design"))
        self.assertEqual("INT-3", self.field(self.issue("DEMO-1-sample-flow") / "design.md", "intent"))

    def test_symlinked_issue_paths_are_rejected(self):
        outside = self.base / "outside"
        outside.mkdir()
        (self.docs / "issues").symlink_to(outside, target_is_directory=True)
        self.assert_fails(self.scaffold("--next", "sample-flow", "--area", "demo"), "symlink")
        self.assertEqual([], list(outside.iterdir()))
        (self.docs / "issues").unlink()
        issue = self.write_new_issue("DEMO-1-sample-flow")
        target = self.base / "outside.md"
        target.write_text((issue / "requirements.md").read_text())
        (issue / "requirements.md").unlink()
        (issue / "requirements.md").symlink_to(target)
        self.assert_fails(self.scaffold("DEMO-1", "--stage=design"), "symlink")
        self.assert_fails(self.run_script("board.sh"), "symlink")
        self.assert_fails(self.run_script("check_harness.py", "--plans-only"), "symlink")

    # ── 보드 ──────────────────────────────────────────────────────────────────
    def test_board_groups_by_area_and_prints_one_area(self):
        self.write_new_issue("DEMO-1-first-thing", area="app")
        self.write_new_issue("DEMO-2-second-thing", area="api", type_="fix")
        self.write_new_issue("DEMO-10-tenth-thing", area="app", design="in-review")
        self.write_new_issue("DEMO-3-third-thing", area="app", design="approved", tasks="check")
        self.assert_ok(self.run_script("board.sh"))
        board = self.index.read_text()
        self.assertLess(board.index("### api (새 1 · 옛 0)"), board.index("### app (새 3 · 옛 0)"))
        app = board[board.index("### app") :]
        self.assertLess(app.index("| DEMO-1 |"), app.index("| DEMO-3 |"))
        self.assertLess(app.index("| DEMO-3 |"), app.index("| DEMO-10 |"))
        self.assertIn("| DEMO-10 | tenth-thing | feat | approved | in-review | — | 설계 |", board)
        self.assertIn("| DEMO-3 | third-thing | feat | approved | approved | check | 검증 |", board)
        self.assertIn("| DEMO-2 | second-thing | fix | approved | — | — | 요구 |", board)
        area = self.run_script("board.sh", "--area", "app")
        self.assert_ok(area)
        self.assertIn("### app (새 3 · 옛 0)", area.stdout)
        self.assertNotIn("DEMO-2", area.stdout)
        self.assertEqual(board, self.index.read_text())
        self.assert_exit(self.run_script("board.sh", "--area", "nothing"), 1, "nothing")

    def test_board_check_is_read_only_and_detects_drift(self):
        self.assert_ok(self.scaffold("--next", "sample-flow", "--area", "demo"))
        self.set_field(self.issue("DEMO-1-sample-flow") / "requirements.md", "status", "approved")
        before = self.index.read_bytes()
        self.assert_fails(self.run_script("board.sh", "--check"), "보드")
        self.assertEqual(before, self.index.read_bytes())
        self.assert_ok(self.run_script("board.sh"))
        self.assertIn("사람이 작성한 본문", self.index.read_text())
        self.assertIn("| DEMO-1 | sample-flow | feat | approved |", self.index.read_text())
        self.assert_ok(self.run_script("board.sh", "--check"))

    def test_invalid_frontmatter_stops_board_generation(self):
        issue = self.write_new_issue("DEMO-1-sample-flow")
        self.assert_ok(self.run_script("board.sh"))
        before = self.index.read_bytes()
        for broken in ("---\nkey: DEMO-1\nnot a field\n---\n", "---\nkey: DEMO-1\n  nested: x\n---\n", "# 머리 없음\n"):
            with self.subTest(broken=broken):
                (issue / "requirements.md").write_text(broken)
                self.assert_fails(self.run_script("board.sh"), "invalid")
                self.assertEqual(before, self.index.read_bytes())
                self.assert_fails(self.run_script("check_harness.py", "--plans-only"), "requirements.md")

    def test_board_check_waits_for_writer_and_does_not_create_workspace_state(self):
        self.assert_ok(self.scaffold("--next", "sample-flow", "--area", "demo"))
        key = hashlib.sha256(str(self.root.resolve()).encode()).hexdigest()[:24]
        lock_path = Path(tempfile.gettempdir()) / f"harness-sdd.{os.getuid()}.{key}.lock"
        before = self.tree_snapshot()
        with lock_path.open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            process = subprocess.Popen(
                ["bash", str(self.scripts / "board.sh"), "--check"],
                cwd=self.base,
                env=self.env,
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
        self.assertEqual(before, self.tree_snapshot())

    def test_concurrent_next_scaffolds_allocate_distinct_keys(self):
        processes = [
            subprocess.Popen(
                ["bash", str(self.scripts / "new-feature.sh"), "--next", f"sample-{index}", "--area", "demo"],
                cwd=self.base,
                env=self.env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            for index in range(6)
        ]
        for process in processes:
            output, errors = process.communicate(timeout=30)
            self.assertEqual(0, process.returncode, output + errors)
        folders = list((self.docs / "issues").iterdir())
        self.assertEqual({f"DEMO-{number}" for number in range(1, 7)}, {"-".join(folder.name.split("-")[:2]) for folder in folders})
        self.assert_ok(self.run_script("board.sh", "--check"))

    # ── 상태 검사 ─────────────────────────────────────────────────────────────
    def test_plan_checker_reads_task_state_from_frontmatter(self):
        issue = self.write_new_issue("DEMO-1-sample-flow", design="approved", tasks="check", checked=False)
        self.assert_fails(self.run_script("check_harness.py", "--plans-only"), "unchecked task")
        (issue / "tasks.md").write_text(frontmatter_text(key="DEMO-1", area="demo", type="feat", state="active") + "- [X] T001 일\n- [X] T001 중복\n")
        self.assert_fails(self.run_script("check_harness.py", "--plans-only"), "duplicate task ID")
        (issue / "tasks.md").write_text(frontmatter_text(key="DEMO-1", area="demo", type="feat", state="done") + "- [X] T001 일\n")
        self.assert_fails(self.run_script("check_harness.py", "--plans-only"), "state")
        (issue / "tasks.md").write_text(frontmatter_text(key="DEMO-1", area="demo", type="feat", state="completed") + "- [X] T001 일\n")
        self.assert_ok(self.run_script("check_harness.py", "--plans-only"))
        self.assert_fails(self.run_script("check-exec-plan-status.sh"), "보드")
        self.assert_ok(self.run_script("board.sh"))
        self.assert_ok(self.run_script("check-exec-plan-status.sh"))

    def test_plan_checker_rejects_inconsistent_issue_documents(self):
        issue = self.write_new_issue("DEMO-1-sample-flow", design="approved", tasks="active")
        cases = (
            ("design.md", "key", "DEMO-2", "key"),
            ("design.md", "area", "other", "area"),
            ("requirements.md", "type", "story", "type"),
            ("requirements.md", "status", "approved-ish", "status"),
        )
        for name, field, value, expected in cases:
            with self.subTest(field=field):
                original = (issue / name).read_text()
                self.set_field(issue / name, field, value)
                self.assert_fails(self.run_script("check_harness.py", "--plans-only"), expected)
                (issue / name).write_text(original)
        (issue / "design.md").unlink()
        self.assert_fails(self.run_script("check_harness.py", "--plans-only"), "missing design")
        self.write_new_issue("DEMO-1-other-thing")
        self.assert_fails(self.run_script("check_harness.py", "--plans-only"), "duplicate key")
        (self.issue("DEMO-1-other-thing") / "requirements.md").unlink()
        self.issue("DEMO-1-other-thing").rmdir()
        self.issue("DEMO-7-Bad_Name").mkdir()
        self.assert_fails(self.run_script("check_harness.py", "--plans-only"), "DEMO-7-Bad_Name")

    def test_freshness_reads_new_issues_without_writing(self):
        issue = self.write_new_issue("DEMO-1-sample-flow", req="draft", design=None)
        requirement = issue / "requirements.md"
        requirement.write_text(requirement.read_text() + "[NEEDS CLARIFICATION: 질문]\n")
        task = self.write_new_issue("DEMO-2-other-thing", design="approved", tasks="active") / "tasks.md"
        old = time.time() - 30 * 86400
        os.utime(requirement, (old, old))
        os.utime(task, (old, old))
        before = self.tree_snapshot()
        result = self.run_script("check-spec-freshness.sh", "--days", "14")
        self.assert_ok(result)
        self.assertIn("정체 스펙=1", result.stdout)
        self.assertIn("미해결 마커=1", result.stdout)
        self.assertIn("정체 tasks=1", result.stdout)
        self.assertEqual(before, self.tree_snapshot())

    # ── 옛 두 구조 읽기 ────────────────────────────────────────────────────────
    def test_legacy_layouts_are_read_by_prerequisites_and_board(self):
        self.write_legacy_issue("demo", "1-feat-sample", state="active")
        self.write_legacy_stage("demo", "2-fix-older", state="completed")
        self.write_new_issue("DEMO-4-new-thing", area="demo")
        issue = self.run_script("check-sdd-prerequisites.sh", "demo", "sample", "--stage", "implement")
        self.assert_ok(issue)
        self.assertIn("BASE=.agents/docs/demo-specs/issues/1-feat-sample\n", issue.stdout)
        stage = self.run_script("check-sdd-prerequisites.sh", "demo", "2-fix-older", "--stage=tasks")
        self.assert_ok(stage)
        self.assertIn("BASE=.agents/docs/demo-specs\n", stage.stdout)
        self.assert_ok(self.run_script("board.sh"))
        board = self.index.read_text()
        self.assertIn("### demo (새 1 · 옛 2)", board)
        demo = board[board.index("### demo") :]
        self.assertLess(demo.index("| DEMO-4 |"), demo.index("| 1 (옛) | sample | feat | approved | approved | active | 구현 |"))
        self.assertIn("| 2 (옛) | older | fix | approved | approved | completed | 완료 |", board)
        self.assert_ok(self.run_script("board.sh", "--check"))

    def test_legacy_stage_documents_are_not_created_anymore(self):
        self.write_legacy_issue("demo", "1-feat-sample", design=None)
        before = self.tree_snapshot()
        self.assert_exit(self.scaffold("demo", "1-feat-sample", "--stage=design"), 2, "읽기 전용")
        self.assertEqual(before, self.tree_snapshot())

    def test_ambiguous_short_legacy_name_requires_full_key(self):
        self.write_legacy_issue("demo", "1-feat-sample", state="active")
        self.write_legacy_issue("demo", "2-fix-sample", state="active")
        self.assert_fails(self.run_script("check-sdd-prerequisites.sh", "demo", "sample"), "ambiguous")
        self.assert_ok(self.run_script("check-sdd-prerequisites.sh", "demo", "1-feat-sample", "--stage", "implement"))

    def test_plan_checker_reads_legacy_issue_state_and_task_ids(self):
        issue = self.write_legacy_issue("demo", "1-feat-sample", state="check", checked=False)
        task = issue / "tasks/check.md"
        self.assert_fails(self.run_script("check_harness.py", "--plans-only"), "unchecked task")
        task.write_text("| 상태 | active |\n- [X] T001 일\n- [X] T001 중복\n")
        result = self.run_script("check_harness.py", "--plans-only")
        self.assert_fails(result, "state mismatch")
        self.assertIn("duplicate task ID", result.stderr)
        task.write_text("| 상태 | check |\n- [X] T001 일\n")
        self.assert_ok(self.run_script("check_harness.py", "--plans-only"))

    def test_plan_checker_rejects_same_key_in_both_legacy_layouts(self):
        self.write_legacy_issue("demo", "1-feat-sample", state="active")
        legacy = self.docs / "demo-specs/tasks/check/1-feat-sample.md"
        legacy.parent.mkdir(parents=True)
        legacy.write_text("| 상태 | check |\n- [X] T001 일\n")
        self.assert_fails(self.run_script("check_harness.py", "--plans-only"), "duplicate")

    def test_root_fallback_checker_supports_legacy_issue_layout(self):
        issue = self.write_legacy_issue("demo", "1-feat-sample", state="active")
        (self.scripts / "check_harness.py").unlink()
        (issue / "tasks/active.md").write_text("| 상태 | completed |\n- [X] T001 일\n")
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
        issue = self.write_legacy_issue("demo", "1-feat-sample", state="completed", checked=False)
        (issue / "requirements.md").unlink()
        (issue / "design.md").unlink()
        result = self.run_script("check-exec-plan-status.sh")
        self.assert_fails(result, "missing requirements")
        self.assertIn("missing design", result.stderr)
        self.assertIn("unchecked task", result.stderr)

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

    def test_legacy_freshness_is_read_only(self):
        issue = self.write_legacy_issue("demo", "1-feat-sample", req="draft", state="active", checked=False)
        requirement = issue / "requirements.md"
        requirement.write_text("| 상태 | draft |\n[NEEDS CLARIFICATION: 질문]\n")
        old = time.time() - 30 * 86400
        os.utime(requirement, (old, old))
        os.utime(issue / "tasks/active.md", (old, old))
        before = requirement.read_bytes()
        result = self.run_script("check-spec-freshness.sh", "--days", "14")
        self.assert_ok(result)
        self.assertIn("정체 스펙=1", result.stdout)
        self.assertIn("미해결 마커=1", result.stdout)
        self.assertIn("정체 tasks=1", result.stdout)
        self.assertEqual(before, requirement.read_bytes())

    def test_symlinked_legacy_document_and_board_index_are_rejected(self):
        issue = self.write_legacy_issue("demo", "1-feat-sample")
        outside = self.base / "outside.md"
        outside.write_text("| 상태 | approved |\n")
        requirement = issue / "requirements.md"
        requirement.unlink()
        requirement.symlink_to(outside)
        self.assert_fails(self.run_script("check-sdd-prerequisites.sh", "demo", "1-feat-sample", "--stage", "tasks"), "symlink")
        self.assert_fails(self.run_script("check_harness.py", "--plans-only"), "symlink")
        self.assert_fails(self.run_script("board.sh"), "symlink")
        requirement.unlink()
        requirement.write_text("| 상태 | approved |\n")
        index = self.docs / "demo-specs/index.md"
        index.symlink_to(outside)
        self.assert_fails(self.run_script("board.sh"), "symlink")
        self.assertEqual("| 상태 | approved |\n", outside.read_text())

    def test_legacy_spec_symlink_is_rejected(self):
        outside = self.base / "outside"
        outside.mkdir()
        (self.docs / "demo-specs").symlink_to(outside, target_is_directory=True)
        self.assert_fails(self.run_script("board.sh", "demo"), "symlink")
        self.assertEqual([], list(outside.iterdir()))

    def legacy_index(self):
        self.write_legacy_issue("demo", "1-feat-sample", design=None)
        index = self.docs / "demo-specs/index.md"
        index.write_text("# 제품 색인\n\n<!-- BOARD:BEGIN -->\n<!-- BOARD:END -->\n")
        self.assert_ok(self.run_script("board.sh"))
        (self.docs / "demo-specs/issues/1-feat-sample/design.md").write_text("| 상태 | draft |\n")
        return index

    def test_legacy_index_board_keeps_body(self):
        index = self.legacy_index()
        index.write_text(index.read_text() + "\n사용자 기록\n")
        before = index.read_bytes()
        self.assert_fails(self.run_script("board.sh", "--check"), "보드")
        self.assertEqual(before, index.read_bytes())
        self.assert_ok(self.run_script("board.sh"))
        self.assertIn("사용자 기록", index.read_text())
        self.assertIn("🎨 설계 (1)", index.read_text())

    def test_board_preserves_concurrent_index_content_and_mode_changes(self):
        index = self.legacy_index()
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
        self.legacy_index()
        spec = self.docs / "demo-specs"
        moved = self.docs / "saved-demo-specs"
        outside = self.base / "unrelated"
        outside.mkdir()
        external_index = outside / "index.md"
        external_index.write_text("다른 디렉터리의 문서\n")
        original_replace = sdd_layout.os.replace

        def replace_after_directory_swap(source, destination, **arguments):
            self.assertIn("src_dir_fd", arguments)
            self.assertIn("dst_dir_fd", arguments)
            if destination == "index.md" and not spec.is_symlink():
                spec.rename(moved)
                spec.symlink_to(outside, target_is_directory=True)
            return original_replace(source, destination, **arguments)

        with mock.patch.object(sdd_layout.os, "replace", side_effect=replace_after_directory_swap):
            sdd_board.update_boards(self.root, "demo")
        self.assertEqual("다른 디렉터리의 문서\n", external_index.read_text())
        self.assertIn("🎨 설계 (1)", (moved / "index.md").read_text())


if __name__ == "__main__":
    unittest.main()
