"""플러그인 스킬의 CLI 호출 갈래 시험 — skills/hx-bootstrap/kit.sh(HK-12 R12.4, design §6).

    python3 -m unittest tests.test_kit_wrapper

Node 18.3 이상이면 bin/harness-kit.js(CLI)를, 없거나 낮으면 setup.sh · update.sh · add-agent.sh 를 부른다.
Node 버전은 HARNESS_KIT_NODE 로 가짜 node 를 넣어 바꾼다. 두 갈래가 같은 트리를 만드는지 본다. 네트워크를 쓰지 않는다.
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
from test_cli_parity import base_env  # noqa: E402
from test_cli_update_parity import snapshot  # noqa: E402

KIT_SH = cli_dist.KIT / "plugins/harness-kit/skills/hx-bootstrap/kit.sh"
REAL_NODE = shutil.which("node")
INIT_FLAGS = ("--stack", "go", "--arch", "flat", "--agents", "codex,kiro", "--modules", "jira-workflow",
              "--name", "Acme Notes", "--slug", "acme-notes", "--package-ns=github.com/acme/notes", "--token", "SERVICE_NAME=notes-api")


@unittest.skipUnless(REAL_NODE, "Node 18.3 이상이 필요하다")
class KitWrapperTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="hk-kitsh-")).resolve()
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def fake_node(self, version: str) -> str:
        """-e 로 버전을 물으면 version 을, 그 밖에는 진짜 node 를 부르는 가짜 node."""
        path = self.tmp / f"node-{version}"
        path.write_text(f'#!/bin/sh\nif [ "$1" = "-e" ]; then printf "%s" "{version}"; exit 0; fi\nexec "{REAL_NODE}" "$@"\n', encoding="utf-8")
        path.chmod(0o755)
        return str(path)

    def kit(self, *args: str, node: str | None = None) -> subprocess.CompletedProcess:
        env = base_env({})
        if node is not None:
            env["HARNESS_KIT_NODE"] = node
        return subprocess.run(["bash", str(KIT_SH), *args], env=env, capture_output=True, text=True, timeout=300)

    def test_kit_sh_is_executable_bash_3_2_script(self):
        self.assertTrue(os.access(KIT_SH, os.X_OK))
        self.assertTrue(KIT_SH.read_text(encoding="utf-8").startswith("#!/usr/bin/env bash\n"))
        self.assertTrue((KIT_SH.parent / "bin/harness-kit.js").is_file())

    def test_which_picks_cli_only_from_node_18_3(self):
        cases = {str(self.tmp / "no-node"): "legacy", self.fake_node("16.20.2"): "legacy", self.fake_node("18.2.1"): "legacy",
                 self.fake_node("18.3.0"): "cli", self.fake_node("v22.1.0"): "cli", REAL_NODE: "cli"}
        for node, want in cases.items():
            with self.subTest(node=Path(node).name):
                r = self.kit("--which", node=node)
                self.assertEqual((r.returncode, r.stdout.strip()), (0, want), r.stderr)

    def test_cli_branch_passes_arguments_through(self):
        version = json.loads((cli_dist.CLI_DIR / "package.json").read_text(encoding="utf-8"))["version"]
        r = self.kit("--version")
        self.assertEqual((r.returncode, r.stdout), (0, f"{version}\n"), r.stderr)

    def test_legacy_init_makes_the_same_tree_as_cli_init(self):
        cl, sh = self.tmp / "cli" / "acme-notes", self.tmp / "sh" / "acme-notes"
        cli = self.kit("init", "--cwd", str(cl), "--yes", "--json", *INIT_FLAGS)
        self.assertEqual(cli.returncode, 0, cli.stdout[-2000:] + cli.stderr[-2000:])
        self.assertEqual(json.loads(cli.stdout)["command"], "init")
        legacy = self.kit("init", "--cwd", str(sh), "--yes", "--json", *INIT_FLAGS, node=self.fake_node("16.20.2"))
        self.assertEqual(legacy.returncode, 0, legacy.stdout[-2000:] + legacy.stderr[-2000:])
        first = legacy.stdout.splitlines()[0]
        self.assertIn("Node 18.3", first)
        self.assertIn("setup.sh", first)
        self.assertIn("JSON 출력은 CLI 에서만", legacy.stdout)
        a, b = snapshot(cl), snapshot(sh)
        self.assertEqual(sorted(set(a[0]) ^ set(b[0])), [])
        self.assertEqual(sorted(r for r in a[0] if a[0][r] != b[0][r]), [])
        meta = json.loads((sh / ".agents/harness-kit.json").read_text(encoding="utf-8"))
        self.assertEqual((meta["stack"], meta["arch"], meta["agents"], meta["modules"]), ("go", "flat", ["codex", "kiro"], ["jira-workflow"]))
        self.assertEqual(meta["tokens"]["SERVICE_NAME"], "notes-api")

    def test_legacy_plan_update_add_go_to_v1_scripts(self):
        old = self.fake_node("18.2.1")
        target = self.tmp / "acme-notes"
        plan = self.kit("plan", "--cwd", str(target), "--stack", "python", "--agents", "claude", node=old)
        self.assertEqual(plan.returncode, 0, plan.stderr)
        self.assertIn("dry-run", plan.stdout)
        self.assertEqual([p for p in target.rglob("*") if p.is_file()], [])
        init = self.kit("init", "--cwd", str(target), "--stack", "python", "--agents", "claude", node=old)
        self.assertEqual(init.returncode, 0, init.stderr)
        update = self.kit("update", "--cwd", str(target), "--dry-run", node=old)
        self.assertEqual(update.returncode, 0, update.stderr)
        self.assertIn("update.sh", update.stdout.splitlines()[0])
        self.assertRegex(update.stdout, r"conflict=0")
        twin = self.tmp / "twin" / "acme-notes"
        shutil.copytree(target, twin, symlinks=True)
        add = self.kit("add", "cursor", "platform-guards", "--cwd", str(target), node=old)
        self.assertEqual(add.returncode, 0, add.stdout[-2000:] + add.stderr[-2000:])
        self.assertIn("add-agent.sh", add.stdout.splitlines()[0])
        self.assertIn("platform-guards 모듈은 공통 층에 포함됨", add.stdout)
        meta = json.loads((target / ".agents/harness-kit.json").read_text(encoding="utf-8"))
        self.assertEqual((meta["agents"], meta["modules"]), (["claude", "cursor"], []))
        cli = self.kit("add", "cursor", "platform-guards", "--cwd", str(twin), "--json")
        self.assertEqual(cli.returncode, 0, cli.stdout[-2000:])
        a, b = snapshot(target), snapshot(twin)
        self.assertEqual(sorted(set(a[0]) ^ set(b[0])), [])
        self.assertEqual(sorted(r for r in a[0] if a[0][r] != b[0][r]), [])

    def test_legacy_rejects_cli_only_flags_and_commands(self):
        old = self.fake_node("16.20.2")
        target = self.tmp / "x"
        for args, code in (
            (("init", "--adopt", "--cwd", str(target)), 2),
            (("init", "--templates", str(self.tmp), "--cwd", str(target)), 2),
            (("init", "--token", "BOGUS=1", "--cwd", str(target)), 2),
            (("update", "--prune", "--cwd", str(target)), 2),
            (("update", "--forget", "AGENTS.md", "--cwd", str(target)), 2),
            (("doctor", "--cwd", str(target)), 5),
            (("remove", "codex", "--cwd", str(target)), 5),
            (("outdated",), 5),
        ):
            with self.subTest(args=args[:2]):
                r = self.kit(*args, node=old)
                self.assertEqual(r.returncode, code, r.stdout + r.stderr)
                self.assertIn("Node 18.3", r.stdout + r.stderr)
        self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
