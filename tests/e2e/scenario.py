"""두 구성 e2e 의 시나리오 단계(설계 11 §3.4 S0~S10, 판정 E1~E9). 단계마다 킷 명령 · 킷 스크립트 · 대시보드 API 만 부른다."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from sandbox import IMPLEMENT_ROLE, REVIEW_ROLE, Report, Sandbox, Skip  # noqa: I001 — sandbox 가 fixtures 를 경로에 넣는다

import scripted  # noqa: E402

HERE = Path(__file__).resolve().parent
REQUIREMENT = HERE / "fixtures/requirement.md"
INIT_FLAGS = ["--yes", "--stack", "python", "--agents", "claude,codex", "--no-register", "--name", "Sample", "--slug", "sample"]


# ── S0 설치 ──────────────────────────────────────────────────────────────────


def install(sb: Sandbox, config: str, report: Report) -> None:
    """구성별 설치 순서. A 킷만 · B-forward 킷 → aidlc → entire · B-reverse entire → aidlc → 킷."""
    sb.init_repo()
    if config == "B-reverse":
        sb.run("entire", "enable", "--agent", "claude-code", "--project")
        sb.run("aidlc", "config", "--harness", "claude", "--yes")
        sb.commit("chore: 외부 도구를 먼저 깐다(entire → aidlc)")
        sb.hk("init", *INIT_FLAGS)
        sb.commit("chore: 킷 init")
        sb.hk("add", "aidlc", "--yes")
        sb.hk("add", "entire", "--yes")
    else:
        sb.hk("init", *INIT_FLAGS)
        sb.commit("chore: 킷 init")
        if config == "B-forward":
            sb.hk("add", "aidlc", "--yes")
            sb.hk("add", "entire", "--yes")
    if sb.git("status", "--porcelain"):
        sb.commit("chore: 설치 정리")
    sb.git("push", "-q", "origin", "develop")
    doctor = sb.hk("doctor", "--check", "--json", check=False)
    report.add(config, "S0.doctor-check", "pass" if doctor.returncode == 0 else "fail", f"doctor --check exit {doctor.returncode}")
    report.measurements.setdefault("load", {})[config] = json.loads(sb.hk("doctor", "--json").stdout).get("load", [])


# ── S1~S3 접수 · 설계 · 승인 ──────────────────────────────────────────────────


def unit_keys(path: Path) -> dict:
    doc = json.loads(path.read_text(encoding="utf-8"))
    return {
        "top": sorted(k for k in doc if k != "source"),
        "unit": sorted({k for u in doc["units"] for k in u if k != "sourceId"}),
        "decomposition": sorted(doc.get("decomposition", {})),
        "units": len(doc["units"]),
    }


def file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def req_headings(path: Path) -> list[str]:
    return [line for line in path.read_text(encoding="utf-8").splitlines() if line.startswith("## ")]


def snapshot_external(sb: Sandbox) -> dict:
    return {"files": sb.external_hashes(), "hooks": sb.external_hook_entries()}


def intent_dir(sb: Sandbox, key: str) -> Path:
    found = sorted((sb.repo / ".agents/docs/intents").glob(f"{key}-*"))
    assert found, f"{key} Intent 폴더가 없다"
    return found[0]


def design(sb: Sandbox, config: str, report: Report, aidlc: bool, tag: str) -> str:
    """S1 접수 → S2 설계 산출물. A 는 대본 에이전트가 intent.md · units.json 을 쓰고, B 는 AI-DLC 산출물 fixture 를 sync aidlc 로 가져온다."""
    r = sb.hk("intake", "--title", "주문 결제 연동", "--kind", "product", "--name", "order-billing", "--text-file", str(REQUIREMENT), "--json")
    folder_rel = json.loads(r.stdout)["folder"]
    key = Path(folder_rel).name.split("-order")[0]
    folder = sb.repo / folder_rel
    if aidlc:
        for rel, text in scripted.aidlc_files().items():
            sb.write(rel, text)
        sync = sb.hk("sync", "aidlc", "--key", key, "--json", check=False)
        if sync.returncode != 0:
            raise RuntimeError(f"sync aidlc exit {sync.returncode}\n{sync.stdout[-800:]}\n{sync.stderr[-800:]}")
        folder = intent_dir(sb, key)
        # 편차(HK-22 design §3 D3): flow.design = aidlc 인데도 intake 가 킷 설계용 intent.md · questions.md 틀을 만든다.
        # 둘이 같이 있으면 intent.py check 가 빈 틀을 검사해 실패하므로, AI-DLC 가 설계를 맡는 이 구성에서는 사람이 틀을 지운다.
        for name in ("intent.md", "questions.md"):
            (folder / name).unlink(missing_ok=True)
    else:
        sb.write(f"{folder_rel}/intent.md", scripted.intent_md(key))
        sb.write(f"{folder_rel}/questions.md", scripted.questions_md(key))
        sb.write(f"{folder_rel}/units.json", scripted.units_json(key))
    chk = sb.py("intent.py", "check", str(folder), "--json", check=False)
    report.add(config, f"S2.intent-check{tag}", "pass" if chk.returncode == 0 else "fail", chk.stdout[-300:] if chk.returncode else "")
    report.measurements.setdefault("units_keys", {})[f"{config}{tag}"] = unit_keys(folder / "units.json")
    sb.commit(f"docs: {key} 설계 산출물")
    return key


def approve_intent_and_plans(sb: Sandbox, config: str, report: Report, key: str, tag: str) -> None:
    """S3 intent · plans 승인(대시보드 API + PIN). B 는 intent.md 가 없는 Intent 라 API 가 받는지 본다."""
    folder = intent_dir(sb, key)
    rel = folder.relative_to(sb.repo)
    # E3: 앞 승인 없이 plans 승인 API 는 거절한다
    status, early = sb.call("GET", f"/api/v1/intents/{key}/gates?gate=plans")
    status, body = sb.approve({"intent": key}, "plans", "기획 확인", sha=early.get("data", {}).get("sha256", "0" * 64))
    report.add(config, f"E3.plans-before-intent{tag}", "pass" if status == 422 else "fail", f"status {status} {body.get('error', {}).get('code')}")
    # 승인 대상 문서: 킷 설계는 intent.md, AI-DLC Intent 는 intent.json(from_unit.py 와 같은 규칙)
    doc = folder / "intent.md" if (folder / "intent.md").is_file() else folder / "intent.json"
    status, body = sb.approve({"intent": key}, "intent", "범위 확인", sha=file_sha(doc))
    report.add(config, f"S3.intent-approval{tag}", "pass" if status == 201 else "fail", f"status {status} {json.dumps(body, ensure_ascii=False)[:300]}")
    if status != 201:
        raise Skip("intent 승인 API 가 이 Intent 를 받지 않았다 — 이후 단계를 건너뛴다")
    # plans: 설계 계획 템플릿을 채운 기획물 + backlog 생성 구간
    tpl = sb.read(".agents/docs/_spec-templates/plans/design-plan.md")
    for token, value in (("INTENT_KEY", key), ("TITLE", "주문 결제 연동"), ("CREATED", "2026-11-24"), ("HARNESS", "claude")):
        tpl = tpl.replace("{{" + token + "}}", value)
    sb.write(f"{rel}/plans/design-plan.md", tpl)
    sb.py("intent.py", "backlog", key)
    status, bundle = sb.call("GET", f"/api/v1/intents/{key}/gates?gate=plans")
    if status != 200:
        raise RuntimeError(f"plans 묶음: {status} {bundle}")
    status, body = sb.approve({"intent": key}, "plans", "기획 확인", sha=bundle["data"]["sha256"])
    report.add(config, f"S3.plans-approval{tag}", "pass" if status == 201 else "fail", f"status {status} {json.dumps(body, ensure_ascii=False)[:300]}")
    sb.commit(f"docs: {key} intent · plans 승인")


# ── S4~S9 Unit → 이슈 → 구현 → 병합 → 배포 → 운영 ───────────────────────────────


def specify(sb: Sandbox, config: str, report: Report, key: str, unit: str, tag: str) -> dict:
    """S4 /hx-specify --from-unit(계약 먼저). 반환: 이슈 키 · 폴더."""
    r = sb.py("from_unit.py", f"{key}/{unit}", check=False)
    if r.returncode != 0:
        report.add(config, f"S4.from-unit-{unit}{tag}", "fail", (r.stdout + r.stderr)[-400:])
        raise Skip("from_unit 실패")
    created = re.search(r"생성 완료: (\S+)", r.stdout)
    folder = sb.repo / created[1] if created else None
    if folder is None or not folder.is_dir():
        found = sorted((sb.repo / ".agents/docs/issues").glob("*"))
        folder = found[-1]
    issue_key = folder.name.split("-")[0] + "-" + folder.name.split("-")[1]
    report.add(config, f"S4.from-unit-{unit}{tag}", "pass", folder.name)
    return {"key": issue_key, "folder": folder, "unit": unit}
