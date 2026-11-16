"""SDD scaffold·선행 조건·상태 검사·신선도 명령."""

import argparse
import os
import re
import sys
import time

from harness.sdd_board import update_boards
from harness.sdd_layout import (
    TYPES,
    atomic_write,
    feature_locations,
    plan_errors,
    prerequisites,
    resolve_feature,
    safe_path,
    sdd_lock,
    sort_key,
    spec_roots,
    stage_path,
    status_of,
    task_records,
    validate_token,
)


def parse_scaffold(arguments):
    parser = argparse.ArgumentParser(description="이슈별 SDD 생성. 이전 단계 승인 후 한 단계씩 생성한다.")
    parser.add_argument("slug")
    parser.add_argument("name")
    parser.add_argument("--stage", choices=("requirements", "design", "tasks"), default="requirements")
    parser.add_argument("--type", choices=TYPES, default="feat")
    parser.add_argument("--number", "--priority", dest="number")
    parser.add_argument("--legacy", action="store_true", help="신규 이슈를 기존 stage 폴더 구조로 생성")
    parser.add_argument("--all", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(arguments)
    validate_token(args.slug, "product-slug")
    validate_token(args.name, "이름/키")
    if args.all:
        raise ValueError("--all 은 단계 승인 게이트를 우회하므로 지원하지 않습니다")
    if args.number is not None and (not re.fullmatch(r"[0-9]+", args.number) or int(args.number) < 1):
        raise ValueError("--number must be a positive integer")
    return args


def requirement_key(root, spec, args):
    if re.match(r"^[0-9]+-", args.name) or any(args.name.startswith(f"{kind}-") for kind in TYPES):
        raise ValueError("이름에 번호나 종류를 직접 붙이지 마십시오. --number 와 --type 을 사용하십시오.")
    locations = feature_locations(root, spec)
    if any(key.endswith(f"-{args.name}") for key, _ in locations):
        raise ValueError(f"requirements already exists for {args.name}; continue with its full key")
    occupied = {sort_key(key)[0] for key, _ in locations if re.match(r"^[0-9]+-", key)}
    number = int(args.number) if args.number is not None else max(occupied, default=0) + 1
    if number in occupied:
        raise ValueError(f"number already in use: {number}")
    return f"{number}-{args.type}-{args.name}"


def scaffold_text(root, slug, key, stage, layout):
    template = safe_path(root, root / f".agents/docs/_spec-templates/{stage}/_template.md")
    body = template.read_text(encoding="utf-8")
    initial = "active" if stage == "tasks" else "draft"
    body = re.sub(r"^\|\s*상태\s*\|.*$", f"| 상태 | {initial} |", body, count=1, flags=re.MULTILINE)
    body = body.replace("{{PRODUCT_SLUG}}", slug).replace("{{FEATURE_NAME}}", key).replace("{{EPIC_ID}}", "미지정")
    if layout == "issue":
        for source, destination in (
            (f"../../requirements/{key}.md", "../requirements.md"),
            (f"../../design/{key}.md", "../design.md"),
            (f"../requirements/{key}.md", "requirements.md"),
            (f"../design/{key}.md", "design.md"),
            (f"../tasks/active/{key}.md", "tasks/active.md"),
        ):
            # tasks 문서의 ../requirements.md 를 두 번째 치환이 다시 바꾸지 않게 키가 포함된 경로만 바꾼다.
            body = body.replace(source, destination)
        if stage == "tasks":
            for state in ("active", "check", "completed", "superseded"):
                body = body.replace(f"`{state}/`", f"`{state}.md`")
    return body


def create_product_index(root, spec, slug, layout):
    index = safe_path(root, spec / "index.md")
    if not index.exists():
        template = safe_path(root, root / ".agents/docs/_spec-templates/index.md")
        body = template.read_text(encoding="utf-8").replace("{{PRODUCT_SLUG}}", slug)
        atomic_write(root, index, body)
    if layout == "legacy":
        readme = safe_path(root, spec / "tasks/README.md")
        if not readme.exists():
            template = safe_path(root, root / ".agents/docs/_spec-templates/tasks/README.md")
            atomic_write(root, readme, template.read_text(encoding="utf-8"))


def scaffold(root, arguments):
    args = parse_scaffold(arguments)
    spec = safe_path(root, root / f".agents/docs/{args.slug}-specs")
    with sdd_lock(root):
        if args.stage == "requirements":
            key = requirement_key(root, spec, args)
            layout = "legacy" if args.legacy else "issue"
        else:
            key, layout = resolve_feature(root, spec, args.name)
            prerequisites(root, spec, key, layout, args.stage)
        if args.stage == "tasks":
            for state in ("check", "completed", "superseded"):
                if safe_path(root, stage_path(spec, key, layout, "tasks", state)).is_file():
                    raise ValueError(f"task already in {state}; move the existing task document")
        destination = safe_path(root, stage_path(spec, key, layout, args.stage))
        if destination.exists():
            print(f"✔ 이미 있습니다: {destination.relative_to(root)} — 새로 만든 파일 없음")
        else:
            body = scaffold_text(root, args.slug, key, args.stage, layout)
            create_product_index(root, spec, args.slug, layout)
            atomic_write(root, destination, body)
            print(f"✔ 생성 완료: {destination.relative_to(root)}")
        update_boards(root, args.slug)
    next_steps = {
        "requirements": "/hx-specify → 사용자 승인 → /hx-plan",
        "design": "/hx-plan → 사용자 승인 → /hx-tasks",
        "tasks": "/hx-tasks → 계획 승인 → /hx-implement",
    }
    print(f"다음: {next_steps[args.stage]}")
    return 0


def check_prerequisites(root, arguments):
    parser = argparse.ArgumentParser()
    parser.add_argument("slug")
    parser.add_argument("feature")
    parser.add_argument("--stage", choices=("design", "tasks", "implement"), default="")
    args = parser.parse_args(arguments)
    validate_token(args.slug, "product-slug")
    spec = safe_path(root, root / f".agents/docs/{args.slug}-specs")
    key, layout = resolve_feature(root, spec, args.feature)
    base = spec / "issues" / key if layout == "issue" else spec
    print(f"BASE={base.relative_to(root)}")
    for stage in ("requirements", "design", "tasks"):
        print(f"{stage.upper()}={stage_path(spec, key, layout, stage).relative_to(root)}")
    prerequisites(root, spec, key, layout, args.stage)
    print(f"선행조건 OK (stage={args.stage})")
    return 0


def board(root, arguments):
    parser = argparse.ArgumentParser()
    parser.add_argument("slug", nargs="?")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(arguments)
    update_boards(root, args.slug, check=args.check)
    print("✔ 보드 정합성 확인 완료" if args.check else "✔ 보드 갱신 완료")
    return 0


def check_plans(root, arguments):
    if arguments:
        raise ValueError(f"unknown arguments: {arguments}")
    strict_legacy = (root / "scripts/check_harness.py").is_file()
    errors = plan_errors(root, strict_legacy=strict_legacy)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    update_boards(root, check=True)
    print("exec-plan(tasks) 상태 일관성 OK")
    return 0


def freshness(root, arguments):
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=int(os.environ.get("STALE_DAYS", "14")))
    args = parser.parse_args(arguments)
    if args.days < 0:
        raise ValueError("--days must be nonnegative")
    stale, markers, stuck = [], [], []
    threshold = time.time() - (args.days + 1) * 86400
    for spec in spec_roots(root):
        for key, layout in feature_locations(root, spec):
            for stage in ("requirements", "design"):
                path = safe_path(root, stage_path(spec, key, layout, stage))
                if path.is_file() and status_of(path) in ("draft", "in-review", "in review") and path.stat().st_mtime < threshold:
                    stale.append(path.relative_to(root).as_posix())
        for _, _, state, task in task_records(root, spec):
            if state == "active" and task.stat().st_mtime < threshold:
                stuck.append(task.relative_to(root).as_posix())
        for path in sorted(spec.rglob("*.md")):
            safe_path(root, path)
            if path.name == "_template.md":
                continue
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if "[NEEDS CLARIFICATION:" in line and "`[NEEDS CLARIFICATION" not in line:
                    markers.append(f"{path.relative_to(root)}:{number}:{line}")
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


def main(root, arguments):
    commands = {
        "scaffold": scaffold,
        "prerequisites": check_prerequisites,
        "board": board,
        "plans": check_plans,
        "freshness": freshness,
    }
    if not arguments or arguments[0] not in commands:
        print("usage: sdd-layout.py scaffold|prerequisites|board|plans|freshness ...", file=sys.stderr)
        return 2
    try:
        if arguments[0] == "scaffold":
            return scaffold(root, arguments[1:])
        with sdd_lock(root):
            return commands[arguments[0]](root, arguments[1:])
    except (OSError, ValueError) as error:
        print(f"✖ {error}", file=sys.stderr)
        return 0 if arguments[0] == "freshness" else 1
