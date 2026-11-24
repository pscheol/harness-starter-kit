"""구성 하나를 처음부터 끝까지 돌리는 순서와, 구성끼리 비교하는 판정(E1 · E2)."""

from __future__ import annotations

import json
import shutil

import deliver
import scenario
from sandbox import Report, Sandbox, Skip


def external_same(config: str, report: Report, cid: str, base: dict, now: dict) -> None:
    changed = [p for p, h in base["files"].items() if now["files"].get(p) != h] + [p for p, h in base["hooks"].items() if now["hooks"].get(p) != h]
    report.add(config, cid, "pass" if not changed and base["files"] else "fail", f"외부 파일 {len(base['files'])} · 훅 항목 {len(base['hooks'])} · 달라진 {len(changed)}{' ' + str(changed[:3]) if changed else ''}")


def kit_commands(sb: Sandbox, config: str, report: Report, baseline: dict) -> None:
    """E5: 킷 update · repair · uninstall 뒤 AI-DLC · Entire 파일과 훅 항목의 sha256 은 그대로다(MG-R5)."""
    sb.hk("update", "--yes")
    external_same(config, report, "E5.after-update", baseline, scenario.snapshot_external(sb))
    sb.hk("repair")
    external_same(config, report, "E5.after-repair", baseline, scenario.snapshot_external(sb))
    # uninstall 은 복사본에서 한다(이 리포는 뒤 단계가 쓴다). 복사본도 일회용 HOME 안에 있다.
    copy = sb.base / "uninstall-copy"
    shutil.copytree(sb.repo, copy)
    sb.hk("uninstall", "--yes", cwd=copy)
    files = {p: (copy / p).is_file() and scenario.file_sha(copy / p) for p in baseline["files"]}
    gone = [p for p, h in baseline["files"].items() if files[p] != h]
    report.add(config, "E5.after-uninstall", "pass" if not gone else "fail", f"달라지거나 없어진 외부 파일 {len(gone)}{' ' + str(gone[:3]) if gone else ''}")


def remove_modules(sb: Sandbox, config: str, report: Report, baseline: dict) -> None:
    """E6 앞 절반: remove entire → remove aidlc. 외부 산출물은 지우지 않고, 설정은 킷만 쓰는 값으로 돌아온다."""
    sb.hk("remove", "entire", "--yes")
    sb.hk("remove", "aidlc", "--yes")
    left = scenario.snapshot_external(sb)
    missing = [p for p, h in baseline["files"].items() if (sb.repo / p).is_file() is False or scenario.file_sha(sb.repo / p) != h]
    lock_owned = [i for i in sb.list_files() if str(i.get("owner", "")).startswith("external:")]
    meta = json.loads(sb.read(".agents/knots-sync.json"))
    ok = not missing and not lock_owned and meta["flow"]["design"] == "kit" and meta["flow"]["record"] == "none" and meta["modules"] == []
    report.add(config, "E6.remove-modules", "pass" if ok else "fail", f"지워지거나 바뀐 외부 파일 {len(missing)} · lock 의 external 항목 {len(lock_owned)} · flow {meta['flow'].get('design')}/{meta['flow'].get('record')} · modules {meta['modules']}")
    del left
    sb.commit("chore: 외부 모듈 끄기")


def lifecycle(sb: Sandbox, config: str, report: Report, aidlc: bool, tag: str) -> None:
    """S1~S9. 승인 API 가 닫힌 환경(에이전트 세션)에서는 승인 앞까지만 돌고 건너뜀으로 적는다."""
    # 앞 바퀴가 이슈 브랜치에서 멈췄을 수 있다 — 관리 페이지는 메인 폴더가 base(develop)일 때만 문서를 저장한다
    if sb.git("rev-parse", "--abbrev-ref", "HEAD") != "develop":
        if sb.git("status", "--porcelain"):
            sb.commit("chore: 앞 바퀴 정리")
        sb.git("switch", "-q", "develop")
    key = scenario.design(sb, config, report, aidlc, tag)
    sb.start_dashboard()
    try:
        scenario.approve_intent_and_plans(sb, config, report, key, tag)
        first = scenario.specify(sb, config, report, key, "U-1", tag)
        second = scenario.specify(sb, config, report, key, "U-2", tag)
        report.measurements.setdefault("requirements_headings", {})[f"{config}{tag}"] = scenario.req_headings(first["folder"] / "requirements.md")
        sb.commit(f"docs: {key} 이슈 둘")
        deliver.issue_docs(sb, config, report, first, tag)
        deliver.implement(sb, config, report, first, aidlc and not tag, tag)
        deliver.verify_changed(sb, config, report, tag)
        deliver.merge_and_done(sb, config, report, first, tag)
        deliver.deploy(sb, config, report, key, tag)
        report.add(config, f"E8.ops-to-intake{tag}", "skip", "이 판의 e2e 는 운영 기록 → intake --from ops: 을 아직 돌리지 않는다(후속)")
        del second
    finally:
        sb.stop_dashboard()


def run(sb: Sandbox, config: str, report: Report) -> None:
    aidlc = config.startswith("B")
    scenario.install(sb, config, report)
    baseline = scenario.snapshot_external(sb) if aidlc else None
    try:
        lifecycle(sb, config, report, aidlc, "")
    except Skip as skip:
        report.add(config, "lifecycle", "skip", str(skip))
    if baseline is not None:
        kit_commands(sb, config, report, baseline)
        remove_modules(sb, config, report, baseline)
        try:
            lifecycle(sb, config, report, False, "-after-remove")
        except Skip as skip:
            report.add(config, "lifecycle-after-remove", "skip", str(skip))


def compare_configs(report: Report, configs: list[str]) -> None:
    """E1: units.json 키 집합이 A · B 에서 같다. E2: requirements 절 구성이 같다."""
    keys = report.measurements.get("units_keys", {})
    base = keys.get("A")
    for cfg in configs:
        if cfg == "A" or base is None or cfg not in keys:
            continue
        same = {k: v for k, v in keys[cfg].items() if k != "units"} == {k: v for k, v in base.items() if k != "units"}
        report.add("A↔" + cfg, "E1.units-json-keys", "pass" if same else "fail", "" if same else f"A {base} / {cfg} {keys[cfg]}")
    heads = report.measurements.get("requirements_headings", {})
    for cfg in configs:
        if cfg == "A":
            continue
        if "A" in heads and cfg in heads:
            report.add("A↔" + cfg, "E2.requirements-headings", "pass" if heads["A"] == heads[cfg] else "fail", "" if heads["A"] == heads[cfg] else f"A {heads['A']} / {cfg} {heads[cfg]}")
        else:
            report.add("A↔" + cfg, "E2.requirements-headings", "skip", "승인 API 가 닫혀 from_unit 까지 가지 못했다")
