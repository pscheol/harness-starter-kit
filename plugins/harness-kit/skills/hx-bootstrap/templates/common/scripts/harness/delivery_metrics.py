#!/usr/bin/env python3
"""전달 지표 다섯 개와 기준선(설계 14 §3.10, DO-R12 · R13). git 기록 · approvals.md · 배포 기록 · 운영 기록의 장애 표지에서만 계산한다.

    python3 scripts/harness/delivery_metrics.py [--from YYYY-MM-DD --to YYYY-MM-DD] [--json] [--fill <운영 기록>]
    python3 scripts/harness/delivery_metrics.py --baseline [--force] [--adopted-at <날짜|커밋>]
    python3 scripts/harness/delivery_metrics.py --verify-baseline

사람이 적은 숫자(실측 값 · 감지 시각)는 입력이 아니다. 같은 입력이면 같은 값이다(시계 · 난수 없음). 모델을 부르지 않는다.
리드 타임 · 복구 시간 · 승인 대기 시간은 시간 단위, 비율은 0~1 이다.
"""

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import approvals, deploy_record, intent as intents, ops_records  # noqa: E402
from harness.sdd_issues import issue_folders  # noqa: E402
from harness.sdd_keys import split_folder  # noqa: E402

SCHEMA = "harness-kit.delivery-metrics/v1"
BASELINE = ".agents/docs/ops/metrics-baseline.json"
BASELINE_SCHEMA = "harness-kit.delivery-baseline/v1"
REPORTS = ".agents/reports/metrics"
DAY = 86400
FIX_BRANCH = re.compile(r"(?<![A-Za-z0-9])fix/")
REWORK_DAYS, FAILURE_DAYS, BASELINE_DAYS = 30, 7, 90
LOCK = ".agents/harness-kit.lock"
NAMES = ("leadTimeHours", "changeFailureRate", "mttrHours", "approvalWaitHours", "reworkRate")
LABELS = {"leadTimeHours": "리드 타임(시간, 중앙값)", "changeFailureRate": "배포 실패율", "mttrHours": "복구 시간(시간, 중앙값)", "approvalWaitHours": "승인 대기 시간(시간, 중앙값)", "reworkRate": "재작업 비율"}


def git(root, *args):
    r = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, check=False)
    return r.stdout if r.returncode == 0 else ""


def epoch(day, end=False):
    moment = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return int(moment.timestamp()) + (DAY if end else 0)


def iso_epoch(text):
    try:
        return int(datetime.fromisoformat(str(text).replace("Z", "+00:00")).timestamp())
    except ValueError:
        return None


def median(values):
    values = sorted(values)
    if not values:
        return None
    mid = len(values) // 2
    return values[mid] if len(values) % 2 else (values[mid - 1] + values[mid]) / 2


def p85(values):
    values = sorted(values)
    return values[max(math.ceil(0.85 * len(values)) - 1, 0)] if values else None


def hours(seconds):
    return round(seconds / 3600, 1)


def stat(values, method):
    if not values:
        return {"median": None, "p85": None, "n": 0, "method": method if method == "unavailable" else "none"}
    return {"median": hours(median(values)), "p85": hours(p85(values)), "n": len(values), "method": method}


def rate(count, total, method):
    return {"value": round(count / total, 2) if total else None, "n": total, "method": method if total else "none"}


# ── git 입력 ─────────────────────────────────────────────────────────────────
class Repo:
    def __init__(self, root, ref):
        self.root, self.ref = Path(root), ref
        self.log = [tuple(line.split("\x00", 2)) for line in git(root, "log", "--format=%H%x00%ct%x00%s", ref).split("\n") if line.count("\x00") == 2]
        self.times = {sha: int(ct) for sha, ct, _ in self.log}
        self.subjects = {sha: subject for sha, _, subject in self.log}

    def digest(self, start, end):
        lines = [f"{sha}\x00{ct}\x00{subject}" for sha, ct, subject in self.log if start <= int(ct) < end]
        tag_lines = [f"{name}\x00{ts}" for name, ts in self.tags() if start <= ts < end]
        return "sha256:" + hashlib.sha256("\n".join([*lines, "--", *tag_lines]).encode("utf-8")).hexdigest()

    def tags(self):
        out = []
        names = git(self.root, "tag", "--list", "v*", "--merged", self.ref).split()
        for name in names:
            ct = git(self.root, "log", "-1", "--format=%ct", f"{name}^{{commit}}").strip()
            if ct:
                out.append((name, int(ct)))
        return sorted(out, key=lambda item: (item[1], item[0]))

    def merges(self):
        """base 첫 부모 줄의 병합 커밋 [(sha, ct, subject, 가지 첫 커밋 시각)]."""
        out = []
        for line in git(self.root, "log", "--first-parent", "--merges", "--format=%H%x00%ct%x00%s", self.ref).split("\n"):
            if line.count("\x00") != 2:
                continue
            sha, ct, subject = line.split("\x00", 2)
            first = git(self.root, "log", "--reverse", "--format=%ct", f"{sha}^1..{sha}^2").split()
            out.append((sha, int(ct), subject, int(first[0]) if first else None))
        return sorted(out, key=lambda item: (item[1], item[0]))

    def files_of_merge(self, sha):
        return set(git(self.root, "diff", "--name-only", f"{sha}^1", sha).split())

    def adoption(self):
        """킷 도입 커밋(harness-kit.lock 을 처음 더한 커밋) 시각. 없으면 None."""
        found = git(self.root, "log", "--diff-filter=A", "--format=%ct", self.ref, "--", LOCK).split()
        return int(found[-1]) if found else None


# ── 기준선(도입 전, method git) ────────────────────────────────────────────────
def git_metrics(repo, start, end):
    merges = [m for m in repo.merges() if start <= m[1] < end]
    lead = [m[1] - m[3] for m in merges if m[3] is not None and m[1] >= m[3]]
    tags = [t for t in repo.tags() if start <= t[1] < end]
    fixes = [m for m in repo.merges() if "hotfix/" in m[2]]
    reverts = [(sha, int(ct)) for sha, ct, subject in repo.log if re.match(r"^[Rr]evert\b", subject)]
    failed = []
    for name, ts in tags:
        hit = any(ts <= ct <= ts + FAILURE_DAYS * DAY for _, ct in reverts) or any(ts <= m[1] <= ts + FAILURE_DAYS * DAY for m in fixes)
        if hit:
            failed.append((name, ts))
    allt = repo.tags()
    recover = []
    for name, ts in failed:
        later = [t for t in allt if t[1] > ts]
        if later:
            recover.append(later[0][1] - ts)
    rework = rework_rate(repo, merges)
    return {"leadTimeHours": stat(lead, "git"), "changeFailureRate": rate(len(failed), len(tags), "git"), "mttrHours": stat(recover, "git") | {"p85": None},
            "approvalWaitHours": {"median": None, "p85": None, "n": 0, "method": "unavailable"}, "reworkRate": rework}


def rework_rate(repo, merges):
    """병합한 이슈(병합) 중 30일 안에 같은 파일을 다시 고친 `fix/` 병합이 따라온 비율."""
    ordered = sorted(repo.merges(), key=lambda m: (m[1], m[0]))
    files = {m[0]: repo.files_of_merge(m[0]) for m in ordered}
    reworked = 0
    for merge in merges:
        later = [m for m in ordered if merge[1] < m[1] <= merge[1] + REWORK_DAYS * DAY and FIX_BRANCH.search(m[2])]
        if any(files[merge[0]] & files[m[0]] for m in later):
            reworked += 1
    return rate(reworked, len(merges), "git")


# ── 도입 뒤(method kit) ───────────────────────────────────────────────────────
def add_time(repo, path):
    """그 경로를 처음 더한 커밋 시각(없으면 None)."""
    found = git(repo.root, "log", "--diff-filter=A", "--format=%ct", repo.ref, "--", path).split()
    return int(found[-1]) if found else None


def issue_facts(repo):
    root = repo.root
    out = {}
    for folder in issue_folders(root):
        parts = split_folder(folder.name)
        if not parts:
            continue
        rel = folder.relative_to(root).as_posix()
        fm = intents.front(folder / "requirements.md")
        intent = fm.get("intent")
        start = None
        if intent:
            for intake in sorted((root / intents.INTENTS).glob(f"{intent}-*/intake.md")):
                start = add_time(repo, intake.relative_to(root).as_posix())
        if start is None:
            start = add_time(repo, f"{rel}/requirements.md")
        merged = git(root, "log", "-1", "--format=%ct", repo.ref, "--", rel).strip()
        out[parts[0]] = {"key": parts[0], "folder": folder, "rel": rel, "type": fm.get("type"), "start": start, "merged": int(merged) if merged else None,
                         "entries": approvals.read_entries(folder / "approvals.md"), "req": add_time(repo, f"{rel}/requirements.md")}
    return out


def touched_files(repo, key):
    """커밋 메시지에 이슈 키가 든 커밋이 바꾼 파일(.agents/ 밖)."""
    out = set()
    for sha, _, subject in repo.log:
        if re.search(rf"(?<![A-Z0-9-]){re.escape(key)}(?![0-9])", subject):
            out |= {name for name in git(repo.root, "show", "--no-commit-id", "--name-only", "--format=", sha).split() if not name.startswith(".agents/")}
    return out


def production_records(root):
    out = []
    for record in deploy_record.all_records(root):
        if record.env == "production" and record.state in ("succeeded", "rolled-back", "failed"):
            out.append(record)
    return out


def incidents_of(root):
    out = []
    for record in ops_records.all_records(root):
        for incident in record["incidents"]:
            out.append({"record": record["name"], **incident})
    return out


def kit_metrics(repo, start, end):
    root = repo.root
    facts = issue_facts(repo)
    records = [r for r in production_records(root) if (iso_epoch(r.finished_at()) or 0) and start <= (iso_epoch(r.finished_at()) or 0) < end]
    deployed = {key: iso_epoch(r.finished_at()) for r in records if r.state == "succeeded" for key in r.issues}
    if records:
        lead = [deployed[key] - f["start"] for key, f in facts.items() if key in deployed and f["start"] is not None and deployed[key] >= f["start"]]
        method = "kit"
    else:
        lead = [f["merged"] - f["start"] for f in facts.values() if f["merged"] and f["start"] is not None and start <= f["merged"] < end and f["merged"] >= f["start"]]
        method = "merge"
    incs = incidents_of(root)
    failed = 0
    for record in records:
        finished = iso_epoch(record.finished_at())
        named = any(record.path.name in inc["fields"].get("원인 배포", "") and finished <= (epoch(inc["date"]) or 0) <= finished + FAILURE_DAYS * DAY + DAY for inc in incs)
        failed += 1 if (record.state != "succeeded" or named) else 0
    recover = []
    all_records = deploy_record.all_records(root)
    for inc in incs:
        follow = inc["fields"].get("후속 이슈", "").strip()
        fact = facts.get(follow)
        if not fact or fact["req"] is None:
            continue
        action = inc["fields"].get("조치", "")
        pool = [r for r in all_records if r.env == "production" and r.state == "succeeded" and iso_epoch(r.finished_at())]
        named = [r for r in pool if r.path.name in action]
        containing = sorted((r for r in pool if follow in r.issues), key=lambda r: iso_epoch(r.finished_at()))
        pick = (named or containing or [None])[0]
        if pick is not None and iso_epoch(pick.finished_at()) >= fact["req"]:
            recover.append(iso_epoch(pick.finished_at()) - fact["req"])
    waits = approval_waits(repo, facts, start, end)
    merged = [f for f in facts.values() if f["merged"] and start <= f["merged"] < end]
    reworked, rounds = 0, []
    all_merged = sorted((f for f in facts.values() if f["merged"]), key=lambda f: (f["merged"], f["key"]))
    for fact in merged:
        later = [o for o in all_merged if o["type"] == "fix" and fact["merged"] < o["merged"] <= fact["merged"] + REWORK_DAYS * DAY and o["key"] != fact["key"]]
        if later:
            mine = touched_files(repo, fact["key"])
            if mine and any(mine & touched_files(repo, o["key"]) for o in later):
                reworked += 1
        rounds.append(sum(1 for e in fact["entries"] if e["valid"] and e["decision"] == "changes-requested"))
    rework = rate(reworked, len(merged), "kit")
    if merged:
        rework["changesRequestedPerIssue"] = round(sum(rounds) / len(merged), 2)
    has_records = bool(production_records(root))
    return {"leadTimeHours": stat(lead, method),
            "changeFailureRate": rate(failed, len(records), "kit") if has_records else {"value": None, "n": 0, "method": "none"},
            "mttrHours": (stat(recover, "kit") | {"p85": None}) if has_records else {"median": None, "p85": None, "n": 0, "method": "none"},
            "approvalWaitHours": stat(waits, "kit") if waits else {"median": None, "p85": None, "n": 0, "method": "unavailable"}, "reworkRate": rework}


def approval_waits(repo, facts, start, end):
    """문서 머리를 in-review 로 바꾼 첫 커밋 시각 → 그 sha 의 approved 기록 시각(시간). mr 은 MR 열림 시각(glab · gh)이 필요해 여기서 뺀다."""
    waits = []
    for fact in facts.values():
        for gate, name in (("requirements", "requirements.md"), ("design", "design.md")):
            path = fact["folder"] / name
            if not path.is_file():
                continue
            first = git(repo.root, "log", "--reverse", "--format=%ct", "-S" + "status: in-review", repo.ref, "--", f"{fact['rel']}/{name}").split()
            if not first:
                continue
            sha = approvals.approval_sha(path.read_bytes())
            stamps = [iso_epoch(e["at"]) for e in fact["entries"] if e["valid"] and e["gate"] == gate and e["decision"] == "approved" and e["target"] and e["target"]["sha256"] == sha]
            stamps = [s for s in stamps if s is not None and start <= s < end]
            if stamps and min(stamps) >= int(first[0]):
                waits.append(min(stamps) - int(first[0]))
    return waits


# ── 조립 ─────────────────────────────────────────────────────────────────────
def base_ref(root):
    meta = intents.meta_of(Path(root))
    base = str((meta.get("git") or {}).get("base") or "develop") if isinstance(meta.get("git"), dict) else "develop"
    for ref in (f"origin/{base}", base, "HEAD"):
        if git(root, "rev-parse", "--verify", "-q", ref).strip():
            return base, ref
    return base, "HEAD"


def compute(root, start_day, end_day, ref=None, kit=True):
    base, found = base_ref(root)
    repo = Repo(root, ref or found)
    start, end = epoch(start_day), epoch(end_day, end=True)
    metrics = kit_metrics(repo, start, end) if kit else git_metrics(repo, start, end)
    return repo, base, {"schema": SCHEMA, "range": {"from": start_day, "to": end_day, "base": base, "headSha": repo.log[0][0][:7] if repo.log else None}, "metrics": metrics}


def baseline(root, force=False, adopted=None):
    root = Path(root)
    target = root / BASELINE
    if target.exists() and not force:
        raise FileExistsError(f"기준선이 이미 있다: {BASELINE} — 다시 만들려면 --force")
    base, ref = base_ref(root)
    repo = Repo(root, ref)
    at = None
    if adopted:
        at = epoch(adopted) if re.match(r"^\d{4}-\d{2}-\d{2}$", adopted) else (int(git(root, "log", "-1", "--format=%ct", adopted).strip() or 0) or None)
    at = at or repo.adoption()
    if at is None:
        raise ValueError("킷 도입 커밋(harness-kit.lock 을 처음 더한 커밋)을 찾지 못했다 — --adopted-at <날짜|커밋> 을 준다")
    start, end = at - BASELINE_DAYS * DAY, at
    start_day = datetime.fromtimestamp(start, timezone.utc).strftime("%Y-%m-%d")
    end_day = datetime.fromtimestamp(end - 1, timezone.utc).strftime("%Y-%m-%d")
    metrics = git_metrics(repo, start, end)
    data = {"schema": BASELINE_SCHEMA, "range": {"from": start_day, "to": end_day, "base": base, "headSha": repo.log[0][0][:12] if repo.log else None, "fromEpoch": start, "toEpoch": end},
            "inputDigest": repo.digest(start, end), "metrics": metrics, "createdAt": datetime.now().astimezone().isoformat(timespec="seconds")}
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return data


def verify_baseline(root):
    """(같은가, 다른 곳 목록). 기준선의 입력 범위 · head 로 다시 계산한다."""
    root = Path(root)
    try:
        saved = json.loads((root / BASELINE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False, [f"{BASELINE} 를 읽지 못했다"]
    span = saved.get("range") or {}
    repo = Repo(root, span.get("headSha") or "HEAD")
    start, end = int(span.get("fromEpoch", 0)), int(span.get("toEpoch", 0))
    again = git_metrics(repo, start, end)
    diff = [name for name in NAMES if again.get(name) != (saved.get("metrics") or {}).get(name)]
    if repo.digest(start, end) != saved.get("inputDigest"):
        diff.append("inputDigest")
    return not diff, diff


def read_baseline(root):
    try:
        data = json.loads((Path(root) / BASELINE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def headline(name, item):
    if not item:
        return None
    return item.get("median") if "median" in item else item.get("value")


def method_mismatch(current, base):
    return [name for name in NAMES if (current.get(name) or {}).get("method") not in (None, "none") and (base or {}).get(name, {}).get("method") not in (None, "none", (current.get(name) or {}).get("method"))]


def table_lines(current, base):
    def show(item):
        value = headline("", item)
        return "—" if value is None else str(value)

    rows = ["| 지표 | 기준선 | 이 기간 | 계산 방법 |", "|---|---|---|---|"]
    for name in NAMES:
        mine, theirs = current.get(name) or {}, (base or {}).get(name) or {}
        method = mine.get("method") or "none"
        note = f"{method}" + (f" (기준선 {theirs.get('method')} — 계산 방법 다름)" if theirs.get("method") not in (None, "none", method) and method != "none" else "")
        rows.append(f"| {LABELS[name]} | {show(theirs)} | {show(mine)} | {note} |")
    return rows


def fill_record(path, current, base):
    text = Path(path).read_text(encoding="utf-8")
    begin = re.compile(r"^<!--\s*METRICS:BEGIN\b")
    end = re.compile(r"^<!--\s*METRICS:END\b")
    updated = deploy_record.replace_between(text, begin, end, table_lines(current, base), ["<!-- METRICS:BEGIN — harness-kit metrics 가 쓴다. 손으로 고치지 않는다 -->", "<!-- METRICS:END -->"])
    Path(path).write_text(updated if updated.endswith("\n") else updated + "\n", encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser(prog="delivery_metrics.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root")
    parser.add_argument("--from", dest="start")
    parser.add_argument("--to", dest="end")
    parser.add_argument("--baseline", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--adopted-at")
    parser.add_argument("--verify-baseline", action="store_true")
    parser.add_argument("--fill")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    root = intents.harness_root(Path(args.root or Path.cwd()))
    if args.baseline:
        try:
            data = baseline(root, args.force, args.adopted_at)
        except (FileExistsError, ValueError) as error:
            print(f"✖ {error}", file=sys.stderr)
            return 1
        print(json.dumps(data, ensure_ascii=False, indent=2) if args.json else f"✔ 기준선: {BASELINE} ({data['range']['from']} ~ {data['range']['to']})")
        return 0
    if args.verify_baseline:
        same, diff = verify_baseline(root)
        print("기준선 재계산: 같다" if same else "✖ 기준선 재계산 값이 다르다: " + ", ".join(diff) + " — 사람이 --baseline --force 로 다시 만든다")
        return 0 if same else 1
    end_day = args.end or date.today().isoformat()
    start_day = args.start or (datetime.strptime(end_day, "%Y-%m-%d") - timedelta(days=30)).strftime("%Y-%m-%d")
    _, _, data = compute(root, start_day, end_day)
    saved = read_baseline(root)
    data["baseline"] = (saved or {}).get("metrics")
    data["methodMismatch"] = method_mismatch(data["metrics"], data["baseline"] or {})
    out = root / REPORTS / f"delivery-{end_day}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.fill:
        fill_record(ops_records.resolve(root, args.fill), data["metrics"], data["baseline"])
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print("\n".join(table_lines(data["metrics"], data["baseline"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
