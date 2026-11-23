"""킷 설치 시험 — 빈 임시 폴더에 스택마다 설치하고 결과를 확인한다.

    python3 -m unittest discover -s tests -p "test_*.py"

외부 네트워크·빌드 도구를 쓰지 않는다. git 은 쓴다(설치본을 리포로 만들어 하네스 검사기를 돌린다).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

KIT = Path(__file__).resolve().parents[1]
SETUP = KIT / "plugins/harness-kit/skills/hx-bootstrap/setup.sh"
SYNC_COMMANDS = KIT / "scripts/sync-commands.sh"
UPDATE = KIT / "plugins/harness-kit/skills/hx-update/update.sh"
HARNESS_TESTS = KIT / "tests/harness_scripts"
STACKS = ("jvm", "python", "go", "web", "electron")
TOKEN_RE = re.compile(r"\{\{(PROJECT_NAME|PROJECT_SLUG|PACKAGE_NS|SERVICE_NAME|PRIMARY_LANGUAGE|BUILD_TOOL|TEST_CMD|PROTECTED_PATH|UNIT_ID|UNIT_TITLE)\}\}")


def install(
    target: Path,
    stack: str,
    agents: str = "all",
    modules: str = "none",
    extra: tuple[str, ...] = (),
    env_extra: dict[str, str] | None = None,
) -> subprocess.CompletedProcess:
    env = {
        **os.environ,
        "PROJECT_NAME": "Acme Notes",
        "PROJECT_SLUG": "acme-notes",
        "PACKAGE_NS": "com.acme.notes",
        "SERVICE_NAME": "notes-api",
        **(env_extra or {}),
    }
    return subprocess.run(
        ["bash", str(SETUP), f"--stack={stack}", f"--agents={agents}", f"--modules={modules}", *extra, str(target)],
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )


def git_init(target: Path) -> None:
    subprocess.run(["git", "init", "-q"], cwd=target, check=True)
    subprocess.run(["git", "add", "-A"], cwd=target, check=True)


class InstallTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="kit install "))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def protect_hook(self, root: Path, path: str) -> subprocess.CompletedProcess:
        payload = json.dumps({"tool_name": "Write", "tool_input": {"file_path": str(root / path), "content": "x"}})
        return subprocess.run(["bash", "scripts/hooks/protect-sources.sh"], cwd=root, input=payload, capture_output=True, text=True, timeout=60)

    def installed(self, stack: str, **kwargs) -> Path:
        target = self.tmp / stack
        result = install(target, stack, **kwargs)
        self.assertEqual(result.returncode, 0, result.stdout[-3000:] + result.stderr[-3000:])
        return target

    def test_every_stack_installs_core_files(self):
        for stack in STACKS:
            with self.subTest(stack=stack):
                root = self.installed(stack)
                for rel in (
                    "AGENTS.md",
                    "README.md",
                    "ARCHITECTURE.md",
                    ".agents/harness.json",
                    ".agents/rules/sdd-workflow.md",
                    ".agents/rules/session-collaboration.md",
                    ".agents/rules/code-maintenance.md",
                    ".agents/skills/hx-docs/SKILL.md",
                    ".agents/roles/reviewer.md",
                    ".agents/verify-checks.json",
                    "scripts/verify.sh",
                    "scripts/verify-entry.sh",
                    "scripts/verify-changed.py",
                    "scripts/session-coordination.py",
                    "scripts/check_harness.py",
                    "scripts/new-feature.sh",
                    "scripts/hooks/verify-gate.sh",
                    "scripts/git-hooks/pre-commit",
                    "tools/docs/feature_docs.py",
                    "tools/docs/schema-snapshot.sh",
                    "docs/features/_src/docs.config.json",
                    "docs/features/_src/catalog.json",
                    ".claude/commands/hx-docs.md",
                    ".codex/config.toml",
                    ".kiro/hooks/harness-verify-gate.json",
                    ".kiro/agents/acme-notes.json",
                ):
                    self.assertTrue((root / rel).is_file(), f"{stack}: {rel}")
                self.assertTrue(os.access(root / "scripts/git-hooks/pre-commit", os.X_OK))
                manifest = json.loads((root / ".agents/harness.json").read_text())
                self.assertEqual(manifest["unit"], "acme-notes")
                self.assertEqual(sorted(manifest["agents"]), ["claude", "codex", "cursor", "kiro"])

    def test_no_install_tokens_remain(self):
        for stack in STACKS:
            with self.subTest(stack=stack):
                root = self.installed(stack)
                left = []
                for path in root.rglob("*"):
                    if path.is_file() and ".git" not in path.parts:
                        try:
                            text = path.read_text(encoding="utf-8")
                        except (UnicodeDecodeError, OSError):
                            continue
                        if TOKEN_RE.search(text):
                            left.append(path.relative_to(root).as_posix())
                self.assertEqual(left, [], f"{stack}: 치환되지 않은 토큰")

    def test_harness_checker_passes_on_fresh_install(self):
        for stack in STACKS:
            with self.subTest(stack=stack):
                root = self.installed(stack)
                git_init(root)
                result = subprocess.run([sys.executable, "scripts/check_harness.py"], cwd=root, capture_output=True, text=True, timeout=120)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_claude_only_install_passes_checker_without_other_agents(self):
        root = self.installed("python", agents="claude")
        self.assertFalse((root / ".codex").exists())
        self.assertFalse((root / ".kiro").exists())
        self.assertTrue((root / ".agents/skills/hx-specify/SKILL.md").is_file())
        git_init(root)
        result = subprocess.run([sys.executable, "scripts/check_harness.py"], cwd=root, capture_output=True, text=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_new_feature_scaffolds_issue_folder_with_sdlc_sections(self):
        root = self.installed("jvm")
        result = subprocess.run(["bash", "scripts/new-feature.sh", "notes", "folder-bookmark"], cwd=root, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        requirements = next((root / ".agents/docs/notes-specs/issues").glob("*-feat-folder-bookmark/requirements.md"))
        text = requirements.read_text()
        self.assertIn("### 정책 (S2 기획 · 필수)", text)
        self.assertIn("| 기능 문서 |", text)

    def test_feature_docs_build_and_check_on_fresh_install(self):
        # 외부 스크립트(assets/vendor)는 받기 전이라 경고만 난다. 받은 뒤에는 잠금 파일의 sha256 으로 대조한다.
        root = self.installed("python")
        build = subprocess.run([sys.executable, "tools/docs/feature_docs.py", "build"], cwd=root, capture_output=True, text=True, timeout=120)
        self.assertEqual(build.returncode, 0, build.stdout + build.stderr)
        check = subprocess.run([sys.executable, "tools/docs/feature_docs.py", "check"], cwd=root, capture_output=True, text=True, timeout=120)
        self.assertEqual(check.returncode, 0, check.stdout + check.stderr)
        self.assertTrue((root / "docs/features/index.html").is_file())
        assets = subprocess.run([sys.executable, "tools/docs/feature_docs.py", "check", "--assets"], cwd=root, capture_output=True, text=True, timeout=120)
        self.assertEqual(assets.returncode, 0, assets.stdout + assets.stderr)
        vendor = root / "docs/features/assets/vendor/mermaid"
        vendor.mkdir(parents=True)
        (vendor / "mermaid.min.js").write_text("/* 잠금과 다른 파일 */")
        tampered = subprocess.run([sys.executable, "tools/docs/feature_docs.py", "check", "--assets"], cwd=root, capture_output=True, text=True, timeout=120)
        self.assertEqual(tampered.returncode, 1, tampered.stdout + tampered.stderr)

    def test_feature_docs_rule_covers_issue_docs_after_first_issue(self):
        # 생성기는 SDD 이슈도 읽는다. changed 문서 규칙이 이슈 문서를 덮지 않으면 check 가 알린다.
        root = self.installed("python")
        git_init(root)
        scaffold = subprocess.run(["bash", "scripts/new-feature.sh", "notes", "folder-bookmark"], cwd=root, capture_output=True, text=True, timeout=60)
        self.assertEqual(scaffold.returncode, 0, scaffold.stdout + scaffold.stderr)
        for command in ("build", "check"):
            result = subprocess.run([sys.executable, "tools/docs/feature_docs.py", command], cwd=root, capture_output=True, text=True, timeout=120)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_feature_docs_tool_tests_pass_in_install(self):
        root = self.installed("go")
        result = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "tests"], cwd=root / "tools/docs", capture_output=True, text=True, timeout=300)
        self.assertEqual(result.returncode, 0, result.stdout[-3000:] + result.stderr[-3000:])
        node = shutil.which("node")
        if node:
            scripts = sorted(str(path.relative_to(root / "tools/docs")) for path in (root / "tools/docs/tests").glob("*.test.mjs"))
            self.assertTrue(scripts)
            assets = subprocess.run([node, "--test", *scripts], cwd=root / "tools/docs", capture_output=True, text=True, timeout=120)
            self.assertEqual(assets.returncode, 0, assets.stdout[-3000:] + assets.stderr[-3000:])

    def test_protected_path_choice_reaches_the_write_hook(self):
        root = self.installed("go", env_extra={"PROTECTED_PATH": "third_party/specs"})
        git_init(root)
        blocked = self.protect_hook(root, "third_party/specs/api.md")
        self.assertEqual(blocked.returncode, 2, blocked.stdout + blocked.stderr)
        self.assertIn("third_party/specs", blocked.stderr)
        allowed = self.protect_hook(root, "docs/references/api.md")
        self.assertEqual(allowed.returncode, 0, allowed.stdout + allowed.stderr)
        settings = json.loads((root / ".claude/settings.json").read_text())
        self.assertIn("Edit(//**/third_party/specs/**)", settings["permissions"]["deny"])

    def test_command_pointers_match_skill_sources(self):
        result = subprocess.run(["bash", str(SYNC_COMMANDS), "--check"], capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_update_keeps_user_edits_as_new(self):
        root = self.installed("web")
        rule = root / ".agents/rules/sdd-workflow.md"
        rule.write_text(rule.read_text() + "\n사용자가 고친 줄\n")
        lock = root / ".agents/harness-kit.lock"
        lock.write_text(lock.read_text().replace("\t.agents/rules/sdd-workflow.md", "\t.agents/rules/sdd-workflow.md"))
        pristine = root / ".agents/rules/writing-style.md"
        pristine_text = pristine.read_text()
        pristine.write_text(pristine_text + "\n옛 판\n")
        lines = lock.read_text().splitlines()
        lock.write_text("\n".join(lines) + "\n")
        result = subprocess.run(["bash", str(UPDATE), str(root)], capture_output=True, text=True, timeout=300)
        self.assertEqual(result.returncode, 0, result.stdout[-3000:] + result.stderr[-3000:])
        self.assertIn("사용자가 고친 줄", rule.read_text())


class HarnessScriptTests(unittest.TestCase):
    """Knots 에서 옮긴 하네스 자체 시험(scripts/tests)을 설치본에 넣어 돈다."""

    def test_harness_scripts_suite_passes_in_install(self):
        tmp = Path(tempfile.mkdtemp(prefix="kit harness "))
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        root = tmp / "python"
        result = install(root, "python")
        self.assertEqual(result.returncode, 0, result.stderr)
        shutil.copytree(HARNESS_TESTS, root / "scripts/tests")
        git_init(root)
        run = subprocess.run(
            [sys.executable, "-m", "unittest", "discover", "-s", "scripts/tests", "-p", "test_*.py"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=1200,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )
        self.assertEqual(run.returncode, 0, run.stdout[-4000:] + run.stderr[-4000:])


if __name__ == "__main__":
    unittest.main()
