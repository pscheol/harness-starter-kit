"""`deploy plan <키…>` — 포함 이슈의 design §13 을 모아 배포 기록(state: planned)을 만든다(설계 14 §3.3, DO-R2 · R3). 표준 라이브러리만 쓴다."""

import json
import re
import subprocess
from datetime import date
from pathlib import Path

from harness import deploy_config, deploy_record, intent as intents, rollout, sdd_gates
from harness.sdd_issues import issue_folders
from harness.sdd_keys import split_folder

INTENT_KEY = re.compile(r"^INT-\d+$")
TAG = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$")


class PlanError(Exception):
    def __init__(self, message, code=1, keys=()):
        super().__init__(message)
        self.code = code
        self.keys = list(keys)


def git(root, *args):
    r = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, check=False)
    return r.stdout.strip() if r.returncode == 0 else ""


def issue_heads(root):
    """{키: (폴더, requirements 머리)}."""
    out = {}
    for folder in issue_folders(Path(root)):
        parts = split_folder(folder.name)
        if not parts:
            continue
        out[parts[0]] = (folder, intents.front(folder / "requirements.md"))
    return out


def expand(root, keys):
    """키(이슈 또는 Intent) → (이슈 키 목록, 포함 못 하는 키). Intent 는 done 을 통과한 이슈만 넣는다."""
    heads = issue_heads(root)
    issues, blocked = [], []
    for key in keys:
        if INTENT_KEY.match(key):
            members = sorted((k for k, (_, fm) in heads.items() if fm.get("intent") == key), key=lambda k: (k.rsplit("-", 1)[0], int(k.rsplit("-", 1)[1])))
            done = [k for k in members if sdd_gates.passed(sdd_gates.Issue(root, heads[k][0]), "done")]
            if not done:
                raise PlanError(f"{key}: done 을 통과한 이슈가 없다", 1, [key])
            issues += done
        elif key in heads:
            if not sdd_gates.passed(sdd_gates.Issue(root, heads[key][0]), "done"):
                blocked.append(key)
            issues.append(key)
        else:
            raise PlanError(f"이슈 폴더가 없다: {key}", 1, [key])
    seen = []
    for key in issues:
        if key not in seen:
            seen.append(key)
    if blocked:
        raise PlanError("done 을 통과하지 않은 이슈: " + ", ".join(blocked), 1, blocked)
    return seen, heads


def unit_label(root, fm):
    unit, intent_key = fm.get("unit"), fm.get("intent")
    title = fm.get("title") or ""
    if unit and intent_key:
        for folder in sorted((Path(root) / intents.INTENTS).glob(f"{intent_key}-*")):
            data = intents.read_json(folder / "units.json")
            for item in (data or {}).get("units", []) if isinstance(data, dict) else []:
                if isinstance(item, dict) and item.get("id") == unit and item.get("title"):
                    title = item["title"]
    return f"{unit} {title}".strip() if unit else title or "—"


def record_key(issues, heads, tag):
    if len(issues) == 1:
        return issues[0]
    intent_keys = {heads[k][1].get("intent") for k in issues}
    if len(intent_keys) == 1 and None not in intent_keys:
        return next(iter(intent_keys))
    if tag:
        return tag
    raise PlanError("서로 다른 Intent 의 이슈를 묶을 때는 --tag <릴리스 태그> 가 필요하다", 2)


def free_id(root, day, key):
    base = deploy_record.folder(root)
    name, n = f"{day}-{key}", 1
    while (base / f"{name}.md").exists():
        n += 1
        name = f"{day}-{key}-{n}"
    return name


def issue_part(root, key, heads, base):
    folder, fm = heads[key]
    issue = sdd_gates.Issue(root, folder)
    text = (issue.doc("design")[2] or b"").decode("utf-8", "replace")
    merge = git(root, "log", "-1", "--format=%h", base, "--", folder.relative_to(root).as_posix()) or "—"
    return {"key": key, "text": text, "unit": unit_label(root, fm), "sha": rollout.section_sha(text) or "—", "merge": merge,
            "risk": issue.risk, "none": rollout.none_reason((rollout.section(text) or ("", []))[1])}


def render(record_id, key, env, tag, base, sha, risk, parts, config, today, day):
    fm = ["---", "kind: deploy", f"key: {key}", f"env: {env}", "state: planned", f"issues: [{', '.join(p['key'] for p in parts)}]",
          f"commit: {{ base: {base}, sha: {sha} }}", f"tag: {tag or 'null'}", f"risk: {risk}", f"created: {day}", "---", ""]
    rows1 = [f"| {p['key']} | {p['unit']} | {p['sha']} | {p['merge']} |" for p in parts]
    order = []
    metric, back_c, back_m = [], [], []
    for number, p in enumerate(parts, 1):
        if p["none"]:
            order.append(f"{number}. {p['key']} 배포 없음: {p['none']}")
            continue
        v1, v2 = rollout.values(p["text"], "1"), rollout.values(p["text"], "2")
        order.append(f"{number}. {p['key']} {v1.get('순서', '—')}")
        metric.append(f"| 지표 | {p['key']} 확인 신호: {v1.get('확인 신호', '—')} | 설계 §13.1 |")
        back_c.append(f"- {p['key']} 판단 기준: {v2.get('판단 기준', '—')}")
        back_m.append(f"- {p['key']} 방법: {v2.get('방법', '—')}")
    commands = (config or {}).get("commands") or {}
    smoke = "deploy.json `smoke` — 검증 환경 주소에 실제 HTTP 요청을 보내 주요 경로의 응답 코드 · 본문 일부를 확인하는 명령" if commands.get("smoke") else "deploy.json 에 smoke 명령이 없다(skipped)"
    health = "deploy.json `health`" if commands.get("health") else "deploy.json 에 health 명령이 없다(skipped)"
    check_rows = []
    for p in parts:
        items = rollout.checklist(p["text"])
        check_rows += [f"| {name} | {p['key']} | {state or '미확인'} |" for name, state in items]
        if p["none"] and not items:
            check_rows.append(f"| 배포 없음 | {p['key']} | 해당 없음: {p['none']} |")
    plan = ["<!-- PLAN:BEGIN — deploy plan 이 만든다. 승인 sha는 이 구간의 sha256이다 -->", "## 1. 포함 Unit", "| 이슈 | Unit | design §13 sha | 병합 커밋 |", "|---|---|---|---|", *rows1, "",
            "## 2. 순서", *order, "", "## 3. 확인 신호", "| 신호 | 명령 · 링크 | 기준 |", "|---|---|---|",
            f"| 스모크 | {smoke} | exit 0 |", f"| 헬스 | {health} | 3회 연속 200 |", *metric, "",
            "## 4. 롤백", *back_c, *back_m, "- 시험: none", "", "## 5. 배포 점검", "| 항목 | 이슈 | 상태 |", "|---|---|---|", *check_rows, "",
            "## 6. 검증", "- full: none", "- quality-gate: none", "<!-- PLAN:END -->"]
    title = f"# 배포 — {key}" + (f" ({tag})" if tag else "")
    tail = ["", "## 7. 결과", "<!-- RESULT:BEGIN — deploy.py result 가 쓴다. 손으로 고치지 않는다 -->", "| 단계 | 시작 | 끝 | 결과 | 근거 |", "|---|---|---|---|---|", "", "상태: planned", "<!-- RESULT:END -->", ""]
    del record_id, today
    return "\n".join([*fm, title, "", *plan, *tail])


def plan(root, keys, env="production", tag=None, today=None):
    """배포 기록을 만들고 (경로, 포함 이슈) 를 돌려준다."""
    root = Path(root)
    if tag is not None and not TAG.match(tag):
        raise PlanError(f"--tag 형식이 아니다: {tag}", 2)
    config, error = deploy_config.read(root)
    if error:
        raise PlanError(error, 2)
    if config is not None and env not in (config.get("envs") or {}):
        raise PlanError(f"deploy.json envs 에 {env} 가 없다", 2)
    issues, heads = expand(root, keys)
    meta = intents.meta_of(root)
    base = str((meta.get("git") or {}).get("base") or "develop") if isinstance(meta.get("git"), dict) else "develop"
    sha = ""
    for ref in (f"origin/{base}", base, "HEAD"):
        sha = git(root, "rev-parse", "--short=12", ref)
        if sha:
            break
    parts = [issue_part(root, key, heads, base) for key in issues]
    day = (today or date.today()).isoformat()
    key = record_key(issues, heads, tag)
    record_id = free_id(root, day, key)
    risk = deploy_record.risk_max([p["risk"] for p in parts])
    text = render(record_id, key, env, tag, base, sha, risk, parts, config, today, day)
    path = deploy_record.folder(root) / f"{record_id}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path, issues


def as_json(path, issues, root):
    return json.dumps({"record": Path(path).relative_to(root).as_posix(), "id": Path(path).stem, "issues": issues}, ensure_ascii=False)
