#!/usr/bin/env python3
"""배포 기록 · `deploy` 게이트 검사 · 배포 실행 · 자동 검증 배포(설계 14 §3.3 ~ §3.5). 킷은 모델을 부르지 않는다.

    python3 scripts/harness/deploy.py plan <이슈·Intent 키…> [--env production] [--tag v2.3.0] [--json]
    python3 scripts/harness/deploy.py check <기록> [--require-approved] [--waive "<사유>"] [--json]
    python3 scripts/harness/deploy.py record <기록> --from-ci <파이프라인 URL|산출물 파일|폴더>
    python3 scripts/harness/deploy.py run --env <이름> [--record <기록>] [--rollback-test] [--to-sha <sha>]
    python3 scripts/harness/deploy.py result <기록> --from <deploy-result.json>
    python3 scripts/harness/deploy.py auto-verify
    python3 scripts/harness/deploy.py history --platform gitlab|github [--base develop]

exit: 0 성공 · 1 조건 · 검사 실패 · 2 사용법 · 설정 오류. 운영 배포 작업은 배포 명령 앞에서 `check <기록> --require-approved` 를 부른다(DO-R6).
"""

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import deploy_ci, deploy_gate, deploy_plan, deploy_record, deploy_run, intent as intents  # noqa: E402


def root_of(option):
    return intents.harness_root(Path(option or Path.cwd()))


def emit(args, data, text):
    print(json.dumps(data, ensure_ascii=False, indent=2) if args.json else text)


def cmd_plan(args, root):
    try:
        path, issues = deploy_plan.plan(root, args.keys, args.env, args.tag)
    except deploy_plan.PlanError as error:
        print(f"✖ {error}", file=sys.stderr)
        for key in error.keys:
            print(key)
        return error.code
    relative = path.relative_to(root).as_posix()
    emit(args, {"record": relative, "id": path.stem, "issues": issues}, f"✔ 배포 기록: {relative}\n포함 이슈: {', '.join(issues)}\n다음: 기록 §4 시험 · §6 검증을 deploy record --from-ci 로 채우고 승인한다")
    return 0


def cmd_check(args, root):
    try:
        record = deploy_record.load(deploy_record.resolve(root, args.record))
    except (FileNotFoundError, OSError) as error:
        print(f"✖ {error}", file=sys.stderr)
        return 2
    result = deploy_gate.check(root, record, args.require_approved, args.waive)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        for line in deploy_gate.lines(result):
            print(line)
        if result["ok"]:
            print(f"✔ {record.id}: " + ("승인 · 조건 통과" if args.require_approved else "승인할 수 있다") + f" · 계획 sha {str(record.sha)[:12]}")
    return 0 if result["ok"] else 1


def cmd_record(args, root):
    try:
        path = deploy_record.resolve(root, args.record)
        changed = deploy_ci.fill(root, path, args.from_ci)
    except (FileNotFoundError, deploy_ci.CiError) as error:
        print(f"✖ {error}", file=sys.stderr)
        return 1
    emit(args, {"record": path.name, "changed": changed}, "\n".join([f"✔ {path.name}", *changed]) if changed else f"{path.name}: 채울 산출물이 없다")
    return 0


def cmd_run(args, root):
    code, data = deploy_run.run(root, args.env, args.record and deploy_record.resolve(root, args.record), args.rollback_test, args.to_sha)
    if code and data.get("error"):
        print(f"✖ {data['error']}", file=sys.stderr)
        for reason in data.get("reasons") or []:
            print(f"  - {reason}", file=sys.stderr)
    else:
        print(json.dumps(data, ensure_ascii=False, indent=2) if args.json else f"{data['state']}: " + " · ".join(f"{step['id']} {step['status']}" for step in data["steps"]))
    return code


def cmd_result(args, root):
    try:
        path = deploy_record.resolve(root, args.record)
        data = json.loads(Path(args.source).read_text(encoding="utf-8"))
        deploy_run.write_result(path, data)
    except (FileNotFoundError, OSError, ValueError) as error:
        print(f"✖ {error}", file=sys.stderr)
        return 2
    print(f"✔ {path.name}: {data.get('state')}")
    return 0


def cmd_auto_verify(args, root):
    code, data = deploy_run.auto_verify(root)
    if data.get("status") == "off":
        print("자동 검증 배포: 꺼짐")
    elif data.get("error"):
        print(f"✖ {data['error']}", file=sys.stderr)
    else:
        print(f"자동 검증 배포: {data['status']}" + (f" — {data['reason']}" if data.get("reason") else "") + f" · 연속 실패 {data['consecutiveFailures']}")
    return code


def cmd_history(args, root):
    return deploy_run.write_history(root, args.platform, args.base)


def build():
    parser = argparse.ArgumentParser(prog="deploy.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root")
    sub = parser.add_subparsers(dest="cmd", required=True)
    plan = sub.add_parser("plan")
    plan.add_argument("keys", nargs="+")
    plan.add_argument("--env", default="production")
    plan.add_argument("--tag")
    plan.add_argument("--json", action="store_true")
    check = sub.add_parser("check")
    check.add_argument("record")
    check.add_argument("--require-approved", action="store_true")
    check.add_argument("--waive")
    check.add_argument("--json", action="store_true")
    record = sub.add_parser("record")
    record.add_argument("record")
    record.add_argument("--from-ci", required=True)
    record.add_argument("--json", action="store_true")
    run = sub.add_parser("run")
    run.add_argument("--env", required=True)
    run.add_argument("--record")
    run.add_argument("--rollback-test", action="store_true")
    run.add_argument("--to-sha")
    run.add_argument("--json", action="store_true")
    result = sub.add_parser("result")
    result.add_argument("record")
    result.add_argument("--from", dest="source", required=True)
    sub.add_parser("auto-verify")
    history = sub.add_parser("history")
    history.add_argument("--platform", required=True, choices=("gitlab", "github"))
    history.add_argument("--base", default="develop")
    return parser


def main(argv=None):
    args = build().parse_args(argv)
    root = root_of(args.root)
    handlers = {"plan": cmd_plan, "check": cmd_check, "record": cmd_record, "run": cmd_run, "result": cmd_result, "auto-verify": cmd_auto_verify, "history": cmd_history}
    return handlers[args.cmd](args, root)


if __name__ == "__main__":
    sys.exit(main())
