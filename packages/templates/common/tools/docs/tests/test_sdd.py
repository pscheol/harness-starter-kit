"""SDD 이슈 추출기가 새 구조(`.agents/docs/issues/<키>-<이름>/`, 문서 머리)와 옛 두 구조를 함께 읽는다."""

import shutil
import tempfile
import unittest
from pathlib import Path

from docskit import catalog
from docskit.extract import sdd


def head(**fields):
    return "---\n" + "".join(f"{key}: {value}\n" for key, value in fields.items()) + "---\n"


class SddExtractTest(unittest.TestCase):
    def setUp(self):
        self.repo = Path(tempfile.mkdtemp(prefix="docs-sdd-"))
        self.addCleanup(shutil.rmtree, self.repo, ignore_errors=True)
        self.docs = self.repo / ".agents/docs"

    def write(self, rel, text):
        path = self.docs / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def new_issue(self, folder, area="notes", type_="feat", title=None, design=False, state=None):
        key = "-".join(folder.split("-")[:2])
        common = {"key": key, "area": area, "type": type_, "title": title or folder}
        self.write(f"issues/{folder}/requirements.md", head(**common, status="approved") + "# Requirements — 본문 제목\n")
        if design:
            self.write(f"issues/{folder}/design.md", head(**common, status="approved") + "# Design\n")
        if state:
            self.write(f"issues/{folder}/tasks.md", head(**common, state=state) + "# Tasks\n")

    def by_key(self):
        return {issue.key: issue for issue in sdd.collect(self.repo, ["."])}

    def test_new_issue_status_follows_documents_and_state(self):
        self.new_issue("ACME-1-folder-bookmark")
        self.new_issue("ACME-2-folder-sync", design=True)
        self.new_issue("ACME-3-share-link", design=True, state="check")
        self.new_issue("ACME-4-bad-state", design=True, state="later")
        issues = self.by_key()
        self.assertEqual(
            {k: i.status for k, i in issues.items()},
            {"ACME-1-folder-bookmark": "requirements", "ACME-2-folder-sync": "design", "ACME-3-share-link": "check", "ACME-4-bad-state": "design"},
        )

    def test_new_issue_fields_come_from_the_head(self):
        self.new_issue("ACME-12-upload-cleanup", area="files", type_="fix", title="업로드 정리")
        issue = self.by_key()["ACME-12-upload-cleanup"]
        self.assertEqual((issue.slug, issue.number, issue.type, issue.name, issue.title), ("files", 12, "fix", "upload-cleanup", "업로드 정리"))
        self.assertEqual(issue.path, ".agents/docs/issues/ACME-12-upload-cleanup/requirements.md")
        self.assertFalse(issue.legacy)
        self.assertEqual(issue.ref, ".:issues/files/ACME-12-upload-cleanup")

    def test_missing_head_values_fall_back(self):
        self.write("issues/ACME-5-no-head/requirements.md", "# Requirements — 머리 없는 이슈\n")
        issue = self.by_key()["ACME-5-no-head"]
        self.assertEqual((issue.slug, issue.type, issue.title, issue.status), ("-", "feat", "머리 없는 이슈", "requirements"))

    def test_folders_that_are_not_issue_keys_are_ignored(self):
        self.write("issues/README.md", "# 안내\n")
        self.write("issues/notes-draft/requirements.md", head(key="X", area="notes") + "# Requirements\n")
        (self.docs / "issues/ACME-6-empty-folder").mkdir(parents=True)
        self.assertEqual(self.by_key(), {})

    def test_catalog_patterns_match_new_issues_by_area_or_key(self):
        self.new_issue("ACME-7-folder-bookmark", area="notes")
        ref = self.by_key()["ACME-7-folder-bookmark"].ref
        self.assertTrue(catalog.glob_score(".:issues/notes/*", ref))
        self.assertTrue(catalog.glob_score(".:issues/*/ACME-7-*", ref))
        self.assertFalse(catalog.glob_score(".:issues/files/*", ref))

    def test_legacy_layouts_are_still_read_next_to_new_issues(self):
        self.new_issue("ACME-8-folder-bookmark")
        self.write("note-specs/issues/3-feat-share/requirements.md", "# Requirements — 공유\n\n| 상태 | approved |\n")
        self.write("note-specs/issues/3-feat-share/tasks/active.md", "# Tasks — 공유\n")
        self.write("note-specs/requirements/4-fix-login.md", "# Requirements — 로그인\n")
        issues = self.by_key()
        self.assertEqual(sorted(issues), ["3-feat-share", "4-fix-login", "ACME-8-folder-bookmark"])
        share = issues["3-feat-share"]
        self.assertEqual((share.status, share.slug, share.ref, share.legacy), ("active", "note", ".:note-specs/3-feat-share", True))
        self.assertEqual(issues["4-fix-login"].status, "requirements")


if __name__ == "__main__":
    unittest.main()
