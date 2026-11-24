"""scripts/release.sh 시험 — 다섯 버전 값 · --check · --dry-run · 커밋 · 로컬 태그(설계 11 MG-R8 · MG-R9, 완료 기준 5 · 6).

    python3 -m unittest tests.test_release

임시 git 리포에 매니페스트 7개(다섯 값 + 원본 매니페스트 둘)와 CHANGELOG 만 복사해 돌린다.
생성물 · 시험 명령은 KNS_RELEASE_BUILD_CMD · KNS_RELEASE_TEST_CMD 로 바꿔 부르지 않는다. 네트워크 · push 를 쓰지 않는다.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

KIT = Path(__file__).resolve().parents[1]
RELEASE = KIT / "scripts/release.sh"
FIVE = [
    "packages/cli/package.json",
    ".claude-plugin/marketplace.json",
    ".agents/plugins/marketplace.json",
    "plugins/kns/.claude-plugin/plugin.json",
    "plugins/kns/.codex-plugin/plugin.json",
]
SOURCES = ["packages/plugin/.claude-plugin/plugin.json", "packages/plugin/.codex-plugin/plugin.json"]
ALL = FIVE + SOURCES


def version_of(path: Path) -> str:
    doc = json.loads(path.read_text(encoding="utf-8"))
    if "plugins" in doc:
        return next(p for p in doc["plugins"] if p["name"] == "knots-sync")["version"]
    return doc["version"]


@unittest.skipUnless(shutil.which("node") and shutil.which("git"), "node · git 이 필요하다")
class ReleaseScriptTest(unittest.TestCase):
    def setUp(self):
        self.repo = Path(tempfile.mkdtemp(prefix="hk-release-")).resolve()
        self.addCleanup(shutil.rmtree, self.repo, True)
        for rel in ALL:
            (self.repo / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(KIT / rel, self.repo / rel)
        self.set_all("2.0.0-alpha.0")
        (self.repo / "CHANGELOG.md").write_text("# 변경 기록\n\n## 2.0.0-alpha.1\n\n- 시험\n\n## 2.0.0-alpha.0\n\n- 처음\n", encoding="utf-8")
        self.env = {**os.environ, "KNS_RELEASE_ROOT": str(self.repo), "KNS_RELEASE_BUILD_CMD": "true", "KNS_RELEASE_TEST_CMD": "true",
                    "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_SYSTEM": "/dev/null",
                    "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com"}
        self.git("init", "-q", "-b", "main")
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "base")

    def git(self, *args: str) -> str:
        r = subprocess.run(["git", *args], cwd=self.repo, env=self.env, capture_output=True, text=True)
        self.assertEqual(0, r.returncode, r.stderr)
        return r.stdout

    def release(self, *args: str, **env) -> subprocess.CompletedProcess:
        return subprocess.run(["bash", str(RELEASE), *args], cwd=self.repo, env={**self.env, **env}, capture_output=True, text=True, timeout=120)

    def set_all(self, version: str, only: list[str] | None = None):
        for rel in only or ALL:
            path = self.repo / rel
            doc = json.loads(path.read_text(encoding="utf-8"))
            (next(p for p in doc["plugins"] if p["name"] == "knots-sync") if "plugins" in doc else doc)["version"] = version
            path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def versions(self) -> list[str]:
        return [version_of(self.repo / rel) for rel in ALL]

    # ── --check ──

    def test_check_passes_when_all_equal_and_fails_when_one_differs(self):
        ok = self.release("--check")
        self.assertEqual(0, ok.returncode, ok.stderr)
        for rel in FIVE:
            with self.subTest(file=rel):
                self.set_all("2.0.0-alpha.0")
                self.set_all("1.0.8", [rel])
                r = self.release("--check")
                self.assertEqual(1, r.returncode, r.stdout)
                self.assertIn(rel, r.stdout)
                self.assertIn("1.0.8", r.stdout)

    def test_check_also_fails_when_a_source_manifest_differs_from_the_generated_one(self):
        self.set_all("9.9.9", [SOURCES[0]])
        self.assertEqual(1, self.release("--check").returncode)

    def test_check_rejects_a_version_argument(self):
        self.assertEqual(2, self.release("--check", "2.0.0").returncode)

    # ── --dry-run ──

    def test_dry_run_lists_the_five_files_and_writes_nothing(self):
        r = self.release("9.9.9", "--dry-run")
        self.assertEqual(0, r.returncode, r.stderr)
        for rel in FIVE:
            self.assertIn(rel, r.stdout)
        self.assertEqual("", self.git("status", "--porcelain"))
        self.assertEqual(["2.0.0-alpha.0"] * 7, self.versions())
        self.assertEqual("", self.git("tag"))

    def test_dry_run_only_warns_about_changelog_and_dirty_tree(self):
        (self.repo / "dirty.txt").write_text("x", encoding="utf-8")
        r = self.release("9.9.9", "--dry-run")
        self.assertEqual(0, r.returncode, r.stderr)
        self.assertIn("CHANGELOG.md", r.stderr)
        self.assertIn("깨끗하지 않다", r.stderr)

    # ── 실행 ──

    def test_release_changes_only_version_lines_commits_and_tags_locally(self):
        r = self.release("2.0.0-alpha.1")
        self.assertEqual(0, r.returncode, r.stderr + r.stdout)
        self.assertEqual(["2.0.0-alpha.1"] * 7, self.versions())
        stat = self.git("diff", "HEAD~1", "--numstat").strip().splitlines()
        self.assertEqual(sorted(ALL), sorted(line.split("\t")[2] for line in stat))
        self.assertTrue(all(line.split("\t")[:2] == ["1", "1"] for line in stat), stat)
        diff = self.git("diff", "-U0", "HEAD~1")
        changed = [ln for ln in diff.splitlines() if ln[:1] in "+-" and not ln.startswith(("+++", "---"))]
        self.assertTrue(all('"version":' in ln for ln in changed), changed)
        self.assertEqual("v2.0.0-alpha.1", self.git("tag").strip())
        self.assertEqual("chore: release v2.0.0-alpha.1", self.git("log", "-1", "--format=%s").strip())
        self.assertEqual(0, self.release("--check").returncode)

    def test_release_never_pushes_and_needs_no_remote(self):
        self.assertEqual("", self.git("remote").strip())
        self.assertEqual(0, self.release("2.0.0-alpha.1").returncode)
        text = RELEASE.read_text(encoding="utf-8")
        for line in text.splitlines():
            if "git push" in line:
                self.assertTrue(line.lstrip().startswith(("echo", "#")), line)

    def test_no_commit_leaves_changes_in_the_work_tree(self):
        r = self.release("2.0.0-alpha.1", "--no-commit")
        self.assertEqual(0, r.returncode, r.stderr)
        self.assertEqual(["2.0.0-alpha.1"] * 7, self.versions())
        self.assertEqual("", self.git("tag"))
        self.assertEqual("base", self.git("log", "-1", "--format=%s").strip())

    def test_version_must_be_semver_and_greater(self):
        for bad in ("2.0", "v2.0.0", "2.0.0-beta.1", "2.0.0-alpha.0", "1.9.9", "2.0.0-alpha"):
            with self.subTest(version=bad):
                r = self.release(bad)
                self.assertEqual(2, r.returncode, r.stderr)
        self.assertEqual(["2.0.0-alpha.0"] * 7, self.versions())

    def test_prerelease_is_smaller_than_the_release_of_the_same_numbers(self):
        self.set_all("2.0.0-rc.1")
        (self.repo / "CHANGELOG.md").write_text("## 2.0.0\n\n- x\n## 2.0.0-rc.2\n", encoding="utf-8")
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "x")
        self.assertEqual(0, self.release("2.0.0-rc.2", "--dry-run").returncode)
        self.assertEqual(0, self.release("2.0.0", "--dry-run").returncode)
        self.assertEqual(2, self.release("2.0.0-alpha.9").returncode)

    def test_same_version_is_allowed_only_to_realign_split_values(self):
        self.assertEqual(2, self.release("2.0.0-alpha.0").returncode)
        self.set_all("1.0.8", [FIVE[1], SOURCES[0]])
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "split")
        r = self.release("2.0.0-alpha.0", "--no-commit")
        self.assertEqual(0, r.returncode, r.stderr + r.stdout)
        self.assertEqual(["2.0.0-alpha.0"] * 7, self.versions())

    def test_missing_changelog_section_stops_before_any_write(self):
        (self.repo / "CHANGELOG.md").write_text("# 변경 기록\n", encoding="utf-8")
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "no section")
        r = self.release("2.0.0-alpha.1")
        self.assertEqual(1, r.returncode)
        self.assertEqual(["2.0.0-alpha.0"] * 7, self.versions())
        self.assertEqual("", self.git("status", "--porcelain"))

    def test_dirty_tree_and_other_branch_stop_with_exit_3(self):
        (self.repo / "dirty.txt").write_text("x", encoding="utf-8")
        self.assertEqual(3, self.release("2.0.0-alpha.1").returncode)
        (self.repo / "dirty.txt").unlink()
        self.git("checkout", "-q", "-b", "feature/x")
        self.assertEqual(3, self.release("2.0.0-alpha.1").returncode)
        self.assertEqual(0, self.release("2.0.0-alpha.1", "--no-commit", KNS_RELEASE_ANY_BRANCH="1").returncode)
        self.git("checkout", "-q", "--", ".")
        self.git("checkout", "-q", "-b", "release/2.0")
        self.assertEqual(0, self.release("2.0.0-alpha.1", "--no-commit").returncode)

    def test_failing_tests_leave_no_commit_and_no_tag(self):
        r = self.release("2.0.0-alpha.1", KNS_RELEASE_TEST_CMD="false")
        self.assertEqual(1, r.returncode)
        self.assertEqual("", self.git("tag"))
        self.assertEqual("base", self.git("log", "-1", "--format=%s").strip())

    def test_a_file_with_another_indent_is_rolled_back(self):
        path = self.repo / FIVE[0]
        doc = json.loads(path.read_text(encoding="utf-8"))
        path.write_text(json.dumps(doc, indent=4) + "\n", encoding="utf-8")
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "indent 4")
        r = self.release("2.0.0-alpha.1")
        self.assertEqual(1, r.returncode, r.stdout)
        self.assertEqual("", self.git("status", "--porcelain"))
        self.assertEqual(["2.0.0-alpha.0"] * 7, self.versions())


class RealFilesTest(unittest.TestCase):
    """이 리포의 실제 파일 — 다섯 값이 같다(MR 마다 도는 --check 와 같은 검사)."""

    @unittest.skipUnless(shutil.which("node"), "node 가 필요하다")
    def test_repo_versions_are_aligned(self):
        r = subprocess.run(["bash", str(RELEASE), "--check"], cwd=KIT, capture_output=True, text=True, timeout=60)
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)

    def test_update_sh_and_cli_read_the_same_version(self):
        plugin = version_of(KIT / "plugins/kns/.claude-plugin/plugin.json")
        self.assertEqual(plugin, version_of(KIT / "packages/cli/package.json"))
        bundle = (KIT / "plugins/kns/skills/bootstrap/bin/knots-sync.js").read_text(encoding="utf-8").splitlines()[1]
        self.assertIn(f"knots-sync {plugin} ", bundle)


if __name__ == "__main__":
    unittest.main()
