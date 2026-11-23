"""생성물 시험 — plugins/harness-kit/ 이 packages/ 에서 만든 결과와 같은지 본다(HK-1).

    python3 -m unittest tests.test_generated

Node 18 이상이 필요하다(킷 개발 환경). 플러그인을 쓰는 사용자 환경에는 필요 없다.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

KIT = Path(__file__).resolve().parents[1]
GEN = KIT / "scripts/gen-plugins.mjs"
PLUGIN = KIT / "plugins/harness-kit"
COPY_IGNORE = shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store", "node_modules")


def node(*args: str, cwd: Path = KIT) -> subprocess.CompletedProcess:
    return subprocess.run(["node", str(cwd / "scripts/gen-plugins.mjs"), *args], cwd=cwd,
                          capture_output=True, text=True, timeout=120)


def tree(root: Path) -> dict[str, tuple[bytes, bool]]:
    out: dict[str, tuple[bytes, bool]] = {}
    for p in sorted(root.rglob("*")):
        if p.is_file() and p.name != ".DS_Store" and "__pycache__" not in p.parts:
            out[p.relative_to(root).as_posix()] = (p.read_bytes(), os.access(p, os.X_OK))
    return out


@unittest.skipUnless(shutil.which("node"), "Node 18 이상이 필요하다")
class GeneratedPluginTest(unittest.TestCase):
    def kit_copy(self) -> Path:
        tmp = Path(tempfile.mkdtemp(prefix="hk-gen-"))
        self.addCleanup(shutil.rmtree, tmp, True)
        for name in ("packages", "plugins", "scripts"):
            shutil.copytree(KIT / name, tmp / name, ignore=COPY_IGNORE, symlinks=True)
        return tmp

    def test_check_passes_on_committed_tree(self):
        r = node("--check")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_detects_manual_edit_of_generated_file(self):
        kit = self.kit_copy()
        target = kit / "plugins/harness-kit/skills/hx-bootstrap/SKILL.md"
        target.write_text(target.read_text(encoding="utf-8") + "\n손으로 고친 줄\n", encoding="utf-8")
        r = node("--check", cwd=kit)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("skills/hx-bootstrap/SKILL.md", r.stdout)

    def test_detects_lost_exec_bit(self):
        kit = self.kit_copy()
        execs = sorted(p for p in (kit / "plugins/harness-kit").rglob("*") if p.is_file() and os.access(p, os.X_OK))
        self.assertTrue(execs, "실행 권한이 있는 생성물이 하나 이상 있어야 한다")
        target = execs[0]
        target.chmod(0o644)
        r = node("--check", cwd=kit)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("x " + target.relative_to(kit / "plugins/harness-kit").as_posix(), r.stdout)

    def test_output_is_deterministic(self):
        a = Path(tempfile.mkdtemp(prefix="hk-gen-a-"))
        b = Path(tempfile.mkdtemp(prefix="hk-gen-b-"))
        self.addCleanup(shutil.rmtree, a, True)
        self.addCleanup(shutil.rmtree, b, True)
        self.assertEqual(node("--out", str(a)).returncode, 0)
        self.assertEqual(node("--out", str(b)).returncode, 0)
        self.assertEqual(tree(a), tree(b))
        self.assertEqual(tree(a), tree(PLUGIN))

    def test_overlapping_layers_are_rejected(self):
        kit = self.kit_copy()
        dup = kit / "packages/legacy-setup/hx-bootstrap/SKILL.md"
        dup.write_text("겹침\n", encoding="utf-8")
        r = node("--check", cwd=kit)
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn("SKILL.md", r.stdout + r.stderr)

    def test_refuses_dangerous_out(self):
        """원본 · 저장소 루트 · 생성물이 아닌 폴더는 지우지 않는다(R2.4)."""
        kit = self.kit_copy()
        keep = kit / "keep"
        keep.mkdir()
        (keep / "note.txt").write_text("남아야 한다\n", encoding="utf-8")
        for out in (kit / "packages", kit / "packages/templates", kit, keep, Path("/")):
            r = node("--out", str(out), cwd=kit)
            self.assertEqual(r.returncode, 2, f"{out}: {r.stdout}{r.stderr}")
        self.assertTrue((kit / "packages/templates/common").is_dir())
        self.assertTrue((keep / "note.txt").is_file())

    def test_plugin_matches_layers(self):
        """생성물의 세 층이 원본 세 곳에서 왔다(R1.1 · R3.1)."""
        self.assertTrue((KIT / "packages/templates/common").is_dir())
        self.assertTrue((KIT / "packages/legacy-setup/hx-bootstrap/setup.sh").is_file())
        self.assertTrue((KIT / "packages/plugin/.claude-plugin/plugin.json").is_file())
        self.assertFalse((PLUGIN / "skills/hx-bootstrap/tools").exists(), "개발 도구는 플러그인에 넣지 않는다")
        self.assertTrue((PLUGIN / "skills/hx-bootstrap/templates/common").is_dir())


if __name__ == "__main__":
    unittest.main()
