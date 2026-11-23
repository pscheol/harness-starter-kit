"""검증 시험이 같이 쓰는 임시 하네스(설치본 scripts/ 를 복사한다). 실제 빌드 도구는 띄우지 않는다."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]
IDENTITY = ["-c", "user.email=harness@example.invalid", "-c", "user.name=harness"]
# 에이전트 세션·CI·상위 게이트 표지가 시험 결과를 바꾸지 않도록 지운다.
CLEARED = ("CLAUDECODE", "CI", "HARNESS_VERIFY_LEVEL", "HARNESS_VERIFY_PARENT", "HARNESS_VERIFY_RECORDING", "HARNESS_VERIFY_TRIGGER")
GATE_BODY = """#!/usr/bin/env bash
set -uo pipefail
# BEGIN HARNESS VERIFICATION ENTRY
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verify-entry.sh"
# END HARNESS VERIFICATION ENTRY
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2
echo "▶ 본문 첫 단계"
echo "body ${HARNESS_VERIFY_LEVEL:-full} parent=${HARNESS_VERIFY_PARENT:-}"
"""


class VerifyFixture(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="verify fixture ")
        self.addCleanup(directory.cleanup)
        self.base = Path(directory.name).resolve()
        self.root = self.base / "harness"
        self.root.mkdir()
        self.write(".agents/harness.json", json.dumps({"unit": "sample", "stack": "monorepo"}))
        self.write("README.md", "# 설명\n")
        scripts = self.root / "scripts"
        scripts.mkdir()
        for name in ("verify-changed.py", "verify-entry.sh"):
            if (SOURCE / name).exists():
                shutil.copy2(SOURCE / name, scripts)
        for name in ("harness", "hooks"):
            if (SOURCE / name).exists():
                shutil.copytree(SOURCE / name, scripts / name, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        self.bin = self.base / "bin"
        self.bin.mkdir()
        environment = {key: value for key, value in os.environ.items() if key not in CLEARED}
        self.env = {
            **environment,
            "PYTHONDONTWRITEBYTECODE": "1",
            "TMPDIR": str(self.base),
            "PATH": str(self.bin) + os.pathsep + environment.get("PATH", ""),
        }
        self.records = self.base / "calls.jsonl"

    def write(self, relative, content=""):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return path

    def fake(self, relative, code=0, output="1 passed", delay=0, root=None):
        """부른 인자·폴더를 기록하고 정해진 출력·코드로 끝나는 실행 파일."""
        path = (root or self.root) / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, sys, time\n"
            f"with open({str(self.records)!r}, 'a') as record:\n"
            "    record.write(json.dumps({'arguments': sys.argv, 'cwd': os.getcwd(),"
            " 'parent': os.environ.get('HARNESS_VERIFY_PARENT'), 'level': os.environ.get('HARNESS_VERIFY_LEVEL')}) + '\\n')\n"
            f"time.sleep({delay!r})\nprint({output!r})\nsys.exit({code})\n"
        )
        path.chmod(0o755)
        return path

    def fake_tool(self, name, script):
        """PATH 맨 앞에 놓는 가짜 도구(pnpm·go 등). script 는 python 본문이다."""
        path = self.bin / name
        path.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, sys\n"
            f"with open({str(self.records)!r}, 'a') as record:\n"
            "    record.write(json.dumps({'arguments': sys.argv, 'cwd': os.getcwd()}) + '\\n')\n" + script
        )
        path.chmod(0o755)
        return path

    def calls(self):
        if not self.records.exists():
            return []
        return [json.loads(line) for line in self.records.read_text().splitlines()]

    def gate(self, body=GATE_BODY):
        path = self.write("scripts/verify.sh", body)
        path.chmod(0o755)
        return path

    def run_cli(self, *arguments, env=None, cwd=None):
        return subprocess.run(
            [sys.executable, str(self.root / "scripts/verify-changed.py"), *arguments],
            cwd=cwd or self.root,
            env=env or self.env,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )

    def run_gate(self, *arguments, env=None, extra=None):
        environment = {**(env or self.env), **(extra or {})}
        return subprocess.run(
            ["bash", str(self.root / "scripts/verify.sh"), *arguments],
            cwd=self.root,
            env=environment,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )

    def plan(self, *arguments, env=None):
        result = self.run_cli(*arguments, "--plan", env=env)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def git(self, *arguments, cwd=None):
        return subprocess.run(["git", "-C", str(cwd or self.root), *arguments], capture_output=True, text=True, check=True)

    def commit_all(self, message="base", cwd=None):
        self.git("add", "-A", cwd=cwd)
        self.git(*IDENTITY, "commit", "-q", "-m", message, cwd=cwd)
        return self.git("rev-parse", "HEAD", cwd=cwd).stdout.strip()

    def init_repo(self, cwd=None, branch="develop"):
        self.git("init", "-q", "-b", branch, cwd=cwd)

    def publish(self, branch="develop", cwd=None):
        """지금 HEAD 를 origin/<branch> 로 둔다(네트워크 없이 원격 추적 ref 만 만든다)."""
        head = self.git("rev-parse", "HEAD", cwd=cwd).stdout.strip()
        self.git("update-ref", f"refs/remotes/origin/{branch}", head, cwd=cwd)
        return head

    def commands(self, plan, kind=None):
        return [command for command in plan["commands"] if kind is None or command["kind"] == kind]
