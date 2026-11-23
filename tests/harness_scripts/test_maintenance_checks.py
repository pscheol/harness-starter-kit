"""선택 파일 유지보수 진단의 공개 CLI 계약을 검사한다."""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "check-maintenance.py"
SHARED = Path(__file__).resolve().parents[2]


class MaintenanceChecksTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def source(self, relative, content):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def run_checker(self, *paths, json_output=True):
        arguments = ["python3", str(SCRIPT)]
        if json_output:
            arguments.append("--json")
        if paths:
            arguments.extend(["--files", *map(str, paths)])
        return subprocess.run(arguments, cwd=self.root, capture_output=True, text=True)

    def report(self, *paths):
        result = self.run_checker(*paths)
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        return json.loads(result.stdout)

    def test_only_selected_file_is_read(self):
        self.source("src/selected.py", "def count_notes(notes):\n    return len(notes)\n")
        self.source("src/other.py", "def broken(:\n")
        report = self.report("src/selected.py")
        self.assertEqual(report["checked"], ["src/selected.py"])
        self.assertEqual(report["diagnostics"], [])

    def test_python_mixed_boolean_has_location_and_action(self):
        self.source(
            "src/policy.py",
            "def permits(first, second, third):\n    if first and second or third:\n        return True\n",
        )
        report = self.report("src/policy.py")
        warning = report["diagnostics"][0]
        self.assertEqual((warning["path"], warning["line"], warning["code"]), ("src/policy.py", 2, "CM001"))
        self.assertEqual(warning["severity"], "warning")
        self.assertIn("predicate", warning["action"])
        self.assertIn("리뷰", report["reviewRequired"])

    def test_python_multiline_parenthesized_condition_is_one_candidate(self):
        self.source(
            "src/policy.py",
            "def permits(first, second, third):\n    if (\n        first and second\n        or third\n    ):\n        return True\n",
        )
        report = self.report("src/policy.py")
        self.assertEqual([warning["code"] for warning in report["diagnostics"]], ["CM001"])

    def test_python_same_operator_and_named_predicate_are_clear(self):
        self.source(
            "src/policy.py",
            "def permits(first, second, third):\n    if first and second and third:\n        return True\n    return False\n",
        )
        self.assertEqual(self.report("src/policy.py")["diagnostics"], [])

    def test_python_comments_strings_and_separate_conditions_are_not_mixed(self):
        self.source(
            "src/policy.py",
            (
                "def permits(first, second):\n    message = 'if first and second or third'\n"
                "    # if first and second or third:\n    if first and second:\n        return message\n"
                "    if first or second:\n        return None\n"
            ),
        )
        self.assertEqual(self.report("src/policy.py")["diagnostics"], [])

    def test_python_ambiguous_local_binding_is_warning(self):
        self.source(
            "src/notes.py",
            "def load_notes(repository):\n    list = repository.notes()\n    instance = list[0]\n    return instance\n",
        )
        report = self.report("src/notes.py")
        self.assertEqual([(warning["line"], warning["code"]) for warning in report["diagnostics"]], [(2, "CM002"), (3, "CM002")])
        self.assertIn("list", report["diagnostics"][0]["message"])

    def test_python_short_local_bindings_are_review_candidates(self):
        self.source(
            "src/notes.py",
            "def load_notes(repository):\n    req, resp = repository.exchange()\n    r = req\n    s = resp\n    return r, s\n",
        )
        report = self.report("src/notes.py")
        self.assertEqual(len(report["diagnostics"]), 4)

    def test_python_external_parameter_and_field_names_are_preserved(self):
        self.source(
            "src/adapter.py",
            (
                "from dataclasses import dataclass\n\n@dataclass\nclass VendorRequest:\n    list: str\n\n"
                "def handle(req, resp):\n    req.instance = resp\n"
                "    return {'list': req.list, 'instance': req.instance}\n"
            ),
        )
        self.assertEqual(self.report("src/adapter.py")["diagnostics"], [])

    def test_python_technical_names_and_comprehension_indices_are_allowed(self):
        self.source(
            "src/notes.py",
            (
                "def load_notes(repository):\n    note_id = repository.note_id\n    sql = repository.sql\n"
                "    dto = repository.dto\n    notes = [i for i in range(2)]\n    return note_id, sql, dto, notes\n"
            ),
        )
        self.assertEqual(self.report("src/notes.py")["diagnostics"], [])

    def test_typescript_multiline_condition_and_binding_are_candidates(self):
        self.source(
            "src/notes.ts",
            "function loadNotes() {\n  const list = load();\n  if (\n    isOwner && isActive\n    || isAdmin\n  ) { return list; }\n}\n",
        )
        report = self.report("src/notes.ts")
        self.assertEqual([(warning["line"], warning["code"]) for warning in report["diagnostics"]], [(2, "CM002"), (3, "CM001")])

    def test_kotlin_condition_and_binding_are_candidates(self):
        self.source(
            "src/Notes.kt",
            "fun loadNotes(): Boolean {\n    val instance = load()\n    return if (isOwner && isActive || isAdmin) true else false\n}\n",
        )
        self.assertEqual([warning["code"] for warning in self.report("src/Notes.kt")["diagnostics"]], ["CM002", "CM001"])

    def test_typescript_and_kotlin_comments_strings_and_wire_fields_are_ignored(self):
        for suffix in ("ts", "kt"):
            with self.subTest(suffix=suffix):
                path = f"src/Notes.{suffix}"
                self.source(
                    path,
                    (
                        "// const list = load();\n/* if (a && b || c) {} */\n"
                        'const message = "if (a && b || c) { const instance = 1; }";\n'
                        "function handle(req, resp) { return { list: req.list, instance: resp.instance }; }\n"
                    ),
                )
                self.assertEqual(self.report(path)["diagnostics"], [])

    def test_kotlin_raw_strings_and_typescript_templates_are_ignored(self):
        self.source("src/Message.kt", 'val message = """\nif (a && b || c) { val list = 1 }\n"""\n')
        self.source("src/message.ts", "const message = `\nif (a && b || c) { const list = 1; }\n`;\n")
        self.assertEqual(self.report("src/Message.kt", "src/message.ts")["diagnostics"], [])

    def test_documentation_tests_fixtures_and_generated_files_are_skipped(self):
        paths = [
            "docs/example.py",
            "tests/example.py",
            "src/test_policy.py",
            "src/NotesTest.kt",
            "src/NotesIT.kt",
            "src/notes.test.ts",
            "src/notes.spec.tsx",
            "src/__tests__/notes.ts",
            "fixtures/example.py",
            "src/generated/notes.ts",
            "src/notes.generated.ts",
            "src/api.d.ts",
            "src/README.md",
        ]
        for path in paths:
            self.source(path, "def broken(:\n")
        report = self.report(*paths)
        self.assertEqual(report["checked"], [])
        self.assertEqual(len(report["skipped"]), len(paths))
        self.assertEqual(report["diagnostics"], [])

    def test_unselected_directory_and_absolute_path_are_rejected(self):
        path = self.source("src/notes.py", "SECRET_VALUE = 'never print this'\n")
        for selection in ("src", str(path)):
            with self.subTest(selection=selection):
                result = self.run_checker(selection)
                self.assertEqual(result.returncode, 2)
                self.assertIn("relative file", result.stderr)
                self.assertNotIn("SECRET_VALUE", result.stdout + result.stderr)

    def test_parent_traversal_is_rejected_even_if_it_resolves_inside(self):
        self.source("src/notes.py", "def load_notes(): return []\n")
        for selection in ("src/../src/notes.py", "../outside.py"):
            with self.subTest(selection=selection):
                result = self.run_checker(selection)
                self.assertEqual(result.returncode, 2)
                self.assertIn("relative file", result.stderr)

    def test_symlink_to_outside_root_is_rejected_without_reading(self):
        with tempfile.TemporaryDirectory() as outside_directory:
            outside = Path(outside_directory) / "private.py"
            outside.write_text("SECRET_VALUE = 'never print this'\n")
            (self.root / "escape.py").symlink_to(outside)
            result = self.run_checker("escape.py")
            self.assertEqual(result.returncode, 2)
            self.assertIn("outside", result.stderr)
            self.assertNotIn("SECRET_VALUE", result.stdout + result.stderr)

    def test_symlink_to_file_inside_root_uses_selected_label(self):
        target = self.source("src/notes.py", "def load_notes():\n    list = []\n    return list\n")
        (self.root / "linked.py").symlink_to(target)
        report = self.report("linked.py")
        self.assertEqual(report["diagnostics"][0]["path"], "linked.py")

    def test_missing_selection_is_error_without_repository_scan(self):
        result = self.run_checker()
        self.assertEqual(result.returncode, 2)
        self.assertIn("--files", result.stderr)

    def test_missing_file_is_error(self):
        result = self.run_checker("src/missing.py")
        self.assertEqual(result.returncode, 2)
        self.assertIn("relative file", result.stderr)

    def test_python_syntax_error_is_warning_without_source_text(self):
        self.source("src/policy.py", "def permits(: # SECRET_VALUE\n")
        report = self.report("src/policy.py")
        self.assertEqual(report["diagnostics"][0]["code"], "CM003")
        self.assertNotIn("SECRET_VALUE", json.dumps(report))

    def test_invalid_encoding_is_warning_without_crashing(self):
        path = self.root / "notes.py"
        path.write_bytes(b"\xff\xfe\xff")
        report = self.report("notes.py")
        self.assertEqual(report["diagnostics"][0]["code"], "CM003")

    def test_duplicate_selections_are_checked_once(self):
        self.source("src/notes.py", "def load_notes():\n    list = []\n    return list\n")
        report = self.report("src/notes.py", "./src/notes.py")
        self.assertEqual(report["checked"], ["src/notes.py"])
        self.assertEqual(len(report["diagnostics"]), 1)

    def test_text_output_is_actionable_and_warnings_do_not_fail(self):
        self.source("src/notes.py", "def load_notes():\n    list = []\n    return list\n")
        result = self.run_checker("src/notes.py", json_output=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("src/notes.py:2:", result.stdout)
        self.assertIn("CM002", result.stdout)
        self.assertIn("리뷰", result.stdout)


class MaintenanceWorkflowTest(unittest.TestCase):
    def test_three_clients_reference_one_canonical_skill(self):
        canonical = ".agents/skills/hx-maintain/SKILL.md"
        skill = SHARED / canonical
        for relative in (".claude/skills/hx-maintain/SKILL.md", ".kiro/skills/hx-maintain/SKILL.md"):
            path = SHARED / relative
            self.assertTrue(path.is_file(), relative)
            self.assertEqual(skill.read_bytes(), path.read_bytes())
        self.assertIn(canonical, (SHARED / ".kiro/steering/hx-maintain.md").read_text())
        self.assertTrue(skill.is_file(), canonical)
        self.assertIn("code-maintenance.md", skill.read_text())

    def test_rule_covers_package_mapper_semantics_and_contract_documents(self):
        path = SHARED / ".agents/rules/code-maintenance.md"
        self.assertTrue(path.is_file())
        content = path.read_text()
        for term in (
            "패키지",
            "mapper",
            "단락 평가",
            "쿼리 DSL",
            "Given",
            "OpenAPI",
            "operationId",
            # 킷 판은 모델 선택 기준을 단위 문서에 맡긴다.
            "모델 선택 기준",
            "full",
            "LangGraph",
        ):
            self.assertIn(term, content)
        pointer = SHARED / ".kiro/steering/code-maintenance.md"
        self.assertTrue(pointer.is_file())
        self.assertIn(".agents/rules/code-maintenance.md", pointer.read_text())


if __name__ == "__main__":
    unittest.main()
