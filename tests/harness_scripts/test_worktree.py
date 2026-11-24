"""worktree 운영(설계 05 §2 · §3, HK-15). 임시 리포 + 로컬 bare origin 으로 `worktree.py` 를 실제 git 위에서 돌린다.

    python3 -m unittest discover -s scripts/tests -p "test_worktree.py"
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[2]
MARKERS = ("CLAUDECODE", "CLAUDE_CODE_", "CODEX_", "KIRO_", "HX_", "HARNESS_", "CLAUDE_SESSION_ID", "GIT_")
ISSUES = ".agents/docs/issues"


def clean_env(**extra):
    env = {key: value for key, value in os.environ.items() if not key.startswith(MARKERS)}
    env.update({"PYTHONDONTWRITEBYTECODE": "1", "GIT_CONFIG_NOSYSTEM": "1", "GIT_TERMINAL_PROMPT": "0"})
    env.update(extra)
    return env


def git(cwd, *arguments, check=True):
    result = subprocess.run(["git", "-c", "maintenance.auto=false", "-c", "gc.auto=0", "-c", "core.hooksPath=/dev/null", "-c", "protocol.file.allow=always", *arguments],
                            cwd=cwd, capture_output=True, text=True, env=clean_env())
    if check and result.returncode != 0:
        raise AssertionError(f"git {' '.join(arguments)} 실패: {result.stderr}")
    return result.stdout.strip()


def write(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def issue_docs(root, key, slug, design="approved", type_="feat"):
    folder = Path(root) / ISSUES / f"{key}-{slug}"
    write(folder / "requirements.md", f"---\nkey: {key}\narea: demo\ntype: {type_}\ntitle: 시험\nstatus: approved\ncreated: 2026-11-24\n---\n\n# R\n")
    write(folder / "design.md", f"---\nkey: {key}\narea: demo\ntype: {type_}\ntitle: 시험\nstatus: {design}\ncreated: 2026-11-24\n---\n\n# D\n")


class WorktreeCase(unittest.TestCase):
    META = {"schema": "knots-sync/v2", "git": {"base": "develop", "maxPerRepo": 3}, "issueKey": {"source": "kit", "prefix": "ACME"},
            "tokens": {"PROJECT_SLUG": "proj"}}

    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="wt case ")
        self.addCleanup(directory.cleanup)
        self.base = Path(directory.name).resolve()
        self.origin = self.base / "origin.git"
        subprocess.run(["git", "init", "-q", "--bare", "-b", "develop", str(self.origin)], check=True, env=clean_env())
        self.main = self.base / "proj"
        self.main.mkdir()
        shutil.copytree(ROOT / "scripts/harness", self.main / "scripts/harness", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(ROOT / "scripts/hooks", self.main / "scripts/hooks", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copy2(ROOT / "scripts/session-coordination.py", self.main / "scripts/session-coordination.py")
        for name in ("hooks.json",):
            if (ROOT / ".agents" / name).is_file():
                (self.main / ".agents").mkdir(exist_ok=True)
                shutil.copy2(ROOT / ".agents" / name, self.main / ".agents" / name)
        write(self.main / ".agents/knots-sync.json", json.dumps(self.META))
        write(self.main / ".gitignore", ".env\n.env.local\nlocal.properties\n.agents/state/\n.agents/local/\n.env.worktree\nnode_modules/\n")
        write(self.main / "src/app.py", "print('hi')\n")
        write(self.main / "docs/guide.md", "# guide\n")
        write(self.main / "README.md", "# proj\n")
        write(self.main / ".worktreeinclude", ".env\n.env.local\n**/local.properties\nscratch.txt\n")
        write(self.main / ".env.example", "SERVER_PORT=8080\nDB_PORT=5432\nAPP_NAME=demo\n")
        issue_docs(self.main, "ACME-1", "alpha-work")
        issue_docs(self.main, "ACME-2", "beta-work", design="in-review")
        issue_docs(self.main, "ACME-3", "gamma-work")
        issue_docs(self.main, "ACME-4", "delta-work")
        issue_docs(self.main, "ACME-5", "eps-work")
        git(self.main, "init", "-q", "-b", "develop")
        git(self.main, "config", "user.email", "kim@example.com")
        git(self.main, "config", "user.name", "Kim")
        git(self.main, "add", "-A")
        git(self.main, "commit", "-q", "-m", "init")
        git(self.main, "remote", "add", "origin", str(self.origin))
        git(self.main, "push", "-q", "-u", "origin", "develop")
        # 메인 폴더의 로컬 파일(gitignore 됨 · 안 됨)
        write(self.main / ".env", "SERVER_PORT=8080\nSECRET=x\n")
        write(self.main / "app/local.properties", "sdk=1\n")
        write(self.main / "scratch.txt", "추적도 무시도 안 된 파일\n")
        self.root = self.base / "proj.worktrees"

    def wt(self, *arguments, cwd=None, stdin=None, **env):
        return subprocess.run([sys.executable, "-B", str(self.main / "scripts/harness/worktree.py"), *arguments], cwd=cwd or self.main,
                              input=stdin, capture_output=True, text=True, env=clean_env(**env), timeout=120)

    def new(self, key, *arguments, **env):
        result = self.wt("new", key, "--json", *arguments, **env)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def record(self, folder):
        path = self.main / ".agents/state/worktrees" / f"{folder}.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None

    def session(self, sid, cwd, minutes_ago=0):
        seen = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).astimezone().isoformat(timespec="seconds")
        write(self.main / ".agents/state/sessions" / f"{sid}.json", json.dumps({"schema": "knots-sync.session/v1", "id": sid, "harness": "claude",
                                                                                "cwd": str(cwd), "checkout": "worktree", "lastSeenAt": seen}))


class NewTest(WorktreeCase):
    def test_creates_issue_worktree_at_sibling_folder_from_origin_base(self):
        out = self.new("ACME-1")
        path = self.root / "ACME-1-alpha-work"
        self.assertEqual(str(path), str(Path(out["path"]).resolve()))
        self.assertTrue((path / "src/app.py").is_file())
        self.assertEqual("feat/ACME-1-alpha-work", git(path, "rev-parse", "--abbrev-ref", "HEAD"))
        self.assertEqual(git(self.main, "rev-parse", "origin/develop"), git(path, "rev-parse", "HEAD"))
        # --no-track: upstream 이 origin/develop 이 되면 push 가 이름 불일치로 거부된다
        self.assertEqual("", git(path, "config", "--get", "branch.feat/ACME-1-alpha-work.merge", check=False))

    def test_branch_type_comes_from_requirements(self):
        issue_docs(self.main, "ACME-6", "crash-fix", type_="fix")
        git(self.main, "add", "-A")
        git(self.main, "commit", "-q", "-m", "fix issue")
        git(self.main, "push", "-q", "origin", "develop")
        out = self.new("ACME-6")
        self.assertEqual("fix/ACME-6-crash-fix", out["branch"])

    def test_state_record_follows_design_14(self):
        self.new("ACME-1")
        rec = self.record("ACME-1-alpha-work")
        self.assertEqual("knots-sync.worktree/v1", rec["schema"])
        self.assertEqual(("issue", "ACME-1", "alpha-work", ".", "feat/ACME-1-alpha-work", "origin/develop", "approved", 1, False),
                         (rec["kind"], rec["key"], rec["slug"], rec["repo"], rec["branch"], rec["base"], rec["designCheck"], rec["portIndex"], rec["docsOnly"]))
        self.assertEqual(git(self.main, "rev-parse", "origin/develop"), rec["baseSha"])
        self.assertEqual({"harness": "human"}, rec["createdBy"])
        for field in ("createdAt", "lastUsedAt", "diskDeltaKB", "path"):
            self.assertIn(field, rec)

    def test_unapproved_design_is_refused_with_exit_1_unless_docs(self):
        refused = self.wt("new", "ACME-2")
        self.assertEqual(1, refused.returncode, refused.stderr)
        self.assertIn("approved", refused.stderr + refused.stdout)
        self.assertIn("--docs", refused.stderr + refused.stdout)
        self.assertFalse((self.root / "ACME-2-beta-work").exists())
        out = self.new("ACME-2", "--docs")
        self.assertTrue(Path(out["path"]).is_dir())
        self.assertEqual("n/a", self.record("ACME-2-beta-work")["designCheck"])

    def test_skip_design_check_warns_and_records_it(self):
        result = self.wt("new", "ACME-2", "--skip-design-check", "--json")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("design", result.stderr)
        self.assertEqual("skipped", self.record("ACME-2-beta-work")["designCheck"])

    def test_unknown_issue_is_exit_3(self):
        result = self.wt("new", "ACME-99")
        self.assertEqual(3, result.returncode)
        self.assertIn("new-feature.sh", result.stderr)

    def test_bad_key_is_usage_error(self):
        self.assertEqual(2, self.wt("new", "acme-1").returncode)

    def test_fourth_worktree_is_refused_with_exit_3_and_a_list(self):
        for key in ("ACME-1", "ACME-3", "ACME-4"):
            self.new(key)
        result = self.wt("new", "ACME-5")
        self.assertEqual(3, result.returncode, result.stderr)
        self.assertIn("wt done", result.stderr + result.stdout)
        self.assertIn("ACME-1", result.stderr + result.stdout)
        self.assertFalse((self.root / "ACME-5-eps-work").exists())

    def test_existing_place_is_exit_3(self):
        (self.root / "ACME-1-alpha-work").mkdir(parents=True)
        self.assertEqual(3, self.wt("new", "ACME-1").returncode)

    def test_docs_worktree_is_sparse_with_root_files_and_three_folders(self):
        out = self.new("ACME-1", "--docs")
        path = Path(out["path"])
        names = sorted(p.name for p in path.iterdir() if p.name != ".git")
        self.assertIn("README.md", names)
        self.assertIn(".agents", names)
        self.assertIn("docs", names)
        self.assertNotIn("src", names)
        # 메인 폴더의 sparse 설정은 바뀌지 않는다(05 §6)
        self.assertIn(git(self.main, "config", "--get", "core.sparseCheckout", check=False), ("", "false"))
        self.assertEqual("", git(self.main, "sparse-checkout", "list", check=False))
        self.assertTrue((self.main / "src/app.py").is_file())
        self.assertTrue(self.record("ACME-1-alpha-work")["docsOnly"])

    def test_only_adds_folders_to_the_sparse_set(self):
        write(self.main / "svc/a/x.txt", "x\n")
        write(self.main / "svc/b/y.txt", "y\n")
        git(self.main, "add", "-A")
        git(self.main, "commit", "-q", "-m", "svc")
        git(self.main, "push", "-q", "origin", "develop")
        path = Path(self.new("ACME-1", "--only", "svc/a")["path"])
        self.assertTrue((path / "svc/a/x.txt").is_file())
        self.assertFalse((path / "svc/b").exists())
        self.assertFalse((path / "src").exists())
        self.assertEqual(["svc/a"], self.record("ACME-1-alpha-work")["only"])

    def test_worktreeinclude_copies_only_ignored_local_files(self):
        path = Path(self.new("ACME-1")["path"])
        self.assertEqual("SERVER_PORT=8080\nSECRET=x\n", (path / ".env").read_text(encoding="utf-8"))
        self.assertTrue((path / "app/local.properties").is_file())
        self.assertFalse((path / "scratch.txt").exists())  # gitignore 되지 않은 파일은 복사하지 않는다

    def test_worktreeinclude_does_not_overwrite_and_skips_sparse_folders(self):
        path = Path(self.new("ACME-1", "--docs")["path"])
        self.assertTrue((path / ".env").is_file())            # 루트 파일은 sparse 라도 복사
        self.assertFalse((path / "app").exists())              # sparse 로 빠진 폴더의 파일은 복사하지 않는다

    def test_worktreeinclude_skips_big_files(self):
        write(self.main / ".worktreeinclude", ".env\nbig.env\n")
        (self.main / "big.env").write_bytes(b"x" * (51 * 1024 * 1024))
        write(self.main / ".gitignore", ".env\nbig.env\n.agents/state/\n")
        result = self.wt("new", "ACME-1", "--json")
        self.assertEqual(0, result.returncode, result.stderr)
        path = Path(json.loads(result.stdout)["path"])
        self.assertTrue((path / ".env").is_file())
        self.assertFalse((path / "big.env").exists())
        self.assertIn("big.env", result.stderr)

    def test_port_offset_is_index_times_100_and_frees_on_done(self):
        first = Path(self.new("ACME-1")["path"])
        second = Path(self.new("ACME-3")["path"])
        env1 = (first / ".env.worktree").read_text(encoding="utf-8")
        env2 = (second / ".env.worktree").read_text(encoding="utf-8")
        self.assertIn("HARNESS_WT_INDEX=1", env1)
        self.assertIn("SERVER_PORT=8180", env1)
        self.assertIn("HARNESS_WT_INDEX=2", env2)
        self.assertIn("HARNESS_WT_KEY=ACME-3", env2)
        self.assertIn("HARNESS_PORT_OFFSET=200", env2)
        self.assertIn("SERVER_PORT=8280", env2)
        self.assertIn("DB_PORT=5632", env2)
        self.assertIn("COMPOSE_PROJECT_NAME=proj-acme-3", env2)
        self.assertNotIn("APP_NAME", env2)
        self.assertEqual(0, self.wt("done", "ACME-1").returncode)
        third = Path(self.new("ACME-4")["path"])
        self.assertIn("HARNESS_WT_INDEX=1", (third / ".env.worktree").read_text(encoding="utf-8"))

    def test_port_over_65535_is_skipped_with_a_warning(self):
        write(self.main / ".env.example", "BIG_PORT=65500\nSERVER_PORT=8080\n")
        git(self.main, "add", "-A")
        git(self.main, "commit", "-q", "-m", "ports")
        git(self.main, "push", "-q", "origin", "develop")
        result = self.wt("new", "ACME-1", "--json")
        self.assertEqual(0, result.returncode, result.stderr)
        env = (Path(json.loads(result.stdout)["path"]) / ".env.worktree").read_text(encoding="utf-8")
        self.assertNotIn("BIG_PORT", env)
        self.assertIn("BIG_PORT", result.stderr)

    def test_env_local_wins_over_env_over_example(self):
        write(self.main / ".env.local", "SERVER_PORT=3000\n")
        env = (Path(self.new("ACME-1")["path"]) / ".env.worktree").read_text(encoding="utf-8")
        self.assertIn("SERVER_PORT=3100", env)

    def test_cargo_projects_share_one_target_dir_under_root(self):
        write(self.main / "Cargo.toml", "[package]\nname='x'\n")
        git(self.main, "add", "-A")
        git(self.main, "commit", "-q", "-m", "cargo")
        git(self.main, "push", "-q", "origin", "develop")
        env = (Path(self.new("ACME-1")["path"]) / ".env.worktree").read_text(encoding="utf-8")
        self.assertIn(f"CARGO_TARGET_DIR={self.root}/.cargo-target", env)

    def test_pnpm_and_uv_are_only_announced_without_deps(self):
        write(self.main / "web/pnpm-lock.yaml", "lockfileVersion: 9\n")
        write(self.main / "svc/uv.lock", "version = 1\n")
        git(self.main, "add", "-A")
        git(self.main, "commit", "-q", "-m", "locks")
        git(self.main, "push", "-q", "origin", "develop")
        result = self.wt("new", "ACME-1")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("pnpm install --frozen-lockfile --prefer-offline", result.stdout)
        self.assertIn("uv sync --frozen", result.stdout)

    def test_deps_flag_runs_the_install_command_in_the_unit_folder(self):
        write(self.main / "web/pnpm-lock.yaml", "lockfileVersion: 9\n")
        git(self.main, "add", "-A")
        git(self.main, "commit", "-q", "-m", "pnpm")
        git(self.main, "push", "-q", "origin", "develop")
        bin_dir = self.base / "bin"
        bin_dir.mkdir()
        fake = bin_dir / "pnpm"
        fake.write_text('#!/bin/sh\necho "$@" > pnpm-ran.txt\n', encoding="utf-8")
        fake.chmod(0o755)
        path = Path(self.new("ACME-1", "--deps", PATH=f"{bin_dir}:{os.environ['PATH']}")["path"])
        self.assertEqual("install --frozen-lockfile --prefer-offline", (path / "web/pnpm-ran.txt").read_text(encoding="utf-8").strip())

    def test_open_flag_launches_the_ide_after_creating(self):
        bin_dir = self.base / "bin"
        bin_dir.mkdir()
        log = self.base / "code.log"
        fake = bin_dir / "code"
        fake.write_text(f'#!/bin/sh\necho "$@" >> "{log}"\n', encoding="utf-8")
        fake.chmod(0o755)
        path = self.new("ACME-1", "--open", PATH=f"{bin_dir}:{os.environ['PATH']}")["path"]
        self.assertEqual(f"-n {path}", log.read_text(encoding="utf-8").strip())

    def test_npm_node_modules_is_cloned_when_lock_is_identical(self):
        if sys.platform != "darwin":
            self.skipTest("APFS 복제는 macOS 만")
        write(self.main / "web/package-lock.json", "{}\n")
        write(self.main / "web/node_modules/dep/index.js", "module.exports = 1\n")
        git(self.main, "add", "-A")
        git(self.main, "commit", "-q", "-m", "npm")
        git(self.main, "push", "-q", "origin", "develop")
        path = Path(self.new("ACME-1")["path"])
        self.assertTrue((path / "web/node_modules/dep/index.js").is_file())

    def test_creating_in_the_second_session_does_not_touch_the_main_folder(self):
        before = git(self.main, "status", "--porcelain")
        self.new("ACME-1")
        self.assertEqual(before, git(self.main, "status", "--porcelain"))
        self.assertEqual("develop", git(self.main, "rev-parse", "--abbrev-ref", "HEAD"))

    def test_outside_a_git_repo_is_exit_3(self):
        outside = self.base / "outside"
        outside.mkdir()
        self.assertEqual(3, self.wt("new", "ACME-1", cwd=outside).returncode)

    def test_worktree_root_setting_absolute_and_relative(self):
        meta = dict(self.META, git={"base": "develop", "maxPerRepo": 3, "worktreeRoot": str(self.base / "elsewhere")})
        write(self.main / ".agents/knots-sync.json", json.dumps(meta))
        path = Path(self.new("ACME-1")["path"])
        self.assertEqual(self.base / "elsewhere" / "ACME-1-alpha-work", path.resolve())

    def test_max_per_repo_setting_is_used(self):
        meta = dict(self.META, git={"base": "develop", "maxPerRepo": 1})
        write(self.main / ".agents/knots-sync.json", json.dumps(meta))
        self.new("ACME-1")
        self.assertEqual(3, self.wt("new", "ACME-3").returncode)

    def test_runs_from_inside_a_worktree_and_uses_the_same_root(self):
        first = Path(self.new("ACME-1")["path"])
        result = self.wt("new", "ACME-3", "--json", cwd=first)
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(self.root / "ACME-3-gamma-work", Path(json.loads(result.stdout)["path"]).resolve())
        self.assertTrue((self.main / ".agents/state/worktrees/ACME-3-gamma-work.json").is_file())

    def test_two_sessions_do_not_see_each_others_changes(self):
        a = Path(self.new("ACME-1")["path"])
        b = Path(self.new("ACME-3")["path"])
        write(a / "src/only_a.py", "a\n")
        git(a, "add", "-A")
        git(a, "commit", "-q", "-m", "a")
        write(b / "src/only_b.py", "b\n")
        git(b, "add", "-A")
        git(b, "commit", "-q", "-m", "b")
        self.assertEqual("", git(a, "diff", "develop...feat/ACME-3-gamma-work", "--", "src/only_a.py"))
        self.assertEqual("", git(b, "diff", "develop...feat/ACME-1-alpha-work", "--", "src/only_b.py"))
        self.assertFalse((b / "src/only_a.py").exists())


class ListTest(WorktreeCase):
    def test_list_json_reports_changes_unpushed_size_and_sessions(self):
        a = Path(self.new("ACME-1")["path"])
        self.new("ACME-3")
        write(a / "src/new.py", "x\n")
        git(a, "add", "-A")
        git(a, "commit", "-q", "-m", "c")
        write(a / "src/dirty.py", "y\n")
        self.session("s1", a, minutes_ago=2)
        self.session("s2", a, minutes_ago=90)
        result = self.wt("list", "--json")
        self.assertEqual(0, result.returncode, result.stderr)
        data = json.loads(result.stdout)
        rows = {row["key"]: row for row in data["worktrees"]}
        self.assertEqual({"ACME-1", "ACME-3"}, set(rows))
        self.assertEqual((1, 1, 1), (rows["ACME-1"]["changes"], rows["ACME-1"]["unpushed"], rows["ACME-1"]["sessions"]))
        self.assertEqual((0, 0, 0), (rows["ACME-3"]["changes"], rows["ACME-3"]["unpushed"], rows["ACME-3"]["sessions"]))
        self.assertEqual("progress", rows["ACME-1"]["state"])
        self.assertEqual("finished", rows["ACME-3"]["state"])
        self.assertGreater(rows["ACME-3"]["sizeKB"], 0)
        self.assertIn("lastUsedAt", rows["ACME-1"])
        self.assertEqual(3, data["maxPerRepo"])
        self.assertIn("freeGB", data)

    def test_list_text_has_a_row_per_worktree_and_done_hint(self):
        self.new("ACME-1")
        result = self.wt("list")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("ACME-1", result.stdout)
        self.assertIn("wt done ACME-1", result.stdout.replace("worktree.py done", "wt done"))
        self.assertIn("합계", result.stdout)

    def test_list_warns_when_disk_is_low(self):
        self.new("ACME-1")
        result = self.wt("list", HARNESS_WT_MIN_FREE_GB="99999999")
        self.assertIn("디스크 여유", result.stdout + result.stderr)
        result = self.wt("list", HARNESS_WT_WARN_GB="0.0000001")
        self.assertIn("합계", result.stdout)
        self.assertRegex(result.stdout + result.stderr, "합계 .*GB 가 .*GB 를 넘었다")

    def test_size_is_cached_and_refresh_size_remeasures(self):
        a = Path(self.new("ACME-1")["path"])
        self.wt("list")
        first = self.record("ACME-1-alpha-work")["sizeKB"]
        (a / "blob.bin").write_bytes(b"0" * 3_000_000)
        self.wt("list")
        self.assertEqual(first, self.record("ACME-1-alpha-work")["sizeKB"])
        self.wt("list", "--refresh-size")
        self.assertGreater(self.record("ACME-1-alpha-work")["sizeKB"], first + 2000)

    def test_disk_breakdown_splits_source_deps_build(self):
        a = Path(self.new("ACME-1")["path"])
        (a / "node_modules").mkdir()
        (a / "node_modules/x.bin").write_bytes(b"0" * 200_000)
        (a / "dist").mkdir()
        (a / "dist/y.bin").write_bytes(b"0" * 100_000)
        result = self.wt("list", "--disk", "--json", "--refresh-size")
        row = json.loads(result.stdout)["worktrees"][0]
        self.assertGreaterEqual(row["disk"]["deps"], 190)
        self.assertGreaterEqual(row["disk"]["build"], 90)
        self.assertIn("source", row["disk"])


class OpenTest(WorktreeCase):
    def fake_ide(self, name):
        bin_dir = self.base / "bin"
        bin_dir.mkdir(exist_ok=True)
        log = self.base / f"{name}.log"
        script = bin_dir / name
        script.write_text(f'#!/bin/sh\necho "$@" >> "{log}"\n', encoding="utf-8")
        script.chmod(0o755)
        return bin_dir, log

    def test_open_runs_code_with_n_and_the_path(self):
        bin_dir, log = self.fake_ide("code")
        path = self.new("ACME-1")["path"]
        before = self.record("ACME-1-alpha-work")["lastUsedAt"]
        time.sleep(1.1)
        result = self.wt("open", "ACME-1", PATH=f"{bin_dir}:{os.environ['PATH']}")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(f"-n {path}", log.read_text(encoding="utf-8").strip())
        self.assertNotEqual(before, self.record("ACME-1-alpha-work")["lastUsedAt"])

    def test_ide_order_flag_then_personal_then_project(self):
        code_bin, code_log = self.fake_ide("code")
        idea_bin, idea_log = self.fake_ide("idea")
        path = self.new("ACME-1")["path"]
        env = {"PATH": f"{idea_bin}:{code_bin}:{os.environ['PATH']}"}
        meta = dict(self.META, git={"base": "develop", "maxPerRepo": 3, "ide": "idea"})
        write(self.main / ".agents/knots-sync.json", json.dumps(meta))
        self.assertEqual(0, self.wt("open", "ACME-1", **env).returncode)
        self.assertEqual(path, idea_log.read_text(encoding="utf-8").strip())
        write(self.main / ".agents/local/knots-sync.local.json", json.dumps({"git": {"ide": "code"}}))
        self.assertEqual(0, self.wt("open", "ACME-1", **env).returncode)
        self.assertEqual(f"-n {path}", code_log.read_text(encoding="utf-8").strip())
        self.assertEqual(0, self.wt("open", "ACME-1", "--ide", "idea", **env).returncode)
        self.assertEqual(2, len(idea_log.read_text(encoding="utf-8").strip().splitlines()))

    def test_broken_personal_file_is_ignored(self):
        bin_dir, log = self.fake_ide("code")
        self.new("ACME-1")
        write(self.main / ".agents/local/knots-sync.local.json", "{not json")
        self.assertEqual(0, self.wt("open", "ACME-1", PATH=f"{bin_dir}:{os.environ['PATH']}").returncode)
        self.assertTrue(log.is_file())

    def test_missing_ide_is_exit_5_and_prints_the_path(self):
        path = self.new("ACME-1")["path"]
        empty = self.base / "empty-bin"
        empty.mkdir()
        result = self.wt("open", "ACME-1", PATH=f"{empty}:/usr/bin:/bin")
        self.assertEqual(5, result.returncode, result.stderr)
        self.assertIn(path, result.stdout + result.stderr)

    def test_open_unknown_key_is_exit_3(self):
        self.assertEqual(3, self.wt("open", "ACME-1").returncode)


class DoneTest(WorktreeCase):
    def push(self, path):
        branch = git(path, "rev-parse", "--abbrev-ref", "HEAD")
        git(path, "push", "-q", "origin", branch)

    def test_clean_pushed_worktree_is_removed_with_its_branch_and_record(self):
        out = self.new("ACME-1")
        path = Path(out["path"])
        write(path / "src/more.py", "z\n")
        git(path, "add", "-A")
        git(path, "commit", "-q", "-m", "more")
        self.push(path)
        result = self.wt("done", "ACME-1")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertFalse(path.exists())
        self.assertEqual("", git(self.main, "branch", "--list", "feat/ACME-1-alpha-work"))
        self.assertIsNone(self.record("ACME-1-alpha-work"))
        self.assertNotIn("feat/ACME-1-alpha-work", git(self.main, "worktree", "list"))

    def test_fresh_worktree_without_commits_is_finished(self):
        path = Path(self.new("ACME-1")["path"])
        self.assertEqual(0, self.wt("done", "ACME-1").returncode)
        self.assertFalse(path.exists())

    def test_uncommitted_changes_are_kept_with_a_reason_and_exit_1(self):
        path = Path(self.new("ACME-1")["path"])
        write(path / "src/dirty.py", "x\n")
        result = self.wt("done", "ACME-1")
        self.assertEqual(1, result.returncode)
        self.assertIn("남김: ACME-1-alpha-work", result.stdout)
        self.assertIn("커밋 안 된 변경 1개", result.stdout)
        self.assertTrue(path.exists())
        self.assertIsNotNone(self.record("ACME-1-alpha-work"))

    def test_unpushed_commit_is_kept_then_push_makes_it_finished(self):
        path = Path(self.new("ACME-1")["path"])
        write(path / "src/c.py", "x\n")
        git(path, "add", "-A")
        git(path, "commit", "-q", "-m", "c")
        result = self.wt("done", "ACME-1")
        self.assertEqual(1, result.returncode)
        self.assertIn("push 안 된 커밋 1개", result.stdout)
        self.assertTrue(path.exists())
        self.push(path)
        self.assertEqual(0, self.wt("done", "ACME-1").returncode)
        self.assertFalse(path.exists())

    def test_live_session_blocks_done_but_stale_one_does_not(self):
        path = Path(self.new("ACME-1")["path"])
        self.session("live", path, minutes_ago=3)
        result = self.wt("done", "ACME-1")
        self.assertEqual(1, result.returncode)
        self.assertIn("다른 세션", result.stdout)
        self.assertTrue(path.exists())
        self.session("live", path, minutes_ago=30)
        self.assertEqual(0, self.wt("done", "ACME-1").returncode)

    def test_running_inside_the_worktree_is_refused(self):
        path = Path(self.new("ACME-1")["path"])
        result = self.wt("done", "ACME-1", cwd=path)
        self.assertEqual(1, result.returncode)
        self.assertIn("작업 폴더", result.stdout)
        self.assertTrue(path.exists())

    def test_done_without_argument_uses_the_current_worktree_but_still_refuses_inside(self):
        path = Path(self.new("ACME-1")["path"])
        result = self.wt("done", cwd=path)
        self.assertEqual(1, result.returncode)
        self.assertTrue(path.exists())

    def test_path_option_finds_the_worktree(self):
        path = Path(self.new("ACME-1")["path"])
        self.assertEqual(0, self.wt("done", "--path", str(path)).returncode)
        self.assertFalse(path.exists())

    def test_main_folder_and_outside_paths_are_exit_3(self):
        self.assertEqual(3, self.wt("done", "--path", str(self.main)).returncode)
        outside = self.base / "x"
        outside.mkdir()
        self.assertEqual(3, self.wt("done", "--path", str(outside)).returncode)
        self.assertEqual(3, self.wt("done", "ACME-1").returncode)

    def test_ignored_build_files_do_not_block_removal(self):
        path = Path(self.new("ACME-1")["path"])
        (path / "node_modules").mkdir()
        (path / "node_modules/a.js").write_text("1", encoding="utf-8")
        self.assertEqual(0, self.wt("done", "ACME-1").returncode)
        self.assertFalse(path.exists())

    def test_env_worktree_without_gitignore_does_not_block(self):
        write(self.main / ".gitignore", ".env\n.agents/state/\n")
        git(self.main, "add", "-A")
        git(self.main, "commit", "-q", "-m", "no ignore")
        git(self.main, "push", "-q", "origin", "develop")
        path = Path(self.new("ACME-1")["path"])
        self.assertIn("?? .env.worktree", git(path, "status", "--porcelain"))
        self.assertEqual(0, self.wt("done", "ACME-1").returncode)
        self.assertFalse(path.exists())

    def test_keep_branch(self):
        self.new("ACME-1")
        self.assertEqual(0, self.wt("done", "ACME-1", "--keep-branch").returncode)
        self.assertIn("feat/ACME-1-alpha-work", git(self.main, "branch", "--list", "feat/ACME-1-alpha-work"))

    def test_branch_with_unpushed_commits_survives_when_worktree_is_clean(self):
        path = Path(self.new("ACME-1")["path"])
        write(path / "src/c.py", "x\n")
        git(path, "add", "-A")
        git(path, "commit", "-q", "-m", "c")
        self.assertEqual(1, self.wt("done", "ACME-1").returncode)
        self.assertIn("feat/ACME-1-alpha-work", git(self.main, "branch", "--list", "feat/ACME-1-alpha-work"))

    def test_done_json(self):
        self.new("ACME-1")
        data = json.loads(self.wt("done", "ACME-1", "--json").stdout)
        self.assertEqual((True, "ACME-1"), (data["removed"], data["key"]))


class GcTest(WorktreeCase):
    def test_default_lists_only_and_apply_removes_finished_ones(self):
        done = Path(self.new("ACME-1")["path"])
        busy = Path(self.new("ACME-3")["path"])
        write(busy / "src/dirty.py", "x\n")
        listed = self.wt("gc")
        self.assertEqual(0, listed.returncode, listed.stderr)
        self.assertIn("ACME-1", listed.stdout)
        self.assertIn("--apply", listed.stdout)
        self.assertTrue(done.exists() and busy.exists())
        applied = self.wt("gc", "--apply")
        self.assertEqual(0, applied.returncode, applied.stderr)
        self.assertFalse(done.exists())
        self.assertTrue(busy.exists())
        self.assertIsNone(self.record("ACME-1-alpha-work"))
        self.assertIn("남김", applied.stdout)

    def test_removes_stale_session_records_and_orphan_state(self):
        a = Path(self.new("ACME-1")["path"])
        self.session("old", a, minutes_ago=60 * 24 * 8)
        self.session("new", a, minutes_ago=1)
        write(self.main / ".agents/state/worktrees/ghost.json", json.dumps({"schema": "knots-sync.worktree/v1", "kind": "issue", "key": "ACME-9",
                                                                              "path": str(self.root / "ghost"), "branch": "feat/x"}))
        listed = json.loads(self.wt("gc", "--json").stdout)
        self.assertEqual(1, listed["staleSessions"])
        self.assertTrue((self.main / ".agents/state/sessions/old.json").is_file())
        self.assertEqual(["ghost"], [Path(p).stem for p in listed["orphanRecords"]])
        self.wt("gc", "--apply")
        self.assertFalse((self.main / ".agents/state/sessions/old.json").exists())
        self.assertTrue((self.main / ".agents/state/sessions/new.json").is_file())
        self.assertFalse((self.main / ".agents/state/worktrees/ghost.json").exists())

    def test_prunes_worktrees_whose_folder_vanished_and_removes_empty_unknown_folders(self):
        a = Path(self.new("ACME-1")["path"])
        shutil.rmtree(a)
        (self.root / "empty-leftover").mkdir()
        (self.root / "has-files").mkdir()
        (self.root / "has-files/x.txt").write_text("1", encoding="utf-8")
        self.assertIn("ACME-1-alpha-work", self.wt("gc").stdout)
        self.assertTrue((self.root / "empty-leftover").exists())
        self.wt("gc", "--apply")
        self.assertFalse((self.root / "empty-leftover").exists())
        self.assertTrue((self.root / "has-files/x.txt").exists())
        self.assertNotIn("ACME-1-alpha-work", git(self.main, "worktree", "list"))

    def test_prunes_coordination_records_outside_retention(self):
        write(self.main / ".agents/harness.json", json.dumps({"unit": "proj"}))
        now = time.time()

        def session(sid, age_days):
            stamp = now - age_days * 86400
            return {"id": sid, "client": "claude", "issue": "ACME-1", "status": "active", "registered_at": stamp, "heartbeat_at": stamp,
                    "expires_at": stamp + 1800, "ttl_seconds": 1800, "files": [], "baseline": {}}

        def notice(nid, age_days, sender=None, target=None, ack=()):
            return {"id": nid * 32, "sender": sender, "target": target, "message": "m", "created_at": now - age_days * 86400,
                    "acknowledged_by": list(ack), "trust": "untrusted"}

        state_file = self.main / ".agents/coordination/state.json"
        write(state_file, json.dumps({"version": 1, "sessions": {"old": session("old", 10), "new": session("new", 0.1)}, "notices": [
            notice("a", 40, sender="new"), notice("b", 1, target="old"), notice("c", 1, sender="old", ack=["old", "new"]), notice("d", 1, sender="new"),
        ]}))
        before = json.loads(state_file.read_text(encoding="utf-8"))
        listed = json.loads(self.wt("gc", "--json").stdout)
        self.assertEqual({"sessionsRemoved": 1, "noticesRemoved": 2, "sessionsKept": 1, "noticesKept": 2}, listed["coordination"])
        self.assertEqual(before, json.loads(state_file.read_text(encoding="utf-8")))  # 목록만: 내용은 그대로
        self.assertEqual(0, self.wt("gc", "--apply").returncode)
        after = json.loads(state_file.read_text(encoding="utf-8"))
        self.assertEqual(["new"], list(after["sessions"]))
        self.assertEqual(["c" * 32, "d" * 32], [n["id"] for n in after["notices"]])
        self.assertEqual((None, ["new"]), (after["notices"][0]["sender"], after["notices"][0]["acknowledged_by"]))
        status = subprocess.run([sys.executable, "-B", str(self.main / "scripts/session-coordination.py"), "--root", str(self.main), "status"],
                                capture_output=True, text=True, env=clean_env())
        self.assertEqual(0, status.returncode, status.stderr)

    def test_gc_does_not_touch_the_cargo_target_dir(self):
        (self.root / ".cargo-target").mkdir(parents=True)
        (self.root / ".cargo-target/keep").write_text("1", encoding="utf-8")
        self.wt("gc", "--apply")
        self.assertTrue((self.root / ".cargo-target/keep").exists())


class HookTest(WorktreeCase):
    def hook(self, name, payload, **env):
        script = {"hook-create": "scripts/hooks/worktree-create.sh", "hook-remove": "scripts/hooks/worktree-remove.sh"}[name]
        hook_id = {"hook-create": "harness-worktree-create", "hook-remove": "harness-worktree-remove"}[name]
        (self.main / ".agents/state").mkdir(exist_ok=True)
        return subprocess.run(["bash", str(self.main / "scripts/hooks/dispatch.sh"), hook_id, script], cwd=self.main, input=json.dumps(payload),
                              capture_output=True, text=True, env=clean_env(CLAUDE_PROJECT_DIR=str(self.main), **env), timeout=120)

    def base_payload(self, **extra):
        return {"session_id": "sess-1", "cwd": str(self.main), "hook_event_name": "WorktreeCreate", **extra}

    def test_create_with_issue_key_name_prints_the_path_as_the_last_line(self):
        result = self.hook("hook-create", self.base_payload(name="ACME-1"))
        self.assertEqual(0, result.returncode, result.stderr)
        last = [line for line in result.stdout.splitlines() if line.strip()][-1]
        self.assertEqual(str(self.root / "ACME-1-alpha-work"), str(Path(last).resolve()))
        self.assertEqual("feat/ACME-1-alpha-work", git(last, "rev-parse", "--abbrev-ref", "HEAD"))
        rec = self.record("ACME-1-alpha-work")
        self.assertEqual({"harness": "claude", "sessionId": "sess-1"}, rec["createdBy"])

    def test_create_again_with_same_name_returns_the_same_path(self):
        first = self.hook("hook-create", self.base_payload(name="ACME-1")).stdout.strip().splitlines()[-1]
        second = self.hook("hook-create", self.base_payload(name="ACME-1"))
        self.assertEqual(0, second.returncode, second.stderr)
        self.assertEqual(first, second.stdout.strip().splitlines()[-1])

    def test_create_follows_design_check_and_limit(self):
        result = self.hook("hook-create", self.base_payload(name="ACME-2"))
        self.assertEqual(1, result.returncode)
        self.assertIn("approved", result.stderr)
        self.assertEqual("", result.stdout.strip())
        for key in ("ACME-1", "ACME-3", "ACME-4"):
            self.assertEqual(0, self.hook("hook-create", self.base_payload(name=key)).returncode)
        self.assertEqual(1, self.hook("hook-create", self.base_payload(name="ACME-5")).returncode)

    def test_create_with_other_name_makes_a_temporary_worktree_from_head(self):
        write(self.main / "src/wip.py", "committed locally\n")
        git(self.main, "add", "-A")
        git(self.main, "commit", "-q", "-m", "local only")
        result = self.hook("hook-create", self.base_payload(name="bold-oak-a3f2"))
        self.assertEqual(0, result.returncode, result.stderr)
        path = Path(result.stdout.strip().splitlines()[-1])
        self.assertEqual(self.root / "_agents" / "bold-oak-a3f2", path.resolve())
        self.assertEqual("wt/bold-oak-a3f2", git(path, "rev-parse", "--abbrev-ref", "HEAD"))
        self.assertTrue((path / "src/wip.py").is_file())
        rec = self.record("_agents/bold-oak-a3f2")
        self.assertEqual("agent", rec["kind"])
        self.assertFalse((path / ".env.worktree").exists())

    def test_temporary_worktrees_do_not_count_against_the_issue_limit_but_have_their_own(self):
        for key in ("ACME-1", "ACME-3", "ACME-4"):
            self.new(key)
        for i in range(6):
            self.assertEqual(0, self.hook("hook-create", self.base_payload(name=f"agent-{i}")).returncode, i)
        seventh = self.hook("hook-create", self.base_payload(name="agent-6"))
        self.assertEqual(1, seventh.returncode)

    def test_unsafe_names_become_safe_folder_names(self):
        result = self.hook("hook-create", self.base_payload(name="#1234"))
        self.assertEqual(0, result.returncode, result.stderr)
        path = Path(result.stdout.strip().splitlines()[-1]).resolve()
        self.assertEqual(self.root / "_agents" / "pr-1234", path)
        result = self.hook("hook-create", self.base_payload(name="../../evil"))
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertTrue(Path(result.stdout.strip().splitlines()[-1]).resolve().is_relative_to(self.root / "_agents"))

    def test_create_without_name_is_exit_1(self):
        self.assertEqual(1, self.hook("hook-create", self.base_payload()).returncode)

    def test_remove_deletes_a_finished_issue_worktree_and_branch(self):
        path = self.hook("hook-create", self.base_payload(name="ACME-1")).stdout.strip().splitlines()[-1]
        result = self.hook("hook-remove", {"session_id": "sess-1", "cwd": path, "hook_event_name": "WorktreeRemove", "worktree_path": path})
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("", result.stdout)
        self.assertFalse(Path(path).exists())
        self.assertEqual("", git(self.main, "branch", "--list", "feat/ACME-1-alpha-work"))

    def test_remove_keeps_dirty_or_unpushed_worktrees_with_exit_1(self):
        path = Path(self.hook("hook-create", self.base_payload(name="ACME-1")).stdout.strip().splitlines()[-1])
        write(path / "src/dirty.py", "x\n")
        result = self.hook("hook-remove", {"cwd": str(self.main), "worktree_path": str(path)})
        self.assertEqual(1, result.returncode)
        self.assertIn("커밋 안 된 변경", result.stderr)
        self.assertTrue(path.exists())

    def test_remove_ignores_the_ending_session_but_not_other_live_sessions(self):
        path = Path(self.hook("hook-create", self.base_payload(name="ACME-1")).stdout.strip().splitlines()[-1])
        self.session("sess-1", path, minutes_ago=0)
        self.session("other", path, minutes_ago=2)
        result = self.hook("hook-remove", {"session_id": "sess-1", "cwd": str(self.main), "worktree_path": str(path)})
        self.assertEqual(1, result.returncode)
        self.assertIn("다른 세션", result.stderr)
        self.session("other", path, minutes_ago=60)
        result = self.hook("hook-remove", {"session_id": "sess-1", "cwd": str(self.main), "worktree_path": str(path)})
        self.assertEqual(0, result.returncode, result.stderr)

    def test_remove_refuses_paths_that_the_kit_did_not_make(self):
        outside = self.base / "outside-wt"
        git(self.main, "worktree", "add", "-q", "-b", "other", str(outside))
        result = self.hook("hook-remove", {"cwd": str(self.main), "worktree_path": str(outside)})
        self.assertEqual(1, result.returncode)
        self.assertIn("킷이 만든 worktree", result.stderr)
        self.assertTrue(outside.exists())

    def test_remove_temporary_worktree_needs_head_commit_elsewhere(self):
        path = Path(self.hook("hook-create", self.base_payload(name="scratch-1")).stdout.strip().splitlines()[-1])
        # 새 커밋이 없다 → HEAD 는 develop 에 있다
        self.assertEqual(0, self.hook("hook-remove", {"cwd": str(self.main), "worktree_path": str(path)}).returncode)
        self.assertFalse(path.exists())
        path = Path(self.hook("hook-create", self.base_payload(name="scratch-2")).stdout.strip().splitlines()[-1])
        write(path / "src/w.py", "w\n")
        git(path, "add", "-A")
        git(path, "commit", "-q", "-m", "w")
        result = self.hook("hook-remove", {"cwd": str(self.main), "worktree_path": str(path)})
        self.assertEqual(1, result.returncode)
        self.assertIn("push 안 된 커밋", result.stderr)
        git(path, "branch", "keep-it")
        self.assertEqual(0, self.hook("hook-remove", {"cwd": str(self.main), "worktree_path": str(path)}).returncode)

    def test_gc_cleans_finished_temporary_worktrees(self):
        path = Path(self.hook("hook-create", self.base_payload(name="scratch-3")).stdout.strip().splitlines()[-1])
        self.wt("gc", "--apply")
        self.assertFalse(path.exists())


class DomainTest(WorktreeCase):
    def setUp(self):
        super().setUp()
        self.dom_origin = self.base / "dom-origin.git"
        subprocess.run(["git", "init", "-q", "--bare", "-b", "develop", str(self.dom_origin)], check=True, env=clean_env())
        seed = self.base / "dom-seed"
        seed.mkdir()
        git(seed, "init", "-q", "-b", "develop")
        git(seed, "config", "user.email", "kim@example.com")
        git(seed, "config", "user.name", "Kim")
        write(seed / "svc.py", "print('svc')\n")
        write(seed / ".gitignore", ".env\n")
        git(seed, "add", "-A")
        git(seed, "commit", "-q", "-m", "seed")
        git(seed, "remote", "add", "origin", str(self.dom_origin))
        git(seed, "push", "-q", "origin", "develop")
        git(self.main, "submodule", "add", "-q", "-b", "develop", str(self.dom_origin), "dom")
        git(self.main, "commit", "-q", "-am", "add dom")
        git(self.main, "push", "-q", "origin", "develop")

    def test_super_repo_without_docs_or_domain_is_exit_3(self):
        result = self.wt("new", "ACME-1")
        self.assertEqual(3, result.returncode, result.stderr)
        self.assertIn("--domain", result.stderr)

    def test_domain_worktree_lives_under_root_domain_folder(self):
        result = self.wt("new", "ACME-1", "--domain", "dom", "--json")
        self.assertEqual(0, result.returncode, result.stderr)
        path = Path(json.loads(result.stdout)["path"]).resolve()
        self.assertEqual(self.root / "dom" / "ACME-1-alpha-work", path)
        self.assertTrue((path / "svc.py").is_file())
        self.assertEqual("feat/ACME-1-alpha-work", git(path, "rev-parse", "--abbrev-ref", "HEAD"))
        rec = self.record("dom/ACME-1-alpha-work")
        self.assertEqual("dom", rec["repo"])
        self.assertEqual("?? scratch.txt", git(self.main, "status", "--porcelain", "--ignore-submodules=none"))  # scratch.txt 는 시험 준비물

    def test_domain_done_prints_the_pointer_hint_and_super_repo_stays_clean(self):
        path = Path(json.loads(self.wt("new", "ACME-1", "--domain", "dom", "--json").stdout)["path"])
        result = self.wt("done", "ACME-1", cwd=self.main)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertFalse(path.exists())
        self.assertIn("git -C", result.stdout)
        self.assertIn("add dom", result.stdout)
        self.assertEqual("?? scratch.txt", git(self.main, "status", "--porcelain"))

    def test_running_inside_the_domain_repo_needs_no_domain_option(self):
        result = self.wt("new", "ACME-3", "--json", cwd=self.main / "dom")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(self.root / "dom" / "ACME-3-gamma-work", Path(json.loads(result.stdout)["path"]).resolve())

    def test_docs_worktree_of_the_super_repo_does_not_init_submodules(self):
        path = Path(json.loads(self.wt("new", "ACME-1", "--docs", "--json").stdout)["path"])
        self.assertEqual(self.root / "ACME-1-alpha-work", path.resolve())
        self.assertFalse((path / "dom/svc.py").exists())

    def test_domain_limit_counts_per_repo(self):
        for key in ("ACME-1", "ACME-3", "ACME-4"):
            self.assertEqual(0, self.wt("new", key, "--domain", "dom").returncode)
        self.assertEqual(3, self.wt("new", "ACME-5", "--domain", "dom").returncode)
        self.assertEqual(0, self.wt("new", "ACME-5", "--docs").returncode)

    def test_list_all_groups_by_repo(self):
        self.wt("new", "ACME-1", "--domain", "dom")
        self.wt("new", "ACME-3", "--docs")
        data = json.loads(self.wt("list", "--all", "--json").stdout)
        self.assertEqual({"dom", "."}, {row["repo"] for row in data["worktrees"]})


if __name__ == "__main__":
    unittest.main()
