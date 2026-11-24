"""S5~S9: 이슈 문서 승인 → 구현 → 검증 → 병합 → 배포 기록 · 승인(설계 11 §3.4).

이 단계는 대시보드 승인 API(PIN)를 쓴다. 에이전트 세션 안에서는 서버가 승인 API 를 닫으므로(DB-R22) 사람 터미널 · CI 에서 돈다.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from sandbox import IMPLEMENT_ROLE, REVIEW_ROLE, Report, Sandbox, Skip  # noqa: I001 — sandbox 가 fixtures 를 경로에 넣는다

import scripted  # noqa: E402


def set_head(text: str, field: str, value: str) -> str:
    """머리(---) 안의 한 줄을 바꾼다. 없으면 머리 끝에 더한다."""
    lines = text.split("\n")
    end = lines.index("---", 1)
    for i in range(1, end):
        if lines[i].startswith(f"{field}:"):
            lines[i] = f"{field}: {value}"
            return "\n".join(lines)
    lines.insert(end, f"{field}: {value}")
    return "\n".join(lines)


def replace_body(text: str, body: str) -> str:
    lines = text.split("\n")
    end = lines.index("---", 1)
    return "\n".join(lines[: end + 1]) + "\n\n" + body


def short(body: dict) -> str:
    return json.dumps(body, ensure_ascii=False)[:300]


def approve_doc(sb: Sandbox, key: str, gate: str, rel: str, phrase: str) -> tuple[int, dict]:
    return sb.approve({"issue": key}, gate, phrase, sha=sb.doc_sha(rel))


def issue_docs(sb: Sandbox, config: str, report: Report, issue: dict, tag: str) -> None:
    """S5 requirements · design · tasks 승인. E3: 앞 승인 없이 다음 게이트 승인 API 는 422."""
    key, folder = issue["key"], issue["folder"]
    rel = folder.relative_to(sb.repo).as_posix()
    area = scripted.UNIT_AREAS[issue["unit"]]
    sb.write(f"{rel}/requirements.md", set_head(sb.read(f"{rel}/requirements.md"), "status", "in-review"))
    sb.write(f"{rel}/design.md", set_head(replace_body(sb.read(f"{rel}/design.md"), scripted.DESIGN_BODY.format(area=area)), "status", "in-review"))
    sb.write(f"{rel}/tasks.md", replace_body(sb.read(f"{rel}/tasks.md"), scripted.TASKS_BODY.format(area=area)))
    sb.commit(f"docs: {key} 문서")
    status, body = approve_doc(sb, key, "design", f"{rel}/design.md", "설계 확정")
    report.add(config, f"E3.design-before-requirements{tag}", "pass" if status == 422 else "fail", f"status {status} {body.get('error', {}).get('code')}")
    for gate, name in (("requirements", "requirements.md"), ("design", "design.md"), ("tasks", "tasks.md")):
        status, body = approve_doc(sb, key, gate, f"{rel}/{name}", f"{gate} 확정")
        report.add(config, f"S5.{gate}-approval{tag}", "pass" if status == 201 else "fail", "" if status == 201 else f"status {status} {short(body)}")
        if status != 201:
            raise Skip(f"{gate} 승인 실패 — 이후 단계를 건너뛴다")
    sb.commit(f"docs: {key} 승인")


def implement(sb: Sandbox, config: str, report: Report, issue: dict, checkpoints: bool, tag: str) -> None:
    """S6 구현 Bolt 2개(대본 에이전트가 코드를 쓰고 커밋). B 는 구현 하네스 커밋에만 체크포인트(E4)."""
    key, name = issue["key"], issue["folder"].name
    area = scripted.UNIT_AREAS[issue["unit"]]
    sb.git("switch", "-q", "-c", f"feat/{name}")
    commits = []
    for bolt in (1, 2):
        src = f"src/{area}/__init__.py"
        sb.write(src, sb.read(src) + f"\n\ndef bolt_{bolt}_{key.lower().replace('-', '_')}():\n    return {bolt}\n")
        sb.commit(f"feat: {key} Bolt {bolt}", env={"HX_E2E_ROLE": IMPLEMENT_ROLE})
        commits.append(sb.git("rev-parse", "HEAD"))
    if not checkpoints:
        return
    if sb.mode != "stub":
        report.add(config, f"E4.checkpoints{tag}", "skip", "실제 Entire 체크포인트는 구현 하네스(Claude Code) 세션 훅이 만든다 — 대본 에이전트로는 만들 수 없다")
        return
    # e2e-stub 만: 실제 Entire 가 낼 결과 모양(구현 커밋마다 ref)을 가짜 entire 가 만든다. 리뷰 세션 커밋에는 만들지 않는다.
    for n, sha in enumerate(commits, 1):
        sb.run("entire", "checkpoint-make", sha, f"{n:02d}" + "ab" * 5)
    sb.write("review-note.md", "리뷰 세션이 남긴 메모\n")
    review_sha = sb.commit(f"docs: {key} 리뷰 메모", env={"HX_E2E_ROLE": REVIEW_ROLE})
    status, data = sb.call("GET", f"/api/v1/checkpoints?issue={key}")
    listed = json.dumps(data, ensure_ascii=False)
    ok = status == 200 and review_sha[:7] not in listed and commits[0][:7] in listed
    report.add(config, f"E4.checkpoints{tag}", "pass" if ok else "fail", f"status {status}: {listed[:200]}")


def verify_changed(sb: Sandbox, config: str, report: Report, tag: str) -> None:
    """S7 verify --changed. fixture 환경에 ruff 같은 도구가 없으면 건너뜀으로 적는다."""
    r = sb.run("bash", "scripts/verify.sh", "--changed", check=False, timeout=900)
    out = r.stdout + r.stderr
    if r.returncode == 0:
        report.add(config, f"S7.verify-changed{tag}", "pass")
    elif re.search(r"설치되지 않|not found|없다", out):
        report.add(config, f"S7.verify-changed{tag}", "skip", "검증 도구 없음: " + out.strip().splitlines()[-1][:160])
    else:
        report.add(config, f"S7.verify-changed{tag}", "fail", out[-400:])


def merge_and_done(sb: Sandbox, config: str, report: Report, issue: dict, tag: str) -> None:
    """S8 MR 승인 → 병합 → done 승인."""
    key = issue["key"]
    status, body = sb.approve({"issue": key}, "mr", "MR 확인")
    report.add(config, f"S8.mr-approval{tag}", "pass" if status == 201 else "fail", "" if status == 201 else f"status {status} {short(body)}")
    if status != 201:
        raise Skip("mr 승인 실패")
    sb.commit(f"docs: {key} mr 승인")
    branch = sb.git("rev-parse", "--abbrev-ref", "HEAD")
    sb.git("switch", "-q", "develop")
    sb.git("merge", "-q", "--no-ff", branch, "-m", f"merge: {branch}")
    sb.git("push", "-q", "origin", "develop")
    status, body = sb.approve({"issue": key}, "done", "병합 확인")
    report.add(config, f"S8.done-approval{tag}", "pass" if status == 201 else "fail", "" if status == 201 else f"status {status} {short(body)}")
    if status != 201:
        raise Skip("done 승인 실패")
    sb.commit(f"docs: {key} done 승인")


def deploy(sb: Sandbox, config: str, report: Report, intent_key: str, tag: str) -> None:
    """S9 배포 기록 plan → 가짜 CI 산출물 → deploy 승인(E9) → check --require-approved."""
    r = sb.py("deploy.py", "plan", intent_key, "--json", check=False)
    if r.returncode != 0:
        report.add(config, f"S9.deploy-plan{tag}", "fail", (r.stdout + r.stderr)[-400:])
        raise Skip("deploy plan 실패")
    record = json.loads(r.stdout)["record"]
    record_id = Path(record).stem
    sha = sb.git("rev-parse", "--short=12", "HEAD")
    text = sb.read(record).replace("- full: none", f"- full: passed · sha {sha} · https://ci.example/1").replace("- quality-gate: none", f"- quality-gate: passed · sha {sha}")
    sb.write(record, text)
    deploy_cfg = {"schema": "harness-kit.deploy/v1", "envs": {"verify": {"kind": "verification"}, "production": {"kind": "production"}}, "commands": {}, "autoVerify": {"enabled": False}}
    sb.write(".agents/deploy.json", json.dumps(deploy_cfg))
    sb.commit("docs: 배포 기록")
    check = sb.py("deploy.py", "check", record_id, "--json", check=False)
    plan_sha = json.loads(check.stdout).get("planSha256", "") if check.stdout.strip().startswith("{") else ""
    status, body = sb.approve({"deploy": record_id}, "deploy", "10%부터 연다", sha=plan_sha)
    ok = status == 422 and "D3" in json.dumps(body, ensure_ascii=False)
    report.add(config, f"E9.no-rollback-test{tag}", "pass" if ok else "fail", f"status {status} {short(body.get('error', {}))}")
    waive = "검증 환경에 결제사 샌드박스가 없다. 이전 커밋으로 되돌린다"
    status, body = sb.approve({"deploy": record_id}, "deploy", "10%부터 연다", sha=plan_sha, waiveRollback=waive)
    report.add(config, f"E9.waived-approval{tag}", "pass" if status == 201 else "fail", "" if status == 201 else f"status {status} {short(body)}")
    gate = sb.py("deploy.py", "check", record_id, "--require-approved", check=False)
    report.add(config, f"E9.check-require-approved{tag}", "pass" if gate.returncode == 0 else "fail", gate.stdout[-300:] if gate.returncode else "")
