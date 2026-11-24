"""변경 검증의 선택·실행·격리를 실제 빌드 없이 확인한다."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]


class VerifyChangedTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="changed verification ")
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name) / "harness"
        self.root.mkdir()
        self.write(".agents/harness.json", json.dumps({"unit": "sample", "stack": "monorepo"}))
        self.write("README.md", "# 설명\n")
        (self.root / "scripts").mkdir()
        if (SOURCE / "verify-changed.py").exists():
            shutil.copy2(SOURCE / "verify-changed.py", self.root / "scripts")
        if (SOURCE / "harness").exists():
            shutil.copytree(
                SOURCE / "harness",
                self.root / "scripts/harness",
                ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
            )
        self.env = {
            **os.environ,
            "PYTHONDONTWRITEBYTECODE": "1",
            "TMPDIR": str(self.root.parent),
        }
        self.records = self.root / "calls.jsonl"

    def write(self, relative, content=""):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return path

    def fake(self, relative, code=0, output="1 passed", delay=0):
        path = self.write(
            relative,
            "#!/usr/bin/env python3\n"
            "import json, os, sys, time\n"
            f"with open({str(self.records)!r}, 'a') as record:\n"
            "    record.write(json.dumps({'arguments': sys.argv, 'cwd': os.getcwd()}) + '\\n')\n"
            f"time.sleep({delay!r})\nprint({output!r})\nsys.exit({code})\n",
        )
        path.chmod(0o755)
        return path

    def run_cli(self, *arguments, cwd=None):
        entry = self.root / "scripts/verify-changed.py"
        if not entry.exists():
            return subprocess.CompletedProcess([], 2, "changed verification CLI is not implemented", "")
        return subprocess.run(
            [sys.executable, str(entry), *arguments],
            cwd=cwd or self.root,
            env=self.env,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )

    def plan(self, *arguments):
        result = self.run_cli(*arguments, "--plan")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def python_project(self, prefix=""):
        self.write(
            prefix + "pyproject.toml",
            "[project]\nname='sample'\nversion='0.1.0'\n[dependency-groups]\ndev=['pytest','ruff']\n",
        )
        self.write(
            prefix + "src/sample/price.py",
            "def discounted_price(price):\n    return price\n",
        )
        self.write(
            prefix + "tests/test_price.py",
            "from sample.price import discounted_price\ndef test_price():\n    assert discounted_price(3) == 3\n",
        )
        self.write(
            prefix + "tests/test_unrelated.py",
            "def test_unrelated():\n    assert True\n",
        )
        self.fake(prefix + ".venv-verify/bin/python")

    def test_document_change_is_l0_and_does_not_run_a_build(self):
        result = self.run_cli("--files", "README.md")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn('"level": "L0"', result.stdout)
        self.assertFalse(self.records.exists())

    def test_path_triggered_check_is_planned_for_matching_files_only(self):
        self.write(
            ".agents/verify-checks.json",
            json.dumps(
                {
                    "checks": [
                        {
                            "id": "feature-docs",
                            "paths": ["docs/features/**", "openapi/*.yaml"],
                            "command": ["python3", "tools/docs/check.py"],
                        }
                    ]
                }
            ),
        )
        self.write("docs/features/a.md", "# a\n")
        self.write("openapi/api.yaml", "openapi: 3.1.0\n")
        matched = self.plan("--files", "docs/features/a.md")
        checks = [c for c in matched["commands"] if c["kind"] == "check"]
        self.assertEqual(1, len(checks))
        self.assertEqual(["python3", "tools/docs/check.py"], checks[0]["arguments"])
        self.assertEqual(str(self.root.resolve()), checks[0]["cwd"])
        other = self.plan("--files", "README.md")
        self.assertFalse([c for c in other["commands"] if c["kind"] == "check"])

    def test_path_triggered_check_runs_and_its_failure_fails_the_gate(self):
        self.fake("tools/docs/check.py", code=1, output="문서 검사 실패")
        self.write(
            ".agents/verify-checks.json",
            json.dumps({"checks": [{"id": "feature-docs", "paths": ["docs/**"], "command": [sys.executable, "tools/docs/check.py"]}]}),
        )
        self.write("docs/a.md", "# a\n")
        result = self.run_cli("--files", "docs/a.md")
        self.assertNotEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertTrue(self.records.exists())

    def mixed_tool_project(self):
        """manifest 없는 파이썬 도구 + 사이트 JS(node 내장 시험) — 한 프로젝트에 두 언어."""
        self.write("tool/package.json", json.dumps({"name": "tool", "private": True}))
        self.write("tool/render.py", "def render(value):\n    return value\n")
        self.write("tool/tests/test_render.py", "from render import render\n\ndef test_render():\n    assert render(1) == 1\n")
        self.write("tool/assets/site.js", "(function () {})()\n")
        self.write("tool/tests/site.test.mjs", "import { test } from 'node:test'\ntest('x', () => {})\n")

    def test_mixed_language_project_plans_each_language(self):
        self.mixed_tool_project()
        plan = self.plan("--files", "tool/render.py", "tool/assets/site.js")
        self.assertFalse([item for item in plan["incomplete"] if "unsupported" in item], plan["incomplete"])
        arguments = [" ".join(c["arguments"]) for c in plan["commands"] if c["kind"] == "test"]
        self.assertTrue(any("unittest" in a and "test_render.py" in a for a in arguments), arguments)
        if shutil.which("node"):
            self.assertTrue(any("--test" in a and "site.test.mjs" in a for a in arguments), arguments)

    def commit_all(self):
        identity = ["-c", "user.email=harness@example.invalid", "-c", "user.name=harness"]
        for arguments in (["init", "-q"], ["add", "-A"], [*identity, "commit", "-q", "-m", "base"]):
            subprocess.run(["git", "-C", str(self.root), *arguments], check=True, capture_output=True)

    def test_deleted_test_file_is_a_recommendation_not_missing(self):
        self.mixed_tool_project()
        self.write("tool/tests/test_removed.py", "def test_removed():\n    assert True\n")
        self.commit_all()
        (self.root / "tool/tests/test_removed.py").unlink()
        plan = self.plan("--files", "tool/tests/test_removed.py")
        self.assertEqual([], plan["incomplete"])
        self.assertTrue(any("tool/tests/test_removed.py" in item and "deleted test" in item for item in plan["recommendations"]), plan["recommendations"])

    def test_test_path_that_git_never_had_is_not_treated_as_deleted(self):
        self.mixed_tool_project()
        self.commit_all()
        plan = self.plan("--files", "tool/tests/test_typo.py")
        self.assertFalse([item for item in plan["recommendations"] if "deleted test" in item], plan["recommendations"])
        self.assertTrue(plan["incomplete"], plan)

    def test_summary_lists_recommendations(self):
        self.mixed_tool_project()
        self.write("tool/tests/test_removed.py", "def test_removed():\n    assert True\n")
        self.commit_all()
        (self.root / "tool/tests/test_removed.py").unlink()
        result = self.run_cli("--files", "tool/tests/test_removed.py", "--summary")
        self.assertIn("권고", result.stdout + result.stderr)
        self.assertIn("tool/tests/test_removed.py", result.stdout + result.stderr)

    def covering_check(self, covers=True):
        check = {"id": "site", "paths": ["site/assets/**"], "command": [sys.executable, "tools/docs/check.py"], "covers": covers}
        self.write(".agents/verify-checks.json", json.dumps({"checks": [check]}))
        self.write("site/assets/vendor/lib.min.js", "!function(){}();\n")

    def test_covering_check_owns_generated_code_without_related_tests(self):
        self.covering_check()
        plan = self.plan("--files", "site/assets/vendor/lib.min.js")
        self.assertEqual([], plan["incomplete"])
        self.assertEqual(["check"], [c["kind"] for c in plan["commands"]])

    def test_check_without_covers_still_asks_for_related_tests(self):
        self.covering_check(covers=False)
        plan = self.plan("--files", "site/assets/vendor/lib.min.js")
        self.assertTrue(any("no related test" in item or "package.json missing" in item for item in plan["incomplete"]))

    def test_covers_must_be_boolean(self):
        self.covering_check(covers="yes")
        result = self.run_cli("--files", "site/assets/vendor/lib.min.js", "--plan")
        self.assertNotEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("covers", result.stdout + result.stderr)

    def test_invalid_verify_checks_file_is_reported(self):
        self.write(".agents/verify-checks.json", json.dumps({"checks": [{"id": "x", "paths": "docs/**"}]}))
        self.write("docs/a.md", "# a\n")
        result = self.run_cli("--files", "docs/a.md", "--plan")
        self.assertNotEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("verify-checks", result.stdout + result.stderr)

    def test_document_invalid_json_fails(self):
        self.write("config.json", "{broken}")
        result = self.run_cli("--files", "config.json")
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        self.assertIn("config.json", result.stdout + result.stderr)

    def test_python_source_selects_only_related_test_and_existing_runtime(self):
        self.python_project()
        plan = self.plan("--files", "src/sample/price.py")
        tests = [command for command in plan["commands"] if command["kind"] == "test"]
        self.assertEqual(1, len(tests))
        self.assertIn("./tests/test_price.py", tests[0]["arguments"])
        self.assertNotIn("./tests/test_unrelated.py", tests[0]["arguments"])
        self.assertIn(".venv-verify/bin/python", tests[0]["arguments"][0])
        self.assertFalse(self.records.exists(), "dry run must not launch runtime")

    def uv_workspace(self):
        """uv workspace — 상위에 환경 하나, 하위 a(소스)와 b(a 를 쓰는 소스)."""
        self.write("pyproject.toml", "[tool.uv.workspace]\nmembers = ['a', 'b']\n")
        self.write("a/pyproject.toml", "[project]\nname='a'\nversion='0.1.0'\n[dependency-groups]\ndev=['pytest']\n")
        self.write("a/src/alpha/price.py", "def price():\n    return 1\n")
        self.write("a/tests/test_price.py", "from alpha.price import price\ndef test_price():\n    assert price() == 1\n")
        self.write("b/pyproject.toml", "[project]\nname='b'\nversion='0.1.0'\ndependencies=['a']\n[dependency-groups]\ndev=['pytest']\n")
        self.write("b/src/beta/cart.py", "from alpha.price import price\ndef total():\n    return price()\n")
        self.write("b/tests/test_cart.py", "from beta.cart import total\ndef test_total():\n    assert total() == 1\n")
        self.write("b/tests/test_other.py", "def test_other():\n    assert True\n")
        self.fake(".venv-verify/bin/python")

    def test_workspace_member_change_selects_dependent_member_tests_with_root_runtime(self):
        # 하위 a 를 바꾸면 a 를 쓰는 하위 b 의 시험도 고르고, 실행 환경은 workspace 상위의 것을 쓴다.
        self.uv_workspace()
        plan = self.plan("--files", "a/src/alpha/price.py")
        tests = {Path(command["cwd"]).name: command for command in plan["commands"] if command["kind"] == "test"}
        self.assertEqual({"a", "b"}, set(tests), plan)
        self.assertIn("./tests/test_price.py", tests["a"]["arguments"])
        self.assertIn("./tests/test_cart.py", tests["b"]["arguments"])
        self.assertNotIn("./tests/test_other.py", tests["b"]["arguments"])
        for command in tests.values():
            self.assertTrue(command["arguments"][0].endswith("harness/.venv-verify/bin/python"), command["arguments"][0])
        self.assertEqual([], plan.get("missing", []), plan)

    def test_workspace_dependent_member_change_does_not_select_dependency_tests(self):
        self.uv_workspace()
        plan = self.plan("--files", "b/src/beta/cart.py")
        tests = {Path(command["cwd"]).name: command for command in plan["commands"] if command["kind"] == "test"}
        self.assertEqual({"b"}, set(tests), plan)

    def test_python_consumer_test_is_selected_for_mapper(self):
        self.python_project()
        self.write("src/sample/mapper.py", "def map_price(value):\n    return value\n")
        self.write("src/sample/price.py", "from sample.mapper import map_price\n")
        plan = self.plan("--files", "src/sample/mapper.py")
        self.assertIn("./tests/test_price.py", str(plan["commands"]))

    def test_python_relative_import_keeps_package_initializer_scope(self):
        self.python_project()
        self.write("src/sample/feature/mapper.py", "VALUE = 3\n")
        self.write("src/sample/feature/__init__.py", "from .mapper import VALUE\n")
        self.write("tests/test_feature.py", "from sample.feature import VALUE\n")
        plan = self.plan("--files", "src/sample/feature/mapper.py")
        self.assertIn("./tests/test_feature.py", str(plan["commands"]))

    def test_python_script_run_by_file_name_selects_the_test_naming_it(self):
        self.python_project()
        self.write("scripts/check-tool.py", "#!/usr/bin/env python3\nprint('ok')\n")
        self.write("tests/test_tool_cli.py", "SCRIPT = 'scripts/check-tool.py'\ndef test_cli():\n    assert SCRIPT\n")
        plan = self.plan("--files", "scripts/check-tool.py")
        self.assertIn("./tests/test_tool_cli.py", str(plan["commands"]))
        self.assertNotIn("./tests/test_unrelated.py", str(plan["commands"]))
        self.assertEqual([], plan["incomplete"])

    def test_python_module_mentioned_only_in_text_is_not_a_dependency(self):
        self.python_project()
        self.write("tests/test_notes.py", "'''price.py 설명'''\ndef test_notes():\n    assert True\n")
        plan = self.plan("--files", "src/sample/price.py")
        self.assertIn("./tests/test_price.py", str(plan["commands"]))
        self.assertNotIn("./tests/test_notes.py", str(plan["commands"]))

    def test_python_script_named_by_a_source_selects_that_source_test(self):
        self.python_project()
        self.write("scripts/static_check.py", "if __name__ == '__main__':\n    print('ok')\n")
        self.write("src/sample/runner.py", "STATIC = 'scripts/static_check.py'\n")
        self.write("tests/test_runner.py", "from sample.runner import STATIC\n")
        self.write("src/sample/notes.py", "'''scripts/static_check.py 를 설명만 한다.'''\n")
        self.write("tests/test_notes_use.py", "from sample.notes import __doc__\n")
        plan = self.plan("--files", "scripts/static_check.py")
        self.assertIn("./tests/test_runner.py", str(plan["commands"]))
        self.assertNotIn("./tests/test_unrelated.py", str(plan["commands"]))
        self.assertNotIn("./tests/test_notes_use.py", str(plan["commands"]))

    def test_python_package_initializer_selects_tests_of_its_submodules(self):
        self.python_project()
        self.write("src/sample/feature/__init__.py", "")
        self.write("src/sample/feature/mapper.py", "VALUE = 3\n")
        self.write("tests/test_mapper_use.py", "from sample.feature.mapper import VALUE\n")
        plan = self.plan("--files", "src/sample/feature/__init__.py")
        self.assertIn("./tests/test_mapper_use.py", str(plan["commands"]))
        self.assertNotIn("./tests/test_unrelated.py", str(plan["commands"]))

    def test_python_test_helper_imported_from_the_tests_path_selects_its_tests(self):
        self.python_project()
        self.write("tests/support/fixture_helper.py", "VALUE = 1\n")
        self.write("tests/test_contract.py", "from support.fixture_helper import VALUE\n")
        plan = self.plan("--files", "tests/support/fixture_helper.py")
        self.assertIn("./tests/test_contract.py", str(plan["commands"]))
        self.assertNotIn("./tests/test_unrelated.py", str(plan["commands"]))

    def test_no_related_test_widens_to_the_module_test_not_full(self):
        # 관련 테스트가 없으면 그 모듈의 테스트로 넓힌다(HK-4 R3.1). full 을 권하지 않는다(R3.3).
        self.python_project()
        self.write("src/sample/new_work.py", "VALUE = 3\n")
        result = self.run_cli("--files", "src/sample/new_work.py")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual("no-related-test", json.loads(result.stdout)["widened"][0]["reason"])
        self.assertNotIn("opt in to full", result.stdout)

    def test_explicit_test_resolves_ambiguous_mapping_without_running_unrelated_suite(
        self,
    ):
        self.python_project()
        self.write("src/sample/new_work.py", "VALUE = 3\n")
        result = self.run_cli("--files", "src/sample/new_work.py", "--tests", "tests/test_price.py")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        calls = [json.loads(line) for line in self.records.read_text().splitlines()]
        pytest = [call for call in calls if "pytest" in call["arguments"]]
        self.assertEqual(1, len(pytest))
        self.assertNotIn("./tests/test_unrelated.py", pytest[0]["arguments"])
        self.assertNotIn("sync", self.records.read_text())

    def test_explicit_tests_replace_inferred_consumer_tests_in_their_project(self):
        self.python_project()
        self.write(
            "tests/test_price_consumer.py",
            "from sample.price import discounted_price\n",
        )
        plan = self.plan("--files", "src/sample/price.py", "--tests", "tests/test_price.py")
        command = next(command for command in plan["commands"] if command["kind"] == "test")
        self.assertEqual(
            ["./tests/test_price.py"],
            [argument for argument in command["arguments"] if argument.startswith("./tests/")],
        )
        self.assertNotIn("./tests/test_price_consumer.py", str(plan["commands"]))

    def test_explicit_tests_keep_directly_changed_tests_without_other_inference(self):
        self.python_project()
        self.write(
            "tests/test_changed_consumer.py",
            "from sample.price import discounted_price\n",
        )
        self.write(
            "tests/test_other_consumer.py",
            "from sample.price import discounted_price\n",
        )
        plan = self.plan(
            "--files",
            "src/sample/price.py",
            "tests/test_changed_consumer.py",
            "--tests",
            "tests/test_price.py",
        )
        command = next(command for command in plan["commands"] if command["kind"] == "test")
        self.assertEqual(
            {"./tests/test_price.py", "./tests/test_changed_consumer.py"},
            {argument for argument in command["arguments"] if argument.startswith("./tests/")},
        )
        self.assertNotIn("./tests/test_other_consumer.py", str(plan["commands"]))

    def test_explicit_tests_leave_other_selected_projects_on_inference(self):
        self.python_project()
        self.python_project("other/")
        self.write(
            "tests/test_price_consumer.py",
            "from sample.price import discounted_price\n",
        )
        plan = self.plan(
            "--files",
            "src/sample/price.py",
            "other/src/sample/price.py",
            "--tests",
            "tests/test_price.py",
        )
        commands = {Path(command["cwd"]).name: command for command in plan["commands"] if command["kind"] == "test"}
        self.assertEqual({"harness", "other"}, set(commands))
        self.assertEqual(
            ["./tests/test_price.py"],
            [argument for argument in commands["harness"]["arguments"] if argument.startswith("./tests/")],
        )
        self.assertIn("./tests/test_price.py", commands["other"]["arguments"])
        self.assertEqual([], plan["incomplete"])

    def test_explicit_tests_do_not_hide_missing_tests_in_another_project(self):
        self.python_project()
        self.python_project("other/")
        self.write("other/src/sample/new_work.py", "VALUE = 3\n")
        result = self.run_cli(
            "--files",
            "src/sample/price.py",
            "other/src/sample/new_work.py",
            "--tests",
            "tests/test_price.py",
        )
        # 다른 프로젝트의 관련 테스트 없는 파일은 그 프로젝트의 모듈 테스트로 넓힌다 — 숨기지 않는다.
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        widened = json.loads(result.stdout)["widened"]
        self.assertEqual(["other/src/sample/new_work.py"], [item["file"] for item in widened])
        calls = [json.loads(line) for line in self.records.read_text().splitlines()]
        self.assertTrue(any(call["cwd"].endswith("/other") and call["arguments"][-1] == "tests" for call in calls), calls)

    def test_missing_python_runtime_is_reported_without_installing(self):
        self.python_project()
        (self.root / ".venv-verify/bin/python").unlink()
        result = self.run_cli("--files", "src/sample/price.py")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("runtime", result.stdout)
        self.assertFalse(self.records.exists())

    def test_typescript_selects_related_vitest_and_lint_and_typecheck(self):
        self.write(
            "package.json",
            json.dumps({"devDependencies": {"vitest": "1", "typescript": "1", "oxlint": "1"}}),
        )
        self.write("tsconfig.json", "{}")
        self.write("src/prices.ts", "export const price = 3;\n")
        self.write("src/prices.test.ts", "import { price } from './prices';\n")
        self.write("src/other.test.ts", "export {};\n")
        for executable in ("vitest", "tsc", "oxlint"):
            self.fake("node_modules/.bin/" + executable)
        plan = self.plan("--files", "src/prices.ts")
        self.assertEqual(
            {"test", "lint", "typecheck"},
            {command["kind"] for command in plan["commands"]},
        )
        self.assertIn("./src/prices.test.ts", str(plan["commands"]))
        self.assertNotIn("./src/other.test.ts", str(plan["commands"]))
        self.assertNotIn("install", str(plan["commands"]))

    def test_jvm_uses_verified_qualified_test_name_in_its_module(self):
        self.write("settings.gradle.kts", 'include(":orders")\n')
        self.write("orders/build.gradle.kts", "")
        self.write("orders/src/main/kotlin/example/Price.kt", "package example\nclass Price\n")
        self.write(
            "orders/src/test/kotlin/example/PriceTest.kt",
            "package example\nclass PriceTest { val price = Price() }\n",
        )
        self.fake("gradlew")
        plan = self.plan("--files", "orders/src/main/kotlin/example/Price.kt")
        command = next(command for command in plan["commands"] if command["kind"] == "test")
        self.assertIn(":orders:test", command["arguments"])
        self.assertIn("--tests", command["arguments"])
        self.assertIn("example.PriceTest", command["arguments"])
        self.assertNotIn("check", command["arguments"])

    def test_jvm_service_wired_only_by_a_test_support_file_selects_tests_using_it(self):
        self.write("settings.gradle.kts", 'include(":orders")\n')
        self.write("orders/build.gradle.kts", "")
        self.write("orders/src/main/kotlin/example/service/PriceService.kt", "package example.service\nclass PriceService\n")
        self.write(
            "orders/src/test/kotlin/example/web/WebWorld.kt",
            "package example.web\nimport example.service.PriceService\nobject WebWorld { val service = PriceService() }\n",
        )
        self.write("orders/src/test/kotlin/example/web/PriceRestTest.kt", "package example.web\nclass PriceRestTest { val world = WebWorld }\n")
        self.write("orders/src/test/kotlin/example/web/OtherTest.kt", "package example.web\nclass OtherTest\n")
        self.fake("gradlew")
        plan = self.plan("--files", "orders/src/main/kotlin/example/service/PriceService.kt")
        command = next(command for command in plan["commands"] if command["kind"] == "test")
        self.assertIn("example.web.PriceRestTest", command["arguments"])
        self.assertNotIn("example.web.OtherTest", command["arguments"])
        self.assertEqual([], plan["incomplete"])

    def test_gradle_kotlin_build_change_needs_explicit_verification(self):
        self.write("settings.gradle.kts", 'include(":orders")\n')
        self.write("orders/build.gradle.kts", "plugins {}\n")
        self.write(
            "orders/src/test/kotlin/example/PriceTest.kt",
            "package example\nclass PriceTest {}\n",
        )
        self.fake("gradlew")
        result = self.run_cli("--files", "orders/build.gradle.kts")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn(":orders:test", result.stdout)
        self.assertNotIn("opt in to full", result.stdout)
        plan = self.plan(
            "--files",
            "orders/build.gradle.kts",
            "--tests",
            "orders/src/test/kotlin/example/PriceTest.kt",
        )
        self.assertEqual([], plan["incomplete"])
        self.assertIn("bash scripts/verify.sh --affected", str(plan["recommendations"]))

    def test_explicit_jvm_integration_test_uses_declared_class_name(self):
        self.write("settings.gradle.kts", 'include(":orders")\n')
        self.write("orders/build.gradle.kts", "")
        self.write("orders/src/main/kotlin/example/Price.kt", "package example\nclass Price\n")
        self.fake("gradlew")
        for extension, name in (
            ("kt", "ActualTransactionIT"),
            ("java", "ActualTransactionIntegrationTest"),
        ):
            with self.subTest(extension=extension):
                test = f"orders/src/test/{'kotlin' if extension == 'kt' else 'java'}/example/ServiceTenantTransactionIT.{extension}"
                self.write(test, "package example;\nclass " + name + " {}\n")
                plan = self.plan(
                    "--files",
                    "orders/src/main/kotlin/example/Price.kt",
                    "--tests",
                    test,
                )
                self.assertEqual([], plan["incomplete"])
                self.assertIn("example." + name, str(plan["commands"]))

    def test_plan_does_not_write_import_bytecode_without_environment_override(self):
        self.env.pop("PYTHONDONTWRITEBYTECODE", None)
        self.plan("--files", "README.md")
        self.assertFalse((self.root / "scripts/harness/__pycache__").exists())

    def test_dart_uses_named_test_without_pub_get(self):
        self.write("pubspec.yaml", "name: sample\n")
        self.write("lib/price.dart", "class Price {}\n")
        self.write("test/price_test.dart", "import '../lib/price.dart';\n")
        executable = self.fake("fake-bin/flutter")
        self.env["PATH"] = str(executable.parent) + os.pathsep + self.env["PATH"]
        plan = self.plan("--files", "lib/price.dart")
        self.assertIn("./test/price_test.dart", str(plan["commands"]))
        self.assertIn("--no-pub", str(plan["commands"]))
        self.assertNotIn("pub get", str(plan))

    def test_dart_package_import_maps_consumer_test(self):
        self.write("pubspec.yaml", "name: sample\n")
        self.write("lib/mapper.dart", "class Mapper {}\n")
        self.write("lib/price.dart", "import 'package:sample/mapper.dart';\n")
        self.write("test/price_test.dart", "import 'package:sample/price.dart';\n")
        executable = self.fake("fake-bin/flutter")
        self.env["PATH"] = str(executable.parent) + os.pathsep + self.env["PATH"]
        plan = self.plan("--files", "lib/mapper.dart")
        self.assertIn("./test/price_test.dart", str(plan["commands"]))

    def test_shell_script_accepts_explicit_python_regression_test(self):
        self.write("scripts/update.sh", "#!/bin/sh\nexit 0\n")
        self.write(
            "scripts/tests/test_update.py",
            "import unittest\nclass UpdateTest(unittest.TestCase):\n    def test_update(self):\n        self.assertTrue(True)\n",
        )
        plan = self.plan("--files", "scripts/update.sh", "--tests", "scripts/tests/test_update.py")
        self.assertEqual([], plan["incomplete"])
        self.assertIn("unittest", str(plan["commands"]))

    def test_shared_source_test_runs_in_an_identical_deployed_copy(self):
        self.write(".agents/harness.json", json.dumps({"unit": "root", "stack": "monorepo", "source": "tools/harness/shared"}))
        self.write(
            "tools/harness/units.json",
            json.dumps({"units": [{"id": "root", "path": ".", "stack": "monorepo"}, {"id": "child", "path": "child", "stack": "python"}]}),
        )
        self.write("child/.agents/harness.json", json.dumps({"unit": "child", "stack": "python"}))
        body = "import unittest\nclass ToolTest(unittest.TestCase):\n    def test_tool(self):\n        self.assertTrue(True)\n"
        self.write("tools/harness/shared/scripts/tests/test_tool.py", body)
        self.write("child/scripts/tests/test_tool.py", body)
        self.write("tools/harness/shared/scripts/tests/test_stale.py", body)
        self.write("child/scripts/tests/test_stale.py", body + "# 배포 전\n")
        plan = self.plan(
            "--files",
            "tools/harness/shared/scripts/tests/test_tool.py",
            "--files",
            "tools/harness/shared/scripts/tests/test_stale.py",
        )
        tests = [command for command in plan["commands"] if command["kind"] == "test"]
        self.assertEqual(1, len(tests), tests)
        self.assertEqual("child", tests[0]["unit"])
        self.assertEqual(str(self.root.resolve() / "child/scripts"), tests[0]["cwd"])
        self.assertIn(str(self.root.resolve() / "child/scripts/tests"), tests[0]["arguments"])
        self.assertIn("test_tool.py", tests[0]["arguments"])
        self.assertTrue(any("test_stale.py" in item and "sync" in item for item in plan["incomplete"]), plan["incomplete"])

    def test_registry_resolves_nested_owner_from_root_and_domain(self):
        self.write(
            "tools/harness/units.json",
            json.dumps(
                {
                    "units": [
                        {"id": "root", "path": ".", "stack": "monorepo"},
                        {"id": "domain", "path": "domain", "stack": "domain"},
                        {"id": "python", "path": "domain/worker", "stack": "python"},
                    ]
                }
            ),
        )
        self.write(
            "domain/.agents/harness.json",
            json.dumps({"unit": "domain", "stack": "domain"}),
        )
        self.write(
            "domain/worker/.agents/harness.json",
            json.dumps({"unit": "python", "stack": "python"}),
        )
        self.python_project("domain/worker/")
        root_plan = self.plan("--files", "domain/worker/src/sample/price.py")
        self.assertEqual("python", root_plan["commands"][0]["unit"])
        domain = self.root / "domain"
        shutil.copytree(self.root / "scripts", domain / "scripts")
        result = subprocess.run(
            [
                sys.executable,
                str(domain / "scripts/verify-changed.py"),
                "--files",
                "worker/src/sample/price.py",
                "--plan",
            ],
            cwd=domain,
            env=self.env,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual("python", json.loads(result.stdout)["commands"][0]["unit"])

    def test_external_paths_and_symlink_escape_are_rejected(self):
        outside = self.root.parent / "outside.py"
        outside.write_text("VALUE = 1\n")
        (self.root / "escape.py").symlink_to(outside)
        for path in ("../outside.py", str(outside), "escape.py"):
            with self.subTest(path=path):
                result = self.run_cli("--files", path, "--plan")
                self.assertEqual(2, result.returncode, result.stdout + result.stderr)
                self.assertIn("outside", result.stdout + result.stderr)

    def test_test_directory_cannot_expand_to_an_entire_suite(self):
        self.python_project()
        result = self.run_cli("--files", "src/sample/price.py", "--tests", "tests", "--plan")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("file", result.stdout + result.stderr)

    def test_base_option_cannot_be_used_for_argument_injection(self):
        result = self.run_cli("--base=--output=outside", "--plan")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("ref", result.stdout + result.stderr)

    def git(self, *arguments):
        return subprocess.run(
            ["git", "-C", str(self.root), *arguments],
            capture_output=True,
            text=True,
            check=True,
        )

    def test_git_discovery_includes_staged_deleted_untracked_and_renamed(self):
        self.git("init", "-q")
        self.write("old.md", "# old\n")
        self.write("deleted.md", "# deleted\n")
        self.git("add", "README.md", "old.md", "deleted.md")
        self.git(
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "-qm",
            "fixture",
        )
        self.git("mv", "old.md", "new.md")
        (self.root / "deleted.md").unlink()
        self.write("untracked.md", "# untracked\n")
        plan = self.plan()
        self.assertTrue({"old.md", "new.md", "deleted.md", "untracked.md"}.issubset(plan["files"]))

    def test_default_reads_changes_inside_a_registered_gitlink(self):
        self.git("init", "-q")
        nested = self.root / "domain"
        nested.mkdir()
        subprocess.run(["git", "init", "-q", str(nested)], check=True)
        self.write("domain/guide.md", "# nested\n")
        subprocess.run(["git", "-C", str(nested), "add", "guide.md"], check=True)
        subprocess.run(
            [
                "git",
                "-C",
                str(nested),
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "commit",
                "-qm",
                "fixture",
            ],
            check=True,
        )
        self.git("add", "domain")
        self.write("domain/new.md", "# new\n")
        plan = self.plan()
        self.assertIn("domain/new.md", plan["files"])

    def prepare_gitlink_change(self):
        self.git("init", "-q")
        nested = self.root / "domain"
        nested.mkdir()

        def nested_git(*arguments):
            return subprocess.run(
                ["git", "-C", str(nested), *arguments],
                capture_output=True,
                text=True,
                check=True,
            )

        nested_git("init", "-q")
        self.write("domain/guide.md", "# 원본\n")
        nested_git("add", "guide.md")
        nested_git(
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "-qm",
            "first",
        )
        self.git("add", "domain")
        self.git(
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "-qm",
            "first",
        )
        previous = self.git("rev-parse", "HEAD").stdout.strip()
        self.write("domain/guide.md", "# 변경\n")
        nested_git("add", "guide.md")
        nested_git(
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "-qm",
            "second",
        )
        self.git("add", "domain")
        self.write("domain/unowned.md", "# 다른 세션\n")
        return nested, nested_git, previous

    def test_explicit_staged_gitlink_expands_committed_files_without_dirty_paths(self):
        self.prepare_gitlink_change()
        plan = self.plan("--files", "domain")
        self.assertEqual(["domain/guide.md"], plan["files"])

    def test_push_gitlink_refs_expand_exact_old_new_pointer_diff(self):
        _, _, previous = self.prepare_gitlink_change()
        self.git(
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "-qm",
            "second",
        )
        current = self.git("rev-parse", "HEAD").stdout.strip()
        plan = self.plan("--files", "domain", "--gitlink-base", previous, "--gitlink-head", current)
        self.assertEqual(["domain/guide.md"], plan["files"])
        added = self.plan("--files", "domain", "--gitlink-base", "0" * 40, "--gitlink-head", current)
        self.assertEqual(["domain/guide.md"], added["files"])

    def test_explicit_gitlink_requires_initialized_matching_checkout(self):
        nested, nested_git, _ = self.prepare_gitlink_change()
        nested_git("add", "unowned.md")
        nested_git(
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "-qm",
            "third",
        )
        result = self.run_cli("--files", "domain", "--plan")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("checkout", result.stdout)
        (nested / ".git").rename(nested / ".git-hidden")
        result = self.run_cli("--files", "domain", "--plan")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("initialized", result.stdout)

    def test_explicit_ordinary_directory_remains_rejected(self):
        self.python_project()
        result = self.run_cli("--files", "src", "--plan")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("individual", result.stdout)

    def test_empty_changes_are_noop_not_test_pass(self):
        self.git("init", "-q")
        self.git("add", ".")
        self.git(
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "-qm",
            "fixture",
        )
        result = self.run_cli()
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn('"status": "noop"', result.stdout)
        self.assertIn('"test_commands": 0', result.stdout)

    def test_unit_git_discovery_is_relative_to_unit_and_excludes_siblings(self):
        unit = self.root / "unit"
        self.write(
            "unit/.agents/harness.json",
            json.dumps({"unit": "nested", "stack": "python"}),
        )
        self.python_project("unit/")
        shutil.copytree(self.root / "scripts", unit / "scripts")
        self.git("init", "-q")
        self.git("add", ".")
        self.git(
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "-qm",
            "first",
        )
        self.write("unit/src/sample/price.py", "PRICE = 4\n")
        self.write("README.md", "# 다른 범위\n")
        result = subprocess.run(
            [sys.executable, str(unit / "scripts/verify-changed.py"), "--plan"],
            cwd=unit,
            env=self.env,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual(["src/sample/price.py"], json.loads(result.stdout)["files"])

    def test_session_uses_only_snapshot_files_and_unknown_session_is_rejected(self):
        self.write(
            "scripts/session-coordination.py",
            "import json, sys\nif sys.argv[sys.argv.index('--session')+1] != 'owned':\n    sys.exit(2)\nprint(json.dumps({'files':['README.md']}))\n",
        )
        plan = self.plan("--session", "owned")
        self.assertEqual(["README.md"], plan["files"])
        result = self.run_cli("--session", "unknown", "--plan")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("session", result.stdout + result.stderr)

    def test_unit_session_converts_shared_root_paths_and_rejects_cross_unit_scope(self):
        unit = self.root / "unit"
        self.write(
            "unit/.agents/harness.json",
            json.dumps({"unit": "nested", "stack": "python"}),
        )
        self.write("unit/README.md", "# 설명\n")
        shutil.copytree(self.root / "scripts", unit / "scripts")
        helper = unit / "scripts/session-coordination.py"

        def query(files, shared_root):
            helper.write_text("import json\nprint(" + repr(json.dumps({"root": str(shared_root), "files": files})) + ")\n")
            return subprocess.run(
                [
                    sys.executable,
                    str(unit / "scripts/verify-changed.py"),
                    "--session",
                    "owned",
                    "--plan",
                ],
                cwd=unit,
                env=self.env,
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )

        result = query(["unit/README.md"], self.root)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual(["README.md"], json.loads(result.stdout)["files"])
        result = query(["unit/README.md", "README.md"], self.root)
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("shared root", result.stdout)
        outside = self.root.parent / "outside-harness"
        (outside / ".agents").mkdir(parents=True)
        (outside / ".agents/harness.json").write_text("{}")
        result = query(["README.md"], outside)
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("root", result.stdout)

    def test_command_failure_and_timeout_do_not_pass(self):
        self.python_project()
        self.fake(".venv-verify/bin/python", code=1, output="failure")
        result = self.run_cli("--files", "src/sample/price.py")
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        self.fake(".venv-verify/bin/python", delay=1)
        result = self.run_cli("--files", "src/sample/price.py", "--timeout", "0.1")
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        self.assertIn("timeout", result.stdout)

    def test_summary_lists_only_missing_tests_without_the_whole_plan(self):
        # Stop hook 은 이 출력을 그대로 에이전트에게 넘긴다. 파일·명령 목록 전체를 실으면 매번 수천 줄이 된다.
        self.python_project()
        shutil.rmtree(self.root / "tests")
        self.write("src/sample/new_work.py", "VALUE = 3\n")
        result = self.run_cli("--files", "src/sample/new_work.py", "--summary")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("미완료 1개", result.stdout)
        self.assertIn("new_work.py", result.stdout)
        self.assertNotIn('"commands"', result.stdout)
        self.assertNotIn('"files"', result.stdout)
        self.assertLess(len(result.stdout.splitlines()), 10)

    def test_summary_groups_missing_tests_by_reason_and_names_few_files(self):
        # 같은 이유로 수십 개가 빠지면 파일마다 한 줄씩 늘어놓지 않는다. 이유별 개수와 예시 파일 몇 개만 보인다.
        self.python_project()
        shutil.rmtree(self.root / "tests")
        names = [f"src/sample/work_{index}.py" for index in range(12)]
        for name in names:
            self.write(name, "VALUE = 3\n")
        result = self.run_cli("--files", *names, "--summary")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("미완료 12개", result.stdout)
        self.assertIn("미검증 12개", result.stdout)
        self.assertIn("외 9개", result.stdout)
        self.assertIn("--plan", result.stdout)
        self.assertNotIn("src/sample/work_", result.stdout)
        self.assertLessEqual(len(result.stdout.strip().splitlines()), 4)

    def test_summary_shows_the_tail_of_a_failed_command(self):
        self.python_project()
        self.fake(".venv-verify/bin/python", code=1, output="\n".join(f"줄 {index}" for index in range(40)) + "\n실패-원인")
        result = self.run_cli("--files", "src/sample/price.py", "--summary")
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        self.assertIn("실패-원인", result.stdout)
        self.assertNotIn("줄 0\n", result.stdout)
        self.assertNotIn('"arguments"', result.stdout)

    def test_busy_build_lock_is_skipped_and_never_reported_passed(self):
        self.python_project()
        plan = self.plan("--files", "src/sample/price.py")
        import fcntl

        lock_path = Path(plan["locks"][0])
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        with lock_path.open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.run_cli("--files", "src/sample/price.py", "--lock-timeout", "0.1")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("lock", result.stdout)
        self.assertFalse(self.records.exists())

    def test_zero_collected_tests_cannot_pass(self):
        self.python_project()
        self.fake(".venv-verify/bin/python", output="Ran 0 tests in 0.001s\nOK")
        result = self.run_cli("--files", "src/sample/price.py")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("zero", result.stdout)

    def test_nonfinite_timeouts_are_rejected(self):
        for option, value in (
            ("--timeout", "nan"),
            ("--timeout", "inf"),
            ("--lock-timeout", "nan"),
        ):
            with self.subTest(option=option, value=value):
                result = self.run_cli("--files", "README.md", option, value, "--plan")
                self.assertEqual(2, result.returncode, result.stdout + result.stderr)

    def test_markdown_checks_fences_links_and_deleted_documents(self):
        self.write("guide.md", "# 설명\n[누락](missing.md)\n```python\n")
        result = self.run_cli("--files", "guide.md", "deleted.md")
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        self.assertIn("broken link", result.stdout)
        self.assertIn("unclosed code fence", result.stdout)
        self.assertIn("deleted file", result.stdout)

    def test_changed_file_argument_is_literal_not_shell_code(self):
        self.python_project()
        dangerous = "tests/test_$(touch marker).py"
        self.write(dangerous, "def test_literal():\n    assert True\n")
        result = self.run_cli("--files", "src/sample/price.py", "--tests", dangerous)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn(dangerous, self.records.read_text())
        self.assertFalse((self.root / "marker").exists())

    def test_warning_diagnostic_does_not_change_test_result(self):
        self.python_project()
        self.write(
            "scripts/check-maintenance.py",
            "import sys\nprint('warning: review naming')\nsys.exit(1)\n",
        )
        result = self.run_cli("--files", "src/sample/price.py")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("warning: review naming", result.stdout)


if __name__ == "__main__":
    unittest.main()
