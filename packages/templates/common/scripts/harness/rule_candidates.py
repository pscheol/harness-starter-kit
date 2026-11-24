#!/usr/bin/env python3
"""규칙 후보(설계 14 §3.11, DO-R14 · R15). 리뷰 · 승인 · 운영에서 반복되는 고침을 후보 파일로 모으고, 사람이 골라 MR 로 규칙에 넣는다.

    python3 scripts/harness/rule_candidates.py candidates [--since 30d] [--json]
    python3 scripts/harness/rule_candidates.py promote RC-4        (사람 터미널만) chore/RC-4-<이름> 브랜치에 규칙 파일 수정 + status: accepted
    python3 scripts/harness/rule_candidates.py reject RC-4 --reason "…"
    python3 scripts/harness/rule_candidates.py check                accepted 후보의 target 규칙 파일이 같은 MR 에서 바뀌었는지(fast)

`제안 규칙` 문장은 비워 둔다 — 사람이나 에이전트 세션이 쓴다. 에이전트가 규칙 파일에 바로 넣지 않는다. 모델을 부르지 않는다.
"""

import argparse
import json
import re
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import approvals, deploy_record, intent as intents, ops_records  # noqa: E402
from harness.agent_session import env_marker  # noqa: E402
from harness.sdd_issues import issue_folders  # noqa: E402
from harness.sdd_keys import split_folder  # noqa: E402

FOLDER = ".agents/docs/rule-candidates"
FILE = re.compile(r"^RC-(\d+)-([a-z0-9][a-z0-9-]*)\.md$")
STATUSES = ("proposed", "accepted", "rejected")
SOURCE_TYPES = ("approval", "review", "ops")
STALE_DAYS = 14
REVIEW_REPEAT = 2


def git(root, *args):
    r = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, check=False)
    return r.stdout if r.returncode == 0 else ""


def kebab(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "rule"


# ── 읽기 ─────────────────────────────────────────────────────────────────────
def parse_sources(lines):
    """머리의 `sources:` 목록 줄(`  - { type: …, ref: "…", check: … }`)."""
    out = []
    for line in lines:
        match = re.match(r"^\s*-\s*\{(.*)\}\s*$", line)
        if match:
            item = {}
            for part in re.split(r",\s*(?=\w+:)", match.group(1)):
                key, _, value = part.partition(":")
                item[key.strip()] = value.strip().strip("\"'")
            out.append(item)
    return out


def read(path):
    text = Path(path).read_text(encoding="utf-8")
    lines = text.replace("\r\n", "\n").split("\n")
    end = next((i for i in range(1, len(lines)) if lines[i] == "---"), 0) if lines and lines[0] == "---" else 0
    head = lines[1:end]
    fm = {}
    for line in head:
        match = re.match(r"^([a-z][A-Za-z0-9]*):\s*(.*?)(\s+#.*)?$", line)
        if match:
            fm[match.group(1)] = match.group(2).strip().strip("\"'")
    body = "\n".join(lines[end + 1 :])
    proposal = re.search(r"## 제안 규칙\n(.*?)(?=\n## |\Z)", body, re.S)
    return {"path": Path(path), "id": fm.get("id"), "status": fm.get("status") or "proposed", "target": None if fm.get("target") in (None, "", "null") else fm.get("target"),
            "created": fm.get("created"), "mr": None if fm.get("mr") in (None, "", "null") else fm.get("mr"), "sources": parse_sources(head), "body": body,
            "proposal": (proposal.group(1).strip() if proposal else ""), "title": next((l[2:].strip() for l in body.split("\n") if l.startswith("# ")), "")}


def all_candidates(root):
    base = Path(root) / FOLDER
    return [read(path) for path in sorted(base.glob("RC-*.md"))] if base.is_dir() else []


def age_days(created, today):
    try:
        return (today - date.fromisoformat(str(created))).days
    except ValueError:
        return 0


# ── 후보 찾기 ────────────────────────────────────────────────────────────────
def file_day(root, path):
    stamp = git(root, "log", "-1", "--format=%ct", "--", Path(path).relative_to(root).as_posix()).strip()
    when = datetime.fromtimestamp(int(stamp)).date() if stamp else datetime.fromtimestamp(Path(path).stat().st_mtime).date()
    return when


def report_checks(root, key):
    """.agents/reports/review/<키>.md 의 `## F-n · 심각도 · 점검 ID` 제목 → {F-n: 점검 ID}."""
    path = Path(root) / ".agents/reports/review" / f"{key}.md"
    out = {}
    if path.is_file():
        for line in path.read_text(encoding="utf-8").split("\n"):
            match = re.match(r"^## (F-\d+) · \S+ · (RV-[A-Z]+)", line)
            if match:
                out[match.group(1)] = match.group(2)
    return out


def scan_approvals(root):
    found = []
    for folder in issue_folders(Path(root)):
        parts = split_folder(folder.name)
        for entry in approvals.read_entries(folder / "approvals.md"):
            if entry["valid"] and entry["decision"] == "changes-requested" and entry.get("ruleCandidate"):
                found.append({"type": "approval", "ref": f"issues/{folder.name}/approvals.md#{entry['at']}", "issue": parts[0] if parts else folder.name, "gate": entry["gate"], "phrase": entry["phrase"]})
    return found


def scan_reviews(root, today, window):
    groups = {}
    for folder in issue_folders(Path(root)):
        parts = split_folder(folder.name)
        review = folder / "review.md"
        if not parts or not review.is_file() or (today - file_day(root, review)).days > window:
            continue
        checks = report_checks(root, parts[0])
        for line in review.read_text(encoding="utf-8").split("\n"):
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            if len(cells) < 4 or not cells[0].startswith("F-") or cells[3] != "수용":
                continue
            check = (cells[4] if len(cells) > 4 and cells[4].startswith("RV-") else None) or checks.get(cells[0])
            if not check:
                continue
            rule = cells[5] if len(cells) > 5 and cells[5] else check
            groups.setdefault((check, rule), []).append({"type": "review", "ref": f"issues/{folder.name}/review.md#{cells[0]}", "check": check, "rule": rule, "issue": parts[0]})
    return [items for items in groups.values() if len({item["issue"] for item in items}) >= REVIEW_REPEAT]


def scan_ops(root):
    found = []
    for record in ops_records.all_records(root):
        for row in record["learned"]:
            if row["ruleCandidate"] not in ops_records.EMPTY:
                target = row["ruleCandidate"] if row["ruleCandidate"].startswith(".agents/rules/") else None
                found.append({"type": "ops", "ref": f"ops/records/{record['name']}.md#{row['id']}", "text": row["text"], "target": target})
    return found


def known_refs(root):
    return {item["ref"] for candidate in all_candidates(root) for item in candidate["sources"]}


def next_number(root):
    base = Path(root) / FOLDER
    numbers = [int(m.group(1)) for p in base.glob("RC-*.md") if (m := FILE.match(p.name))] if base.is_dir() else []
    return max(numbers, default=0) + 1


def render(number, name, target, sources, title, evidence, created):
    lines = ["---", f"id: RC-{number}", "status: proposed", f"target: {target or 'null'}", "sources:"]
    for item in sources:
        extra = f', check: {item["check"]}' if item.get("check") else ""
        lines.append(f'  - {{ type: {item["type"]}, ref: "{item["ref"]}"{extra} }}')
    lines += [f"created: {created}", "mr: null", "---", "", f"# RC-{number} {title}", "", "## 제안 규칙", "", "(규칙 파일에 들어갈 문장. 조건과 숫자로. 사람이나 에이전트 세션이 쓴다)", "", "## 근거", ""]
    lines += [f"- {line}" for line in evidence]
    lines += ["", "## 적용하지 않는 경우", "", ""]
    return "\n".join(lines)


def create(root, name, target, sources, title, evidence, today):
    number = next_number(root)
    path = Path(root) / FOLDER / f"RC-{number}-{name}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render(number, name, target, sources, title, evidence, today.isoformat()), encoding="utf-8")
    return path


def candidates(root, since_days=30, today=None):
    """새 후보 파일을 만들고 [(경로, 출처 수)] 를 돌려준다. 이미 후보에 든 출처는 건너뛴다."""
    today = today or date.today()
    seen = known_refs(root)
    made = []
    for item in scan_approvals(root):
        if item["ref"] in seen:
            continue
        path = create(root, f"approval-{kebab(item['issue'])}", None, [item], f"{item['issue']} {item['gate']} 수정 요청에서 반복될 고침", [f"{item['ref']}: 승인자가 '규칙 후보: 예' 로 표시했다 — {item['phrase']}"], today)
        made.append((path, 1))
        seen.add(item["ref"])
    for items in scan_reviews(root, today, since_days):
        fresh = [item for item in items if item["ref"] not in seen]
        if len(fresh) < 1 or {item["ref"] for item in items} <= seen:
            continue
        rule = items[0]["rule"]
        target = f".agents/rules/{rule}.md" if items[0]["check"] == "RV-RULE" and rule != "RV-RULE" else None
        path = create(root, f"review-{kebab(rule)}", target, items, f"{items[0]['check']} {rule} 수용 지적이 {len({i['issue'] for i in items})}개 이슈에서 반복됐다",
                      [f"{item['ref']}: 리뷰 지적을 수용으로 처리했다({item['check']} · {item['rule']})" for item in items], today)
        made.append((path, len(items)))
        seen |= {item["ref"] for item in items}
    for item in scan_ops(root):
        if item["ref"] in seen:
            continue
        path = create(root, f"ops-{kebab(item['ref'].split('/')[-1].replace('.md#', '-'))}", item["target"], [item], item["text"][:80], [f"{item['ref']}: 운영 기록 '배운 것' 행 — {item['text']}"], today)
        made.append((path, 1))
        seen.add(item["ref"])
    return made


# ── 승격 · 거절 ──────────────────────────────────────────────────────────────
def find(root, ident):
    for candidate in all_candidates(root):
        if candidate["id"] == ident:
            return candidate
    raise FileNotFoundError(f"규칙 후보가 없다: {ident}")


def set_fm(path, changes):
    text = Path(path).read_text(encoding="utf-8")
    text = deploy_record.set_fm(text, changes)
    Path(path).write_text(text, encoding="utf-8")


def promote(root, ident):
    candidate = find(root, ident)
    if candidate["status"] != "proposed":
        raise ValueError(f"{ident} 는 이미 {candidate['status']} 다")
    if not candidate["target"]:
        raise ValueError(f"{ident} 의 target(규칙 파일)을 먼저 정한다")
    if not candidate["proposal"] or candidate["proposal"].startswith("(규칙 파일에 들어갈 문장"):
        raise ValueError(f"{ident} 의 '제안 규칙' 문장이 비었다 — 사람이나 에이전트 세션이 먼저 쓴다")
    target = Path(root) / candidate["target"]
    if not str(target.resolve()).startswith(str((Path(root) / ".agents/rules").resolve())):
        raise ValueError("target 은 .agents/rules/ 안의 파일이다(킷 소유 규칙은 04 §3.11 올리는 경로로 보낸다)")
    name = candidate["path"].stem.split("-", 2)[2]
    branch = f"chore/{ident}-{name}"
    made = subprocess.run(["git", "-C", str(root), "switch", "-c", branch], capture_output=True, text=True, check=False)
    if made.returncode != 0:
        raise ValueError(f"브랜치를 만들지 못했다: {made.stderr.strip()}")
    target.parent.mkdir(parents=True, exist_ok=True)
    existing = target.read_text(encoding="utf-8") if target.is_file() else f"# {candidate['title']}\n"
    target.write_text(existing.rstrip("\n") + f"\n\n<!-- {ident} -->\n{candidate['proposal']}\n", encoding="utf-8")
    set_fm(candidate["path"], {"status": "accepted"})
    return branch, target


def reject(root, ident, reason):
    candidate = find(root, ident)
    if candidate["status"] != "proposed":
        raise ValueError(f"{ident} 는 이미 {candidate['status']} 다")
    set_fm(candidate["path"], {"status": "rejected"})
    text = candidate["path"].read_text(encoding="utf-8").rstrip("\n")
    candidate["path"].write_text(f"{text}\n\n거절: {' '.join(reason.split())}\n", encoding="utf-8")


# ── 검사(DO-R15) ─────────────────────────────────────────────────────────────
def changed_names(root):
    base = intents.meta_of(Path(root)).get("git") or {}
    base = str(base.get("base") or "develop") if isinstance(base, dict) else "develop"
    mb = ""
    for ref in (f"origin/{base}", base):
        if git(root, "rev-parse", "--verify", "-q", ref).strip():
            mb = git(root, "merge-base", ref, "HEAD").strip()
            break
    names = set(git(root, "diff", "--name-only", mb or "HEAD").split()) | set(git(root, "ls-files", "-o", "--exclude-standard").split())
    return names, mb


def errors(root):
    """accepted 로 바뀐 후보의 target 규칙 파일이 같은 MR 에서 바뀌지 않았으면 문장."""
    root = Path(root)
    base = root / FOLDER
    if not base.is_dir():
        return []
    names, mb = changed_names(root)
    out = []
    for candidate in all_candidates(root):
        relative = candidate["path"].relative_to(root).as_posix()
        if candidate["status"] != "accepted" or relative not in names:
            continue
        before = git(root, "show", f"{mb}:{relative}") if mb else ""
        if re.search(r"^status:\s*accepted\b", before, re.M):
            continue
        if not candidate["target"] or candidate["target"] not in names:
            out.append(f"{relative}: accepted 후보인데 target 규칙 파일({candidate['target'] or '없음'})이 같은 MR 에서 바뀌지 않았다(DO-R15)")
    return out


def summary(root, today=None):
    today = today or date.today()
    return [{"id": c["id"], "status": c["status"], "target": c["target"], "sources": len(c["sources"]), "ageDays": age_days(c["created"], today), "path": c["path"].relative_to(root).as_posix(), "title": c["title"]} for c in all_candidates(root)]


def main(argv=None):
    parser = argparse.ArgumentParser(prog="rule_candidates.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root")
    parser.add_argument("--today", help=argparse.SUPPRESS)
    sub = parser.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("candidates")
    c.add_argument("--since", default="30d")
    c.add_argument("--json", action="store_true")
    p = sub.add_parser("promote")
    p.add_argument("id")
    r = sub.add_parser("reject")
    r.add_argument("id")
    r.add_argument("--reason", required=True)
    sub.add_parser("check")
    l = sub.add_parser("list")
    l.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    root = intents.harness_root(Path(args.root or Path.cwd()))
    today = date.fromisoformat(args.today) if args.today else date.today()
    try:
        if args.cmd == "candidates":
            days = int(re.match(r"^(\d+)d?$", args.since).group(1)) if re.match(r"^(\d+)d?$", args.since) else 30
            made = candidates(root, days, today)
            data = [{"path": path.relative_to(root).as_posix(), "sources": count} for path, count in made]
            print(json.dumps(data, ensure_ascii=False, indent=2) if args.json else ("\n".join(f"✔ {item['path']} (출처 {item['sources']}건)" for item in data) or "새 규칙 후보가 없다"))
        elif args.cmd == "list":
            data = summary(root, today)
            print(json.dumps(data, ensure_ascii=False, indent=2) if args.json else "\n".join(f"{i['id']} {i['status']} {i['target'] or '-'} 출처 {i['sources']}건 · {i['ageDays']}일" for i in data) or "규칙 후보 없음")
        elif args.cmd in ("promote", "reject"):
            marker = env_marker()
            if marker:
                print(f"✖ 에이전트 세션에서는 규칙 후보를 {args.cmd} 하지 않는다(판정: {marker}). 사람이 자기 터미널에서 실행한다", file=sys.stderr)
                return 3
            if args.cmd == "promote":
                branch, target = promote(root, args.id)
                print(f"✔ {args.id} → 브랜치 {branch} · {target.relative_to(root).as_posix()} 에 문장을 더했다. 커밋 · MR 은 사람이 한다")
            else:
                reject(root, args.id, args.reason)
                print(f"✔ {args.id} 거절")
        else:
            found = errors(root)
            print("\n".join(found), file=sys.stderr)
            return 1 if found else 0
    except (FileNotFoundError, ValueError) as error:
        print(f"✖ {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
