#!/usr/bin/env python3
"""/kns-review 의 결정적 부분(설계 09 §3.1). 리뷰 판단은 사람이 연 리뷰 세션이 하고, 이 스크립트는 모델을 부르지 않는다.

    python3 scripts/harness/review.py collect <!123|#45|브랜치> [--platform github|gitlab]   입력 모으기(체크아웃하지 않는다)
    python3 scripts/harness/review.py publish <이슈키> [--no-comment]                       findings.json → 보고서 · 요약 코멘트
    python3 scripts/harness/review.py comment <이슈키>                                      보고서로 review 구간만 다시 쓴다

exit: 0 · 1 코멘트 실패(보고서는 씀) · 2 입력 · 사용법 오류.
입력은 .agents/state/review/<키>/ 에 파일로 두고 화면에는 30줄 이하 요약만 낸다. 리뷰 세션은 review.md · approvals.md 를 쓰지 않는다.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import approvals, mr_comment, review_report, review_state  # noqa: E402
from harness.agent_session import env_marker  # noqa: E402

BRANCH = re.compile(r"^(?:feat|fix|refactor|perf|chore|docs)/([A-Z][A-Z0-9]{1,9}-[0-9]+)-[a-z0-9-]+$")
STATE = ".agents/state/review"
REPORTS = ".agents/reports/review"
SDD_DOCS = ("requirements", "design", "tasks", "review", "approvals")
RULES = ("pr-review-policy", "security", "api-standards", "guardrails", "code-maintenance")
FETCH_SECONDS = 120
FILES_SHOWN = 15
HARNESS_OF_MARKER = {"CLAUDECODE=1": "claude", "CLAUDE_CODE_MESSAGING_SOCKET": "claude", "CURSOR_AGENT": "cursor"}


class Usage(Exception):
    pass


def git(root, *arguments, timeout=60, check=True):
    try:
        result = subprocess.run(["git", "-C", str(root), *arguments], capture_output=True, timeout=timeout, check=False,
                                env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})
    except (OSError, subprocess.TimeoutExpired) as error:
        raise Usage(f"git {' '.join(arguments[:2])} 실패: {error}") from error
    if check and result.returncode != 0:
        raise Usage(f"git {' '.join(arguments[:3])} 실패: {result.stderr.decode('utf-8', 'replace').strip()[:200]}")
    return result


def git_text(root, *arguments):
    result = git(root, *arguments, check=False)
    return result.stdout.decode("utf-8", "replace") if result.returncode == 0 else None


def harness_root():
    root = review_state.harness_root(Path.cwd())
    if root is None:
        raise Usage("하네스 루트(.agents/knots-sync.json)를 찾지 못했다")
    return root


def platform_of(root, ref, chosen):
    if chosen:
        return chosen
    if ref.startswith("#"):
        return "github"
    if ref.startswith("!"):
        return "gitlab"
    url = git_text(root, "remote", "get-url", "origin") or ""
    if "github" in url:
        return "github"
    if "gitlab" in url:
        return "gitlab"
    raise Usage("플랫폼을 정하지 못했다 — GitHub 는 #<번호>, GitLab 은 !<번호> 또는 --platform 을 준다")


def harness_of_session():
    marker = env_marker()
    if marker is None:
        return "human"
    if marker.startswith("CODEX_"):
        return "codex"
    if marker.startswith("KIRO_"):
        return "kiro"
    return HARNESS_OF_MARKER.get(marker, "agent")


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data if isinstance(data, bytes) else data.encode("utf-8"))


def ensure_reports_ignore(root):
    ignore = root / ".agents/reports/.gitignore"
    if not ignore.exists():
        write(ignore, "*\n")


# ── collect ──────────────────────────────────────────────────────────────────
def fetch(root, mr):
    refspecs = [f"+refs/heads/{name}:refs/remotes/origin/{name}" for name in (mr["head"], mr["base"])]
    git(root, "fetch", "--quiet", "origin", *refspecs, timeout=FETCH_SECONDS)
    head = (git_text(root, "rev-parse", f"origin/{mr['head']}") or "").strip()
    base = (git_text(root, "rev-parse", f"origin/{mr['base']}") or "").strip()
    return head, base


def issue_folder_at(root, ref, key):
    prefix = (git_text(root, "rev-parse", "--show-prefix") or "").strip()
    listing = git_text(root, "ls-tree", "--name-only", ref, f"{prefix}.agents/docs/issues/") or ""
    folders = [line for line in listing.splitlines() if Path(line).name.startswith(f"{key}-")]
    return (folders[0][len(prefix):] if folders else None), prefix


def scan_findings(root, forge, mr, head, directory):
    """새 문제 목록과 출처. CI 산출물 → 로컬 findings-latest.json(같은 head) 순서."""
    downloaded = directory / "artifacts"
    try:
        if forge.platform == "github":
            runs = json.loads(forge.run("run", "list", "--commit", head, "--json", "databaseId,workflowName,name", "--limit", "20") or "[]")
            run = next((item for item in runs if "harness" in str(item.get("workflowName") or item.get("name") or "")), None)
            if run:
                forge.run("run", "download", str(run["databaseId"]), "-n", "harness-reports", "-D", str(downloaded))
        else:
            forge.run("job", "artifact", mr["head"], "harness:affected", "--path", str(downloaded))
    except (mr_comment.ForgeError, ValueError, KeyError):
        pass
    for candidate in sorted(downloaded.rglob("findings-latest.json")) if downloaded.is_dir() else []:
        data = review_state.read_json(candidate)
        if data.get("findings") is not None:
            return data, "CI 산출물"
    local = review_state.read_json(root / ".agents/reports/findings-latest.json")
    if local.get("head") and head.startswith(str(local["head"])):
        return local, ".agents/reports/findings-latest.json"
    return None, None


def scan_text(data, source):
    if not data:
        return "스캔 결과 없음 — CI 산출물도, 같은 head 의 .agents/reports/findings-latest.json 도 없다\n"
    new = [item for item in data.get("findings", []) if item.get("new")]
    table = {severity: sum(item.get("severity") == severity for item in new) for severity in review_report.SEVERITIES}
    lines = [f"출처: {source} · level {data.get('level')} · head {str(data.get('head'))[:7]}",
             "새 문제: " + " · ".join(f"{key} {value}" for key, value in table.items())]
    order = review_report.SEVERITIES
    for item in sorted(new, key=lambda entry: order.index(entry["severity"]) if entry.get("severity") in order else 4)[:20]:
        lines.append(f"- [{item.get('severity')}] {item.get('analyzer')} {item.get('ruleId')} — {item.get('path')}:{item.get('startLine')} {str(item.get('message', ''))[:100]}")
    return "\n".join(lines) + "\n"


def collect(options):
    root = harness_root()
    ref = options.mr.lstrip("#!") if options.mr[:1] in ("#", "!") else options.mr
    platform = platform_of(root, options.mr, options.platform)
    forge = mr_comment.Forge(platform, ref, cwd=root)
    try:
        mr = forge.view(ref)
    except (mr_comment.ForgeError, ValueError, KeyError) as error:
        raise Usage(f"MR 정보를 읽지 못했다: {error}") from error
    match = BRANCH.match(mr["head"])
    if not match:
        raise Usage(f"head 브랜치 이름에 이슈 키가 없다: {mr['head']} — <종류>/<키>-<이름> 형식이어야 한다")
    key = match.group(1)
    head, base = fetch(root, mr)
    directory = root / STATE / key
    if directory.exists():
        shutil.rmtree(directory)
    directory.mkdir(parents=True)
    write(directory / "diff.patch", git(root, "diff", "--find-renames", f"origin/{mr['base']}...origin/{mr['head']}").stdout)
    numstat = git_text(root, "diff", "--find-renames", "--numstat", f"origin/{mr['base']}...origin/{mr['head']}") or ""
    write(directory / "files.tsv", numstat)
    folder, prefix = issue_folder_at(root, f"origin/{mr['head']}", key)
    sdd = []
    for name in SDD_DOCS if folder else ():
        text = git(root, "show", f"origin/{mr['head']}:{prefix}{folder}/{name}.md", check=False)
        if text.returncode == 0:
            write(directory / "sdd" / f"{name}.md", text.stdout)
            sdd.append(name)
    rules = []
    for name in RULES:
        text = git(root, "show", f"origin/{mr['base']}:{prefix}.agents/rules/{name}.md", check=False)
        if text.returncode == 0:
            write(directory / "rules" / f"{name}.md", text.stdout)
            rules.append(name)
    decisions = [Path(line).name for line in (git_text(root, "ls-tree", "--name-only", f"origin/{mr['base']}", f"{prefix}.agents/docs/decisions/") or "").splitlines()]
    write(directory / "rules" / "decisions.txt", "\n".join(decisions) + ("\n" if decisions else ""))
    data, source = scan_findings(root, forge, mr, head, directory)
    write(directory / "scan.txt", scan_text(data, source))
    previous = root / REPORTS / f"{key}.md"
    if previous.is_file():
        shutil.copyfile(previous, directory / "previous.md")
    context = {"key": key, "platform": platform, "number": mr["number"], "mr": ("#" if platform == "github" else "!") + str(mr["number"]),
               "url": mr.get("url"), "title": mr.get("title"), "head": mr["head"], "headSha": head, "base": mr["base"], "baseSha": base,
               "issueFolder": folder, "prefix": prefix, "files": len(numstat.splitlines())}
    if mr.get("headSha") and mr["headSha"] != head:
        context["warning"] = f"MR head({mr['headSha'][:7]})와 받은 origin/{mr['head']}({head[:7]})가 다르다"
    write(directory / "context.json", json.dumps(context, ensure_ascii=False, indent=2) + "\n")
    print_collect(root, directory, context, numstat, sdd, rules, decisions, scan_text(data, source).splitlines()[0:2])
    return 0


def print_collect(root, directory, context, numstat, sdd, rules, decisions, scan_lines):
    here = directory.relative_to(root).as_posix()
    rows = [line.split("\t") for line in numstat.splitlines() if line.count("\t") >= 2]
    lines = [f"리뷰 입력: {context['key']} · {context['mr']} {context.get('title') or ''}".rstrip(),
             f"- head {context['head']} @ {context['headSha'][:7]} · base {context['base']} @ {context['baseSha'][:7]} · 파일 {len(rows)}개(체크아웃하지 않았다)"]
    if context.get("warning"):
        lines.append(f"- ⚠ {context['warning']}")
    for added, removed, path in rows[:FILES_SHOWN]:
        lines.append(f"  +{added} -{removed} {path}")
    if len(rows) > FILES_SHOWN:
        lines.append(f"  … {len(rows) - FILES_SHOWN}개 더 — {here}/files.tsv")
    lines.append(f"- SDD: {context.get('issueFolder') or '이슈 폴더 없음'} ({' · '.join(sdd) or '문서 없음'})")
    lines.append(f"- 규칙(base): {' · '.join(rules) or '없음'} · ADR {len(decisions)}개")
    lines.append(f"- 스캔: {' / '.join(scan_lines)}")
    lines.append(f"- 읽을 파일: {here}/{{diff.patch, sdd/, rules/, scan.txt" + (", previous.md}" if (directory / "previous.md").exists() else "}"))
    lines.append(f"다음: 점검표(RV-COV · RV-ADR · RV-RULE · RV-EDGE · RV-TEST · RV-SCAN · RV-DOC)로 보고 {here}/findings.json 을 쓴 뒤")
    lines.append(f"      python3 scripts/harness/review.py publish {context['key']}")
    print("\n".join(lines[:30]))


# ── publish ──────────────────────────────────────────────────────────────────
def load_context(root, key):
    directory = root / STATE / key
    context = review_state.read_json(directory / "context.json")
    if not context:
        raise Usage(f"{STATE}/{key}/context.json 이 없다 — 먼저 review.py collect <MR> 를 돈다")
    return directory, context


def tree_lines(root, context):
    cache = {}

    def content_of(path):
        if path not in cache:
            text = None
            for ref in (context["head"], context["base"]):
                shown = git(root, "show", f"origin/{ref}:{context.get('prefix', '')}{path}", check=False)
                if shown.returncode == 0:
                    text = shown.stdout.decode("utf-8", "replace")
                    break
            cache[path] = text.splitlines() if text is not None else None
        return cache[path]

    return content_of


def publish(options):
    root = harness_root()
    key = options.key
    directory, context = load_context(root, key)
    try:
        draft = json.loads((directory / "findings.json").read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise Usage(f"{STATE}/{key}/findings.json 이 없다 — 리뷰 세션이 발견을 쓴다") from error
    except ValueError as error:
        raise Usage(f"findings.json 이 JSON 이 아니다: {error}") from error
    findings = draft.get("findings") if isinstance(draft, dict) else None
    content_of = tree_lines(root, context)
    errors = review_report.finding_errors(findings, lambda path: content_of(path) is not None)
    if errors:
        print("\n".join(f"✖ {error}" for error in errors[:10]), file=sys.stderr)
        return 2
    report_path = root / REPORTS / f"{key}.md"
    previous = report_path.read_text(encoding="utf-8") if report_path.is_file() else ""
    marked = review_report.with_fingerprints(findings, lambda path: content_of(path) or [])
    numbered, table = review_report.assign_ids(marked, review_report.previous_ids(previous))
    meta = {"issue": key, "mr": context["mr"], "head": context["headSha"], "base": context["base"], "harness": harness_of_session(),
            "reviewedAt": approvals.now_text()}
    text = review_report.render(meta, numbered, table)
    ensure_reports_ignore(root)
    approvals.atomic_write(report_path, text.encode("utf-8"))
    counts = review_report.counts(numbered)
    print(f"보고서: {report_path.relative_to(root).as_posix()} · {review_report.verdict(numbered)} · " + " · ".join(f"{k} {v}" for k, v in counts.items()))
    if options.no_comment:
        return 0
    return comment_from(root, directory, context, text)


def open_counts(directory, data, root):
    """리뷰 시점의 열린 수: MR head 의 review.md · approvals.md(collect 가 받은 것)로 계산한다."""
    entries = approvals.parse((directory / "sdd/approvals.md").read_bytes())["entries"] if (directory / "sdd/approvals.md").is_file() else []
    rows = review_state.review_rows((directory / "sdd/review.md").read_text(encoding="utf-8")) if (directory / "sdd/review.md").is_file() else {}
    policy = approvals.policy_of(review_state.read_json(root / ".agents/knots-sync.json"))
    return review_state.classify(data["findings"], rows, entries, policy)[1]


def review_section(context, text, opened):
    data = review_report.read_data(text)
    findings = data["findings"]
    counts = {severity: sum(item["severity"] == severity for item in findings) for severity in review_report.SEVERITIES}
    verdict = review_report.verdict(findings)
    lines = [f"**리뷰 {context['key']}** — {verdict} · head {context['headSha'][:7]}",
             "- 발견: " + " · ".join(f"{k} {v}" for k, v in counts.items()) + " / 열림: " + " · ".join(f"{k} {v}" for k, v in opened.items())]
    for item in findings[:mr_comment.TOP]:
        lines.append(f"  - {item['id']} · {item['severity']} · {item['check']} — {item['path']}:{item['line']} {item['title'][:120]}")
    if len(findings) > mr_comment.TOP:
        lines.append(f"  - … {len(findings) - mr_comment.TOP}건 더")
    lines.append(f"- 보고서: 리뷰한 폴더의 .agents/reports/review/{context['key']}.md · 관리 페이지 리뷰 화면. 처리 결과는 구현 세션이 review.md 에 쓴다")
    lines.append(f"<!-- {review_report.DATA_MARK} {review_report.comment_json(data)} -->")
    return "\n".join(lines)


def comment_from(root, directory, context, text):
    data = review_report.read_data(text)
    content = review_section(context, text, open_counts(directory, data, root))
    try:
        forge = mr_comment.Forge(context["platform"], context["number"], cwd=root)
        action, comment_id, removed = mr_comment.upsert(forge, "review", content)
    except mr_comment.ForgeError as error:
        print(f"✖ MR 요약 코멘트를 고치지 못했다: {error} — 보고서는 썼다. 다시: python3 scripts/harness/review.py comment {context['key']}", file=sys.stderr)
        return 1
    extra = f", 중복 코멘트 {removed}개 정리" if removed else ""
    print(f"MR 요약 코멘트 review 구간 {'만듦' if action == 'created' else '고침'}: {context['mr']} (코멘트 {comment_id}{extra})")
    return 0


def comment(options):
    root = harness_root()
    directory, context = load_context(root, options.key)
    report_path = root / REPORTS / f"{options.key}.md"
    if not report_path.is_file():
        raise Usage(f"보고서가 없다: {report_path.relative_to(root).as_posix()}")
    return comment_from(root, directory, context, report_path.read_text(encoding="utf-8"))


def main(argv=None):
    parser = argparse.ArgumentParser(description="/kns-review 의 결정적 부분")
    commands = parser.add_subparsers(dest="command", required=True)
    first = commands.add_parser("collect")
    first.add_argument("mr")
    first.add_argument("--platform", choices=("github", "gitlab"))
    second = commands.add_parser("publish")
    second.add_argument("key")
    second.add_argument("--no-comment", action="store_true")
    third = commands.add_parser("comment")
    third.add_argument("key")
    options = parser.parse_args(argv)
    try:
        return {"collect": collect, "publish": publish, "comment": comment}[options.command](options)
    except Usage as error:
        print(f"✖ {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
