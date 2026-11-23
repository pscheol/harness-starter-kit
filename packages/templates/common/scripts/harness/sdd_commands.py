"""SDD 명령: scaffold · prerequisites · board · plans · freshness · migrate · rekey · branch-check.

종료 코드(설계 01 §3.7.1): 0 생성(또는 이미 있음) · 1 선행 조건 실패 · 2 인자 오류 · 3 키 충돌(migrate 는 지도 검사 실패).
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

from harness.sdd_board import board_json, render_area, update_boards
from harness.sdd_frontmatter import TYPES
from harness.sdd_issues import (
    documents,
    find_issue,
    issue_folders,
    jira_link,
    label,
    plan_errors,
    prerequisites,
    read_doc,
    render_doc,
    today,
)
from harness.sdd_keys import (
    INTENT,
    ISSUES,
    UNIT,
    KeyConflict,
    UsageError,
    base_conflict,
    branch_messages,
    check_area,
    check_key,
    check_name,
    collision_message,
    folder_problems,
    is_key,
    next_key,
    settings,
    split_folder,
)
from harness.sdd_layout import (
    TOKEN,
    atomic_write,
    feature_locations,
    resolve_feature,
    safe_path,
    sdd_lock,
    spec_roots,
    stage_path,
    status_of,
    task_records,
    validate_token,
)
from harness.sdd_layout import prerequisites as legacy_prerequisites
from harness.sdd_migrate import MigrateBlocked, apply, dry_run, rekey, resolve_map

NEW_FORM = "scripts/new-feature.sh <키|--next> <이름> --area <영역>"
NEXT_STEPS = {
    "requirements": "/hx-specify → 사용자 승인(status: approved) → /hx-plan",
    "design": "/hx-plan → 사용자 승인(status: approved) → /hx-tasks",
    "tasks": "/hx-tasks → 계획 승인 → /hx-implement",
}


# ── scaffold ─────────────────────────────────────────────────────────────────
def parse_scaffold(arguments):
    parser = argparse.ArgumentParser(prog="new-feature.sh", description="이슈 SDD 문서를 단계마다 하나씩 만든다.")
    parser.add_argument("target", nargs="?", help="이슈 키(예: KNOTS-17). --next 면 생략")
    parser.add_argument("name", nargs="?", help="이름(slug, 2~5단어)")
    parser.add_argument("--next", action="store_true", help="issueKey.source=kit 일 때 다음 키를 만든다")
    parser.add_argument("--area")
    parser.add_argument("--stage", choices=("requirements", "design", "tasks"), default="requirements")
    parser.add_argument("--type", choices=TYPES, default="feat")
    parser.add_argument("--intent")
    parser.add_argument("--unit")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--legacy", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--all", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--number", "--priority", dest="number", help=argparse.SUPPRESS)
    return parser.parse_args(arguments)


def refuse_retired(args):
    if args.legacy:
        raise UsageError(f"--legacy 는 지원을 끝냈다. 옛 구조(<영역>-specs/)는 읽기 전용이다. 새 이슈: {NEW_FORM}")
    if args.all:
        raise UsageError("--all 은 단계 승인 게이트를 우회하므로 지원하지 않는다")
    if args.number is not None:
        raise UsageError("--number · --priority 는 지원을 끝냈다. 번호는 키가 정한다(--next 또는 <키>)")


def translate_old_call(args):
    """옛 호출 `<slug> <이름>` 을 `--next <이름> --area <slug>` 로 바꾼다(v1.1 동안, R7.10)."""
    if args.stage != "requirements":
        raise UsageError(
            f"옛 구조(.agents/docs/{args.target}-specs/)는 읽기 전용이다 — 새 단계 문서를 만들지 않는다. "
            "옮기려면 python3 scripts/sdd-layout.py migrate --dry-run"
        )
    print(f"⚠ 옛 호출이다. v1.1 동안 --next {args.name} --area {args.target} 로 바꿔 실행한다. 새 형식: {NEW_FORM}", file=sys.stderr)
    args.area = args.area or args.target
    args.next, args.key = True, None


def resolve_target(args):
    """args.key(--next 면 None) · args.name 을 정한다."""
    parts = split_folder(args.target or "")
    if args.next:
        if args.name is not None:
            raise UsageError(f"--next 는 이름 하나만 받는다: {NEW_FORM}")
        args.key, args.name = None, args.target
    elif args.target and is_key(args.target):
        args.key = args.target
    elif parts and is_key(parts[0]) and args.name is None:
        args.key, args.name = parts
    elif args.target and TOKEN.fullmatch(args.target) and args.name is not None:
        translate_old_call(args)
    else:
        raise UsageError(f"이슈 키 또는 영역(slug) 형식이 아니다: {args.target!r} — {NEW_FORM}")


def check_values(args):
    if args.stage == "requirements" or args.name is not None:
        check_name(args.name or "")
    if args.intent is not None and not INTENT.fullmatch(args.intent):
        raise UsageError(f"--intent 는 INT-<번호> 형식이다: {args.intent!r}")
    if args.unit is not None and not UNIT.fullmatch(args.unit):
        raise UsageError(f"--unit 은 U-<번호> 형식이다: {args.unit!r}")
    if args.area is not None:
        check_area(args.area)


def normalize(args):
    refuse_retired(args)
    resolve_target(args)
    check_values(args)
    return args


def known_areas(root):
    areas = {spec.name.removesuffix("-specs") for spec in spec_roots(root)}
    for folder in issue_folders(root):
        try:
            areas |= {fields["area"] for fields in documents(root, folder).values() if fields and fields.get("area")}
        except ValueError:
            continue
    return sorted(areas)


def same_name_issue(root, name):
    return next((folder for folder in issue_folders(root) if (split_folder(folder.name) or ("", ""))[1] == name), None)


def check_conflicts(root, config, key, name):
    for folder in issue_folders(root):
        parts = split_folder(folder.name)
        if parts and parts[0] == key and parts[1] != name:
            raise KeyConflict(f"키 충돌: {key} 가 작업 트리에 {ISSUES}/{folder.name} 로 이미 있다")
    other = base_conflict(root, config, key, name)
    if other:
        raise KeyConflict(collision_message(key, f"{key}-{name}", config.base, other))


def write_document(root, destination, text, dry):
    if dry:
        print(f"↷ dry-run — 만들 문서: {label(root, destination)} (쓰지 않았다)")
        return
    atomic_write(root, destination, text)
    update_boards(root)
    print(f"✔ 생성 완료: {label(root, destination)}")


def scaffold_requirements(root, args, config):
    if not args.area:
        areas = known_areas(root)
        raise UsageError("requirements 단계에는 --area <영역> 이 필요하다. 지금 영역: " + (", ".join(areas) or "없음"))
    if args.next:
        existing = same_name_issue(root, args.name)
        if existing:
            print(f"✔ 이미 있습니다: {label(root, existing)} — 같은 이름의 이슈다. 새로 만들지 않았다")
            return
        args.key = next_key(root, config)
    else:
        check_key(args.key, config)
    folder_name = f"{args.key}-{args.name}"
    problems = folder_problems(folder_name)
    if problems:
        raise UsageError("; ".join(problems))
    check_conflicts(root, config, args.key, args.name)
    destination = safe_path(root, root / ISSUES / folder_name / "requirements.md")
    if destination.exists():
        print(f"✔ 이미 있습니다: {label(root, destination)} — 새로 만든 파일 없음")
        return
    fields = {
        "key": args.key,
        "area": args.area,
        "type": args.type,
        "title": args.name,
        "status": "draft",
        "intent": args.intent,
        "unit": args.unit,
        "jira": jira_link(root, args.key) if config.source == "jira" else None,
        "created": today(),
    }
    write_document(root, destination, render_doc(root, "requirements", folder_name, fields), args.dry_run)


def scaffold_stage(root, args):
    folder = find_issue(root, args.key if args.name is None else f"{args.key}-{args.name}")
    prerequisites(root, folder, args.stage)
    destination = safe_path(root, folder / f"{args.stage}.md")
    if destination.exists():
        print(f"✔ 이미 있습니다: {label(root, destination)} — 새로 만든 파일 없음")
        return
    source = read_doc(root, folder / "requirements.md")
    fields = {name: source.get(name) for name in ("key", "area", "type", "title", "intent", "unit", "jira")}
    fields.update({"state" if args.stage == "tasks" else "status": "active" if args.stage == "tasks" else "draft", "created": today()})
    write_document(root, destination, render_doc(root, args.stage, folder.name, fields), args.dry_run)


def scaffold(root, arguments):
    args = normalize(parse_scaffold(arguments))
    config = settings(root)
    with sdd_lock(root):
        if args.stage == "requirements":
            scaffold_requirements(root, args, config)
        else:
            scaffold_stage(root, args)
    print(f"다음: {NEXT_STEPS[args.stage]}")
    return 0


# ── prerequisites · board · plans · freshness ────────────────────────────────
def check_prerequisites(root, arguments):
    parser = argparse.ArgumentParser(prog="check-sdd-prerequisites.sh")
    parser.add_argument("target", help="이슈 키(새 구조) 또는 옛 영역 slug")
    parser.add_argument("feature", nargs="?", help="옛 구조의 이름 또는 키")
    parser.add_argument("--stage", choices=("design", "tasks", "implement"), default="")
    args = parser.parse_args(arguments)
    parts = split_folder(args.target)
    if args.feature is None and (is_key(args.target) or (parts and is_key(parts[0]))):
        folder = find_issue(root, args.target)
        print(f"BASE={label(root, folder)}")
        for stage in ("requirements", "design", "tasks"):
            print(f"{stage.upper()}={label(root, folder / f'{stage}.md')}")
        prerequisites(root, folder, args.stage)
    else:
        if args.feature is None:
            raise UsageError("새 구조는 <키>, 옛 구조는 <slug> <이름|키> 를 준다")
        validate_token(args.target, "product-slug")
        spec = safe_path(root, root / f".agents/docs/{args.target}-specs")
        key, layout = resolve_feature(root, spec, args.feature)
        base = spec / "issues" / key if layout == "issue" else spec
        print(f"BASE={base.relative_to(root)}")
        for stage in ("requirements", "design", "tasks"):
            print(f"{stage.upper()}={stage_path(spec, key, layout, stage).relative_to(root)}")
        legacy_prerequisites(root, spec, key, layout, args.stage)
    print(f"선행조건 OK (stage={args.stage})")
    return 0


def board(root, arguments):
    parser = argparse.ArgumentParser(prog="board.sh")
    parser.add_argument("slug", nargs="?", help="옛 <slug>-specs/index.md 만")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--area", help="그 영역 표만 stdout 에 낸다(쓰지 않는다)")
    parser.add_argument("--json", action="store_true", help="보드 상태를 JSON 으로 낸다(쓰지 않는다, 관리 페이지와 같은 계산)")
    args = parser.parse_args(arguments)
    if args.json:
        print(json.dumps(board_json(root), ensure_ascii=False, indent=2))
        return 0
    if args.area is not None:
        sys.stdout.write(render_area(root, args.area))
        return 0
    update_boards(root, args.slug, check=args.check)
    print("✔ 보드 정합성 확인 완료" if args.check else "✔ 보드 갱신 완료")
    return 0


def check_plans(root, arguments):
    if arguments:
        raise UsageError(f"unknown arguments: {arguments}")
    strict_legacy = (root / "scripts/check_harness.py").is_file()
    errors = plan_errors(root, strict_legacy=strict_legacy)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    update_boards(root, check=True)
    print("exec-plan(tasks) 상태 일관성 OK")
    return 0


def legacy_stale(root, threshold):
    stale, stuck = [], []
    for spec in spec_roots(root):
        for key, layout in feature_locations(root, spec):
            for stage in ("requirements", "design"):
                path = safe_path(root, stage_path(spec, key, layout, stage))
                if path.is_file() and status_of(path) in ("draft", "in-review", "in review") and path.stat().st_mtime < threshold:
                    stale.append(label(root, path))
        stuck += [label(root, task) for _, _, state, task in task_records(root, spec) if state == "active" and task.stat().st_mtime < threshold]
    return stale, stuck


def issue_stale(root, threshold):
    stale, stuck = [], []
    for folder in issue_folders(root):
        for stage, fields in documents(root, folder).items():
            path = folder / f"{stage}.md"
            if fields is None or path.stat().st_mtime >= threshold:
                continue
            if stage == "tasks" and fields.get("state") == "active":
                stuck.append(label(root, path))
            elif stage != "tasks" and fields.get("status") in ("draft", "in-review"):
                stale.append(label(root, path))
    return stale, stuck


def stale_entries(root, threshold):
    old_stale, old_stuck = legacy_stale(root, threshold)
    new_stale, new_stuck = issue_stale(root, threshold)
    return old_stale + new_stale, old_stuck + new_stuck


def clarification_markers(root):
    markers = []
    issues = safe_path(root, root / ISSUES)
    for directory in [*spec_roots(root), *([issues] if issues.is_dir() else [])]:
        for path in sorted(directory.rglob("*.md")):
            safe_path(root, path)
            if path.name == "_template.md":
                continue
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if "[NEEDS CLARIFICATION:" in line and "`[NEEDS CLARIFICATION" not in line:
                    markers.append(f"{label(root, path)}:{number}:{line}")
    return markers


def freshness(root, arguments):
    parser = argparse.ArgumentParser(prog="check-spec-freshness.sh")
    parser.add_argument("--days", type=int, default=int(os.environ.get("STALE_DAYS", "14")))
    args = parser.parse_args(arguments)
    if args.days < 0:
        raise UsageError("--days must be nonnegative")
    stale, stuck = stale_entries(root, time.time() - (args.days + 1) * 86400)
    markers = clarification_markers(root)
    print(f"▶ 스펙 신선도 리포트 (기준: {args.days}일 이상 미변경)")
    for title, entries in (
        ("정체된 draft/in-review 스펙", stale),
        ("미해결 [NEEDS CLARIFICATION: …] 마커", markers),
        ("정체된 active tasks", stuck),
    ):
        print(f"\n· {title}:")
        print("\n".join(f"  {entry}" for entry in entries) if entries else "  (없음)")
    print(f"\n요약: 정체 스펙={len(stale)}, 미해결 마커={len(markers)}, 정체 tasks={len(stuck)}")
    print("→ 후속 작업은 /hx-converge 로 기존 tasks 끝에 회수합니다.")
    return 0


# ── migrate · rekey · branch-check ───────────────────────────────────────────
def migrate(root, arguments):
    parser = argparse.ArgumentParser(prog="sdd-layout.py migrate")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--map")
    parser.add_argument("--include-legacy", action="store_true")
    parser.add_argument("--prefix")
    parser.add_argument("--start", type=int)
    parser.add_argument("--areas")
    parser.add_argument("--rewrite-links", action="store_true")
    args = parser.parse_args(arguments)
    if args.dry_run:
        if args.start is not None and args.start < 1:
            raise UsageError("--start 는 1 이상이다")
        areas = {area.strip() for area in (args.areas or "").split(",") if area.strip()}
        return dry_run(root, args.include_legacy, args.prefix, args.start, areas)
    if not args.map:
        raise UsageError("--apply 에는 --map <파일> 이 필요하다")
    return apply(root, resolve_map(root, args.map), args.rewrite_links)


def rekey_command(root, arguments):
    parser = argparse.ArgumentParser(prog="sdd-layout.py rekey")
    parser.add_argument("key")
    parser.add_argument("new", nargs="?")
    parser.add_argument("--next", action="store_true")
    args = parser.parse_args(arguments)
    if args.next == (args.new is not None):
        raise UsageError("rekey <키> --next 또는 rekey <키> <새 키>")
    config = settings(root)
    new_key = next_key(root, config) if args.next else args.new
    check_key(new_key, config)
    return rekey(root, args.key, new_key, config)


def branch_check(root, arguments):
    if len(arguments) != 1:
        raise UsageError("branch-check <push ref 목록 파일>")
    errors, warnings = branch_messages(root, Path(arguments[0]).read_text(encoding="utf-8"))
    for message in warnings + errors:
        print(message, file=sys.stderr)
    return 1 if errors else 0


COMMANDS = {
    "scaffold": scaffold,
    "prerequisites": check_prerequisites,
    "board": board,
    "plans": check_plans,
    "freshness": freshness,
    "migrate": migrate,
    "rekey": rekey_command,
    "branch-check": branch_check,
}
#: 스스로 잠그는 명령(scaffold 는 안내 출력을 잠금 밖에서 한다)과 잠글 필요가 없는 명령.
SELF_LOCKED = ("scaffold", "branch-check")


def main(root, arguments):
    if not arguments or arguments[0] not in COMMANDS:
        print("usage: sdd-layout.py " + "|".join(COMMANDS) + " ...", file=sys.stderr)
        return 2
    name, rest = arguments[0], arguments[1:]
    try:
        if name in SELF_LOCKED:
            return COMMANDS[name](root, rest)
        with sdd_lock(root):
            return COMMANDS[name](root, rest)
    except UsageError as error:
        print(f"✖ {error}", file=sys.stderr)
        return 0 if name == "freshness" else 2
    except (KeyConflict, MigrateBlocked) as error:
        print(f"✖ {error}" if not str(error).startswith("✖") else str(error), file=sys.stderr)
        return 3
    except (OSError, ValueError) as error:
        print(f"✖ {error}", file=sys.stderr)
        return 0 if name == "freshness" else 1

