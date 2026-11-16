"""보호 경로(docs/references) 쓰기 차단 회귀 테스트 — 판정 스크립트와 세 클라이언트 배선.

payload 모양은 2026-10-10 에 확인한 것이다. Claude·Kiro 기본 엔진(V2)은 실제 세션의 hook 입력,
Codex 는 0.159.2 소스, Kiro V3·IDE 는 설치본 도구 스키마.
"""

import json
import random
import re
import shutil
import string
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/hooks/protect-sources.sh"
NEAREST_HARNESS = '[ ! -f "$r/.agents/harness.json" ]'


def claude(tool, key, path):
    return {"hook_event_name": "PreToolUse", "tool_name": tool, "tool_input": {key: path, "content": "x"}}


def kiro_v2(path):
    tool_input = {"command": "create", "path": path, "content": "hi"}
    return {
        "hook_event_name": "preToolUse",
        "tool_name": "write",
        "tool_tags": ["write", "@builtin"],
        "tool_input": tool_input,
    }


def kiro_v3(tool, tool_input):
    return {"hook_event_name": "PreToolUse", "tool_name": tool, "tool_input": tool_input}


def codex(tool, command):
    return {"hook_event_name": "PreToolUse", "tool_name": tool, "tool_input": {"command": command}}


def patch(*lines):
    return "\n".join(("*** Begin Patch", *lines, "*** End Patch")) + "\n"


BLOCKED = {
    "claude write": claude("Write", "file_path", "/work/repo/docs/references/a.md"),
    "claude edit": claude("Edit", "file_path", "/work/repo/docs/references/a.md"),
    "claude multiedit": claude("MultiEdit", "file_path", "/work/repo/docs/references/a.md"),
    "claude notebook": claude("NotebookEdit", "notebook_path", "/work/repo/docs/references/n.ipynb"),
    "kiro v2 write": kiro_v2("/private/tmp/repo/docs/references/p.txt"),
    "kiro v3 delete": kiro_v3("delete_file", {"explanation": "정리", "targetFile": "docs/references/old.md"}),
    "kiro ide rename": kiro_v3("semantic_rename", {"path": "docs/references/a.ts", "oldName": "a", "newName": "b"}),
    "kiro ide relocate": kiro_v3("smart_relocate", {"sourcePath": "src/a.ts", "destinationPath": "docs/references/a.ts"}),
    "codex add": codex("apply_patch", patch("*** Add File: docs/references/new.md", "+hi")),
    "codex update": codex("apply_patch", patch("*** Update File: docs/references/a.md", "@@", "-a", "+b")),
    "codex delete": codex("apply_patch", patch("*** Delete File: docs/references/a.md")),
    "codex move": codex("apply_patch", patch("*** Update File: notes/a.md", "*** Move to: docs/references/a.md")),
    "codex heredoc": codex("Bash", "apply_patch <<'EOF'\n" + patch("*** Add File: docs/references/x.md", "+hi") + "EOF\n"),
    "codex indented header": codex("apply_patch", patch("  *** Add File: docs/references/new.md", "+hi")),
    "kiro v3 delete folder": kiro_v3("delete_file", {"targetFile": "docs/references"}),
    "kiro ide relocate folder": kiro_v3("smart_relocate", {"sourcePath": "docs/references", "destinationPath": "old"}),
}
ALLOWED = {
    "singular folder": claude("Write", "file_path", "/work/repo/docs/reference/a.md"),
    "similar folder": claude("Write", "file_path", "/work/repo/docs/references-old/a.md"),
    "content mentions the path": {
        "tool_name": "Write",
        "tool_input": {"file_path": "/w/a.md", "content": "docs/references/x"},
    },
    "shell read": codex("Bash", "cat docs/references/a.md"),
    "patch body mentions the path": codex("apply_patch", patch("*** Add File: notes/a.md", "+see docs/references/x")),
    "patch elsewhere": codex("apply_patch", patch("*** Update File: notes/a.md", "@@", "-a", "+b")),
    "kiro v2 elsewhere": kiro_v2("/private/tmp/repo/ok.txt"),
    "folder with a prefix": claude("Write", "file_path", "/work/repo/mydocs/references/a.md"),
    "patch to a folder with a prefix": codex("apply_patch", patch("*** Add File: xdocs/references/a.md", "+hi")),
    "empty payload": None,
}


SIMILAR = ("docs/reference", "docs/references-x", "xdocs/references", "docs/referencesx")


def segment(rng):
    return "".join(rng.choice(string.ascii_lowercase + string.digits + "-_") for _ in range(rng.randint(1, 8)))


def random_path(rng, protected):
    parts = [segment(rng) for _ in range(rng.randint(0, 4))]
    if protected:
        parts += ["docs", "references"]
    elif rng.random() < 0.5:
        parts += [rng.choice(SIMILAR)]
    parts += [segment(rng) for _ in range(rng.randint(0, 3))] + [segment(rng) + ".md"]
    prefix = rng.choice(("/", "", "./", "../"))
    return prefix + "/".join(parts)


def random_payload(rng, path):
    shapes = (
        lambda: claude(rng.choice(("Write", "Edit", "MultiEdit")), "file_path", path),
        lambda: claude("NotebookEdit", "notebook_path", path),
        lambda: kiro_v2(path),
        lambda: kiro_v3("delete_file", {"targetFile": path}),
        lambda: kiro_v3("smart_relocate", {"sourcePath": "src/a.ts", "destinationPath": path}),
        lambda: codex("apply_patch", patch(f"*** {rng.choice(('Add', 'Update', 'Delete'))} File: {path}", "+x")),
        lambda: codex("apply_patch", patch("*** Update File: notes/a.md", f"*** Move to: {path}")),
    )
    return rng.choice(shapes)()


def run(payload):
    """보호 경로 판정만 본다. 스크립트 사본을 빈 폴더에서 돌려, 실제 리포의 세션 파일 점유(session-context.py)가 판정에 섞이지 않게 한다.

    점유와 겹치는 쓰기를 막는 동작은 test_session_hooks 가 본다 — 같은 리포에서 다른 세션이 `src` 를 점유하면 이 테스트의
    `src/a.ts` 쓰기가 막혀 보호 경로와 상관없이 실패했다.
    """
    text = "" if payload is None else json.dumps(payload, ensure_ascii=False)
    with tempfile.TemporaryDirectory(prefix="protect sources ") as directory:
        script = Path(directory) / "scripts/hooks/protect-sources.sh"
        script.parent.mkdir(parents=True)
        shutil.copy2(SCRIPT, script)
        return subprocess.run(["bash", str(script)], input=text, capture_output=True, text=True, timeout=30)


class ProtectSourcesScriptTest(unittest.TestCase):
    def test_writes_to_the_protected_path_are_blocked_with_a_reason(self):
        for name, payload in BLOCKED.items():
            with self.subTest(name):
                result = run(payload)
                self.assertEqual(2, result.returncode, result.stdout + result.stderr)
                self.assertIn("docs/references", result.stderr)

    def test_other_payloads_pass(self):
        for name, payload in ALLOWED.items():
            with self.subTest(name):
                result = run(payload)
                self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_large_multi_line_payload_is_still_blocked(self):
        # 여러 줄 JSON 에서 grep 이 앞줄에서 일치를 찾고 먼저 끝나도 판정이 통과로 바뀌면 안 된다.
        content = "x" * 300_000
        text = json.dumps({"tool_name": "Write", "tool_input": {"file_path": "/w/docs/references/a.md", "content": content}}, indent=2)
        for _ in range(5):
            result = subprocess.run(["bash", str(SCRIPT)], input=text, capture_output=True, text=True, timeout=30)
            self.assertEqual(2, result.returncode, result.stderr)
            self.assertTrue(result.stderr.strip())

    def test_any_path_through_the_protected_folder_is_blocked(self):
        rng = random.Random(87)
        for _ in range(150):
            payload = random_payload(rng, random_path(rng, protected=True))
            with self.subTest(payload=payload):
                self.assertEqual(2, run(payload).returncode)

    def test_paths_outside_the_protected_folder_pass(self):
        rng = random.Random(870)
        for _ in range(150):
            path = random_path(rng, protected=False)
            if re.search(r"(^|/)docs/references(/|$)", path):
                continue
            payload = random_payload(rng, path)
            with self.subTest(payload=payload):
                self.assertEqual(0, run(payload).returncode)


class ProtectSourcesWiringTest(unittest.TestCase):
    """세 클라이언트 배선이 같은 판정 스크립트를 쓰기 도구에 건다. 배포된 하네스에서 돈다."""

    def setUp(self):
        manifest = ROOT / ".agents/harness.json"
        if not manifest.is_file():
            self.skipTest("배포된 하네스에서만 돈다(공통 원본에는 .agents/harness.json 이 없다)")
        self.unit = json.loads(manifest.read_text())["unit"]

    def load(self, relative):
        return json.loads((ROOT / relative).read_text())

    def test_claude_denies_edits_anywhere_under_the_protected_folder_and_runs_the_hook(self):
        settings = self.load(".claude/settings.json")
        self.assertIn("Edit(//**/docs/references/**)", settings["permissions"]["deny"])
        groups = settings["hooks"]["PreToolUse"]
        matched = [group for group in groups if set(group["matcher"].split("|")) >= {"Write", "Edit", "NotebookEdit"}]
        self.assertTrue(matched, groups)
        self.assertIn("scripts/hooks/protect-sources.sh", matched[0]["hooks"][0]["command"])

    def test_codex_runs_the_hook_for_patches_and_shell_commands(self):
        groups = self.load(".codex/hooks.json")["hooks"]["PreToolUse"]
        self.assertEqual({"apply_patch", "Bash"}, set(groups[0]["matcher"].split("|")))
        command = groups[0]["hooks"][0]["command"]
        self.assertIn("protect-sources.sh", command)
        self.assertIn(NEAREST_HARNESS, command)

    def test_codex_command_blocks_from_a_nested_folder(self):
        command = self.load(".codex/hooks.json")["hooks"]["PreToolUse"][0]["hooks"][0]["command"]
        nested = ROOT / ".agents"
        result = subprocess.run(
            ["sh", "-c", command],
            cwd=nested,
            input=json.dumps(BLOCKED["codex add"]),
            capture_output=True,
            text=True,
            timeout=30,
        )
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)

    def test_kiro_workspace_hook_matches_every_write_tool(self):
        hook = self.load(".kiro/hooks/harness-protect-sources.json")["hooks"][0]
        self.assertEqual("PreToolUse", hook["trigger"])
        tools = set(hook["matcher"].split("|"))
        expected = {
            "fs_write",
            "fs_append",
            "str_replace",
            "delete_file",
            "edit_code",
            "semantic_rename",
            "smart_relocate",
        }
        self.assertEqual(expected, tools)
        self.assertIn("protect-sources.sh", hook["action"]["command"])
        self.assertIn(NEAREST_HARNESS, hook["action"]["command"])

    def test_kiro_agents_with_write_tools_run_the_hook(self):
        for agent in (self.unit, "worker"):
            with self.subTest(agent):
                entries = self.load(f".kiro/agents/{agent}.json")["hooks"]["preToolUse"]
                self.assertEqual("write", entries[0]["matcher"])
                self.assertIn("protect-sources.sh", entries[0]["command"])
                self.assertIn(NEAREST_HARNESS, entries[0]["command"])


if __name__ == "__main__":
    unittest.main()
