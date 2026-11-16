"""git hook(scripts/git-hooks)과 설치 스크립트 회귀 테스트.

임시 리포에서 가짜 전역 설정(GIT_CONFIG_GLOBAL)과 가짜 게이트로 돌려 사용자 설정과 실제 게이트를 건드리지 않는다.
"""

import json
import os
import random
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOOK_FILES = (
    "scripts/git-hooks/pre-commit",
    "scripts/git-hooks/pre-push",
    "scripts/git-hooks/global-hook.sh",
    "scripts/install-git-hooks.sh",
)
# 받은 레벨과, git 이 hook 에 넘긴 리포 로컬 변수 중 게이트까지 남은 것을 기록한다.
FAKE_GATE = """#!/usr/bin/env bash
leaked="$(env | grep -E '^GIT_(DIR|INDEX_FILE|WORK_TREE)=' | cut -d= -f1 | tr '\\n' ' ')"
echo "gate level=$HARNESS_VERIFY_LEVEL leaked=$leaked" >> "$CALLS"
exit "${GATE_EXIT:-0}"
"""
GATE_FAST = "gate level=fast leaked="
GATE_FULL = "gate level=full leaked="


class GitHooksTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="git hooks ")
        self.addCleanup(directory.cleanup)
        self.base = Path(directory.name)
        self.calls = self.base / "calls.log"
        self.global_hooks = self.base / "global hooks"
        self.global_hooks.mkdir()
        self.gitconfig = self.base / "gitconfig"
        self.write_gitconfig(str(self.global_hooks))
        # hook 안에서 이 테스트가 돌 때 git 이 넘긴 변수가 임시 리포의 git 을 실제 리포로 돌리지 않게 뺀다.
        # 상위 full/changed 게이트의 레벨은 격리 리포의 기본 hook 정책을 바꾸지 않는다.
        inherited = {key: value for key, value in os.environ.items() if not key.startswith("GIT_") and key != "HARNESS_VERIFY_LEVEL"}
        self.env = {
            **inherited,
            "GIT_CONFIG_GLOBAL": str(self.gitconfig),
            "GIT_CONFIG_NOSYSTEM": "1",
            "HOME": str(self.base),
            "CALLS": str(self.calls),
            "TMPDIR": str(self.base),
        }
        self.changes = 0
        self.repo = self.make_repo(self.base / "repo")

    def write_gitconfig(self, hooks_path):
        lines = ["[user]", "\tname = harness test", "\temail = harness@example.com"]
        lines += ["[init]", "\tdefaultBranch = main", '[protocol "file"]', "\tallow = always"]
        if hooks_path is not None:
            lines += ["[core]", f"\thooksPath = {hooks_path}"]
        self.gitconfig.write_text("\n".join(lines) + "\n")

    def git(self, *args, cwd=None, check=True):
        result = subprocess.run(["git", *args], cwd=cwd or self.repo, env=self.env, input="", capture_output=True, text=True, timeout=60)
        if check:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def make_repo(self, path):
        path.mkdir(parents=True)
        self.git("init", "-q", cwd=path)
        for relative in HOOK_FILES:
            target = path / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / relative, target)
        gate = path / "scripts/verify.sh"
        gate.write_text(FAKE_GATE)
        gate.chmod(0o755)
        self.git("add", ".", cwd=path)
        self.git("commit", "-q", "--no-verify", "-m", "init", cwd=path)
        return path

    def install(self, *args, root=None):
        script = (root or self.repo) / "scripts/install-git-hooks.sh"
        return subprocess.run(
            ["bash", str(script), *args],
            cwd=self.base,
            env=self.env,
            input="",
            capture_output=True,
            text=True,
            timeout=60,
        )

    def local_hooks_path(self, repo=None):
        return self.git("config", "--local", "--get", "core.hooksPath", cwd=repo or self.repo, check=False).stdout.strip()

    def write_global(self, name, code=0):
        reads = ' stdin=$(tr "\\n" ";")' if name == "pre-push" else ""
        hook = self.global_hooks / name
        hook.write_text(f'#!/usr/bin/env bash\necho "global-{name} args=$*{reads}" >> "$CALLS"\nexit {code}\n')
        hook.chmod(0o755)

    def write_changed_gate(self):
        gate = self.repo / "scripts/verify-changed.py"
        gate.write_text(
            "import json, os, sys\n"
            "with open(os.environ['CALLS'], 'a') as output:\n"
            "    output.write('changed ' + json.dumps(sys.argv[1:]) + '\\n')\n"
            "sys.exit(int(os.environ.get('GATE_EXIT', '0')))\n"
        )

    def changed_arguments(self):
        return [json.loads(line.removeprefix("changed ")) for line in self.logged() if line.startswith("changed ")]

    def logged(self):
        return self.calls.read_text().splitlines() if self.calls.exists() else []

    def commit(self, check=True):
        self.changes += 1
        (self.repo / "change.txt").write_text(f"{self.changes}\n")
        self.git("add", "change.txt")
        return self.git("commit", "-q", "-m", f"change {self.changes}", check=check)

    def add_remote(self):
        remote = self.base / "remote.git"
        self.git("init", "-q", "--bare", str(remote), cwd=self.base)
        self.git("remote", "add", "origin", str(remote))
        return remote

    def assert_ok(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_install_sets_only_the_local_hooks_path(self):
        before = self.gitconfig.read_text()
        self.assert_ok(self.install())
        self.assertEqual("scripts/git-hooks", self.local_hooks_path())
        self.assertEqual(before, self.gitconfig.read_text())

    def test_commit_runs_the_global_hook_then_the_fast_gate(self):
        self.write_global("pre-commit")
        self.assert_ok(self.install())
        self.commit()
        self.assertEqual(["global-pre-commit args=", GATE_FAST], self.logged())

    def test_failing_gate_stops_the_commit(self):
        self.assert_ok(self.install())
        head = self.git("rev-parse", "HEAD").stdout
        self.env["GATE_EXIT"] = "1"
        self.assertNotEqual(0, self.commit(check=False).returncode)
        self.assertEqual(head, self.git("rev-parse", "HEAD").stdout)

    def test_failing_global_hook_stops_the_commit_before_the_gate(self):
        self.write_global("pre-commit", code=1)
        self.assert_ok(self.install())
        self.assertNotEqual(0, self.commit(check=False).returncode)
        self.assertEqual(["global-pre-commit args="], self.logged())

    def test_push_passes_arguments_and_refs_to_the_global_hook_and_runs_legacy_fast_gate(self):
        remote = self.add_remote()
        self.write_global("pre-push")
        self.assert_ok(self.install())
        self.git("push", "-q", "origin", "main")
        logged = self.logged()
        self.assertEqual(2, len(logged), logged)
        self.assertTrue(logged[0].startswith(f"global-pre-push args=origin {remote} stdin="), logged)
        self.assertIn("refs/heads/main", logged[0])
        self.assertEqual(GATE_FAST, logged[1])

    def test_commit_changed_gate_receives_staged_paths_and_excludes_other_dirty_files(self):
        self.write_changed_gate()
        (self.repo / "staged file.py").write_text("value = 1\n")
        (self.repo / "other session.py").write_text("value = 2\n")
        self.git("add", "staged file.py")
        result = subprocess.run(
            ["bash", "scripts/git-hooks/pre-commit"],
            cwd=self.repo,
            env=self.env,
            input="",
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assert_ok(result)
        self.assertEqual([["--files", "staged file.py"]], self.changed_arguments())

    def test_commit_full_gate_is_explicit_and_keeps_other_session_work(self):
        self.write_changed_gate()
        dirty = self.repo / "other session.py"
        dirty.write_text("value = 2\n")
        result = subprocess.run(
            ["bash", "scripts/git-hooks/pre-commit"],
            cwd=self.repo,
            env={**self.env, "HARNESS_VERIFY_LEVEL": "full"},
            input="",
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assert_ok(result)
        self.assertEqual([GATE_FULL], self.logged())
        self.assertEqual("value = 2\n", dirty.read_text())

    def test_push_changed_gate_uses_pushed_range_and_excludes_other_dirty_files(self):
        before = self.git("rev-parse", "HEAD").stdout.strip()
        self.commit()
        after = self.git("rev-parse", "HEAD").stdout.strip()
        self.calls.unlink(missing_ok=True)
        self.write_changed_gate()
        (self.repo / "other session.py").write_text("value = 2\n")
        result = subprocess.run(
            ["bash", "scripts/git-hooks/pre-push", "origin", "unused"],
            cwd=self.repo,
            env=self.env,
            input=f"refs/heads/main {after} refs/heads/main {before}\n",
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assert_ok(result)
        self.assertEqual([["--files", "change.txt", "--gitlink-base", before, "--gitlink-head", after]], self.changed_arguments())

    def test_multiple_push_refs_keep_each_gitlink_comparison_scope(self):
        before = self.git("rev-parse", "HEAD").stdout.strip()
        self.commit()
        middle = self.git("rev-parse", "HEAD").stdout.strip()
        (self.repo / "feature.txt").write_text("feature\n")
        self.git("add", "feature.txt")
        self.git("commit", "-q", "--no-verify", "-m", "fixture feature")
        after = self.git("rev-parse", "HEAD").stdout.strip()
        self.calls.unlink(missing_ok=True)
        self.write_changed_gate()
        refs = f"refs/heads/main {middle} refs/heads/main {before}\nrefs/heads/feature {after} refs/heads/feature {middle}\n"
        result = subprocess.run(
            ["bash", "scripts/git-hooks/pre-push", "origin", "unused"],
            cwd=self.repo,
            env=self.env,
            input=refs,
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assert_ok(result)
        self.assertEqual(
            [
                ["--files", "change.txt", "--gitlink-base", before, "--gitlink-head", middle],
                ["--files", "feature.txt", "--gitlink-base", middle, "--gitlink-head", after],
            ],
            self.changed_arguments(),
        )

    def test_push_full_gate_requires_explicit_level(self):
        self.write_changed_gate()
        head = self.git("rev-parse", "HEAD").stdout.strip()
        result = subprocess.run(
            ["bash", "scripts/git-hooks/pre-push", "origin", "unused"],
            cwd=self.repo,
            env={**self.env, "HARNESS_VERIFY_LEVEL": "full"},
            input=f"refs/heads/main {head} refs/heads/main {'0' * 40}\n",
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assert_ok(result)
        self.assertEqual([GATE_FULL], self.logged())

    def test_delete_only_push_skips_the_gate(self):
        self.add_remote()
        self.git("push", "-q", "origin", "main", "main:feature")
        self.write_global("pre-push")
        self.assert_ok(self.install())
        self.git("push", "-q", "origin", "--delete", "feature")
        logged = self.logged()
        self.assertEqual(1, len(logged), logged)
        self.assertTrue(logged[0].startswith("global-pre-push"), logged)

    def test_failing_gate_stops_the_push(self):
        remote = self.add_remote()
        self.assert_ok(self.install())
        self.env["GATE_EXIT"] = "1"
        result = self.git("push", "-q", "origin", "main", check=False)
        self.assertNotEqual(0, result.returncode)
        refs = self.git("ls-remote", str(remote), cwd=self.base).stdout
        self.assertNotIn("refs/heads/main", refs)

    def test_failing_global_pre_push_stops_the_push_before_the_gate(self):
        self.add_remote()
        self.write_global("pre-push", code=1)
        self.assert_ok(self.install())
        self.assertNotEqual(0, self.git("push", "-q", "origin", "main", check=False).returncode)
        self.assertEqual([], [line for line in self.logged() if line.startswith("gate ")])

    def test_global_path_set_through_an_include_is_followed(self):
        # 전역 설정이 [include] 로 hooksPath 를 가져오면 --get 만으로는 보이지 않는다.
        included = self.base / "included.gitconfig"
        included.write_text(f"[core]\n\thooksPath = {self.global_hooks}\n")
        self.write_gitconfig(None)
        with self.gitconfig.open("a") as config:
            config.write(f"[include]\n\tpath = {included}\n")
        self.write_global("pre-commit")
        installed = self.install()
        self.assert_ok(installed)
        self.assertIn(str(self.global_hooks), installed.stdout)
        self.commit()
        self.assertEqual(["global-pre-commit args=", GATE_FAST], self.logged())

    def test_push_with_no_refs_skips_the_gate(self):
        result = subprocess.run(
            ["bash", "scripts/git-hooks/pre-push", "origin", "unused"],
            cwd=self.repo,
            env=self.env,
            input="",
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assert_ok(result)
        self.assertEqual([], self.logged())

    def test_without_a_global_hooks_path_only_the_gate_runs(self):
        self.write_gitconfig(None)
        installed = self.install()
        self.assert_ok(installed)
        self.assertIn("없음", installed.stdout)
        self.commit()
        self.assertEqual([GATE_FAST], self.logged())

    def test_global_path_pointing_at_the_repository_hooks_is_not_called_again(self):
        self.write_gitconfig(str(self.repo / "scripts/git-hooks"))
        self.assert_ok(self.install())
        self.commit()
        self.assertEqual([GATE_FAST], self.logged())

    def test_global_path_with_a_tilde_is_expanded(self):
        self.write_gitconfig("~/global hooks")
        self.write_global("pre-commit")
        self.assert_ok(self.install())
        self.commit()
        self.assertEqual(["global-pre-commit args=", GATE_FAST], self.logged())

    def test_install_refuses_below_the_repository_top(self):
        unit = self.repo / "unit"
        for relative in HOOK_FILES:
            target = unit / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / relative, target)
        result = self.install(root=unit)
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        self.assertIn("최상위", result.stderr)
        self.assertEqual("", self.local_hooks_path())

    def test_install_twice_gives_the_same_configuration_and_status(self):
        first = self.install()
        second = self.install()
        self.assert_ok(first)
        self.assert_ok(second)
        self.assertEqual(first.stdout, second.stdout)
        self.assertEqual("scripts/git-hooks", self.local_hooks_path())

    def test_install_reports_a_replaced_value(self):
        self.git("config", "--local", "core.hooksPath", "other-hooks")
        result = self.install()
        self.assert_ok(result)
        self.assertIn("other-hooks → scripts/git-hooks", result.stdout)

    def test_install_is_idempotent_for_any_number_of_runs(self):
        rng = random.Random(87)
        reference = self.install().stdout
        for _ in range(3):
            runs = [self.install() for _ in range(rng.randint(1, 4))]
            for run in runs:
                self.assert_ok(run)
                self.assertEqual(reference, run.stdout)
            self.assertEqual("scripts/git-hooks", self.local_hooks_path())

    def test_install_with_submodules_reaches_each_checked_out_submodule(self):
        child = self.make_repo(self.base / "child")
        self.git("submodule", "add", "-q", str(child), "child dir")
        self.git("commit", "-q", "--no-verify", "-m", "add child")
        result = self.install("--submodules")
        self.assert_ok(result)
        self.assertEqual("scripts/git-hooks", self.local_hooks_path())
        self.assertEqual("scripts/git-hooks", self.local_hooks_path(self.repo / "child dir"))
        self.assertIn(str((self.repo / "child dir").resolve()), result.stdout)

    def test_install_with_submodules_fails_for_a_submodule_not_checked_out(self):
        child = self.make_repo(self.base / "child")
        self.git("submodule", "add", "-q", str(child), "child")
        self.git("commit", "-q", "--no-verify", "-m", "add child")
        clone = self.base / "clone"
        self.git("clone", "-q", str(self.repo), str(clone), cwd=self.base)
        result = self.install("--submodules", root=clone)
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        self.assertIn("받지 않음", result.stderr)
        self.assertEqual("scripts/git-hooks", self.local_hooks_path(clone))

    def test_hook_result_follows_the_global_hook_and_the_gate(self):
        # 리포 hook 은 전역 hook 이 통과했을 때만 게이트를 부르고, 둘 다 통과해야 0 이다. 게이트는 한 번만 불린다.
        cases = [(present, code, gate) for present in (True, False) for code in (0, 1) for gate in (0, 1)]
        random.Random(87).shuffle(cases)
        for present, code, gate in cases:
            with self.subTest(global_present=present, global_exit=code, gate_exit=gate):
                self.calls.unlink(missing_ok=True)
                (self.global_hooks / "pre-commit").unlink(missing_ok=True)
                if present:
                    self.write_global("pre-commit", code)
                env = {**self.env, "GATE_EXIT": str(gate)}
                result = subprocess.run(
                    ["bash", "scripts/git-hooks/pre-commit"],
                    cwd=self.repo,
                    env=env,
                    input="",
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                global_passed = not present or code == 0
                self.assertEqual(global_passed and gate == 0, result.returncode == 0, result.stdout + result.stderr)
                gates = [line for line in self.logged() if line.startswith("gate ")]
                self.assertEqual(1 if global_passed else 0, len(gates))


if __name__ == "__main__":
    unittest.main()
