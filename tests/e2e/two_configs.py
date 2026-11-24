#!/usr/bin/env python3
"""두 구성 e2e(설계 11 §3.4, MG-R7): 새 리포를 /tmp 에 만들어 요구사항 하나를 운영 기록까지 돌린다.

    python3 tests/e2e/two_configs.py --mode stub            가짜 aidlc · entire(MR 마다)
    python3 tests/e2e/two_configs.py --mode real            실제 aidlc · entire(릴리스 전, PATH 에 있어야 한다)
    python3 tests/e2e/two_configs.py --mode stub --config A,B-forward --json-out out.json --keep

구성: A(킷만) · B-forward(킷 → aidlc → entire) · B-reverse(entire → aidlc → 킷). B 는 끝에 remove entire → remove aidlc → A 시나리오를 한 번 더 돈다(E6).
모든 도구 실행은 일회용 HOME · 설정 폴더 · 전역 git 설정으로 한다. 시작 전과 끝난 뒤에 실제 전역 git 설정과 ~/.claude/settings.json 의 sha256 이 같은지 본다.
모델을 부르지 않는다. 승인은 대시보드 서버를 이 시험 안에서 띄우고 PIN 을 표준 오류에서 읽어 API 로 한다.
종료 코드: 0 실패 없음(건너뜀 포함) · 1 실패 있음 · 2 사용법.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import flow  # noqa: E402
from sandbox import CONFIGS, Report, Sandbox, Skip, real_env_fingerprint  # noqa: E402


def run_config(mode: str, config: str, report: Report, keep: bool) -> Path | None:
    started = time.time()
    sb = Sandbox(mode, config.lower(), keep)
    print(f"▶ 구성 {config} ({mode}) — {sb.base}", flush=True)
    try:
        flow.run(sb, config, report)
    except Skip as skip:
        report.add(config, "run", "skip", str(skip))
    except Exception:  # noqa: BLE001 — 어떤 오류든 실패로 기록하고 다음 구성으로 간다
        report.add(config, "run", "fail", traceback.format_exc()[-1500:])
    finally:
        report.measurements.setdefault("seconds", {})[config] = round(time.time() - started, 1)
        sb.close()
    return sb.base if keep else None


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mode", choices=("stub", "real"), default="stub")
    parser.add_argument("--config", default=",".join(CONFIGS), help="쉼표로 구분(A · B-forward · B-reverse)")
    parser.add_argument("--json-out")
    parser.add_argument("--keep", action="store_true", help="임시 폴더를 지우지 않는다")
    args = parser.parse_args(argv)
    configs = [c.strip() for c in args.config.split(",") if c.strip()]
    unknown = [c for c in configs if c not in CONFIGS]
    if unknown:
        print(f"모르는 구성: {unknown}", file=sys.stderr)
        return 2
    before = real_env_fingerprint() if args.mode == "real" else None
    report = Report()
    for config in configs:
        run_config(args.mode, config, report, args.keep)
    if before is not None:
        after = real_env_fingerprint()
        same = before == after
        report.add("all", "guard.real-home-untouched", "pass" if same else "fail", "" if same else f"{before} → {after}")
    flow.compare_configs(report, configs)
    fails = [r for r in report.results if r.status == "fail"]
    skips = [r for r in report.results if r.status == "skip"]
    print(f"\n통과 {sum(1 for r in report.results if r.status == 'pass')} · 실패 {len(fails)} · 건너뜀 {len(skips)}")
    if args.json_out:
        Path(args.json_out).write_text(
            json.dumps({"mode": args.mode, "results": [r.__dict__ for r in report.results], "measurements": report.measurements}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
