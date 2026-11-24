"""리뷰 · MR 코멘트 시험이 같이 쓰는 fixture — 로컬 bare origin, 기능 브랜치, 가짜 gh · glab(상태 파일로 PR · 코멘트를 흉내 낸다).

네트워크를 쓰지 않는다. 가짜 CLI 는 PATH 맨 앞에 놓여 실제 gh · glab 이 불리지 않는다.
"""

import json
import os
import subprocess
import sys

from quality_fixture import QualityFixture
from verify_fixture import IDENTITY

AGENT_MARKERS = ("CLAUDECODE", "CLAUDE_CODE_MESSAGING_SOCKET", "CURSOR_AGENT")
MARKER = "<!-- knots-sync:mr-summary -->"
FAKE_CLI = r'''#!/usr/bin/env python3
"""가짜 {name}: PR(MR) 보기와 코멘트 API 만 흉내 낸다. 상태는 {state!r}."""
import json, re, sys
STATE = {state!r}
NAME = {name!r}
args = sys.argv[1:]
with open(STATE) as handle:
    state = json.load(handle)
state.setdefault("calls", []).append(args)


def save():
    with open(STATE, "w") as handle:
        json.dump(state, handle, ensure_ascii=False, indent=1)


def option(flags):
    for flag in flags:
        if flag in args:
            return args[args.index(flag) + 1]
    return None


def fail(message, code=1):
    save()
    sys.stderr.write(message + "\n")
    sys.exit(code)


if state.get("broken"):
    fail("HTTP 401: Bad credentials")
if NAME == "gh" and args[:2] == ["pr", "view"]:
    ref = args[2]
    pr = next((p for p in state["prs"].values() if str(p["number"]) == ref or p["headRefName"] == ref), None)
    if pr is None:
        fail("no pull requests found")
    save()
    print(json.dumps(pr))
    sys.exit(0)
if NAME == "glab" and args[:2] == ["mr", "view"]:
    ref = args[2]
    mr = next((m for m in state["mrs"].values() if str(m["iid"]) == ref or m["source_branch"] == ref), None)
    if mr is None:
        fail("no merge request")
    save()
    print(json.dumps(mr))
    sys.exit(0)
if args[:1] == ["api"]:
    method = (option(["-X", "--method"]) or "GET").upper()
    endpoint = next(a for a in args[1:] if not a.startswith("-") and args[args.index(a) - 1] not in ("-X", "--method", "--input", "-H", "--header"))
    body = None
    if option(["--input"]):
        with open(option(["--input"])) as handle:
            body = json.load(handle)["body"]
    endpoint = endpoint.split("?", 1)[0]
    if NAME == "gh":
        listing = re.fullmatch(r"repos/\{{owner\}}/\{{repo\}}/issues/(\d+)/comments", endpoint)
        single = re.fullmatch(r"repos/\{{owner\}}/\{{repo\}}/issues/comments/(\d+)", endpoint)
    else:
        listing = re.fullmatch(r"projects/[^/]+/merge_requests/(\d+)/notes", endpoint)
        single = re.fullmatch(r"projects/[^/]+/merge_requests/\d+/notes/(\d+)", endpoint)
    comments = state.setdefault("comments", [])
    if listing and method == "GET":
        mine = [c for c in comments if c["mr"] == listing.group(1)]
        save()
        # 쪽마다 배열 하나(실제 --paginate 처럼 이어 붙인다)
        for start in range(0, max(len(mine), 1), 2):
            print(json.dumps([{{"id": c["id"], "body": c["body"], "created_at": c["at"]}} for c in mine[start:start + 2]]))
        sys.exit(0)
    if listing and method == "POST":
        state["next"] = state.get("next", 1000) + 1
        comments.append({{"id": state["next"], "mr": listing.group(1), "body": body, "at": "2026-11-24T00:00:%02dZ" % (state["next"] % 60)}})
        save()
        print(json.dumps({{"id": state["next"], "body": body}}))
        sys.exit(0)
    if single:
        found = next((c for c in comments if str(c["id"]) == single.group(1)), None)
        if found is None:
            fail("HTTP 404: Not Found")
        if method in ("PATCH", "PUT"):
            found["body"] = body
            save()
            print(json.dumps({{"id": found["id"], "body": body}}))
            sys.exit(0)
        if method == "DELETE":
            comments.remove(found)
            save()
            sys.exit(0)
    fail("unsupported api call: " + " ".join(args))
fail("unsupported: " + " ".join(args))
'''


def without_agent_markers(environment):
    return {
        key: value for key, value in environment.items()
        if key not in AGENT_MARKERS and not key.startswith(("CLAUDE_CODE_", "CODEX_", "KIRO_"))
    }


class ReviewFixture(QualityFixture):
    """develop 위에 이슈 DEMO-1 문서와 소스, origin(bare), 기능 브랜치 feat/DEMO-1-upload, PR #12 · MR !7."""

    key = "DEMO-1"
    folder = ".agents/docs/issues/DEMO-1-upload"
    branch = "feat/DEMO-1-upload"

    def setUp(self):
        super().setUp()
        # 커밋 뒤 따로 뜨는 git maintenance(2.54)가 시험 폴더 정리와 겹치지 않게 끈다.
        self.env = {**without_agent_markers(self.env), "GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": "maintenance.auto", "GIT_CONFIG_VALUE_0": "false"}
        self.state = self.base / "forge-state.json"
        self.state.write_text(json.dumps({"prs": {}, "mrs": {}, "comments": []}))
        for name in ("gh", "glab"):
            path = self.bin / name
            path.write_text(FAKE_CLI.format(name=name, state=str(self.state)))
            path.chmod(0o755)
        self.write(".gitignore", ".agents/state/\n.agents/reports/\n")
        self.write(f"{self.folder}/requirements.md", self.doc("requirements", "approved", "# Requirements\n\n- R1.1 업로드한 파일을 지운다\n- R2.1 동시에 지워도 실패하지 않는다\n"))
        self.write(f"{self.folder}/design.md", self.doc("design", "approved", "# Design\n\n§4.2 중복 실행 없음\n"))
        self.write(f"{self.folder}/tasks.md", self.doc("tasks", None, "# Tasks\n\n- [X] T001 정리 작업\n", state="active"))
        self.write(".agents/rules/pr-review-policy.md", "# 리뷰 정책\n\n- 정확성 → 안전성\n")
        self.write(".agents/rules/security.md", "# 보안\n")
        self.write("src/upload/cleanup.py", "def cleanup(path):\n    if exists(path):\n        delete(path)\n    return True\n")
        self.base_sha = self.commit("base")
        self.origin = self.base / "origin.git"
        subprocess.run(["git", "init", "-q", "--bare", str(self.origin)], check=True, env=self.env)
        self.git("remote", "add", "origin", str(self.origin))
        self.git("push", "-q", "origin", "develop")
        self.git("fetch", "-q", "origin")

    def doc(self, stage, status, body, state=None):
        lines = ["---", f"key: {self.key}", "area: upload", "type: feat", "title: upload"]
        if status:
            lines.append(f"status: {status}")
        if state:
            lines.append(f"state: {state}")
        lines += ["created: 2026-11-23", "---", ""]
        return "\n".join(lines) + body

    # ── 기능 브랜치 · PR ──────────────────────────────────────────────────────
    def push_branch(self, changes, message="feature"):
        """기능 브랜치에 바꿈을 커밋해 origin 에 올리고 develop 으로 돌아온다. 돌려주는 값은 head sha."""
        exists = subprocess.run(["git", "-C", str(self.root), "rev-parse", "--verify", "--quiet", self.branch], capture_output=True).returncode == 0
        self.git("checkout", "-q", self.branch if exists else "-b", *([] if exists else [self.branch]))
        for relative, content in changes.items():
            self.write(relative, content)
        head = self.commit(message)
        self.git("push", "-q", "-f", "origin", self.branch)
        self.git("checkout", "-q", "develop")
        self.forge_pr(head)
        return head

    def forge_pr(self, head):
        state = json.loads(self.state.read_text())
        state["prs"]["12"] = {"number": 12, "url": "https://github.example/acme/notes/pull/12", "title": "upload cleanup",
                              "headRefName": self.branch, "baseRefName": "develop", "headRefOid": head}
        state["mrs"]["7"] = {"iid": 7, "web_url": "https://gitlab.example/acme/notes/-/merge_requests/7", "title": "upload cleanup",
                             "source_branch": self.branch, "target_branch": "develop", "sha": head}
        self.state.write_text(json.dumps(state))

    def forge(self):
        return json.loads(self.state.read_text())

    def kit_comments(self, mr="12"):
        return [comment for comment in self.forge()["comments"] if comment["mr"] == mr and MARKER in comment["body"]]

    # ── 실행 ─────────────────────────────────────────────────────────────────
    def script(self, name, *arguments, extra=None, cwd=None):
        return subprocess.run(
            [sys.executable, str(self.root / "scripts/harness" / name), *arguments],
            cwd=cwd or self.root, env={**self.env, **(extra or {})}, capture_output=True, text=True, timeout=120, check=False,
        )

    def review(self, *arguments, extra=None, cwd=None):
        return self.script("review.py", *arguments, extra=extra, cwd=cwd)

    def state_dir(self):
        return self.root / ".agents/state/review" / self.key

    def write_findings(self, findings, notes=""):
        path = self.state_dir() / "findings.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"findings": findings, "notes": notes}, ensure_ascii=False))
        return path

    def report_path(self):
        return self.root / ".agents/reports/review" / f"{self.key}.md"

    def published(self, findings, mr="#12"):
        collect = self.review("collect", mr)
        self.assertEqual(collect.returncode, 0, collect.stdout + collect.stderr)
        self.write_findings(findings)
        publish = self.review("publish", self.key)
        self.assertEqual(publish.returncode, 0, publish.stdout + publish.stderr)
        return publish

    def git_ok(self, *arguments, cwd=None):
        result = subprocess.run(["git", *IDENTITY, *arguments], cwd=cwd or self.root, env=self.env, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result.stdout.strip()


def finding(severity="HIGH", check="RV-EDGE", path="src/upload/cleanup.py", line=2, title="존재 확인과 삭제 사이에 잠금이 없다", **extra):
    item = {
        "severity": severity, "check": check, "path": path, "line": line, "title": title,
        "evidence": "design §4.2 중복 실행 없음", "scenario": "작업자 2개 동시 실행 → 두 번째 delete 예외",
        "recommendation": "idempotent 삭제로 바꾸고 동시 실행 시험을 더한다",
    }
    item.update(extra)
    return item


def environment_without(path_dirs):
    """PATH 에서 실제 gh · glab 이 있는 폴더를 빼고 기본 폴더만 남긴다."""
    return os.pathsep.join([*path_dirs, "/usr/bin", "/bin"])
