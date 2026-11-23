"""affected 레벨(HK-5) — 레벨 진입, base, 스택별 모듈 판정·역방향 닫힘, 넓힘, 상한. 실제 빌드 도구는 띄우지 않는다."""

import json
import unittest

from verify_fixture import VerifyFixture

GO_LIST = """
if sys.argv[1:2] == ['list']:
    print('example.com/shop/store fmt')
    print('example.com/shop/store [example.com/shop/store.test] fmt testing')
    print('example.com/shop/api example.com/shop/store fmt')
    print('example.com/shop/api_test [example.com/shop/api.test] example.com/shop/api example.com/shop/store testing')
    print('example.com/shop/cli fmt')
    print('example.com/shop/store.test example.com/shop/store testing')
sys.exit(0)
"""


class LevelEntryTest(VerifyFixture):
    def setUp(self):
        super().setUp()
        self.gate()

    def level_of(self, *arguments, extra=None):
        result = self.run_gate(*arguments, "--files", "README.md", "--plan", extra=extra)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        return json.loads(result.stdout)["level"]

    def test_default_and_changed_flag_select_changed(self):
        self.assertEqual("L0", self.level_of())
        self.assertEqual("L0", self.level_of("--changed"))

    def test_affected_flag_and_environment_select_affected(self):
        self.assertEqual("affected", self.level_of("--affected"))
        self.assertEqual("affected", self.level_of(extra={"HARNESS_VERIFY_LEVEL": "affected"}))

    def test_argument_wins_over_environment(self):
        self.assertEqual("L0", self.level_of("--changed", extra={"HARNESS_VERIFY_LEVEL": "affected"}))
        self.assertEqual("affected", self.level_of("--affected", extra={"HARNESS_VERIFY_LEVEL": "fast"}))

    def test_fast_runs_the_stack_body(self):
        result = self.run_gate("--fast")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("body fast", result.stdout)

    def test_unknown_level_is_rejected(self):
        result = self.run_gate(extra={"HARNESS_VERIFY_LEVEL": "bogus"})
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("bogus", result.stderr)
        self.assertNotIn("body", result.stdout)


class GradleAffectedTest(VerifyFixture):
    def setUp(self):
        super().setUp()
        self.write(
            "settings.gradle.kts",
            'rootProject.name = "shop"\n// include(":ignored")\ninclude(":lib", ":orders", ":admin-api")\ninclude(":web")\ninclude(":tools")\n'
            'project(":web").projectDir = file("apps/web-app")\n',
        )
        self.write("lib/build.gradle.kts", "plugins { kotlin(\"jvm\") }\n")
        self.write("orders/build.gradle.kts", "dependencies { api(project(':lib')) }\n")
        self.write("admin-api/build.gradle.kts", 'dependencies { implementation(project(":orders")) }\n')
        self.write("apps/web-app/build.gradle.kts", "dependencies { testImplementation(projects.adminApi) }\n")
        self.write("tools/build.gradle.kts", "")
        self.write("lib/src/main/kotlin/shop/Lib.kt", "package shop\nclass Lib\n")
        self.write("tools/src/main/kotlin/shop/Tool.kt", "package shop\nclass Tool\n")
        self.fake("gradlew")

    def gradle_tasks(self, plan):
        commands = self.commands(plan, "test")
        self.assertEqual(1, len(commands), plan)
        return commands[0]["arguments"]

    def test_change_selects_module_and_transitive_consumers(self):
        plan = self.plan("--level", "affected", "--files", "lib/src/main/kotlin/shop/Lib.kt")
        arguments = self.gradle_tasks(plan)
        for task in (":lib:check", ":orders:check", ":admin-api:check", ":web:check"):
            self.assertIn(task, arguments)
        self.assertNotIn(":tools:check", arguments)
        for flag in ("--continue", "--console=plain", "--no-daemon", "--dependency-verification=strict"):
            self.assertIn(flag, arguments)
        self.assertEqual("affected", plan["level"])
        self.assertEqual([], plan["incomplete"], plan)
        self.assertFalse(self.records.exists(), "--plan must not launch Gradle")

    def test_leaf_module_change_does_not_select_its_dependencies(self):
        plan = self.plan("--level", "affected", "--files", "tools/src/main/kotlin/shop/Tool.kt")
        arguments = self.gradle_tasks(plan)
        self.assertIn(":tools:check", arguments)
        self.assertNotIn(":lib:check", arguments)

    def test_module_build_file_selects_that_module(self):
        plan = self.plan("--level", "affected", "--files", "admin-api/build.gradle.kts")
        arguments = self.gradle_tasks(plan)
        self.assertIn(":admin-api:check", arguments)
        self.assertIn(":web:check", arguments)
        self.assertNotIn(":orders:check", arguments)
        self.assertFalse([item for item in plan["widened"] if item.get("reason") == "build-contract"], plan["widened"])

    def test_build_contract_change_widens_to_the_build_root(self):
        self.write("gradle/libs.versions.toml", "[versions]\nkotlin = '2.0.0'\n")
        plan = self.plan("--level", "affected", "--files", "gradle/libs.versions.toml")
        arguments = self.gradle_tasks(plan)
        self.assertIn("check", arguments)
        self.assertFalse([argument for argument in arguments if argument.endswith(":check")], arguments)
        widened = [item for item in plan["widened"] if item.get("reason") == "build-contract"]
        self.assertEqual("gradle/libs.versions.toml", widened[0]["file"], plan["widened"])

    def test_groovy_include_without_parentheses(self):
        (self.root / "settings.gradle.kts").unlink()
        self.write("settings.gradle", "include ':lib', ':orders'\n")
        plan = self.plan("--level", "affected", "--files", "lib/src/main/kotlin/shop/Lib.kt")
        arguments = self.gradle_tasks(plan)
        self.assertIn(":lib:check", arguments)
        self.assertIn(":orders:check", arguments)

    def test_dynamic_settings_fall_back_to_the_init_script_graph_once(self):
        self.write("settings.gradle.kts", 'val modules = listOf(":lib", ":orders")\ninclude(*modules.toTypedArray())\n')
        root = str(self.root)
        graph = [
            {"path": ":", "projectDir": root, "projectDeps": []},
            {"path": ":lib", "projectDir": root + "/lib", "projectDeps": []},
            {"path": ":orders", "projectDir": root + "/orders", "projectDeps": [":lib"]},
        ]
        self.fake("gradlew", output="> Task :harnessProjectGraph\nHARNESS_GRAPH " + json.dumps(graph))
        for _ in range(2):
            plan = self.plan("--level", "affected", "--files", "lib/src/main/kotlin/shop/Lib.kt")
            arguments = self.gradle_tasks(plan)
            self.assertIn(":orders:check", arguments)
        graph_calls = [call for call in self.calls() if "harnessProjectGraph" in call["arguments"]]
        self.assertEqual(1, len(graph_calls), graph_calls)
        self.assertTrue(any("--init-script" in argument for argument in graph_calls[0]["arguments"]))


class ScriptWorkspaceAffectedTest(VerifyFixture):
    def pnpm_workspace(self):
        self.write("pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n  - \"apps/*\"\n")
        self.write("package.json", json.dumps({"name": "root", "private": True}))
        self.write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n")
        self.write("packages/ui/package.json", json.dumps({"name": "@acme/ui"}))
        self.write("packages/ui/src/button.ts", "export const button = 1;\n")
        self.write("apps/web/package.json", json.dumps({"name": "@acme/web", "dependencies": {"@acme/ui": "workspace:*"}}))
        self.write("apps/admin/package.json", json.dumps({"name": "@acme/admin"}))
        self.fake_tool("pnpm", "sys.exit(0)\n")

    def test_pnpm_filters_each_script_by_dependents(self):
        self.pnpm_workspace()
        plan = self.plan("--level", "affected", "--files", "packages/ui/src/button.ts")
        commands = self.commands(plan)
        scripts = [command["arguments"][-1] for command in commands if "--filter" in command["arguments"]]
        self.assertEqual(["lint", "typecheck", "test"], scripts, commands)
        for command in commands:
            if "--filter" not in command["arguments"]:
                continue
            self.assertIn("...@acme/ui", command["arguments"])
            self.assertNotIn("...@acme/admin", command["arguments"])
            for flag in ("--workspace-concurrency=4", "-r", "run", "--if-present"):
                self.assertIn(flag, command["arguments"])
        module = next(item for item in plan["modules"] if item["stack"] == "pnpm")
        self.assertEqual(["@acme/ui", "@acme/web"], module["selected"])

    def test_pnpm_lockfile_change_runs_every_package(self):
        self.pnpm_workspace()
        plan = self.plan("--level", "affected", "--files", "pnpm-lock.yaml")
        commands = [command for command in self.commands(plan) if "run" in command["arguments"]]
        self.assertEqual(3, len(commands), plan["commands"])
        self.assertFalse([command for command in commands if "--filter" in command["arguments"]])
        self.assertTrue([item for item in plan["widened"] if item.get("reason") == "build-contract"])

    def test_npm_workspace_lists_dependent_workspaces(self):
        self.write("package.json", json.dumps({"name": "root", "workspaces": ["packages/*"]}))
        self.write("packages/a/package.json", json.dumps({"name": "a"}))
        self.write("packages/a/index.js", "module.exports = 1;\n")
        self.write("packages/b/package.json", json.dumps({"name": "b", "dependencies": {"a": "*"}}))
        self.write("packages/c/package.json", json.dumps({"name": "c"}))
        self.fake_tool("npm", "sys.exit(0)\n")
        plan = self.plan("--level", "affected", "--files", "packages/a/index.js")
        commands = [command for command in self.commands(plan) if "--if-present" in command["arguments"]]
        self.assertEqual(3, len(commands), plan["commands"])
        for command in commands:
            self.assertIn("--workspace=a", command["arguments"])
            self.assertIn("--workspace=b", command["arguments"])
            self.assertNotIn("--workspace=c", command["arguments"])


class PythonAndGoAffectedTest(VerifyFixture):
    def uv_workspace(self):
        self.write("pyproject.toml", "[tool.uv.workspace]\nmembers = ['libs/*', 'apps/*']\n[tool.ruff]\nline-length = 100\n")
        self.write("libs/core/pyproject.toml", "[project]\nname = 'core'\nversion = '0.1.0'\n")
        self.write("libs/core/src/core/price.py", "def price():\n    return 1\n")
        self.write("libs/core/tests/test_price.py", "def test_price():\n    assert True\n")
        self.write(
            "apps/api/pyproject.toml",
            "[project]\nname = 'api'\nversion = '0.1.0'\ndependencies = ['core>=0.1']\n[tool.uv.sources]\ncore = { workspace = true }\n",
        )
        self.write("apps/api/tests/test_api.py", "def test_api():\n    assert True\n")
        self.write("apps/cli/pyproject.toml", "[project]\nname = 'cli'\nversion = '0.1.0'\ndependencies = ['core']\n")
        self.write("apps/cli/tests/test_cli.py", "def test_cli():\n    assert True\n")
        self.fake(".venv-verify/bin/python")

    def test_uv_member_change_selects_workspace_dependents_only(self):
        self.uv_workspace()
        plan = self.plan("--level", "affected", "--files", "libs/core/src/core/price.py")
        pytest = next(command for command in self.commands(plan, "test") if "pytest" in command["arguments"])
        self.assertIn("libs/core/tests", pytest["arguments"])
        self.assertIn("apps/api/tests", pytest["arguments"])
        self.assertNotIn("apps/cli/tests", pytest["arguments"])
        self.assertTrue(pytest["arguments"][0].endswith(".venv-verify/bin/python"))
        lint = [command for command in self.commands(plan, "lint") if "ruff" in command["arguments"]]
        self.assertTrue(lint, plan["commands"])

    def go_module(self):
        self.write("go.mod", "module example.com/shop\n\ngo 1.22\n")
        self.write("store/store.go", "package store\n")
        self.write("store/store_test.go", "package store\n")
        self.write("api/api.go", "package api\n")
        self.write("cli/cli.go", "package cli\n")
        self.fake_tool("go", GO_LIST)

    def test_go_change_selects_packages_that_depend_on_it(self):
        self.go_module()
        plan = self.plan("--level", "affected", "--files", "store/store.go")
        commands = {command["arguments"][1]: command["arguments"] for command in self.commands(plan) if command["arguments"][1] in {"vet", "test"}}
        self.assertEqual({"vet", "test"}, set(commands), plan["commands"])
        self.assertIn("-race", commands["test"])
        for arguments in commands.values():
            self.assertIn("example.com/shop/store", arguments)
            self.assertIn("example.com/shop/api", arguments)
            self.assertNotIn("example.com/shop/cli", arguments)

    def test_go_mod_change_widens_to_every_package(self):
        self.go_module()
        plan = self.plan("--level", "affected", "--files", "go.mod")
        arguments = [command["arguments"] for command in self.commands(plan) if command["arguments"][1:2] == ["test"]]
        self.assertEqual(1, len(arguments), plan["commands"])
        self.assertIn("./...", arguments[0])


class BaseAndScopeTest(VerifyFixture):
    def repository(self):
        self.init_repo()
        self.write("docs/base.md", "# base\n")
        self.commit_all()

    def test_change_set_is_merge_base_plus_work_tree(self):
        self.repository()
        self.publish()
        self.git("checkout", "-q", "-b", "feat/HK-5-x")
        self.write("docs/committed.md", "# 커밋\n")
        self.commit_all("feature")
        self.write("docs/base.md", "# 고침\n")
        self.write("docs/untracked.md", "# 새 파일\n")
        plan = self.plan("--level", "affected")
        self.assertEqual({"docs/base.md", "docs/committed.md", "docs/untracked.md"}, set(plan["files"]))
        self.assertEqual("origin/develop", plan["base"]["ref"])
        self.assertEqual(self.git("rev-parse", "origin/develop").stdout.strip(), plan["base"]["mergeBase"])

    def test_meta_git_base_and_local_branch_fallback(self):
        self.write(".agents/harness-kit.json", json.dumps({"git": {"base": "main"}}))
        self.repository()
        self.git("branch", "main")
        self.git("checkout", "-q", "-b", "feat/HK-5-y")
        self.write("docs/new.md", "# 새\n")
        plan = self.plan("--level", "affected")
        self.assertEqual("main", plan["base"]["ref"])
        self.assertEqual(["docs/new.md"], plan["files"])

    def test_missing_base_ref_is_incomplete_with_fetch_hint(self):
        self.init_repo(branch="trunk")
        self.commit_all()
        result = self.run_cli("--level", "affected")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn("base ref 없음: origin/develop — git fetch origin develop 뒤 다시 실행", result.stdout)
        self.assertIn('"incomplete"', result.stdout)

    def test_unresolvable_file_stays_scoped_and_never_runs_full(self):
        self.write("tools/render.py", "def render():\n    return 1\n")
        self.write("tools/tests/test_render.py", "from render import render\n\ndef test_render():\n    assert render() == 1\n")
        plan = self.plan("--level", "affected", "--files", "tools/render.py")
        tests = self.commands(plan, "test")
        self.assertTrue(any("test_render.py" in " ".join(command["arguments"]) for command in tests), plan["commands"])
        self.assertNotIn("full", json.dumps(plan["commands"]))
        self.assertFalse(self.commands(plan, "gate"))

    def test_unit_outside_kit_stacks_runs_its_own_gate_with_parent(self):
        self.write("desktop/.agents/harness.json", json.dumps({"unit": "desktop", "stack": "tauri"}))
        self.write("desktop/scripts/verify.sh", "#!/usr/bin/env bash\nexit 0\n")
        self.write("desktop/src/main.rs", "fn main() {}\n")
        plan = self.plan("--level", "affected", "--files", "desktop/src/main.rs")
        gates = self.commands(plan, "gate")
        self.assertEqual(1, len(gates), plan["commands"])
        self.assertEqual(str(self.root / "desktop"), gates[0]["cwd"])
        self.assertEqual({"HARNESS_VERIFY_LEVEL": "full", "HARNESS_VERIFY_PARENT": "affected"}, gates[0]["env"])
        self.assertIn({"reason": "no-module-graph", "unit": "desktop"}, plan["widened"])

    def test_budget_stops_remaining_commands(self):
        self.write("pyproject.toml", "[project]\nname='sample'\nversion='0.1.0'\n[dependency-groups]\ndev=['pytest','ruff']\n")
        self.write("src/sample/price.py", "def price():\n    return 1\n")
        self.write("tests/test_price.py", "def test_price():\n    assert True\n")
        # 첫 명령이 전체 상한보다 오래 걸린다 — 그 뒤 명령은 시각과 상관없이 돌지 않는다.
        self.fake(".venv-verify/bin/python", delay=0.6)
        result = self.run_cli("--level", "affected", "--files", "src/sample/price.py", "--budget", "0.3")
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual("incomplete", report["status"])
        self.assertEqual(2, len([item for item in report["skipped"] if "budget 0.3s exceeded" in item]), report["skipped"])
        self.assertEqual(1, len(self.calls()))

    def test_summary_names_the_affected_level(self):
        self.write("docs/a.md", "# a\n")
        result = self.run_cli("--level", "affected", "--files", "docs/a.md", "--summary")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("(affected)", result.stdout.splitlines()[0])


if __name__ == "__main__":
    unittest.main()
