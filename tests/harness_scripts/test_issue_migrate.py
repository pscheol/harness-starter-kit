"""옛 구조를 새 이슈 폴더로 옮긴다(`sdd-layout.py migrate`, 설계 01 §3.7.6)."""

import json
import unittest

from sdd_fixture import SddCase

OLD = "163-feat-recording-quality-tiro-parity"
NEW = "DEMO-4-recording-quality-tiro-parity"


class MigrateTest(SddCase):
    def setUp(self):
        super().setUp()
        recording = self.docs / "recording-specs"
        issue = recording / "issues" / OLD
        (issue / "tasks").mkdir(parents=True)
        (issue / "diagrams").mkdir()
        (issue / "requirements.md").write_text(
            f"# Requirements — {OLD}\n\n| 항목 | 값 |\n|---|---|\n| 상태 | approved |\n| 연계 | [설계](design.md) |\n\n"
            "[규칙](../../../../rules/sdd-workflow.md)\n"
        )
        (issue / "design.md").write_text(f"# Design — {OLD}\n\n| 상태 | approved |\n\n[요구](requirements.md)\n")
        (issue / "tasks/completed.md").write_text("# Tasks\n\n| 상태 | completed |\n\n- [X] T001 일\n\n[설계](../design.md)\n")
        (issue / "analysis-notes.md").write_text("# 분석\n")
        (issue / "diagrams/flow.mmd").write_text("flowchart LR\n  A --> B\n")
        (recording / "issues/7-fix-upload").mkdir(parents=True)
        (recording / "issues/7-fix-upload/requirements.md").write_text("# Requirements\n\n| 상태 | draft |\n")
        six = recording / "issues/8-feat-one-two-three-four-five-six"
        six.mkdir(parents=True)
        (six / "requirements.md").write_text("| 상태 | approved |\n")
        (six / "design.md").write_text("| 상태 | in-review |\n")
        (recording / "index.md").write_text("# 녹음\n\n사람 기록\n\n<!-- BOARD:BEGIN -->\n<!-- BOARD:END -->\n")
        (recording / "research.md").write_text(f"# 조사\n\n[요구](issues/{OLD}/requirements.md)\n")
        self.write_legacy_issue("auth", "3-feat-login-flow", req="draft", design=None)
        self.write_legacy_stage("auth", "5-fix-token-expiry", state="active")
        (self.root / "docs").mkdir(exist_ok=True)
        (self.root / "docs/elsewhere.md").write_text(f"옛 경로: .agents/docs/recording-specs/issues/{OLD}\n")
        self.assert_ok(self.run_script("board.sh"))
        self.init_git()
        self.map_path = self.root / ".agents/state/migrate-map.json"

    def dry_run(self, *arguments):
        result = self.layout("migrate", "--dry-run", *arguments)
        self.assert_ok(result)
        return json.loads(self.map_path.read_text())

    def apply(self, *arguments):
        return self.layout("migrate", "--apply", "--map", str(self.map_path), *arguments)

    def write_map(self, data):
        self.map_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    def status(self, *paths):
        return self.git("status", "--porcelain", "--", *paths).stdout

    def test_dry_run_writes_only_the_map(self):
        before = self.tree_snapshot()
        data = self.dry_run()
        self.assertEqual(before, self.tree_snapshot())
        self.assertEqual("knots-sync.migrate-map/v1", data["schema"])
        self.assertEqual({"source": "kit", "prefix": "DEMO"}, data["issueKey"])
        self.assertEqual({"areas": 2, "items": 4, "legacyItems": 0}, data["counts"])
        keys = [(item["area"], item["oldNumber"], item["key"], item["slug"]) for item in data["items"]]
        self.assertEqual(
            [
                ("auth", 3, "DEMO-1", "login-flow"),
                ("recording", 7, "DEMO-2", "recording-upload"),
                ("recording", 8, "DEMO-3", "one-two-three-four-five"),
                ("recording", 163, "DEMO-4", "recording-quality-tiro-parity"),
            ],
            keys,
        )
        item = data["items"][3]
        self.assertEqual("move", item["action"])
        self.assertEqual("issue", item["layout"])
        self.assertEqual(f".agents/docs/recording-specs/issues/{OLD}", item["from"])
        self.assertEqual(f".agents/docs/issues/{NEW}", item["to"])
        files = {entry["from"]: entry for entry in item["files"]}
        self.assertEqual("tasks.md", files["tasks/completed.md"]["to"])
        self.assertEqual("completed", files["tasks/completed.md"]["state"])
        self.assertEqual("approved", files["requirements.md"]["status"])
        self.assertIn("diagrams/", files)
        self.assertIn("analysis-notes.md", files)
        self.assertEqual({"requirements": 1, "design": 0, "active": 1, "check": 0, "completed": 0, "superseded": 0}, data["boardBefore"]["auth"])
        self.assertEqual(1, data["boardBefore"]["recording"]["completed"])
        codes = {(warning["code"], warning.get("suggest")) for warning in data["warnings"]}
        self.assertIn(("slug", "recording-upload"), codes)
        self.assertIn(("slug", "one-two-three-four-five"), codes)

    def test_dry_run_options(self):
        data = self.dry_run("--include-legacy", "--prefix", "KNOTS", "--start", "100")
        self.assertEqual({"areas": 2, "items": 5, "legacyItems": 1}, data["counts"])
        stage = next(item for item in data["items"] if item["layout"] == "stage")
        self.assertEqual(("auth", 5, "KNOTS-101", "token-expiry"), (stage["area"], stage["oldNumber"], stage["key"], stage["slug"]))
        self.assertEqual(".agents/docs/auth-specs", stage["from"])
        self.assertEqual({"requirements/5-fix-token-expiry.md", "design/5-fix-token-expiry.md", "tasks/active/5-fix-token-expiry.md"}, {entry["from"] for entry in stage["files"]})
        only = self.dry_run("--areas", "recording")
        self.assertEqual({"recording"}, {item["area"] for item in only["items"]})
        (self.docs / "auth-specs/issues/3-feat-login-flow/requirements.md").write_text("| 상태 | in-review |\n")
        dirty = self.dry_run()
        self.assertIn(("dirty", ".agents/docs/auth-specs/issues/3-feat-login-flow"), {(warning["code"], warning["item"]) for warning in dirty["warnings"]})

    def test_apply_moves_files_and_keeps_board_counts(self):
        self.dry_run()
        head = self.git("rev-parse", "HEAD").stdout
        result = self.apply("--rewrite-links")
        self.assert_ok(result)
        issue = self.issue(NEW)
        self.assertFalse((self.docs / "recording-specs/issues" / OLD).exists())
        for name in ("requirements.md", "design.md", "tasks.md", "analysis-notes.md", "diagrams/flow.mmd"):
            self.assertTrue((issue / name).is_file(), name)
        requirement = issue / "requirements.md"
        for field, value in (("key", "DEMO-4"), ("area", "recording"), ("type", "feat"), ("status", "approved"), ("legacy", f"recording-specs/issues/{OLD}")):
            self.assertEqual(value, self.field(requirement, field), field)
        self.assertEqual("completed", self.field(issue / "tasks.md", "state"))
        self.assertEqual("in-review", self.field(self.issue("DEMO-3-one-two-three-four-five") / "design.md", "status"))
        for name in ("requirements.md", "design.md", "tasks.md"):
            self.assertNotRegex((issue / name).read_text(), r"(?m)^\|\s*상태\s*\|", name)
        self.assertIn("[규칙](../../../rules/sdd-workflow.md)", requirement.read_text())
        self.assertIn("[설계](design.md)", (issue / "tasks.md").read_text())
        self.assertIn(f"[요구](../issues/{NEW}/requirements.md)", (self.docs / "recording-specs/research.md").read_text())
        self.assertIn("docs/elsewhere.md", result.stdout)
        board = self.index.read_text()
        self.assertIn("### recording (새 3 · 옛 0)", board)
        self.assertIn("### auth (새 1 · 옛 1)", board)
        old_index = (self.docs / "recording-specs/index.md").read_text()
        self.assertIn("사람 기록", old_index)
        self.assertIn("이슈는 `.agents/docs/issues/`(area: recording)로 옮겼다", old_index)
        self.assertEqual(head, self.git("rev-parse", "HEAD").stdout)
        self.assertRegex(self.status(".agents/docs"), r"(?m)^R")
        self.assert_ok(self.run_script("board.sh", "--check"))
        self.assert_ok(self.run_script("check_harness.py", "--plans-only"))

    def test_apply_validation_failure_moves_nothing(self):
        data = self.dry_run()
        before = self.tree_snapshot()
        broken = json.loads(json.dumps(data))
        broken["items"][0]["key"] = "bad-key"
        self.write_map(broken)
        self.assert_exit(self.apply(), 3, "bad-key")
        duplicate = json.loads(json.dumps(data))
        duplicate["items"][1]["key"] = duplicate["items"][0]["key"]
        duplicate["items"][1]["to"] = f".agents/docs/issues/{duplicate['items'][0]['key']}-{duplicate['items'][1]['slug']}"
        self.write_map(duplicate)
        self.assert_exit(self.apply(), 3, "duplicate")
        self.write_map(data)
        self.assertEqual(before, self.tree_snapshot())
        research = self.docs / "recording-specs/research.md"
        research.write_text(research.read_text() + "\n커밋 안 한 줄\n")
        self.assert_exit(self.apply(), 3, ".agents/docs")
        research.write_text(research.read_text().replace("\n커밋 안 한 줄\n", ""))
        self.assertEqual(before, self.tree_snapshot())

    def test_count_mismatch_rolls_back(self):
        data = self.dry_run()
        data["items"][3]["area"] = "auth"
        self.write_map(data)
        result = self.apply()
        self.assert_exit(result, 1, "recording")
        self.assertTrue((self.docs / "recording-specs/issues" / OLD / "tasks/completed.md").is_file())
        self.assertFalse(self.issue(NEW).exists())
        self.assertFalse((self.docs / "issues").exists() and any((self.docs / "issues").iterdir()))
        self.assertEqual("", self.status(".agents/docs"))


if __name__ == "__main__":
    unittest.main()
