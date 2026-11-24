"""공통 하네스 회귀 테스트. 이 하네스 루트의 실제 파일을 격리 경로로 복사해 검사한다.

단위 고유 검사(scripts/check_unit.py)는 소스 트리 전체가 필요하므로 여기서는 빼고, 단위의 자기 테스트가 맡는다.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# 단위 폴더 전체를 복사한다. 하네스 문서가 소스 폴더를 링크하므로 하네스 폴더만 옮기면 정상 링크가 깨진다.
# 빌드 산출물·의존성·모델 가중치는 하네스와 무관하고 크다.
COPY_IGNORE = (
    ".git",
    "node_modules",
    ".next",
    ".next-*",
    "build",
    "dist",
    "out",
    ".gradle",
    ".kotlin",
    ".venv",
    ".venv-*",
    "__pycache__",
    "*.pyc",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".coverage",
    "htmlcov",
    "coverage",
    ".dart_tool",
    "Pods",
    "models",
    "logs",
    "tmp",
    ".idea",
    ".DS_Store",
    "*.tsbuildinfo",
)
BUILD_TOOLS = ("gradle", "pnpm", "npm", "npx", "uv", "flutter", "dart", "node")


class SharedHarnessTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="harness copy ")
        self.addCleanup(directory.cleanup)
        self.base = Path(directory.name)
        self.root = self.base / "isolated unit"
        self.root.mkdir()
        shutil.copytree(ROOT, self.root, symlinks=True, dirs_exist_ok=True, ignore=shutil.ignore_patterns(*COPY_IGNORE))
        unit_checks = self.root / "scripts/check_unit.py"
        if unit_checks.exists():
            unit_checks.unlink()
        self.elsewhere = self.base / "elsewhere"
        self.elsewhere.mkdir()
        self.env = {
            **os.environ,
            "HARNESS_VERIFY_REENTRY_WINDOW": "0",
            "HARNESS_VERIFY_LEVEL": "fast",
            "TMPDIR": str(self.base),
        }

    def run_script(self, *args, env=None, cwd=None):
        # hook 은 payload 를 넣고 입력을 닫는다. 같은 조건을 만들려고 빈 입력을 넘긴다.
        return subprocess.run(
            list(args),
            cwd=cwd or self.elsewhere,
            env=env or self.env,
            input="",
            capture_output=True,
            text=True,
            timeout=120,
        )

    def check(self):
        return self.run_script(sys.executable, str(self.root / "scripts/check_harness.py"))

    def scaffold(self, *args):
        return self.run_script("bash", str(self.root / "scripts/new-feature.sh"), *args)

    def assert_ok(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def assert_fails(self, result, text):
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(text, result.stdout + result.stderr)

    def first_rule(self):
        return sorted((self.root / ".agents/rules").glob("*.md"))[0]

    def test_isolated_copy_passes_from_another_directory(self):
        self.assert_ok(self.check())
        self.assert_ok(self.run_script("bash", str(self.root / "scripts/check-exec-plan-status.sh")))

    def select_agents(self, *agents):
        manifest = self.root / ".agents/harness.json"
        data = json.loads(manifest.read_text())
        data["agents"] = list(agents)
        manifest.write_text(json.dumps(data))

    def test_only_selected_agents_need_their_files(self):
        self.select_agents("claude")
        shutil.rmtree(self.root / ".codex")
        shutil.rmtree(self.root / ".kiro")
        self.assert_ok(self.check())

    def test_selected_agent_files_are_still_required(self):
        self.select_agents("claude", "kiro")
        shutil.rmtree(self.root / ".codex")
        (self.root / ".kiro/hooks/harness-verify-gate.json").unlink()
        self.assert_fails(self.check(), ".kiro/hooks/harness-verify-gate.json: missing required file")

    def test_empty_agent_selection_fails(self):
        self.select_agents()
        self.assert_fails(self.check(), ".agents/harness.json: agents is empty")

    def test_unknown_agent_name_fails(self):
        self.select_agents("claud", "kiro")
        self.assert_fails(self.check(), ".agents/harness.json: unknown agent 'claud'")

    def test_fast_gate_does_not_start_build_tools(self):
        shims = self.base / "shims"
        shims.mkdir()
        marker = self.base / "build-tool-started"
        for tool in BUILD_TOOLS:
            shim = shims / tool
            shim.write_text(f'#!/bin/sh\necho {tool} >> "{marker}"\nexit 0\n')
            shim.chmod(0o755)
        gradlew = self.root / "gradlew"
        gradlew.write_text(f'#!/bin/sh\necho gradlew >> "{marker}"\nexit 0\n')
        gradlew.chmod(0o755)
        env = {**self.env, "PATH": f"{shims}{os.pathsep}{self.env['PATH']}", "HARNESS_VERIFY_LEVEL": "fast"}
        result = self.run_script("bash", str(self.root / "scripts/verify.sh"), env=env)
        self.assert_ok(result)
        self.assertFalse(marker.exists(), marker.read_text() if marker.exists() else "")

    def test_scaffold_follows_stage_order_and_approval(self):
        key = issue_prefix(self.root) + "-1"
        issue = self.root / f".agents/docs/issues/{key}-sample-flow"
        self.assert_fails(self.scaffold(key, "--stage=design"), key)
        self.assert_ok(self.scaffold("--next", "sample-flow", "--area", "demo"))
        requirement = issue / "requirements.md"
        self.assertTrue(requirement.is_file())
        self.assertFalse((issue / "design.md").exists())
        self.assert_fails(self.scaffold(key, "--stage=design"), "approved")
        approve(requirement)
        self.assert_ok(self.scaffold(key, "--stage=design"))
        self.assert_fails(self.scaffold(key, "--stage=tasks"), "approved")
        approve(issue / "design.md")
        self.assert_ok(self.scaffold(key, "--stage=tasks"))
        self.assertTrue((issue / "tasks.md").is_file())
        self.assert_ok(self.run_script("bash", str(self.root / "scripts/board.sh"), "--check"))

    def test_scaffold_rejects_path_traversal(self):
        self.assert_fails(self.scaffold("../escape", "sample"), "slug")
        self.assert_fails(self.scaffold("demo", "../escape"), "이름")

    def test_scaffold_does_not_write_into_the_legacy_layout(self):
        self.write_feature("demo", "1-feat-sample", "check")
        approve(self.root / ".agents/docs/demo-specs/requirements/1-feat-sample.md")
        approve(self.root / ".agents/docs/demo-specs/design/1-feat-sample.md")
        self.assert_fails(self.scaffold("demo", "1-feat-sample", "--stage=tasks"), "읽기 전용")
        self.assertFalse((self.root / ".agents/docs/demo-specs/tasks/active/1-feat-sample.md").exists())

    def test_task_state_must_match_its_folder(self):
        self.write_feature("demo", "1-feat-sample", "check", state="active")
        self.assert_fails(self.check(), "state mismatch")

    def test_task_needs_requirements_and_design(self):
        self.write_feature("demo", "1-feat-sample", "active")
        (self.root / ".agents/docs/demo-specs/design/1-feat-sample.md").unlink()
        self.assert_fails(self.check(), "missing design")

    def test_unchecked_task_cannot_wait_for_review(self):
        self.write_feature("demo", "1-feat-sample", "check", checked=False)
        self.assert_fails(self.check(), "unchecked task")

    def test_same_task_in_two_states_fails(self):
        self.write_feature("demo", "1-feat-sample", "active")
        self.write_feature("demo", "1-feat-sample", "completed")
        self.assert_fails(self.check(), "duplicate task")

    def test_link_outside_the_harness_root_fails(self):
        agents = self.root / "AGENTS.md"
        agents.write_text(agents.read_text() + "\n[밖](../outside.md)\n")
        (self.base / "outside.md").write_text("# 밖\n")
        self.assert_fails(self.check(), "link escapes")

    def test_broken_link_fails(self):
        agents = self.root / "AGENTS.md"
        agents.write_text(agents.read_text() + "\n[없음](.agents/rules/does-not-exist.md)\n")
        self.assert_fails(self.check(), "broken link")

    # ── 문서 기준(.agents/docs/guides/doc-standards.md) ──────────────────────────
    def test_readme_needs_the_seven_sections(self):
        readme = self.root / "README.md"
        readme.write_text(readme.read_text().replace("## 기여", "## 참여"))
        self.assert_fails(self.check(), "README.md: missing section '## 기여'")

    def test_a_heading_inside_a_code_block_does_not_count_as_a_section(self):
        readme = self.root / "README.md"
        text = readme.read_text().replace("## 기여", "## 참여")
        readme.write_text(text + "\n```markdown\n## 기여\n```\n")
        self.assert_fails(self.check(), "README.md: missing section '## 기여'")

    def test_agents_entry_must_stay_short(self):
        agents = self.root / "AGENTS.md"
        agents.write_text(agents.read_text() + "\n".join(f"- 줄 {i}" for i in range(160)) + "\n")
        self.assert_fails(self.check(), "AGENTS.md: ")
        self.assert_fails(self.check(), "> 150")

    def test_architecture_needs_a_mermaid_diagram(self):
        architecture = self.root / "ARCHITECTURE.md"
        architecture.write_text(architecture.read_text().replace("```mermaid", "```text"))
        self.assert_fails(self.check(), "ARCHITECTURE.md: no mermaid diagram")

    def test_role_needs_the_seven_sections(self):
        role = self.root / ".agents/roles/reviewer.md"
        role.write_text(role.read_text().replace("## 출력", "## 결과"))
        self.assert_fails(self.check(), ".agents/roles/reviewer.md: missing section '## 출력'")

    def test_unclosed_code_fence_fails(self):
        agents = self.root / "AGENTS.md"
        agents.write_text(agents.read_text() + "\n```bash\nbash scripts/verify.sh\n")
        self.assert_fails(self.check(), "AGENTS.md: unclosed code fence")

    def test_claude_agent_must_declare_tools(self):
        agent = self.root / ".claude/agents/explorer.md"
        agent.write_text(re.sub(r"(?m)^tools:.*\n", "", agent.read_text()))
        self.assert_fails(self.check(), ".claude/agents/explorer.md: front matter needs tools")

    def track_note(self, link, track=True):
        # 하네스 문서 밖의 Markdown 은 git 이 추적할 때만 본다. 복사본을 리포로 만든다.
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        note = self.root / "notes/guide.md"
        note.parent.mkdir(exist_ok=True)
        note.write_text(f"# 안내\n\n[링크]({link})\n")
        if track:
            subprocess.run(["git", "-C", str(self.root), "add", "notes/guide.md"], check=True)

    def test_tracked_markdown_cannot_link_outside_the_harness_root(self):
        (self.base / "outside.md").write_text("# 밖\n")
        self.track_note("../../outside.md")
        self.assert_fails(self.check(), "notes/guide.md: link escapes")

    def test_tracked_markdown_outside_harness_docs_is_checked_only_for_escapes(self):
        self.track_note("missing.md")
        self.assert_ok(self.check())

    def test_untracked_markdown_is_not_scanned(self):
        (self.base / "outside.md").write_text("# 밖\n")
        self.track_note("../../outside.md", track=False)
        self.assert_ok(self.check())

    def test_rule_without_kiro_steering_fails(self):
        rule = self.first_rule()
        (self.root / ".kiro/steering" / rule.name).unlink()
        self.assert_fails(self.check(), "missing Kiro steering")

    def test_kiro_pointer_without_rule_fails(self):
        (self.root / ".kiro/steering/orphan.md").write_text("---\ninclusion: always\n---\n원본: `.agents/rules/orphan.md`\n")
        self.assert_fails(self.check(), "orphan")

    def test_skill_without_agent_copy_fails(self):
        shutil.rmtree(self.root / ".claude/skills/hx-plan")
        self.assert_fails(self.check(), ".claude/skills/hx-plan/SKILL.md: missing skill copy")

    def test_kiro_resource_cannot_escape(self):
        agent = self.root / ".kiro/agents/worker.json"
        data = json.loads(agent.read_text())
        data["resources"].append("file://../outside.md")
        agent.write_text(json.dumps(data))
        self.assert_fails(self.check(), "escapes")

    def test_external_symlink_fails(self):
        (self.base / "outside.md").write_text("# 밖\n")
        (self.root / ".agents/linked.md").symlink_to(self.base / "outside.md")
        self.assert_fails(self.check(), "external symlink")

    def test_codex_role_needs_standalone_fields(self):
        role = self.root / ".codex/agents/worker.toml"
        role.write_text(re.sub(r"^name = .*\n", "", role.read_text(), flags=re.M))
        self.assert_fails(self.check(), "name")

    def test_stop_gate_reports_failure_with_exit_2(self):
        verify = self.root / "scripts/verify.sh"
        verify.write_text("#!/usr/bin/env bash\necho 실패를-만든다\nexit 1\n")
        result = self.run_script("bash", str(self.root / "scripts/hooks/verify-gate.sh"))
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("실패를-만든다", result.stderr)

    def test_stop_gate_skips_while_another_run_holds_the_lock(self):
        verify = self.root / "scripts/verify.sh"
        verify.write_text("#!/usr/bin/env bash\nexit 1\n")
        key = subprocess.run(["sh", "-c", f"printf '%s' '{self.root}' | cksum | cut -d' ' -f1"], capture_output=True, text=True).stdout.strip()
        lock = self.base / f"harness-verify-gate.{os.getuid()}.{key}.lock"
        lock.mkdir()
        (lock / "pid").write_text(str(os.getpid()))
        result = self.run_script("bash", str(self.root / "scripts/hooks/verify-gate.sh"))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_stop_gate_runs_when_an_abandoned_lock_is_old(self):
        verify = self.root / "scripts/verify.sh"
        verify.write_text("#!/usr/bin/env bash\necho 버려진-잠금-뒤\nexit 1\n")
        key = subprocess.run(["sh", "-c", f"printf '%s' '{self.root}' | cksum | cut -d' ' -f1"], capture_output=True, text=True).stdout.strip()
        lock = self.base / f"harness-verify-gate.{os.getuid()}.{key}.lock"
        lock.mkdir()
        (lock / "pid").write_text(str(os.getpid()))
        os.utime(lock, (0, 0))
        result = self.run_script("bash", str(self.root / "scripts/hooks/verify-gate.sh"))
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("버려진-잠금-뒤", result.stderr)

    def test_stop_gate_failure_exit_code_follows_the_client(self):
        # Kiro V3·IDE 는 Stop 의 exit 2 를 무시하고 1 에서 에이전트에 실패를 넘긴다.
        (self.root / "scripts/verify.sh").write_text("#!/usr/bin/env bash\necho 실패\nexit 1\n")
        gate = str(self.root / "scripts/hooks/verify-gate.sh")
        for value, expected in (("1", 1), ("2", 2), ("7", 2), ("", 2)):
            with self.subTest(fail_exit=value):
                env = {**self.env, "HARNESS_VERIFY_FAIL_EXIT": value}
                self.assertEqual(expected, self.run_script("bash", gate, env=env).returncode)

    def test_stop_gate_success_writes_nothing_to_stdout(self):
        # Codex 는 Stop 이 성공하면서 평문 stdout 을 내면 실패로 기록한다.
        (self.root / "scripts/verify.sh").write_text("#!/usr/bin/env bash\necho 게이트-출력\n")
        result = self.run_script("bash", str(self.root / "scripts/hooks/verify-gate.sh"))
        self.assert_ok(result)
        self.assertEqual("", result.stdout)

    def test_session_start_does_not_look_like_json(self):
        # Codex 는 앞 공백을 뗀 첫 글자가 { 나 [ 이면 JSON 으로 읽고, 못 읽으면 컨텍스트를 버린다.
        result = self.run_script("bash", str(self.root / "scripts/hooks/session-start.sh"))
        self.assert_ok(result)
        self.assertNotIn(result.stdout.lstrip()[:1], ("{", "["))

    def test_codex_hooks_json_with_unknown_top_level_key_fails(self):
        # Codex 는 hooks.json 최상위에 모르는 키가 있으면 파일 전체를 버린다.
        path = self.root / ".codex/hooks.json"
        hooks = json.loads(path.read_text())
        path.write_text(json.dumps({"_comment": "설명", **hooks}))
        self.assert_fails(self.check(), "_comment")

    def test_kiro_hooks_find_the_nearest_harness_and_stop_fails_with_1(self):
        unit = json.loads((self.root / ".agents/harness.json").read_text())["unit"]
        agent = json.loads((self.root / f".kiro/agents/{unit}.json").read_text())["hooks"]
        self.assertIn("session-start.sh", agent["agentSpawn"][0]["command"])
        self.assertIn("HARNESS_VERIFY_FAIL_EXIT=1", agent["stop"][0]["command"])
        workspace = {
            name: json.loads((self.root / f".kiro/hooks/{name}.json").read_text())["hooks"][0]["action"]["command"]
            for name in ("harness-session-start", "harness-verify-gate")
        }
        self.assertIn("HARNESS_VERIFY_FAIL_EXIT=1", workspace["harness-verify-gate"])
        for command in (agent["agentSpawn"][0]["command"], agent["stop"][0]["command"], *workspace.values()):
            self.assertIn('[ ! -f "$r/.agents/harness.json" ]', command)
        nested = self.root / "some/nested/dir"
        nested.mkdir(parents=True)
        result = self.run_script("sh", "-c", workspace["harness-session-start"], cwd=nested)
        self.assert_ok(result)
        self.assertIn(json.loads((self.root / ".agents/harness.json").read_text())["title"], result.stdout)
        (self.root / "scripts/verify.sh").write_text("#!/usr/bin/env bash\necho 실패\nexit 1\n")
        for command in (agent["stop"][0]["command"], workspace["harness-verify-gate"]):
            with self.subTest(command=command[:40]):
                self.assertEqual(1, self.run_script("sh", "-c", command, cwd=nested).returncode)

    def test_required_file_ignored_by_gitignore_fails(self):
        # 작업 트리에는 있어 다른 검사가 모두 통과하지만, 무시 규칙에 걸리면 커밋에서 빠져 새 클론에 없다.
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        (self.root / ".gitignore").write_text("git-hooks/\n")
        self.assert_fails(self.check(), "scripts/git-hooks/global-hook.sh: ignored by .gitignore")

    def test_broken_unit_check_is_reported(self):
        (self.root / "scripts/check_unit.py").write_text("raise RuntimeError('단위 검사 오류')\n")
        self.assert_fails(self.check(), "scripts/check_unit.py: RuntimeError")
        (self.root / "scripts/check_unit.py").write_text("VALUE = 1\n")
        self.assert_fails(self.check(), "errors(root)")

    def test_session_start_names_this_harness(self):
        title = json.loads((self.root / ".agents/harness.json").read_text())["title"]
        (self.root / ".agents/session-context.md").write_text("- 단위 고유 안내 한 줄\n")
        result = self.run_script("bash", str(self.root / "scripts/hooks/session-start.sh"))
        self.assert_ok(result)
        self.assertIn(title, result.stdout)
        self.assertIn("단위 고유 안내 한 줄", result.stdout)

    def test_codex_hook_finds_the_nearest_harness_root(self):
        hooks = json.loads((self.root / ".codex/hooks.json").read_text())
        command = hooks["hooks"]["SessionStart"][0]["hooks"][0]["command"]
        nested = self.root / "some/nested/dir"
        nested.mkdir(parents=True)
        result = self.run_script("sh", "-c", command, cwd=nested)
        self.assert_ok(result)
        title = json.loads((self.root / ".agents/harness.json").read_text())["title"]
        self.assertIn(title, result.stdout)

    def write_feature(self, slug, key, folder, state=None, checked=True):
        spec = self.root / f".agents/docs/{slug}-specs"
        for stage in ("requirements", "design"):
            path = spec / stage / f"{key}.md"
            path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                path.write_text(f"# {stage}\n\n| 상태 | draft |\n")
        task = spec / "tasks" / folder / f"{key}.md"
        task.parent.mkdir(parents=True, exist_ok=True)
        box = "X" if checked else " "
        task.write_text(f"# Tasks\n\n| 상태 | {state or folder} |\n\n- [{box}] T001 예시 작업\n")


def approve(path):
    """옛 구조는 `| 상태 |` 행, 새 구조는 frontmatter 의 status 를 approved 로 바꾼다."""
    text = path.read_text()
    if text.startswith("---\n"):
        path.write_text(re.sub(r"^status:.*$", "status: approved", text, count=1, flags=re.M))
        return
    path.write_text(re.sub(r"^(\|\s*상태\s*\|)[^|\n]*\|", r"\1 approved |", text, count=1, flags=re.M))


def issue_prefix(root):
    """설치 메타의 issueKey.prefix. 없으면 new-feature.sh 와 같은 규칙으로 PROJECT_SLUG · 단위 이름에서 만든다."""
    meta = root / ".agents/harness-kit.json"
    data = json.loads(meta.read_text()) if meta.is_file() else {}
    prefix = data.get("issueKey", {}).get("prefix")
    if prefix:
        return prefix
    slug = data.get("tokens", {}).get("PROJECT_SLUG") or json.loads((root / ".agents/harness.json").read_text()).get("unit", "")
    derived = re.sub(r"^[0-9]+", "", re.sub(r"[^A-Z0-9]", "", slug.upper()))[:10]
    return derived if len(derived) >= 2 else "ISSUE"


if __name__ == "__main__":
    unittest.main()
