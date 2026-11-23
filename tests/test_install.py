"""킷 설치 시험 — 빈 임시 폴더에 스택마다 설치하고 결과를 확인한다.

    python3 -m unittest discover -s tests -p "test_*.py"

외부 네트워크·빌드 도구를 쓰지 않는다. git 은 쓴다(설치본을 리포로 만들어 하네스 검사기를 돌린다).
"""

from __future__ import annotations

import hashlib
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
    setup: Path = SETUP,
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
        ["bash", str(setup), f"--stack={stack}", f"--agents={agents}", f"--modules={modules}", *extra, str(target)],
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
                    ".claude/skills/hx-docs/SKILL.md",
                    ".claude/rules/code-maintenance.md",
                    ".kiro/steering/code-maintenance.md",
                    ".cursor/rules/code-maintenance.mdc",
                    ".gitattributes",
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
        command = ["bash", "scripts/new-feature.sh", "--next", "folder-bookmark", "--area", "notes"]
        result = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        requirements = root / ".agents/docs/issues/ACMENOTES-1-folder-bookmark/requirements.md"
        text = requirements.read_text()
        self.assertTrue(text.startswith("---\nkey: ACMENOTES-1\narea: notes\ntype: feat\n"), text[:200])
        self.assertIn("### 정책 (S2 기획 · 필수)", text)
        self.assertIn("| 기능 문서 |", text)
        self.assertNotRegex(text, r"(?m)^\|\s*상태\s*\|")
        self.assertIn("### notes (새 1 · 옛 0)", (root / ".agents/docs/specs-index.md").read_text())

    def test_fresh_install_board_is_current(self):
        root = self.installed("python")
        result = subprocess.run(["bash", "scripts/board.sh", "--check"], cwd=root, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_meta_gets_v11_defaults_and_update_keeps_user_values(self):
        root = self.installed("python")
        meta_path = root / ".agents/harness-kit.json"
        meta = json.loads(meta_path.read_text())
        self.assertEqual({"source": "kit", "prefix": "ACMENOTES"}, meta["issueKey"])
        self.assertEqual("develop", meta["git"]["base"])
        self.assertIs(True, meta["verify"]["fullOnlyInCI"])
        self.assertIn('"agents": ["claude", "codex", "cursor", "kiro"]', meta_path.read_text())
        meta["issueKey"] = {"source": "jira", "prefix": "KNOTS"}
        meta["git"] = {"base": "main", "worktreeRoot": "../{repo}.worktrees"}
        meta["verify"] = {"fullOnlyInCI": False}
        meta["team"] = {"owner": "platform", "labels": ["a", "b"]}
        meta["tokens"]["CUSTOM_TOKEN"] = "keep"
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
        result = subprocess.run(["bash", str(UPDATE), str(root)], capture_output=True, text=True, timeout=300)
        self.assertEqual(result.returncode, 0, result.stdout[-3000:] + result.stderr[-3000:])
        after = json.loads(meta_path.read_text())
        self.assertEqual({"source": "jira", "prefix": "KNOTS"}, after["issueKey"])
        self.assertEqual({"base": "main", "worktreeRoot": "../{repo}.worktrees"}, after["git"])
        self.assertEqual({"fullOnlyInCI": False}, after["verify"])
        self.assertEqual({"owner": "platform", "labels": ["a", "b"]}, after["team"])
        self.assertEqual("keep", after["tokens"]["CUSTOM_TOKEN"])
        self.assertEqual("acme-notes", after["tokens"]["PROJECT_SLUG"])
        self.assertEqual(meta["installedAt"], after["installedAt"])
        self.assertEqual(sorted(meta["agents"]), sorted(after["agents"]))
        # update.sh · add-agent.sh 는 배열을 줄 단위 sed 로 읽는다(harness_meta_list).
        self.assertRegex(meta_path.read_text(), r'"agents": \[[^\]\n]*\]')
        self.assertRegex(meta_path.read_text(), r'"modules": \[[^\]\n]*\]')

    def test_session_start_fixed_context_stays_within_budget(self):
        # 토큰 예산(설계 README 원칙 10): 세션 시작 고정 안내는 v1.0.8 의 1,517바이트보다 길어지지 않는다.
        source = (KIT / "packages/templates/common/scripts/hooks/session-start.sh").read_text(encoding="utf-8")
        fixed = re.search(r"^cat <<'EOF'\n(.*?)^EOF$", source, re.S | re.M)
        self.assertIsNotNone(fixed)
        self.assertLessEqual(len(fixed[1].encode("utf-8")), 1517)
        self.assertIn(".agents/docs/issues/", fixed[1])
        self.assertIn("--affected", fixed[1])
        self.assertNotIn("--full", fixed[1])

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
        command = ["bash", "scripts/new-feature.sh", "--next", "folder-bookmark", "--area", "notes"]
        scaffold = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=60)
        self.assertEqual(scaffold.returncode, 0, scaffold.stdout + scaffold.stderr)
        for command in ("build", "check"):
            result = subprocess.run([sys.executable, "tools/docs/feature_docs.py", command], cwd=root, capture_output=True, text=True, timeout=120)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        # 새 구조 이슈가 백로그 화면에 보인다(HK-9 R9.2).
        backlog = next((root / "docs/features").glob("*백로그*.html"))
        self.assertIn("ACMENOTES-1-folder-bookmark", backlog.read_text(encoding="utf-8"))

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

    def test_skill_and_rule_copies_match_sources(self):
        # 손으로 맞추던 포인터(sync-commands.sh)는 없다. 설치가 원본에서 복사본 · 생성물을 만든다(HK-13 R1).
        self.assertFalse((KIT / "scripts/sync-commands.sh").exists())
        root = self.installed("go")
        for skill in sorted((root / ".agents/skills").iterdir()):
            for f in sorted(p for p in skill.rglob("*") if p.is_file()):
                rel = f.relative_to(root / ".agents/skills").as_posix()
                for harness in (".claude", ".kiro"):
                    self.assertEqual((root / harness / "skills" / rel).read_bytes(), f.read_bytes(), f"{harness} {rel}")
        for rule in sorted((root / ".agents/rules").glob("*.md")):
            self.assertEqual((root / ".claude/rules" / rule.name).read_bytes(), rule.read_bytes(), rule.name)
            self.assertIn(f"원본 .agents/rules/{rule.name}", (root / ".kiro/steering" / rule.name).read_text())
        self.assertFalse((root / ".claude/commands").exists())

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

    def test_update_rebuilds_board_after_format_change(self):
        # v1.0.8 리포: 옛 구조 이슈가 있고 specs-index.md 의 보드가 옛 형식이다(HK-9 R9.3).
        root = self.installed("python")
        issue = root / ".agents/docs/demo-specs/issues/1-feat-sample"
        issue.mkdir(parents=True)
        (issue / "requirements.md").write_text("# Requirements — 1-feat-sample\n\n| 상태 | approved |\n")
        index = root / ".agents/docs/specs-index.md"
        old_board = "\n## 전체 보드 (전 제품)\n\n| 📋 요구 (1) | 🎨 설계 (0) |\n|---|---|\n| `demo/1-feat-sample` | — |\n\n"
        index.write_text(re.sub(r"(<!-- BOARD:BEGIN[^\n]*-->\n).*?(<!-- BOARD:END -->)", lambda m: m[1] + old_board + m[2], index.read_text(), flags=re.S))
        git_init(root)
        plans = ["bash", "scripts/check-exec-plan-status.sh"]
        before = subprocess.run(plans, cwd=root, capture_output=True, text=True, timeout=60)
        self.assertNotEqual(before.returncode, 0, "옛 형식 보드인데 fast 검사가 통과한다 — 시험 전제가 틀렸다")
        result = subprocess.run(["bash", str(UPDATE), str(root)], capture_output=True, text=True, timeout=300)
        self.assertEqual(result.returncode, 0, result.stdout[-3000:] + result.stderr[-3000:])
        self.assertEqual(result.stdout.count("SDD 보드"), 1, result.stdout[-3000:])
        after = subprocess.run(plans, cwd=root, capture_output=True, text=True, timeout=60)
        self.assertEqual(after.returncode, 0, after.stdout + after.stderr)
        self.assertIn("| 1 (옛) | sample | feat |", index.read_text())
        again = subprocess.run(["bash", str(UPDATE), str(root)], capture_output=True, text=True, timeout=300)
        self.assertNotIn("SDD 보드", again.stdout, "보드가 이미 맞으면 다시 만들지 않는다")

    def test_pre_existing_files_are_not_replaced_by_update(self):
        # 설치 전부터 있던 파일: 다르면 lock 해시 '-'(update 가 덮지 않고 .new), 킷 판과 같으면 그 해시(HK-12 R12.6).
        same = self.installed("python", agents="claude") / ".agents/rules/writing-style.md"
        root = self.tmp / "pre"
        (root / ".agents/rules").mkdir(parents=True)
        (root / "AGENTS.md").write_text("# 손으로 쓴 AGENTS\n")
        shutil.copy2(same, root / ".agents/rules/writing-style.md")
        result = install(root, "python", agents="claude")
        self.assertEqual(result.returncode, 0, result.stdout[-3000:] + result.stderr[-3000:])
        lock = (root / ".agents/harness-kit.lock").read_text().splitlines()
        self.assertEqual(lock[1], "# pre-existing: -")
        hashes = {line.split("\t")[3]: line.split("\t")[0] for line in lock if line and not line.startswith("#")}
        self.assertEqual(hashes["AGENTS.md"], "-")
        self.assertRegex(hashes[".agents/rules/writing-style.md"], r"^[0-9a-f]{64}$")
        update = subprocess.run(["bash", str(UPDATE), str(root)], capture_output=True, text=True, timeout=300)
        self.assertEqual(update.returncode, 0, update.stdout[-3000:] + update.stderr[-3000:])
        self.assertEqual((root / "AGENTS.md").read_text(), "# 손으로 쓴 AGENTS\n")
        self.assertTrue((root / "AGENTS.md.new").is_file())
        self.assertRegex(update.stdout, r"update=0 +same=\d+ +conflict=1")

    def test_update_with_legacy_lock_writes_new_instead_of_replacing(self):
        # v1.0.8 lock(표시 줄 없음)은 미리 있던 파일을 그 파일 해시로 적었다. 가릴 수 없으니 .new 를 쓴다(HK-12 R12.6).
        root = self.tmp / "legacy"
        root.mkdir()
        (root / "AGENTS.md").write_text("# 손으로 쓴 AGENTS\n")
        result = install(root, "go", agents="codex")
        self.assertEqual(result.returncode, 0, result.stdout[-3000:] + result.stderr[-3000:])
        lock = root / ".agents/harness-kit.lock"
        mine = hashlib.sha256((root / "AGENTS.md").read_bytes()).hexdigest()
        lines = [line for line in lock.read_text().splitlines() if line != "# pre-existing: -"]
        lock.write_text("\n".join(mine + line[line.index("\t"):] if line.endswith("\tAGENTS.md") else line for line in lines) + "\n")
        update = subprocess.run(["bash", str(UPDATE), str(root)], capture_output=True, text=True, timeout=300)
        self.assertEqual(update.returncode, 0, update.stdout[-3000:] + update.stderr[-3000:])
        self.assertEqual((root / "AGENTS.md").read_text(), "# 손으로 쓴 AGENTS\n")
        self.assertTrue((root / "AGENTS.md.new").is_file())
        self.assertIn("v1 lock", update.stdout)
        after = lock.read_text().splitlines()
        self.assertEqual(after[1], "# pre-existing: -")
        self.assertIn("-\tgo\tcore\tAGENTS.md", after)

    def test_overlap_later_layer_wins_on_install_and_update(self):
        # common 과 platform-guards 모듈이 같은 경로를 깐다. 첫 설치 · update 모두 뒤 레이어(모듈) 판이다(HK-10 R10.1).
        kit = self.tmp / "kit"
        shutil.copytree(KIT / "plugins/harness-kit", kit, symlinks=True)
        mark = "\n# 뒤 레이어 판(HK-10)\n"
        with (kit / "skills/hx-bootstrap/templates/optional/platform-guards/scripts/run-guards.sh").open("a", encoding="utf-8") as handle:
            handle.write(mark)
        root = self.tmp / "python"
        result = install(root, "python", agents="claude", modules="platform-guards", setup=kit / "skills/hx-bootstrap/setup.sh")
        self.assertEqual(result.returncode, 0, result.stdout[-3000:] + result.stderr[-3000:])
        guard = root / "scripts/run-guards.sh"
        self.assertTrue(guard.read_text().endswith(mark), "첫 설치가 앞 레이어(common) 판을 깔았다")
        lock_lines = [line for line in (root / ".agents/harness-kit.lock").read_text().splitlines() if line.endswith("\tscripts/run-guards.sh")]
        self.assertEqual([line.split("\t")[1] for line in lock_lines], ["mod/platform-guards"])
        for run in (1, 2):
            update = subprocess.run(["bash", str(kit / "skills/hx-update/update.sh"), str(root)], capture_output=True, text=True, timeout=300)
            self.assertEqual(update.returncode, 0, update.stdout[-3000:] + update.stderr[-3000:])
            with self.subTest(run=run):
                self.assertRegex(update.stdout, r"update=0 +same=\d+ +conflict=0")
        self.assertEqual(sorted(p.relative_to(root).as_posix() for p in root.rglob("*.new")), [])
        self.assertTrue(guard.read_text().endswith(mark))

    def test_special_token_values_survive_install_and_update(self):
        # & · | · \ 가 든 값은 sed 치환에서 깨졌다. 설치와 update 모두 글자 그대로 넣는다(HK-10 R10.2).
        name = "A&B | C\\D"
        root = self.installed("go", agents="claude", env_extra={"PROJECT_NAME": name})
        self.assertIn(name, (root / "AGENTS.md").read_text())
        self.assertEqual(json.loads((root / ".agents/harness.json").read_text())["title"], name)
        self.assertEqual(json.loads((root / ".agents/harness-kit.json").read_text())["tokens"]["PROJECT_NAME"], name)
        update = subprocess.run(["bash", str(UPDATE), str(root)], capture_output=True, text=True, timeout=300)
        self.assertEqual(update.returncode, 0, update.stdout[-3000:] + update.stderr[-3000:])
        self.assertRegex(update.stdout, r"new=0 +update=0 +same=\d+ +conflict=0")
        self.assertEqual(sorted(p.relative_to(root).as_posix() for p in root.rglob("*.new")), [])


    def test_review_and_approval_files_are_installed(self):
        # HK-23: /hx-review · 승인 강제 파일은 하네스와 상관없이 깔린다. 하네스 복사본(.claude/skills · .kiro/steering)은 배치 엔진 몫이다.
        for stack in ("python", "web"):
            with self.subTest(stack=stack):
                root = self.installed(stack)
                for rel in (
                    ".agents/skills/hx-review/SKILL.md",
                    ".agents/rules/approval-vocabulary.md",
                    "scripts/harness/approve.py",
                    "scripts/harness/approvals.py",
                    "scripts/harness/approvals_guard.py",
                    "scripts/harness/sdd_gates.py",
                    "scripts/harness/review.py",
                    "scripts/harness/review_state.py",
                    "scripts/harness/mr_comment.py",
                    "scripts/hooks/protect-approvals.sh",
                    "scripts/hooks/protect_approvals.py",
                    ".kiro/hooks/harness-protect-approvals.json",
                ):
                    self.assertTrue((root / rel).is_file(), f"{stack}: {rel}")
                self.assertTrue(os.access(root / "scripts/harness/approve.py", os.X_OK))


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
