"""이슈 SDD 시험의 공통 준비. 설치본을 임시 폴더로 복사하고 git · 설정 · 문서를 만드는 도구를 준다.

파일 이름이 test_ 로 시작하지 않아 discover 대상이 아니다. 같은 폴더의 시험이 import 한다.
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

SHARED = Path(__file__).resolve().parents[2]
# 배포된 단위에서는 SHARED 가 단위 폴더 전체다. 의존성 · 빌드 산출물과 실제 명세(`*-specs`, `issues`)는 복사하지 않는다.
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
    ".dart_tool",
    "Pods",
    "*-specs",
    "issues",
    "state",
)


def frontmatter_text(**fields):
    lines = ["---", *(f"{key}: {value}" for key, value in fields.items()), "---", ""]
    return "\n".join(lines)


class SddCase(unittest.TestCase):
    prefix = "DEMO"

    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="issue sdd ")
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.root = self.base / "unit"
        shutil.copytree(SHARED, self.root, ignore=shutil.ignore_patterns(*COPY_IGNORE))
        self.docs = self.root / ".agents/docs"
        self.docs.mkdir(exist_ok=True)
        self.index = self.docs / "specs-index.md"
        self.index.write_text("# 색인\n\n사람이 작성한 본문\n")
        self.scripts = self.root / "scripts"
        gitconfig = self.base / "gitconfig"
        gitconfig.write_text(
            "[user]\n\tname = sdd test\n\temail = sdd@example.com\n"
            "[init]\n\tdefaultBranch = develop\n[protocol \"file\"]\n\tallow = always\n"
            # git 2.54 는 fetch · push 뒤 maintenance 를 따로 띄운다. 그 프로세스가 임시 폴더 정리와 겹치면 정리가 실패한다.
            "[maintenance]\n\tauto = false\n[gc]\n\tauto = 0\n"
        )
        inherited = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        self.env = {
            **inherited,
            "GIT_CONFIG_GLOBAL": str(gitconfig),
            "GIT_CONFIG_NOSYSTEM": "1",
            "HOME": str(self.base),
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        self.settings()

    # ── 설정 · 실행 ────────────────────────────────────────────────────────────
    def settings(self, source="kit", prefix=None, base="develop"):
        meta = self.root / ".agents/harness-kit.json"
        data = json.loads(meta.read_text()) if meta.is_file() else {}
        data["issueKey"] = {"source": source, "prefix": prefix or self.prefix}
        data["git"] = {**data.get("git", {}), "base": base}
        meta.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

    def run_script(self, script, *arguments, cwd=None, stdin=""):
        interpreter = sys.executable if script.endswith(".py") else "bash"
        return subprocess.run(
            [interpreter, str(self.scripts / script), *arguments],
            cwd=cwd or self.base,
            env=self.env,
            input=stdin,
            text=True,
            capture_output=True,
            timeout=60,
        )

    def scaffold(self, *arguments):
        return self.run_script("new-feature.sh", *arguments)

    def layout(self, *arguments):
        return self.run_script("sdd-layout.py", *arguments)

    def check(self):
        return self.run_script("check_harness.py")

    def assert_ok(self, result):
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def assert_fails(self, result, expected):
        self.assertNotEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn(expected, result.stdout + result.stderr)

    def assert_exit(self, result, code, expected=None):
        self.assertEqual(code, result.returncode, result.stdout + result.stderr)
        if expected is not None:
            self.assertIn(expected, result.stdout + result.stderr)

    # ── git ───────────────────────────────────────────────────────────────────
    def git(self, *arguments, cwd=None, check=True):
        result = subprocess.run(
            ["git", *arguments], cwd=cwd or self.root, env=self.env, input="", capture_output=True, text=True, timeout=60
        )
        if check:
            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        return result

    def init_git(self):
        self.git("init", "-q")
        self.git("add", "-A")
        self.git("commit", "-q", "--no-verify", "-m", "init")

    def commit(self, message="change"):
        self.git("add", "-A")
        self.git("commit", "-q", "--no-verify", "-m", message)

    def add_origin(self):
        """작업 리포의 지금 develop 을 담은 bare origin 과, origin 에 push 하는 다른 사람의 클론을 만든다."""
        origin = self.base / "origin.git"
        self.git("init", "-q", "--bare", str(origin), cwd=self.base)
        self.git("remote", "add", "origin", str(origin))
        self.git("push", "-q", "origin", "develop")
        self.git("fetch", "-q", "origin")
        other = self.base / "other"
        self.git("clone", "-q", "-b", "develop", str(origin), str(other), cwd=self.base)
        return other

    def push_issue_from_other(self, other, folder, area="demo"):
        """다른 사람이 base 에 이슈 폴더를 병합한 상태를 만든다."""
        key = re.match(r"^([A-Z][A-Z0-9]*-[0-9]+)-", folder)[1]
        path = other / ".agents/docs/issues" / folder / "requirements.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(frontmatter_text(key=key, area=area, type="feat", title=folder, status="draft") + "# Requirements\n")
        self.git("add", "-A", cwd=other)
        self.git("commit", "-q", "--no-verify", "-m", f"add {folder}", cwd=other)
        self.git("push", "-q", "origin", "develop", cwd=other)

    # ── 새 구조 문서 ───────────────────────────────────────────────────────────
    def issue(self, folder):
        return self.docs / "issues" / folder

    def write_new_issue(self, folder, area="demo", type_="feat", req="approved", design=None, tasks=None, checked=True):
        key = re.match(r"^([A-Z][A-Z0-9]*-[0-9]+)-", folder)[1]
        issue = self.issue(folder)
        issue.mkdir(parents=True, exist_ok=True)
        common = {"key": key, "area": area, "type": type_, "title": folder}
        (issue / "requirements.md").write_text(frontmatter_text(**common, status=req) + "# Requirements\n")
        if design:
            (issue / "design.md").write_text(frontmatter_text(**common, status=design) + "# Design\n")
        if tasks:
            box = "X" if checked else " "
            (issue / "tasks.md").write_text(frontmatter_text(**common, state=tasks) + f"# Tasks\n\n- [{box}] T001 일\n")
        return issue

    def set_field(self, path, field, value):
        text = path.read_text()
        updated, count = re.subn(rf"^{field}:.*$", f"{field}: {value}", text, count=1, flags=re.M)
        self.assertEqual(1, count, f"{path} 에 {field} 가 없다")
        path.write_text(updated)

    def field(self, path, field):
        match = re.search(rf"^{field}:\s*(.*)$", path.read_text().split("\n---", 1)[0], re.M)
        return match[1].strip() if match else None

    # ── 옛 구조 문서 ───────────────────────────────────────────────────────────
    def write_legacy_issue(self, slug, key, req="approved", design="approved", state=None, checked=True):
        issue = self.docs / f"{slug}-specs/issues/{key}"
        issue.mkdir(parents=True, exist_ok=True)
        (issue / "requirements.md").write_text(f"# Requirements — {key}\n\n| 상태 | {req} |\n")
        if design:
            (issue / "design.md").write_text(f"# Design — {key}\n\n| 상태 | {design} |\n")
        if state:
            (issue / "tasks").mkdir(exist_ok=True)
            box = "X" if checked else " "
            (issue / "tasks" / f"{state}.md").write_text(f"# Tasks — {key}\n\n| 상태 | {state} |\n\n- [{box}] T001 일\n")
        return issue

    def write_legacy_stage(self, slug, key, req="approved", design="approved", state=None):
        spec = self.docs / f"{slug}-specs"
        for stage, status in (("requirements", req), ("design", design)):
            if status:
                path = spec / stage / f"{key}.md"
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(f"# {stage} — {key}\n\n| 상태 | {status} |\n")
        if state:
            path = spec / "tasks" / state / f"{key}.md"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(f"# Tasks — {key}\n\n| 상태 | {state} |\n\n- [X] T001 일\n")
        return spec

    def tree_snapshot(self, ignore=(".git", "state")):
        return {
            path.relative_to(self.root).as_posix(): path.read_bytes()
            for path in sorted(self.root.rglob("*"))
            if path.is_file() and not set(path.relative_to(self.root).parts) & set(ignore)
        }
