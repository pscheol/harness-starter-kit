"""v1.0.7 이하 설치본 → v2 update: 옛 훅 줄이 지워진 스크립트를 부르지 않는다(HK-22, 2026-11-25 knots-ai 실측).

    python3 -m unittest tests.test_projection_upgrade_v107

v1.0.2~1.0.7 은 훅 스크립트를 .claude/hooks/*.sh · .codex/hooks/*.sh 에 두고 설정에서 그 경로로 불렀다(v1.0.8 은 scripts/hooks/).
v2 update 는 고치지 않은 그 스크립트를 포인터로 보고 지우는데(retire), 설정의 호출 줄은 사람 줄로 보고 남겨
세션을 열 때마다 훅 오류가 났고 턴 끝 검증이 두 번 돌았다. 고친 뒤에는:
- 지우는 스크립트를 부르는 줄은 킷 줄로 보고 새 훅으로 바꾼다.
- 사람이 고쳐 남긴 스크립트는 줄도 남기고(덮지 않는다), 왜 남겼는지 알린다.
- 사람이 넣은 다른 훅 줄은 그대로다.
두 경로(update.sh · CLI)가 같은 트리를 만든다.
"""

from __future__ import annotations

import io
import json
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cli_dist  # noqa: E402
from projection_kit import TOKENS  # noqa: E402
from test_cli_parity import base_env  # noqa: E402
from test_cli_update_parity import snapshot  # noqa: E402

KIT = cli_dist.KIT
UPDATE = KIT / "plugins/kns/skills/update/update.sh"
TEMPLATES = cli_dist.PLUGIN_TEMPLATES
V107_COMMIT = "e5f103699a9c95fbb2c8ea7755d70640688f7092"  # release/v1.0.7
EDITED_HOOK = ".claude/hooks/verify.sh"
USER_HOOK = "echo user-session-hook"
HOOK_FILES = (".claude/settings.json", ".codex/hooks.json")
# 리포 기준 상대경로로 부르는 스크립트(`"$CLAUDE_PROJECT_DIR"/x` · `bash .codex/x` · dispatch.sh 의 인자)
SCRIPT_REF = re.compile(r"""(?:\$CLAUDE_PROJECT_DIR"?/|(?<![\w/.-]))((?:\.claude|\.codex|scripts)/[\w./-]+\.(?:sh|py))""")


def extract_v107(dest: Path) -> Path | None:
    r = subprocess.run(["git", "-C", str(KIT), "archive", V107_COMMIT, "plugins/harness-kit"], capture_output=True, timeout=120)
    if r.returncode != 0:
        return None
    with tarfile.open(fileobj=io.BytesIO(r.stdout)) as tar:
        tar.extractall(dest, filter="data")
    setup = dest / "plugins/harness-kit/skills/hx-bootstrap/setup.sh"
    return setup if setup.is_file() else None


def hook_commands(root: Path) -> list[tuple[str, str, str]]:
    """[(설정 파일, 이벤트, 명령)]"""
    out = []
    for rel in HOOK_FILES:
        p = root / rel
        if not p.is_file():
            continue
        for event, groups in (json.loads(p.read_text(encoding="utf-8")).get("hooks") or {}).items():
            for g in groups:
                for h in g.get("hooks") or []:
                    if isinstance(h.get("command"), str):
                        out.append((rel, event, h["command"]))
    return out


@unittest.skipUnless(shutil.which("node"), "Node 18.3 이상이 필요하다")
class UpgradeFromV107Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cli = cli_dist.cli_bundle()
        cls.tmp = Path(tempfile.mkdtemp(prefix="kns-v107-")).resolve()
        setup = extract_v107(cls.tmp / "v107")
        if setup is None:
            raise unittest.SkipTest(f"v1.0.7 커밋({V107_COMMIT[:7]})이 없다")
        base = cls.tmp / "base" / "acme-notes"
        r = subprocess.run(["bash", str(setup), "--stack=python", "--agents=claude,codex", str(base)],
                           env=base_env(TOKENS), capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            raise RuntimeError(r.stdout[-2000:] + r.stderr[-2000:])
        with (base / EDITED_HOOK).open("a", encoding="utf-8") as f:
            f.write("# 사람이 고친 옛 훅 줄\n")
        settings = base / ".claude/settings.json"
        data = json.loads(settings.read_text(encoding="utf-8"))
        data["hooks"]["SessionStart"].insert(0, {"matcher": "", "hooks": [{"type": "command", "command": USER_HOOK}]})
        settings.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        cls.base = base
        cls.sh = cls.tmp / "sh" / "acme-notes"
        cls.cl = cls.tmp / "cli" / "acme-notes"
        for target in (cls.sh, cls.cl):
            shutil.copytree(base, target, symlinks=True)
        env = base_env({})
        cls.sh_run = subprocess.run(["bash", str(UPDATE), str(cls.sh)], env=env, capture_output=True, text=True, timeout=600)
        cls.cl_run = subprocess.run(["node", str(cls.cli), "update", "--json", "--templates", str(TEMPLATES), "--cwd", str(cls.cl)],
                                    env=env, capture_output=True, text=True, timeout=600)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_v107_hooks_live_under_harness_folders(self):
        """전제: v1.0.7 은 .claude/hooks · .codex/hooks 경로로 부른다."""
        cmds = [c for _, _, c in hook_commands(self.base)]
        self.assertTrue(any(c.rstrip().endswith(".claude/hooks/session-start.sh") for c in cmds), cmds)
        self.assertTrue(any(c.rstrip().endswith(".codex/hooks/session-start.sh") for c in cmds), cmds)

    def test_both_updates_succeed_with_the_same_tree(self):
        self.assertIn(self.sh_run.returncode, (0, 4), self.sh_run.stdout[-3000:] + self.sh_run.stderr[-2000:])
        self.assertIn(self.cl_run.returncode, (0, 4), self.cl_run.stdout[-3000:] + self.cl_run.stderr[-2000:])
        (sh_files, sh_dirs), (cl_files, cl_dirs) = snapshot(self.sh), snapshot(self.cl)
        self.assertEqual(sorted(set(sh_files) ^ set(cl_files)), [])
        self.assertEqual(sorted(r for r in sh_files if sh_files[r] != cl_files[r]), [])
        self.assertEqual(sorted(sh_dirs ^ cl_dirs), [])

    def test_no_hook_calls_a_missing_script(self):
        for target in (self.sh, self.cl):
            for rel, event, cmd in hook_commands(target):
                for script in SCRIPT_REF.findall(cmd):
                    with self.subTest(target=target.parent.name, file=rel, event=event, script=script):
                        self.assertTrue((target / script).is_file(), f"{rel} {event}: {cmd}")

    def test_retired_hook_lines_become_v2_hooks(self):
        for target in (self.sh, self.cl):
            with self.subTest(target=target.parent.name):
                cmds = hook_commands(target)
                tails = [c.rstrip() for _, _, c in cmds]
                for gone in (".claude/hooks/session-start.sh", ".codex/hooks/session-start.sh", ".codex/hooks/verify.sh"):
                    self.assertFalse((target / gone).exists(), gone)
                    self.assertFalse([t for t in tails if t.endswith(gone)], gone)
                for rel in HOOK_FILES:
                    starts = [c for f, e, c in cmds if f == rel and e == "SessionStart" and "harness-session-start" in c]
                    self.assertEqual(len(starts), 1, (rel, starts))

    def test_edited_legacy_hook_and_user_hook_are_kept(self):
        j = json.loads(self.cl_run.stdout)
        kept = [o for o in j["projection"]["ops"] if o["path"] == EDITED_HOOK]
        self.assertEqual([o["action"] for o in kept], ["keep-modified"])
        self.assertIn("호출 줄", kept[0].get("reason", ""))
        for target in (self.sh, self.cl):
            with self.subTest(target=target.parent.name):
                self.assertIn("사람이 고친 옛 훅 줄", (target / EDITED_HOOK).read_text(encoding="utf-8"))
                cmds = [c for _, _, c in hook_commands(target)]
                self.assertEqual(len([c for c in cmds if c.rstrip().endswith(EDITED_HOOK)]), 1)
                self.assertEqual(cmds.count(USER_HOOK), 1)


if __name__ == "__main__":
    unittest.main()
