"""이슈 키 · 이름 규칙, `--next` 번호, jira 설정, 종료 코드, 키 충돌 · rekey, 옛 구조 동결, 브랜치 규칙(설계 01 §3.7)."""

import re
import sys
import unittest

from sdd_fixture import SHARED, SddCase

sys.path.insert(0, str(SHARED / "scripts"))
from harness import sdd_frontmatter, sdd_keys

sys.path.pop(0)

ZERO = "0" * 40


class KeyRuleTest(unittest.TestCase):
    def test_issue_key_format(self):
        for key in ("HDRV3D-12", "KNOTS-17", "AB-1", "ABCDEFGHIJ-999999"):
            with self.subTest(key=key):
                self.assertTrue(sdd_keys.is_key(key))
        for key in ("A-1", "ABCDEFGHIJK-1", "KNOTS-0", "KNOTS-01", "knots-1", "KNOTS-1234567", "1KNOTS-1", "KNOTS_1"):
            with self.subTest(key=key):
                self.assertFalse(sdd_keys.is_key(key))

    def test_issue_name_format(self):
        for name in ("upload-cleanup", "a1-b2", "one-two-three-four-five", "desktop-parity"):
            with self.subTest(name=name):
                self.assertEqual([], sdd_keys.name_problems(name))
        for name in (
            "upload",
            "feat-login",
            "fix-crash-report",
            "2fa-login",
            "Upload-cleanup",
            "upload_cleanup",
            "one-two-three-four-five-six",
            "a" * 30 + "-" + "b" * 10,
            "업로드-정리",
            "upload--cleanup",
        ):
            with self.subTest(name=name):
                self.assertNotEqual([], sdd_keys.name_problems(name))

    def test_prefix_derivation(self):
        self.assertEqual("ACMENOTES", sdd_keys.derive_prefix("acme-notes"))
        self.assertEqual("KNOTS", sdd_keys.derive_prefix("knots"))
        self.assertEqual("ABCDEFGHIJ", sdd_keys.derive_prefix("abcdefghij-klm"))
        self.assertEqual("PASSWORD", sdd_keys.derive_prefix("1password"))
        self.assertEqual("ISSUE", sdd_keys.derive_prefix("x"))
        self.assertEqual("ISSUE", sdd_keys.derive_prefix(""))


class FrontmatterTest(unittest.TestCase):
    def test_subset_parser_reads_strings_and_strips_comments(self):
        text = "---\nkey: KNOTS-17\narea: app                  # 영역\ntitle: 데스크톱 화면 # 설명\njira: https://x.atlassian.net/browse/KNOTS-17\n---\n# 본문\n"
        fields = sdd_frontmatter.parse(text)
        self.assertEqual(
            {"key": "KNOTS-17", "area": "app", "title": "데스크톱 화면", "jira": "https://x.atlassian.net/browse/KNOTS-17"},
            fields,
        )

    def test_missing_and_malformed_frontmatter(self):
        self.assertIsNone(sdd_frontmatter.parse("# 본문\n"))
        for broken in ("---\nkey: A\n", "---\nKey: A\n---\n", "---\n  nested: A\n---\n", "---\nno colon\n---\n"):
            with self.subTest(broken=broken):
                with self.assertRaises(ValueError):
                    sdd_frontmatter.parse(broken)

    def test_render_and_replace_keep_body(self):
        text = sdd_frontmatter.render({"key": "AB-1", "state": "active"}) + "# 본문\n"
        self.assertEqual({"key": "AB-1", "state": "active"}, sdd_frontmatter.parse(text))
        replaced = sdd_frontmatter.update(text, {"state": "check"})
        self.assertEqual("check", sdd_frontmatter.parse(replaced)["state"])
        self.assertTrue(replaced.endswith("# 본문\n"))


class NextKeyTest(SddCase):
    def next_key(self, name="sample-flow"):
        result = self.scaffold("--next", name, "--area", "demo", "--dry-run")
        self.assert_ok(result)
        match = re.search(rf"issues/(DEMO-[0-9]+)-{name}/", result.stdout)
        self.assertIsNotNone(match, result.stdout)
        return match[1]

    def test_first_key_without_any_source_is_one(self):
        self.assertEqual("DEMO-1", self.next_key())
        self.init_git()
        self.assertEqual("DEMO-1", self.next_key())

    def test_work_tree_folders_count(self):
        self.write_new_issue("DEMO-4-local-thing")
        self.write_new_issue("OTHER-40-other-prefix")
        self.assertEqual("DEMO-5", self.next_key())

    def test_base_tree_of_origin_counts_after_fetch(self):
        self.init_git()
        other = self.add_origin()
        self.push_issue_from_other(other, "DEMO-7-base-thing")
        self.assertEqual("DEMO-8", self.next_key())
        self.assertFalse(self.issue("DEMO-7-base-thing").exists())

    def test_local_and_remote_branch_names_count(self):
        self.init_git()
        self.git("branch", "feat/DEMO-9-other-work")
        self.assertEqual("DEMO-10", self.next_key())
        self.git("update-ref", "refs/remotes/origin/fix/DEMO-11-remote-work", "HEAD")
        self.assertEqual("DEMO-12", self.next_key())
        self.git("branch", "feat/OTHER-50-not-ours")
        self.git("branch", "feat/DEMO-90x-not-a-key")
        self.assertEqual("DEMO-12", self.next_key())

    def test_detached_worktree_path_counts(self):
        self.init_git()
        self.git("worktree", "add", "-q", "--detach", str(self.base / "wt" / "DEMO-14-wt-thing"))
        self.assertEqual("DEMO-15", self.next_key())

    def test_jira_source_refuses_next_and_accepts_jira_keys(self):
        self.settings(source="jira", prefix="KNOTS")
        result = self.scaffold("--next", "desktop-parity", "--area", "app")
        self.assert_exit(result, 2, "issueKey.source")
        self.assertIn("KNOTS-123", result.stderr)
        self.assertFalse((self.docs / "issues").exists())
        other = self.scaffold("OTHERJIRA-5", "desktop-parity", "--area", "app")
        self.assert_exit(other, 0, "접두")
        self.assertTrue(self.issue("OTHERJIRA-5-desktop-parity").is_dir())

    def test_jira_link_is_filled_from_issue_tracker(self):
        self.settings(source="jira", prefix="KNOTS")
        (self.root / ".agents/issue-tracker.yml").write_text("provider: jira\nbaseUrl: https://acme.atlassian.net   # 사이트\n")
        self.assert_ok(self.scaffold("KNOTS-17", "desktop-parity", "--area", "app"))
        requirement = self.issue("KNOTS-17-desktop-parity") / "requirements.md"
        self.assertEqual("https://acme.atlassian.net/browse/KNOTS-17", self.field(requirement, "jira"))

    def test_kit_source_requires_matching_prefix(self):
        self.assert_exit(self.scaffold("OTHER-1", "sample-flow", "--area", "demo"), 2, "prefix")
        self.assertFalse((self.docs / "issues").exists())

    def test_default_prefix_comes_from_project_slug(self):
        meta = self.root / ".agents/harness-kit.json"
        meta.write_text('{"tokens": {"PROJECT_SLUG": "acme-notes"}}\n')
        self.assert_ok(self.scaffold("--next", "sample-flow", "--area", "demo"))
        self.assertTrue(self.issue("ACMENOTES-1-sample-flow").is_dir())


class ExitCodeTest(SddCase):
    def test_exit_codes(self):
        self.assert_exit(self.scaffold("DEMO-1", "sample-flow", "--area", "demo"), 0)
        self.assert_exit(self.scaffold("DEMO-1", "--stage=design"), 1, "approved")
        self.assert_exit(self.scaffold("DEMO-2", "upload", "--area", "demo"), 2, "이름")
        self.assert_exit(self.scaffold("DEMO-1", "other-name", "--area", "demo"), 3, "DEMO-1-sample-flow")
        self.assertFalse(self.issue("DEMO-1-other-name").exists())

    def test_missing_area_lists_existing_areas(self):
        self.write_new_issue("DEMO-1-first-thing", area="app")
        self.write_new_issue("DEMO-2-second-thing", area="billing")
        result = self.scaffold("--next", "third-thing")
        self.assert_exit(result, 2, "--area")
        self.assertIn("app", result.stderr)
        self.assertIn("billing", result.stderr)

    def test_key_taken_on_base_with_another_name_is_a_conflict(self):
        self.init_git()
        other = self.add_origin()
        self.push_issue_from_other(other, "DEMO-3-base-name")
        self.git("fetch", "-q", "origin")
        self.assert_exit(self.scaffold("DEMO-3", "my-name", "--area", "demo"), 3, "DEMO-3-base-name")

    def test_old_call_is_translated_with_notice(self):
        result = self.scaffold("demo", "sample-flow", "--type", "fix")
        self.assert_ok(result)
        self.assertIn("--next sample-flow --area demo", result.stderr)
        requirement = self.issue("DEMO-1-sample-flow") / "requirements.md"
        self.assertEqual("demo", self.field(requirement, "area"))
        self.assertEqual("fix", self.field(requirement, "type"))
        self.assert_exit(self.scaffold("demo", "sample-flow", "--legacy"), 2, "--legacy")


class KeyCollisionTest(SddCase):
    def test_collision_with_base_fails_fast_check_until_rekey(self):
        self.init_git()
        other = self.add_origin()
        self.git("checkout", "-q", "-b", "feat/DEMO-18-desktop-parity")
        self.assert_ok(self.scaffold("DEMO-18", "desktop-parity", "--area", "app"))
        self.commit("local issue")
        self.assert_ok(self.check())
        self.push_issue_from_other(other, "DEMO-18-token-expiry")
        self.git("fetch", "-q", "origin")
        result = self.check()
        self.assert_fails(result, "키 충돌: DEMO-18")
        self.assertIn("DEMO-18-token-expiry", result.stderr)
        self.assertIn("rekey DEMO-18 --next", result.stderr)
        rekey = self.layout("rekey", "DEMO-18", "--next")
        self.assert_ok(rekey)
        self.assertIn("git branch -m feat/DEMO-18-desktop-parity feat/DEMO-19-desktop-parity", rekey.stdout)
        issue = self.issue("DEMO-19-desktop-parity")
        self.assertEqual("DEMO-19", self.field(issue / "requirements.md", "key"))
        self.assertIn("DEMO-19-desktop-parity", (issue / "requirements.md").read_text())
        self.assertFalse(self.issue("DEMO-18-desktop-parity").exists())
        self.assert_ok(self.check())

    def test_rekey_to_explicit_key(self):
        self.write_new_issue("DEMO-2-sample-flow", design="approved")
        self.assert_ok(self.layout("rekey", "DEMO-2", "DEMO-40"))
        self.assertEqual("DEMO-40", self.field(self.issue("DEMO-40-sample-flow") / "design.md", "key"))
        self.assert_exit(self.layout("rekey", "DEMO-40", "bad"), 2)


class LegacyFrozenTest(SddCase):
    def setUp(self):
        super().setUp()
        self.write_legacy_issue("demo", "1-feat-sample", state="active")
        self.write_legacy_stage("demo", "2-fix-older", state="active")
        self.init_git()
        self.add_origin()
        self.git("checkout", "-q", "-b", "feat/DEMO-1-some-work")

    def test_new_legacy_documents_fail_and_edits_pass(self):
        self.assert_ok(self.check())
        requirement = self.docs / "demo-specs/issues/1-feat-sample/requirements.md"
        requirement.write_text(requirement.read_text() + "\n수정한 줄\n")
        self.assert_ok(self.check())
        added = self.write_legacy_issue("demo", "3-feat-newer", design=None)
        result = self.check()
        self.assert_fails(result, "읽기 전용")
        self.assertIn("demo-specs/issues/3-feat-newer/requirements.md", result.stderr)
        self.commit("legacy addition")
        self.assert_fails(self.check(), "3-feat-newer")
        self.git("rm", "-q", "-r", str(added))
        self.commit("remove addition")
        self.assert_ok(self.check())

    def test_moving_legacy_task_between_state_folders_passes(self):
        source = self.docs / "demo-specs/tasks/active/2-fix-older.md"
        target = self.docs / "demo-specs/tasks/check/2-fix-older.md"
        target.parent.mkdir(parents=True)
        self.git("mv", str(source), str(target))
        target.write_text(target.read_text().replace("| 상태 | active |", "| 상태 | check |"))
        self.commit("legacy task to check")
        self.assert_ok(self.check())


class BranchRuleTest(SddCase):
    def setUp(self):
        super().setUp()
        self.init_git()

    def branch_check(self, branch, sha=None, local_ref=None):
        sha = sha or self.git("rev-parse", "HEAD").stdout.strip()
        refs = self.base / "refs.txt"
        refs.write_text(f"{local_ref or 'refs/heads/' + branch} {sha} refs/heads/{branch} {ZERO}\n")
        return self.layout("branch-check", str(refs))

    def test_issue_branch_needs_its_issue_folder_in_the_pushed_commit(self):
        self.assert_exit(self.branch_check("feat/DEMO-17-desktop-parity"), 1, ".agents/docs/issues/DEMO-17-")
        self.write_new_issue("DEMO-17-desktop-parity")
        self.assert_exit(self.branch_check("feat/DEMO-17-desktop-parity"), 1, "DEMO-17")
        self.commit("issue folder")
        result = self.branch_check("feat/DEMO-17-desktop-parity")
        self.assert_ok(result)
        self.assertEqual("", result.stderr)

    def test_exp_base_and_other_branches(self):
        for branch in ("exp/DEMO-17-try-this", "develop", "main", "master"):
            with self.subTest(branch=branch):
                result = self.branch_check(branch)
                self.assert_ok(result)
                self.assertEqual("", result.stderr)
        warned = self.branch_check("feature/whatever")
        self.assert_ok(warned)
        self.assertIn("<종류>/<이슈키>-<이름>", warned.stderr)
        refs = self.base / "refs.txt"
        refs.write_text(f"(delete) {ZERO} refs/heads/feat/DEMO-17-desktop-parity {'1' * 40}\nrefs/tags/v1 {ZERO.replace('0', '1')} refs/tags/v1 {ZERO}\n")
        self.assert_ok(self.layout("branch-check", str(refs)))

    def test_pre_push_blocks_issue_branch_without_folder(self):
        sha = self.git("rev-parse", "HEAD").stdout.strip()
        result = self.run_script(
            "git-hooks/pre-push",
            "origin",
            "unused",
            cwd=self.root,
            stdin=f"refs/heads/feat/DEMO-17-desktop-parity {sha} refs/heads/feat/DEMO-17-desktop-parity {ZERO}\n",
        )
        self.assert_exit(result, 1, "DEMO-17")


class IssueFrontmatterInTemplatesTest(SddCase):
    def test_templates_carry_frontmatter_without_status_rows(self):
        for stage, field in (("requirements", "status"), ("design", "status"), ("tasks", "state")):
            with self.subTest(stage=stage):
                text = (self.docs / f"_spec-templates/{stage}/_template.md").read_text()
                fields = sdd_frontmatter.parse(text)
                self.assertIn(field, fields)
                self.assertNotRegex(text, r"(?m)^\|\s*상태\s*\|")
        self.assertFalse((self.docs / "_spec-templates/index.md").exists())


if __name__ == "__main__":
    unittest.main()
