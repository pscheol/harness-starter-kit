"""두 SDD 구조를 읽고 BOARD 마커 사이만 갱신한다."""

import re

from harness.sdd_layout import (
    STATES,
    atomic_write,
    feature_locations,
    file_snapshot,
    files_at,
    key_parts,
    safe_path,
    spec_roots,
    stage_path,
    validate_token,
)

LABELS = {
    "requirements": "📋 요구",
    "design": "🎨 설계",
    "active": "🔨 구현",
    "check": "👀 검증",
    "completed": "✅ 완료",
    "superseded": "⛔ 폐기",
}
BOARD_STATES = tuple(LABELS)


def feature_state(root, spec, key, layout):
    for state in reversed(STATES):
        if safe_path(root, stage_path(spec, key, layout, "tasks", state)).is_file():
            return state
    return "design" if safe_path(root, stage_path(spec, key, layout, "design")).is_file() else "requirements"


def grouped_features(root, spec):
    groups = {state: [] for state in BOARD_STATES}
    seen = set()
    for key, layout in feature_locations(root, spec):
        if key in seen:
            raise ValueError(f"duplicate issue across layouts: {spec}/{key}")
        seen.add(key)
        groups[feature_state(root, spec, key, layout)].append(key)
    return groups


def header(groups):
    return "\n".join(
        [
            "| " + " | ".join(f"{LABELS[state]} ({len(groups[state])})" for state in BOARD_STATES) + " |",
            "|---|---|---|---|---|---|",
            "| " + " | ".join("<br>".join(groups[state]) or "—" for state in BOARD_STATES) + " |",
        ]
    )


def wrap(lines):
    return (
        "\n".join(
            [
                "<!-- BOARD:BEGIN — scripts/board.sh 가 생성합니다. 손으로 고치지 마십시오. -->",
                "",
                *lines,
                "",
                "<!-- BOARD:END -->",
            ]
        )
        + "\n"
    )


def render_board(root, spec):
    slug = spec.name.removesuffix("-specs")
    groups = grouped_features(root, spec)
    lines = [f"### 보드 — `{slug}`", "", header(groups), ""]
    locations = feature_locations(root, spec)
    if not locations:
        lines.append(f"> 아직 기능이 없습니다. `scripts/new-feature.sh {slug} <feature>` 로 시작하십시오.")
        return wrap(lines)
    lines.extend(["| 순번 | 종류 | 이름 | req | 체크리스트 | design | 상태 |", "|---|---|---|---|---|---|---|"])
    for key, layout in locations:
        number, kind, name = key_parts(key)
        requirement = "☑" if stage_path(spec, key, layout, "requirements").is_file() else "☐"
        design = "☑" if stage_path(spec, key, layout, "design").is_file() else "☐"
        checklist_dir = spec / "issues" / key / "checklists" if layout == "issue" else spec / "checklists"
        checklist_pattern = "*.md" if layout == "issue" else f"{key}-*.md"
        checklist_count = len(files_at(root, checklist_dir, checklist_pattern))
        checklist = str(checklist_count) if checklist_count else "─"
        state = LABELS[feature_state(root, spec, key, layout)]
        lines.append(f"| {number} | `{kind}` | `{name}` | {requirement} | {checklist} | {design} | {state} |")
    lines.extend(
        [
            "",
            "> 상태는 **파일 위치**에서 계산합니다(`tasks/active` → `check` → `completed`, 대체된 작업은 `superseded`).",
            "> 표를 고치지 마시고 파일을 옮기신 뒤 `bash scripts/board.sh` 를 실행하십시오.",
            "> `completed` 가 곧 e2e 동작을 뜻하지는 않습니다 — 계약·골격만 끝난 상태일 수 있습니다.",
        ]
    )
    return wrap(lines)


def render_global(root, specs):
    groups = {state: [] for state in BOARD_STATES}
    rows = []
    for spec in specs:
        slug = spec.name.removesuffix("-specs")
        local = grouped_features(root, spec)
        counts = [len(local[state]) for state in BOARD_STATES]
        for state in BOARD_STATES:
            groups[state].extend(f"{slug}/{key}" for key in local[state])
        rows.append(f"| [`{slug}`]({slug}-specs/index.md) | " + " | ".join(map(str, [*counts, sum(counts)])) + " |")
    lines = ["## 전체 보드 (전 제품)", "", header(groups), ""]
    if not specs:
        lines.append("> 아직 제품이 없습니다. `scripts/new-feature.sh <slug> <feature>` 로 시작하십시오.")
    else:
        lines.extend(
            [
                "| 제품 | 📋 요구 | 🎨 설계 | 🔨 구현 | 👀 검증 | ✅ 완료 | ⛔ 폐기 | 합계 |",
                "|---|---|---|---|---|---|---|---|",
                *rows,
                "",
                "> 항목 표기는 `<제품>/<순번>-<feature>` 입니다. 제품별 상세는 각 `index.md` 보드를 보십시오.",
                "> 상태는 **파일 위치**에서 계산합니다 — 표를 고치지 마시고 `bash scripts/board.sh` 를 실행하십시오.",
            ]
        )
    return wrap(lines)


def replaced_body(before, board):
    begin = before.count("<!-- BOARD:BEGIN")
    end = before.count("<!-- BOARD:END -->")
    if begin != end or begin > 1:
        raise ValueError("invalid BOARD markers; preserve the existing index and repair its markers")
    if begin:
        return re.sub(r"<!-- BOARD:BEGIN[^\n]*\n.*?<!-- BOARD:END -->\n?", lambda _: board, before, flags=re.DOTALL)
    return before.rstrip("\n") + "\n\n" + board


def update_boards(root, target=None, check=False):
    if target:
        validate_token(target, "product-slug")
    specs = spec_roots(root)
    chosen = [spec for spec in specs if not target or spec.name == f"{target}-specs"]
    if target and not chosen:
        raise ValueError(f"missing product folder: {target}-specs")
    plans = []
    for spec in chosen:
        index = safe_path(root, spec / "index.md")
        if index.is_file():
            plans.append((index, render_board(root, spec)))
    index = safe_path(root, root / ".agents/docs/specs-index.md")
    if index.is_file():
        plans.append((index, render_global(root, specs)))
    changed = []
    for index, board in plans:
        expected = file_snapshot(root, index)
        before = expected[0].decode("utf-8")
        after = replaced_body(before, board)
        if before != after:
            changed.append(index)
            if not check:
                atomic_write(root, index, after, replace=True, expected=expected)
    if check and changed:
        raise ValueError("보드가 실제 파일 상태와 다릅니다. bash scripts/board.sh 로 갱신하십시오: " + ", ".join(map(str, changed)))
    return changed
