"""`npx github:<owner>/harness-starter-kit#<태그> <명령>` 이 도는가(결정 D3 · 설계 02 R1.1).

루트 package.json 의 bin 이 플러그인 안의 CLI 를 가리키고, files 가 그 CLI 와 템플릿만 담는다. npm 이 있으면 실제로 묶어
(npm pack) 임시 캐시로 npx 를 돌려 판이 나오는지 본다 — 이 시험이 없어서 D3 를 빠뜨린 적이 있다(2026-11-25).
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
ROOT_PKG = KIT / "package.json"
CLI_PKG = KIT / "packages/cli/package.json"


def npm_works() -> bool:
    if not shutil.which("npm"):
        return False
    r = subprocess.run(["npm", "--version"], capture_output=True, text=True, timeout=60)
    return r.returncode == 0


class NpxPackageTest(unittest.TestCase):
    def test_root_bin_points_to_the_plugin_cli(self):
        pkg = json.loads(ROOT_PKG.read_text(encoding="utf-8"))
        self.assertTrue(pkg.get("version"), "npm 이 묶으려면 version 이 있어야 한다")
        self.assertEqual(list(pkg.get("bin", {})), ["knots-sync"], "npx 는 bin 이 하나여야 이름 없이 그 bin 을 돈다")
        cli = KIT / pkg["bin"]["knots-sync"]
        self.assertTrue(cli.is_file(), cli)
        self.assertTrue(os.access(cli, os.X_OK), f"{cli} 에 실행 권한이 없다")
        self.assertTrue(cli.read_text(encoding="utf-8", errors="replace").startswith("#!/usr/bin/env node"))
        self.assertIn("plugins/kns/", pkg.get("files", []))
        self.assertTrue((cli.parent.parent / "templates/layout.json").is_file(), "CLI 옆에 템플릿이 있어야 한다")

    @unittest.skipUnless(npm_works(), "npm 이 없다")
    def test_packed_package_runs_with_npx(self):
        tmp = Path(tempfile.mkdtemp(prefix="kns-npx-"))
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        env = {**os.environ, "npm_config_cache": str(tmp / "cache"), "npm_config_update_notifier": "false", "npm_config_fund": "false"}
        packed = subprocess.run(["npm", "pack", "--json", "--pack-destination", str(tmp)], cwd=KIT, capture_output=True, text=True, timeout=300, env=env)
        self.assertEqual(packed.returncode, 0, packed.stderr[-2000:])
        info = json.loads(packed.stdout[packed.stdout.index("["):])[0]
        paths = {f["path"] for f in info["files"]}
        self.assertIn("plugins/kns/skills/bootstrap/bin/knots-sync.js", paths)
        self.assertIn("plugins/kns/skills/bootstrap/templates/layout.json", paths)
        self.assertFalse([p for p in paths if p.startswith(("packages/", "docs/", "tests/"))], "원본 · 문서 · 시험은 담지 않는다")
        run = subprocess.run(["npx", "--yes", "--package", str(tmp / info["filename"]), "knots-sync", "--version"],
                             cwd=tmp, capture_output=True, text=True, timeout=300, env=env)
        self.assertEqual(run.returncode, 0, run.stderr[-2000:])
        self.assertEqual(run.stdout.strip(), json.loads(CLI_PKG.read_text(encoding="utf-8"))["version"])


if __name__ == "__main__":
    unittest.main()
