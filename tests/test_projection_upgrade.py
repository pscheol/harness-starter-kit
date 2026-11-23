"""v1.0.8 설치본 → v2 update: 포인터가 복사본 · 생성물로 바뀐다(HK-13 R8 · R9, design §6.3).

    python3 -m unittest tests.test_projection_upgrade

v1.0.8(e181b6f) setup.sh 로 깐 리포를 두 벌로 복사해 한 벌은 새 update.sh, 다른 벌은 CLI update 로 올린다.
두 트리가 같고, 고치지 않은 포인터는 사라지고, 사람이 고친 포인터는 그대로 두고 새 판을 .new 로 받는다.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cli_dist  # noqa: E402
from projection_kit import CHECK_LAYOUT, TOKENS, extract_v108, harness_files  # noqa: E402
from test_cli_parity import base_env  # noqa: E402
from test_cli_update_parity import snapshot  # noqa: E402

KIT = cli_dist.KIT
UPDATE = KIT / "plugins/harness-kit/skills/hx-update/update.sh"
TEMPLATES = cli_dist.PLUGIN_TEMPLATES
POINTER_PHRASES = ("를 읽고 그대로 수행한다", "를 읽고 그대로 따른다", "얇은 포인터", "(포인터)")
EDITED_STEERING = ".kiro/steering/git-workflow.md"
EDITED_COMMAND = ".claude/commands/hx-plan.md"


@unittest.skipUnless(shutil.which("node"), "Node 18.3 이상이 필요하다")
class ProjectionUpgradeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cli = cli_dist.cli_bundle()
        cls.tmp = Path(tempfile.mkdtemp(prefix="hk-upgrade-")).resolve()
        setup = extract_v108(cls.tmp / "v108")
        if setup is None:
            raise unittest.SkipTest("v1.0.8 커밋(e181b6f)이 없다")
        base = cls.tmp / "base" / "acme-notes"
        r = subprocess.run(["bash", str(setup), "--stack=jvm", "--agents=all", "--modules=jira-workflow", str(base)],
                           env=base_env(TOKENS), capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            raise RuntimeError(r.stderr[-2000:])
        cls.base = base
        for rel in (EDITED_STEERING, EDITED_COMMAND):
            with (base / rel).open("a", encoding="utf-8") as f:
                f.write("사람이 고친 포인터 줄\n")
        cls.sh = cls.tmp / "sh" / "acme-notes"
        cls.cl = cls.tmp / "cli" / "acme-notes"
        for target in (cls.sh, cls.cl):
            shutil.copytree(base, target, symlinks=True)
        # 1차 update: 표시 줄 없는 v1.0.8 lock 이라 킷이 바꾼 파일은 모두 .new(HK-12 R12.6). 원본이 .new 대기인 배치는 미룬다(design §6.3).
        cls.first = cls.update_both()
        cls.first_trees = (snapshot(cls.sh), snapshot(cls.cl))
        cls.first_context = cls.measure(cls.cl)
        # 사람이 .new 를 모두 받아들인다(mv) — 그다음 update 가 포인터를 복사본 · 생성물로 바꾼다.
        for target in (cls.sh, cls.cl):
            for p in sorted(target.rglob("*.new")):
                os.replace(p, p.with_suffix(""))
        cls.sh_run, cls.cli_run = cls.update_both()

    @classmethod
    def update_both(cls) -> tuple[subprocess.CompletedProcess, subprocess.CompletedProcess]:
        env = base_env({})
        sh = subprocess.run(["bash", str(UPDATE), str(cls.sh)], env=env, capture_output=True, text=True, timeout=600)
        cl = subprocess.run(["node", str(cls.cli), "update", "--json", "--templates", str(TEMPLATES), "--cwd", str(cls.cl)],
                            env=env, capture_output=True, text=True, timeout=600)
        return sh, cl

    @classmethod
    def measure(cls, root: Path) -> dict[str, int]:
        r = subprocess.run([sys.executable, "-B", str(CHECK_LAYOUT), "--root", str(root), "--context", "--json"],
                           capture_output=True, text=True, timeout=120, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        if r.returncode != 0:
            raise RuntimeError(r.stdout + r.stderr)
        return {h: v["total"] for h, v in json.loads(r.stdout)["context"].items()}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_both_updates_give_the_same_tree(self):
        sh1, cl1 = self.first
        self.assertEqual(sh1.returncode, 0, sh1.stdout[-2000:] + sh1.stderr[-2000:])
        self.assertEqual(cl1.returncode, 4, cl1.stdout[-2000:] + cl1.stderr[-2000:])
        self.assertEqual(self.sh_run.returncode, 0, self.sh_run.stdout[-2000:] + self.sh_run.stderr[-2000:])
        self.assertEqual(self.cli_run.returncode, 4, self.cli_run.stdout[-2000:] + self.cli_run.stderr[-2000:])
        for (sh_files, sh_dirs), (cl_files, cl_dirs) in (self.first_trees, (snapshot(self.sh), snapshot(self.cl))):
            self.assertEqual(sorted(set(sh_files) ^ set(cl_files)), [])
            self.assertEqual(sorted(r for r in sh_files if sh_files[r] != cl_files[r]), [])
            self.assertEqual(sorted(sh_dirs ^ cl_dirs), [])

    def test_first_update_defers_projection_and_keeps_budget(self):
        """원본이 .new 대기면 옛 포인터를 두고 paths 없는 옛 규칙을 배치하지 않는다 — 상시 양이 늘지 않는다."""
        before = self.measure(self.base)
        for h, size in self.first_context.items():
            with self.subTest(harness=h):
                self.assertLessEqual(size, before[h])
        j = json.loads(self.first[1].stdout)
        self.assertIn("defer", {o["action"] for o in j["projection"]["ops"]})

    def test_untouched_pointers_become_copies(self):
        for target in (self.sh, self.cl):
            with self.subTest(target=target.parent.name):
                files = harness_files(target)
                self.assertEqual([f for f in files if f.startswith(".claude/commands/")], [EDITED_COMMAND])
                for skill in ("hx-plan", "hx-issue"):
                    src = (target / ".agents/skills" / skill / "SKILL.md").read_bytes()
                    self.assertEqual((target / ".claude/skills" / skill / "SKILL.md").read_bytes(), src)
                    self.assertEqual((target / ".kiro/skills" / skill / "SKILL.md").read_bytes(), src)
                self.assertTrue((target / "CLAUDE.md").read_text(encoding="utf-8").startswith("@AGENTS.md\n"))
                left = [f for f in files if not f.endswith((".new", ".bak")) and f not in (EDITED_STEERING, EDITED_COMMAND)
                        and any(p in (target / f).read_text(encoding="utf-8", errors="replace") for p in POINTER_PHRASES)]
                self.assertEqual(left, [])

    def test_edited_pointers_are_kept_with_new(self):
        j = json.loads(self.cli_run.stdout)
        for target in (self.sh, self.cl):
            with self.subTest(target=target.parent.name):
                self.assertIn("사람이 고친 포인터 줄", (target / EDITED_STEERING).read_text(encoding="utf-8"))
                self.assertIn("사람이 고친 포인터 줄", (target / EDITED_COMMAND).read_text(encoding="utf-8"))
        conflicts = [c["path"] for c in j["conflicts"]]
        self.assertTrue((self.cl / f"{EDITED_STEERING}.new").is_file())
        self.assertIn(EDITED_STEERING, conflicts)
        self.assertIn(EDITED_COMMAND, [o["path"] for o in j["projection"]["ops"] if o["action"] == "keep-modified"])

    def test_session_context_does_not_grow_after_upgrade(self):
        before = self.measure(self.base)
        after = self.measure(self.cl)
        for h, size in after.items():
            with self.subTest(harness=h):
                self.assertLessEqual(size, before[h])

    def test_layout_check_runs_on_upgraded_cli_tree(self):
        r = subprocess.run([sys.executable, "-B", str(CHECK_LAYOUT), "--root", str(self.cl), "--json"], capture_output=True, text=True, timeout=120)
        report = json.loads(r.stdout)
        kinds = {f["kind"] for f in report["findings"] if f["severity"] == "error"}
        # 남는 오류는 사람이 고친 포인터(drifted)뿐이다.
        self.assertLessEqual(kinds, {"drifted"}, r.stdout[-2000:])


if __name__ == "__main__":
    unittest.main()
