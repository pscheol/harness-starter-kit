#!/usr/bin/env python3
"""정적 분석 · 품질 게이트(설계 09 §3.2~§3.6). 완료 판정은 scripts/verify.sh 가 하고, 이 명령은 그 안에서 불리거나 사람이 직접 부른다.

    python3 scripts/harness/quality.py run --level changed|affected|full [--files …] [--base <ref>] [--summary]
    python3 scripts/harness/quality.py check-config                 # fast: 등록 · 게이트 · 기준선 형식
    python3 scripts/harness/quality.py baseline --update            # 사람 터미널 · CI: base 브랜치 full 결과로 기준선
    python3 scripts/harness/quality.py scan                         # /hx-scan: 새 문제를 묶어 보여 준다

exit: 0 통과(경고 포함) · 1 게이트 실패 · 2 미완료 · 3 다시 돌려야 함(scan) · 에이전트 세션 거부(baseline).
"""

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import quality_baseline, quality_config  # noqa: E402
from harness.quality_git import head_info  # noqa: E402
from harness.quality_run import analyze  # noqa: E402
from harness.verify_sources import BASE_ENV, harness_root  # noqa: E402

SCAN_LINES = 35
GROUP_AT = 5
SEVERITY_ORDER = ("CRITICAL", "HIGH", "MEDIUM", "LOW")
RERUN = "bash scripts/verify.sh --affected"


def changed_inputs(root, options, environ):
    """(파일, diff 기준). --files 가 없으면 Git 변경(affected 는 base merge-base 이후)."""
    from harness.verify_changes import changed_files, resolve_base

    base = None
    if options.level != "changed":
        try:
            base = resolve_base(root, options.base or environ.get(BASE_ENV))
        except ValueError:
            base = None
    reference = base["mergeBase"] if base else (options.base if options.level == "changed" else None)
    if options.files is not None:
        return sorted(set(options.files)), reference or ("HEAD" if options.level != "full" else None)
    if options.level == "full":
        return [], reference
    return changed_files(root, reference), reference or "HEAD"


def run(root, options, environ):
    files, reference = changed_inputs(root, options, environ)
    analysis = analyze(root, options.level, files, reference=reference, environ=environ)
    if options.summary:
        print("\n".join(analysis["lines"]))
    else:
        print(json.dumps(analysis, ensure_ascii=False, indent=2))
    return analysis["exitCode"]


def check_config(root, environ):
    errors, warnings, count = quality_config.check(root, environ)
    if not errors and not warnings and count == 0 and not any((root / ".agents" / name).is_file() for name in (quality_config.REGISTRY, quality_config.GATE)):
        return 0
    for error in errors[:15]:
        print(f"✖ {error}")
    for warning in warnings[:5]:
        print(f"⚠ {warning}")
    if errors:
        print(f"정적 분석 설정 오류 {len(errors)}개 — .agents/analyzers.json · quality-gate.json · quality-baseline.json 을 고친다")
        return 1
    print(f"정적 분석 설정 통과 — 분석기 {count}개 등록(fast 는 실행하지 않는다)")
    return 0


def scan_line(severity, analyzer, rule, items):
    if len(items) > GROUP_AT:
        first = items[0]
        return f"- [{severity}] {analyzer} {rule} — {len(items)}건: {first['path']}:{first['startLine']} 외 {len(items) - 1}곳"
    return "\n".join(f"- [{severity}] {analyzer} {rule} — {item['path']}:{item['startLine']} {item.get('message', '')[:80]}" for item in items)


def analyzer_line(severity, analyzer, groups):
    """한 분석기 · 심각도에 규칙이 GROUP_AT 개를 넘으면 한 줄로 묶는다(의존성 분석기의 CVE 목록)."""
    total = sum(len(items) for items in groups.values())
    top = ", ".join(rule for rule, _ in sorted(groups.items(), key=lambda pair: -len(pair[1]))[:3])
    paths = sorted({item["path"] for items in groups.values() for item in items})
    return f"- [{severity}] {analyzer} — 규칙 {len(groups)}개 · {total}건({', '.join(paths[:2])}{' 외' if len(paths) > 2 else ''}): {top} …"


def scan(root):
    """/hx-scan 입력: 새 문제를 심각도 · 분석기 · 규칙으로 묶는다. 판정하지 않는다."""
    path = root / ".agents/reports/findings-latest.json"
    if not path.is_file():
        print(f"분석 결과가 없다 — {RERUN} 를 먼저 돈다(분석기는 그 안에서 돈다)")
        return 3
    latest = json.loads(path.read_text(encoding="utf-8"))
    head = head_info(root)
    if latest.get("head") != head["sha"]:
        print(f"분석 결과(head {str(latest.get('head'))[:7]})가 지금 HEAD({str(head['sha'])[:7]})와 다르다 — {RERUN} 를 먼저 돈다")
        return 3
    new = [item for item in latest.get("findings", []) if item.get("new")]
    lines = [f"새 문제 {len(new)}건 · 전체 {len(latest.get('findings', []))}건 — {latest.get('runId')}({latest.get('level')})"]
    groups = {}
    for item in new:
        groups.setdefault((SEVERITY_ORDER.index(item["severity"]), item["analyzer"]), {}).setdefault(item["ruleId"], []).append(item)
    body = []
    for (rank, analyzer), rules in sorted(groups.items()):
        if len(rules) > GROUP_AT:
            body.append(analyzer_line(SEVERITY_ORDER[rank], analyzer, rules))
        else:
            body.extend(scan_line(SEVERITY_ORDER[rank], analyzer, rule, items) for rule, items in sorted(rules.items()))
    body = "\n".join(body).splitlines()
    lines.extend(body[:SCAN_LINES])
    if len(body) > SCAN_LINES:
        lines.append(f"… {len(body) - SCAN_LINES}줄 더 — .agents/reports/findings-latest.json")
    lines.append("판정은 bash scripts/verify.sh 가 한다. 예외 등록(accepted)은 사람이 기준선에 한다.")
    print("\n".join(lines))
    return 0


def parse_options(arguments):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", type=Path, help="하네스 루트(기본: 이 스크립트의 리포)")
    commands = parser.add_subparsers(dest="command", required=True)
    runner = commands.add_parser("run")
    runner.add_argument("--level", choices=quality_config.LEVELS, required=True)
    runner.add_argument("--files", nargs="*", default=None)
    runner.add_argument("--base")
    runner.add_argument("--summary", action="store_true")
    runner.add_argument("--root", type=Path, dest="sub_root")
    for name in ("check-config", "scan"):
        commands.add_parser(name).add_argument("--root", type=Path, dest="sub_root")
    baseline = commands.add_parser("baseline")
    baseline.add_argument("--update", action="store_true", required=True)
    baseline.add_argument("--root", type=Path, dest="sub_root")
    return parser.parse_args(arguments)


def main(arguments=None, environ=None):
    import os

    environ = dict(os.environ if environ is None else environ)
    options = parse_options(sys.argv[1:] if arguments is None else arguments)
    chosen = getattr(options, "sub_root", None) or options.root
    root = chosen.resolve() if chosen else harness_root(Path(__file__).resolve().parents[2], environ)
    if options.command == "run":
        return run(root, options, environ)
    if options.command == "check-config":
        return check_config(root, environ)
    if options.command == "scan":
        return scan(root)
    code, message = quality_baseline.update(root, environ)
    print(message if code == 0 else f"✖ {message}")
    return code


if __name__ == "__main__":
    sys.exit(main())
