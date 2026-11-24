"""관련 테스트를 못 찾을 때(HK-4 R3) — 모듈 시험으로 넓히거나 unverified 로 보고하고, full 을 권하지 않는다."""

import json
import shutil
import unittest

from verify_fixture import VerifyFixture

UNVERIFIED_TEXT = "관련 테스트와 모듈 테스트가 없다. 테스트를 추가하거나 --tests 로 지정한다"


class ModuleTestWideningTest(VerifyFixture):
    def python_project(self, with_tests=True):
        self.write("pyproject.toml", "[project]\nname='sample'\nversion='0.1.0'\n[dependency-groups]\ndev=['pytest']\n")
        self.write("src/sample/price.py", "def price():\n    return 1\n")
        self.write("src/sample/new_work.py", "VALUE = 3\n")
        if with_tests:
            self.write("tests/test_price.py", "from sample.price import price\ndef test_price():\n    assert price() == 1\n")
        self.fake(".venv-verify/bin/python")

    def assert_no_full(self, result):
        self.assertNotIn("full", (result.stdout + result.stderr).replace("full suite", ""))

    def test_python_file_without_related_test_runs_its_module_tests(self):
        self.python_project()
        result = self.run_cli("--files", "src/sample/new_work.py")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual([{"file": "src/sample/new_work.py", "module": ".", "test": "tests", "reason": "no-related-test"}], report["widened"])
        pytest = [call["arguments"] for call in self.calls() if "pytest" in call["arguments"]]
        self.assertEqual(1, len(pytest), pytest)
        self.assertEqual("tests", pytest[0][-1])
        self.assert_no_full(result)

    def test_module_without_tests_is_unverified_with_exit_2(self):
        self.python_project(with_tests=False)
        result = self.run_cli("--files", "src/sample/new_work.py", "--summary")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("미완료 1개", result.stdout)
        self.assertIn(f"- 미검증 1개: new_work.py — {UNVERIFIED_TEXT}", result.stdout)
        self.assertFalse(self.calls(), "unverified plan must not run commands")
        plan = self.plan("--files", "src/sample/new_work.py")
        self.assertEqual([{"file": "src/sample/new_work.py", "reason": "no-module-test"}], plan["unverified"])
        self.assertEqual("plan", plan["status"])
        self.assert_no_full(result)

    def test_module_test_that_runs_zero_tests_is_unverified(self):
        self.python_project()
        self.fake(".venv-verify/bin/python", output="collected 0 items")
        result = self.run_cli("--files", "src/sample/new_work.py")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual("incomplete", report["status"])
        self.assertEqual([{"file": "src/sample/new_work.py", "reason": "zero-tests"}], report["unverified"])

    def gradle_project(self, with_tests=True):
        self.write("settings.gradle.kts", 'include(":orders")\n')
        self.write("orders/build.gradle.kts", "")
        self.write("orders/src/main/kotlin/example/Mapper.kt", "package example\nclass Mapper\n")
        if with_tests:
            self.write("orders/src/test/kotlin/example/OtherTest.kt", "package example\nclass OtherTest\n")
        self.fake("gradlew")

    def test_jvm_file_without_related_test_runs_its_gradle_module_test(self):
        self.gradle_project()
        plan = self.plan("--files", "orders/src/main/kotlin/example/Mapper.kt")
        tests = [command["arguments"] for command in self.commands(plan, "test")]
        self.assertIn([str(self.root / "gradlew"), ":orders:test", "--no-daemon", "--console=plain", "--dependency-verification=strict"], tests)
        self.assertEqual(":orders:test", plan["widened"][0]["test"])
        self.assertEqual([], plan["unverified"])

    def test_jvm_module_without_test_sources_is_unverified(self):
        self.gradle_project(with_tests=False)
        plan = self.plan("--files", "orders/src/main/kotlin/example/Mapper.kt")
        self.assertEqual([{"file": "orders/src/main/kotlin/example/Mapper.kt", "reason": "no-module-test"}], plan["unverified"])

    def test_go_file_selects_its_package_tests_and_untested_package_is_unverified(self):
        self.write("go.mod", "module example.com/shop\n")
        self.write("store/store.go", "package store\n")
        self.write("store/store_test.go", "package store\n")
        self.write("cli/cli.go", "package cli\n")
        self.fake_tool("go", "sys.exit(0)\n")
        plan = self.plan("--files", "store/store.go", "cli/cli.go")
        tests = [command["arguments"][1:] for command in self.commands(plan, "test")]
        self.assertIn(["test", "./store"], tests)
        self.assertEqual([{"file": "cli/cli.go", "reason": "no-module-test"}], plan["unverified"])

    def test_package_script_test_is_the_module_test(self):
        self.write("pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n")
        self.write("package.json", json.dumps({"name": "root", "private": True}))
        self.write("packages/ui/package.json", json.dumps({"name": "@acme/ui", "scripts": {"test": "vitest run"}}))
        self.write("packages/ui/src/button.ts", "export const button = 1;\n")
        self.write("packages/ui/src/other.test.ts", "export {};\n")
        self.fake_tool("pnpm", "sys.exit(0)\n")
        plan = self.plan("--files", "packages/ui/src/button.ts")
        tests = [command["arguments"][1:] for command in self.commands(plan, "test")]
        self.assertIn(["--filter", "@acme/ui", "run", "--if-present", "test"], tests)

    def test_build_contract_at_changed_points_to_affected(self):
        self.gradle_project()
        result = self.run_cli("--files", "settings.gradle.kts", "--summary")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("bash scripts/verify.sh --affected", result.stdout)
        self.assert_no_full(result)

    def test_summary_lists_widened_files_and_stays_short(self):
        self.python_project()
        names = [f"src/sample/work_{index}.py" for index in range(12)]
        for name in names:
            self.write(name, "VALUE = 3\n")
        result = self.run_cli("--files", *names, "--summary")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("넓힘 12개: work_0.py → tests, work_1.py → tests, work_10.py → tests 외 9개", result.stdout)
        self.assertLessEqual(len(result.stdout.splitlines()), 40)

    def test_many_unverified_files_are_grouped(self):
        self.python_project(with_tests=False)
        names = [f"src/sample/work_{index}.py" for index in range(12)]
        for name in names:
            self.write(name, "VALUE = 3\n")
        result = self.run_cli("--files", *names, "--summary")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("미완료 12개", result.stdout)
        self.assertIn("- 미검증 12개: work_0.py, work_1.py, work_10.py 외 9개 — ", result.stdout)
        self.assertNotIn("src/sample/work_", result.stdout)
        self.assertLessEqual(len(result.stdout.strip().splitlines()), 4)

    def test_missing_test_runtime_is_incomplete_not_unverified(self):
        self.python_project()
        shutil.rmtree(self.root / ".venv-verify")
        plan = self.plan("--files", "src/sample/new_work.py")
        self.assertTrue(any("runtime" in item for item in plan["incomplete"]), plan["incomplete"])


if __name__ == "__main__":
    unittest.main()
