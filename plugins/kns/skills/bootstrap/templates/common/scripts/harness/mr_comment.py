#!/usr/bin/env python3
"""MR 요약 코멘트 하나(설계 09 §3.1 · §3.7 · VQ-R17). GitHub 는 gh, GitLab 은 glab 을 부른다. 모델은 부르지 않는다.

    python3 scripts/harness/mr_comment.py scan [--root <루트>]     CI: 마지막 검증 결과로 scan 구간을 고친다

코멘트는 표시 `<!-- knots-sync:mr-summary -->` 로 찾고 구간 `review` · `scan` 을 따로 고친다. 둘 이상이면 가장 오래된 것에 모으고
나머지를 지워 항상 하나로 둔다. CLI 가 없거나 토큰 · API 가 실패하면 ForgeError 다(부르는 쪽은 경고 한 줄로 끝낸다).
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

MARKER = "<!-- knots-sync:mr-summary -->"
SECTIONS = ("review", "scan")
PLACEHOLDER = "(아직 없음)"
TITLE = "### knots-sync 요약"
TOP = 7
TIMEOUT = 60


class ForgeError(Exception):
    pass


def section_pattern(name):
    return re.compile(rf"<!-- section:{name} -->\n?(.*?)\n?<!-- /section:{name} -->", re.S)


def sections_of(body):
    found = {}
    for name in SECTIONS:
        match = section_pattern(name).search(body or "")
        found[name] = match.group(1).strip() if match else None
    return found


def render(sections):
    lines = [MARKER, TITLE, ""]
    for name in SECTIONS:
        content = (sections.get(name) or "").strip() or PLACEHOLDER
        lines += [f"<!-- section:{name} -->", content, f"<!-- /section:{name} -->", ""]
    return "\n".join(lines)


def has_content(value):
    return bool(value) and value != PLACEHOLDER


# ── 플랫폼 ───────────────────────────────────────────────────────────────────
def decode_pages(text):
    """--paginate 출력(쪽마다 JSON 배열을 이어 붙인 것)을 하나의 목록으로."""
    items, decoder, index = [], json.JSONDecoder(), 0
    text = text.strip()
    while index < len(text):
        value, index = decoder.raw_decode(text, index)
        items.extend(value if isinstance(value, list) else [value])
        while index < len(text) and text[index].isspace():
            index += 1
    return items


class Forge:
    """platform: github | gitlab. number: PR 번호 · MR iid."""

    def __init__(self, platform, number, project=None, environ=None, cwd=None):
        if platform not in ("github", "gitlab"):
            raise ForgeError(f"모르는 플랫폼: {platform}")
        self.platform, self.number, self.project = platform, str(number), project or ":id"
        self.environ = dict(os.environ if environ is None else environ)
        if platform == "github" and self.environ.get("GITHUB_REPOSITORY") and not self.environ.get("GH_REPO"):
            self.environ["GH_REPO"] = self.environ["GITHUB_REPOSITORY"]
        self.cwd = cwd
        self.tool = "gh" if platform == "github" else "glab"

    def run(self, *arguments, body=None):
        command = [self.tool, *arguments]
        handle = None
        try:
            if body is not None:
                handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
                json.dump({"body": body}, handle, ensure_ascii=False)
                handle.close()
                command += ["--input", handle.name]
                if self.platform == "gitlab":
                    command += ["-H", "Content-Type: application/json"]
            result = subprocess.run(command, capture_output=True, text=True, timeout=TIMEOUT, env=self.environ, cwd=self.cwd, stdin=subprocess.DEVNULL)
        except FileNotFoundError as error:
            raise ForgeError(f"{self.tool} 이 없다") from error
        except subprocess.TimeoutExpired as error:
            raise ForgeError(f"{self.tool} 시간 초과({TIMEOUT}초)") from error
        finally:
            if handle is not None:
                Path(handle.name).unlink(missing_ok=True)
        if result.returncode != 0:
            tail = (result.stderr or result.stdout).strip().splitlines()[-1:] or [f"exit {result.returncode}"]
            raise ForgeError(f"{self.tool} {' '.join(arguments[:3])} 실패: {tail[0][:200]}")
        return result.stdout

    # 보기 · 코멘트 API
    def view(self, ref):
        if self.platform == "github":
            data = json.loads(self.run("pr", "view", str(ref), "--json", "number,url,title,headRefName,baseRefName,headRefOid"))
            return {"number": data["number"], "url": data.get("url"), "title": data.get("title"), "head": data["headRefName"],
                    "base": data["baseRefName"], "headSha": data["headRefOid"]}
        data = json.loads(self.run("mr", "view", str(ref), "-F", "json"))
        return {"number": data["iid"], "url": data.get("web_url"), "title": data.get("title"), "head": data["source_branch"],
                "base": data["target_branch"], "headSha": data.get("sha")}

    def list_endpoint(self):
        if self.platform == "github":
            return f"repos/{{owner}}/{{repo}}/issues/{self.number}/comments"
        return f"projects/{self.project}/merge_requests/{self.number}/notes?per_page=100&sort=asc&order_by=created_at"

    def item_endpoint(self, comment_id):
        if self.platform == "github":
            return f"repos/{{owner}}/{{repo}}/issues/comments/{comment_id}"
        return f"projects/{self.project}/merge_requests/{self.number}/notes/{comment_id}"

    def comments(self):
        items = decode_pages(self.run("api", "--paginate", self.list_endpoint()))
        found = []
        for item in items:
            if not isinstance(item, dict) or item.get("system"):
                continue
            found.append({"id": item["id"], "body": item.get("body") or "", "at": item.get("created_at") or ""})
        return found

    def create(self, body):
        endpoint = self.list_endpoint().split("?", 1)[0]
        return json.loads(self.run("api", "-X", "POST", endpoint, body=body) or "{}").get("id")

    def update(self, comment_id, body):
        self.run("api", "-X", "PATCH" if self.platform == "github" else "PUT", self.item_endpoint(comment_id), body=body)

    def delete(self, comment_id):
        self.run("api", "-X", "DELETE", self.item_endpoint(comment_id))


def upsert(forge, name, content):
    """구간 하나를 쓴다. (동작, 코멘트 ID, 지운 중복 수)."""
    mine = sorted((item for item in forge.comments() if MARKER in item["body"]), key=lambda item: (item["at"], str(item["id"])))
    if not mine:
        return "created", forge.create(render({name: content})), 0
    keep, others = mine[0], mine[1:]
    sections = sections_of(keep["body"])
    for other in reversed(others):
        for section, value in sections_of(other["body"]).items():
            if section != name and not has_content(sections.get(section)) and has_content(value):
                sections[section] = value
    sections[name] = content
    forge.update(keep["id"], render(sections))
    for other in others:
        forge.delete(other["id"])
    return "updated", keep["id"], len(others)


# ── CI 정보 ──────────────────────────────────────────────────────────────────
def ci_context(environ=None):
    """(플랫폼, 번호, 프로젝트) 또는 None. KNS_MR(#12 · !7) 이 있으면 그것을 쓴다."""
    environ = os.environ if environ is None else environ
    override = environ.get("KNS_MR", "")
    if override[:1] in ("#", "!") and override[1:].isdigit():
        return ("github" if override[0] == "#" else "gitlab"), override[1:], environ.get("CI_PROJECT_ID")
    if environ.get("CI_MERGE_REQUEST_IID"):
        return "gitlab", environ["CI_MERGE_REQUEST_IID"], environ.get("CI_PROJECT_ID")
    event = environ.get("GITHUB_EVENT_PATH")
    if event and environ.get("GITHUB_EVENT_NAME", "").startswith("pull_request"):
        try:
            number = (json.loads(Path(event).read_text(encoding="utf-8")).get("pull_request") or {}).get("number")
        except (OSError, ValueError):
            number = None
        if number:
            return "github", str(number), None
    return None


def ci_forge(environ=None):
    context = ci_context(environ)
    if context is None:
        return None
    platform, number, project = context
    return Forge(platform, number, project, environ)


def read_review_data(environ=None):
    """CI 에서 요약 코멘트 review 구간의 데이터 주석(review_state 의 보고서 대신). 못 읽으면 None."""
    from harness import review_report

    forge = ci_forge(environ)
    if forge is None:
        return None
    try:
        comments = [item for item in forge.comments() if MARKER in item["body"]]
    except ForgeError:
        return None
    for item in comments:
        data = review_report.read_data(sections_of(item["body"]).get("review") or "")
        if data:
            return data
    return None


# ── scan 구간 ────────────────────────────────────────────────────────────────
def read_json(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def scan_section(root, result=None, environ=None):
    """검증 결과 · 품질 게이트 · 새 문제로 scan 구간 본문을 만든다."""
    environ = os.environ if environ is None else environ
    root = Path(root)
    result = result if isinstance(result, dict) else read_json(root / ".agents/state/verify-last.json")
    gate = read_json(root / ".agents/reports/quality-gate-last.json")
    findings = read_json(root / ".agents/reports/findings-latest.json")
    level = result.get("level") or gate.get("level") or "affected"
    head = (gate.get("head") or findings.get("head") or "")[:7]
    lines = [f"**검증 · 정적 분석({level}{', head ' + head if head else ''})** — 검증 {result.get('status', '기록 없음')}"]
    if gate:
        failed = [check["id"] for check in gate.get("checks", []) if check.get("status") in ("failed", "warned")]
        lines.append(f"- 품질 게이트: {gate.get('status')}" + (f" — {', '.join(failed[:4])}" if failed else ""))
    new = [item for item in findings.get("findings", []) if item.get("new")]
    if findings:
        table = {severity: sum(item.get("severity") == severity for item in new) for severity in ("CRITICAL", "HIGH", "MEDIUM", "LOW")}
        lines.append("- 새 문제: " + " · ".join(f"{key} {value}" for key, value in table.items()))
        order = ("CRITICAL", "HIGH", "MEDIUM", "LOW")
        for item in sorted(new, key=lambda entry: order.index(entry.get("severity", "LOW")) if entry.get("severity") in order else 4)[:TOP]:
            lines.append(f"  - [{item.get('severity')}] {item.get('analyzer')} {item.get('ruleId')} — {item.get('path')}:{item.get('startLine')}")
    else:
        lines.append("- 정적 분석: 결과 없음(등록한 분석기가 없거나 돌지 않았다)")
    incomplete = gate.get("incomplete") or []
    if incomplete:
        lines.append("- 미완료 분석기: " + ", ".join(f"{item.get('analyzer')}({item.get('reason')})" for item in incomplete[:5]))
    if environ.get("KNS_FROM_BASE"):
        lines.append(f"- 판정 판: base({environ['KNS_FROM_BASE']}) 검증 코드 · 설정")
    elif environ.get("KNS_VERIFY_BOOTSTRAP") == "1":
        lines.append("- 판정 판: bootstrap(base 에 검증 코드가 없어 head 판)")
    lines.append("- 자세한 결과: CI 산출물 harness-reports(.agents/reports/)")
    return "\n".join(lines)


def report_scan(root, result=None, environ=None):
    """CI affected 끝에서 부른다. 화면 한 줄을 돌려준다(MR 정보가 없으면 None). 실패해도 예외를 내지 않는다."""
    environ = os.environ if environ is None else environ
    if not environ.get("CI"):
        return None
    try:
        forge = ci_forge(environ)
        if forge is None:
            return None
        action, comment_id, removed = upsert(forge, "scan", scan_section(root, result, environ))
    except (ForgeError, ValueError, KeyError) as error:
        return f"⚠ MR 요약 코멘트를 고치지 못했다(판정은 그대로): {error}"
    extra = f", 중복 {removed}개 정리" if removed else ""
    return f"MR 요약 코멘트 scan 구간 {'만듦' if action == 'created' else '고침'}(#{comment_id}{extra})"


def main(argv=None):
    parser = argparse.ArgumentParser(description="MR 요약 코멘트")
    commands = parser.add_subparsers(dest="command", required=True)
    scan = commands.add_parser("scan")
    scan.add_argument("--root", default=".")
    options = parser.parse_args(argv)
    line = report_scan(Path(options.root).resolve())
    print(line or "MR 정보가 없다(CI 의 PR · MR 실행에서만 쓴다)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
