#!/usr/bin/env python3
"""두 구성 e2e 의 바탕: 일회용 HOME · 리포 · 대시보드 서버 · API 호출(설계 11 §3.4).

모든 도구 실행은 일회용 HOME · XDG_CONFIG_HOME · HARNESS_KIT_CONFIG_DIR · GIT_CONFIG_GLOBAL 로 한다.
실제 HOME · 전역 git 설정 · 다른 리포를 건드리지 않는다.
"""

from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
import re
import select
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT = HERE.parents[1]
sys.path.insert(0, str(HERE / "fixtures"))
import make_sample_repo  # noqa: E402
import scripted  # noqa: E402

CLI = KIT / "plugins/harness-kit/skills/hx-bootstrap/bin/harness-kit.js"
STUBS = HERE / "stubs"
CONFIGS = ("A", "B-forward", "B-reverse")
SECRET_ENV = re.compile(r"^(CLAUDE|CODEX_|KIRO_|CURSOR_|GIT_|HARNESS_|HX_|ENTIRE|AIDLC|OPENAI|ANTHROPIC)")
IMPLEMENT_ROLE = "implement"
REVIEW_ROLE = "review"


class Skip(Exception):
    """이 환경에서는 볼 수 없는 판정(이유와 함께 건너뜀으로 기록한다)."""


@dataclass
class Result:
    config: str
    id: str
    status: str  # pass · fail · skip
    note: str = ""


@dataclass
class Report:
    results: list[Result] = field(default_factory=list)
    measurements: dict = field(default_factory=dict)
    steps: list[str] = field(default_factory=list)

    def add(self, config: str, cid: str, status: str, note: str = "") -> None:
        self.results.append(Result(config, cid, status, note))
        print(f"  [{config}] {cid}: {status}{' — ' + note if note else ''}", flush=True)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def real_env_fingerprint() -> dict:
    """실제 HOME 쪽 상태(읽기만). 시험이 끝나도 같아야 한다."""
    env = {k: v for k, v in os.environ.items() if k in ("HOME", "PATH")}
    hooks = subprocess.run(["git", "config", "--global", "--get", "core.hooksPath"], capture_output=True, text=True, env=env).stdout.strip()
    home = Path(os.environ.get("HOME", "~")).expanduser()
    files = {}
    for rel in (".gitconfig", ".claude/settings.json", ".config/git/config"):
        f = home / rel
        files[rel] = sha256(f) if f.is_file() else None
    return {"core.hooksPath": hooks, "files": files}


class Sandbox:
    """일회용 HOME · 설정 폴더 · 도구 폴더 · 리포 하나."""

    def __init__(self, mode: str, label: str, keep: bool):
        self.mode, self.label, self.keep = mode, label, keep
        self.base = Path(tempfile.mkdtemp(prefix=f"hk-e2e-{label}-")).resolve()
        self.home = self.base / "home"
        (self.home / ".config").mkdir(parents=True)
        (self.base / "cfg").mkdir()
        (self.home / ".gitconfig").write_text("[user]\n\tname = e2e\n\temail = e2e@example.com\n", encoding="utf-8")
        self.toolbin = self.base / "toolbin"
        self.toolbin.mkdir()
        self.log = self.base / "tools.log"
        self.repo = self.base / "repo"
        self.origin = self.base / "origin.git"
        self.env = self.make_env()
        self.dashboard: subprocess.Popen | None = None
        self.api: dict | None = None

    def make_env(self) -> dict:
        env = {k: v for k, v in os.environ.items() if not SECRET_ENV.match(k)}
        real_node = subprocess.run(["node", "-p", "process.execPath"], capture_output=True, text=True, check=True).stdout.strip()
        links = {"node": real_node, "python3": sys.executable, "git": shutil.which("git")}
        if self.mode == "real":
            for name in ("aidlc", "entire"):
                found = shutil.which(name)
                if not found:
                    raise SystemExit(f"실제 모드에는 {name} 가 PATH 에 있어야 한다")
                links[name] = found
        else:
            for name in ("aidlc", "entire"):
                dest = self.toolbin / name
                shutil.copy2(STUBS / name, dest)
                dest.chmod(0o755)
        for name, target in links.items():
            if target:
                (self.toolbin / name).symlink_to(target)
        env.update(
            HOME=str(self.home), XDG_CONFIG_HOME=str(self.home / ".config"), HARNESS_KIT_CONFIG_DIR=str(self.base / "cfg"),
            GIT_CONFIG_GLOBAL=str(self.home / ".gitconfig"), GIT_CONFIG_SYSTEM="/dev/null", GIT_TERMINAL_PROMPT="0",
            GIT_AUTHOR_NAME="e2e", GIT_AUTHOR_EMAIL="e2e@example.com", GIT_COMMITTER_NAME="e2e", GIT_COMMITTER_EMAIL="e2e@example.com",
            PATH=f"{self.toolbin}:/usr/bin:/bin", E2E_LOG=str(self.log), PYTHONDONTWRITEBYTECODE="1", NO_COLOR="1",
        )
        return env

    # ── 실행 ──

    def run(self, *argv: str, cwd: Path | None = None, check: bool = True, env: dict | None = None, timeout: int = 600) -> subprocess.CompletedProcess:
        r = subprocess.run(list(argv), cwd=cwd or self.repo, env={**self.env, **(env or {})}, capture_output=True, text=True, timeout=timeout)
        if check and r.returncode != 0:
            raise RuntimeError(f"{' '.join(argv)[:160]} → exit {r.returncode}\n{r.stdout[-1500:]}\n{r.stderr[-1500:]}")
        return r

    def hk(self, *args: str, **kw) -> subprocess.CompletedProcess:
        return self.run("node", str(CLI), *args, **kw)

    def py(self, script: str, *args: str, **kw) -> subprocess.CompletedProcess:
        return self.run("python3", "-B", f"scripts/harness/{script}", *args, **kw)

    def git(self, *args: str, **kw) -> str:
        return self.run("git", *args, **kw).stdout.strip()

    def write(self, rel: str, text: str) -> None:
        p = self.repo / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    def read(self, rel: str) -> str:
        return (self.repo / rel).read_text(encoding="utf-8")

    def commit(self, message: str, env: dict | None = None) -> str:
        self.git("add", "-A")
        self.run("git", "commit", "-q", "-m", message, env=env)
        return self.git("rev-parse", "HEAD")

    # ── 리포 ──

    def init_repo(self) -> None:
        self.repo.mkdir()
        self.run("git", "init", "-q", "--bare", str(self.origin), cwd=self.base)
        self.git("init", "-q", "-b", "develop")
        self.git("remote", "add", "origin", str(self.origin))
        make_sample_repo.make(self.repo)
        self.write(".gitignore", "__pycache__/\n*.pyc\n")
        self.commit("chore: sample repo")
        self.git("push", "-q", "origin", "develop")

    def list_files(self) -> list[dict]:
        r = self.hk("list", "--files", "--json")
        data = json.loads(r.stdout)
        return (data.get("files") or {}).get("entries") or []

    def external_hashes(self) -> dict[str, str]:
        """lock 에서 owner 가 external:* 인 파일의 sha256(파일 없음은 '-')."""
        out = {}
        for item in self.list_files():
            owner = str(item.get("owner", ""))
            # .entire/logs/ 는 Entire 가 돌 때마다 스스로 쓰는 실행 기록이라 '깔린 파일'이 아니다(역순 설치에서는 add 때 이미 있어 등록된다).
            if owner.startswith("external:") and not item["path"].startswith(".entire/logs/"):
                f = self.repo / item["path"]
                out[item["path"]] = sha256(f) if f.is_file() else "-"
        return out

    def external_hook_entries(self) -> dict[str, str]:
        """하네스 설정 속 외부 훅 항목별 sha256(.claude/settings.json 은 킷 병합 파일이라 항목으로 본다)."""
        out = {}
        for rel in (".claude/settings.json", ".codex/hooks.json"):
            f = self.repo / rel
            if not f.is_file():
                continue
            data = json.loads(f.read_text(encoding="utf-8"))
            for event, groups in (data.get("hooks") or {}).items():
                for group in groups:
                    for hook in group.get("hooks", []):
                        cmd = hook.get("command", "")
                        if "aidlc" in cmd or "entire" in cmd:
                            out[f"{rel}:{event}:{cmd}"] = hashlib.sha256(json.dumps(hook, sort_keys=True).encode()).hexdigest()
        return out

    # ── 대시보드 서버 · API ──

    def start_dashboard(self) -> None:
        self.dashboard = subprocess.Popen(
            ["node", str(CLI), "dashboard", "--port", "0"], cwd=self.repo, env=self.env,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        info = self.repo / ".agents/state/dashboard.json"
        token = self.repo / ".agents/state/dashboard.token"
        deadline = time.time() + 30
        while time.time() < deadline and not (info.is_file() and token.is_file()):
            if self.dashboard.poll() is not None:
                raise RuntimeError("대시보드가 바로 끝났다: " + (self.dashboard.stderr.read() if self.dashboard.stderr else ""))
            time.sleep(0.2)
        port = json.loads(info.read_text(encoding="utf-8"))["port"]
        pin = ""
        assert self.dashboard.stderr is not None
        deadline = time.time() + 30
        seen = ""
        while time.time() < deadline and not pin:
            ready, _, _ = select.select([self.dashboard.stderr], [], [], 1.0)
            if not ready:
                continue
            seen += os.read(self.dashboard.stderr.fileno(), 4096).decode("utf-8", "replace")
            if "읽기 전용" in seen:
                # 에이전트 세션 안에서 돌리면 서버가 승인 API 를 닫는다(설계 06 DB-R22). 판정을 피하지 않고 건너뛴다.
                self.stop_dashboard()
                raise Skip(f"승인 API 가 닫혀 있다 — 사람 터미널 · CI 에서 돌려야 한다({seen.strip()[:80]})")
            m = re.search(r"승인 PIN: (\S+)", seen)
            if m:
                pin = m[1]
        if not pin:
            raise RuntimeError(f"PIN 을 읽지 못했다: {seen[-300:]}")
        self.api = {"port": port, "token": token.read_text(encoding="utf-8").strip(), "pin": pin}

    def stop_dashboard(self) -> None:
        if self.dashboard and self.dashboard.poll() is None:
            self.dashboard.send_signal(signal.SIGTERM)
            try:
                self.dashboard.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.dashboard.kill()
        self.dashboard = None
        self.api = None

    def call(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
        assert self.api, "대시보드가 꺼져 있다"
        conn = http.client.HTTPConnection("127.0.0.1", self.api["port"], timeout=60)
        headers = {"Authorization": f"Bearer {self.api['token']}", "Host": f"127.0.0.1:{self.api['port']}"}
        payload = None
        if body is not None:
            payload = json.dumps(body).encode()
            headers.update({"Content-Type": "application/json", "Origin": f"http://127.0.0.1:{self.api['port']}"})
        elif method != "GET":
            headers["Origin"] = f"http://127.0.0.1:{self.api['port']}"
        conn.request(method, path, body=payload, headers=headers)
        resp = conn.getresponse()
        text = resp.read().decode("utf-8")
        conn.close()
        try:
            return resp.status, json.loads(text)
        except ValueError:
            return resp.status, {"raw": text}

    def doc_sha(self, rel: str) -> str:
        status, data = self.call("GET", f"/api/v1/docs?path={rel}")
        assert status == 200, (status, data)
        return data["data"]["sha256"]

    def approve(self, target: dict, gate: str, phrase: str, sha: str | None = None, **extra) -> tuple[int, dict]:
        body = {"target": target, "gate": gate, "decision": "approved", "phrase": phrase, "pin": self.api["pin"] if self.api else "", **extra}
        if sha is not None:
            body["docSha256"] = sha
        return self.call("POST", "/api/v1/approvals", body)

    def close(self) -> None:
        self.stop_dashboard()
        if not self.keep:
            shutil.rmtree(self.base, ignore_errors=True)
