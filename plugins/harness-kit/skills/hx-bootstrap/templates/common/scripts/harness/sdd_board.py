"""SDD 보드. `specs-index.md` 에 영역별 표(새 이슈 + 옛 이슈 `(옛)`)를, 옛 `<영역>-specs/index.md` 에 옛 형식 보드를 쓴다.

BOARD 마커 사이만 바꾼다. frontmatter 가 틀린 문서가 있으면 아무것도 쓰지 않고 ValueError 다(설계 01 §3.7.5).
"""

import re

from harness.sdd_frontmatter import TASK_STATES
from harness.sdd_issues import documents, issue_folders, label
from harness.sdd_keys import check_area, split_folder
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
    status_of,
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
WORDS = {"requirements": "요구", "design": "설계", "active": "구현", "check": "검증", "completed": "완료", "superseded": "폐기"}
BOARD_STATES = tuple(LABELS)
TABLE_HEAD = ["| 키 | 이름 | 종류 | req | design | tasks | 상태 |", "|---|---|---|---|---|---|---|"]


# ── 옛 구조 ────────────────────────────────────────────────────────────────
def feature_state(root, spec, key, layout):
    for state in reversed(STATES):
        if safe_path(root, stage_path(spec, key, layout, "tasks", state)).is_file():
            return state
    return "design" if safe_path(root, stage_path(spec, key, layout, "design")).is_file() else "requirements"


def legacy_features(root, spec):
    """옛 구조 (키, 구조) 목록. 두 구조에 같은 키가 있으면 ValueError."""
    seen, features = set(), []
    for key, layout in feature_locations(root, spec):
        if key in seen:
            raise ValueError(f"duplicate issue across layouts: {spec}/{key}")
        seen.add(key)
        features.append((key, layout))
    return features


def grouped_features(root, spec):
    groups = {state: [] for state in BOARD_STATES}
    for key, layout in legacy_features(root, spec):
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
    """옛 `<영역>-specs/index.md` 보드. 옛 이슈가 없으면(모두 옮겼으면) 옮긴 곳 한 줄이다."""
    slug = spec.name.removesuffix("-specs")
    locations = feature_locations(root, spec)
    if not locations:
        return wrap([f"> 이슈는 `.agents/docs/issues/`(area: {slug})로 옮겼다. 보드는 `.agents/docs/specs-index.md` 에 있다."])
    groups = grouped_features(root, spec)
    lines = [f"### 보드 — `{slug}`", "", header(groups), ""]
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


def legacy_rows(root, spec):
    rows = []
    for key, layout in legacy_features(root, spec):
        number, kind, name = key_parts(key)
        statuses = []
        for stage in ("requirements", "design"):
            path = safe_path(root, stage_path(spec, key, layout, stage))
            statuses.append((status_of(path) or "—") if path.is_file() else "—")
        state = feature_state(root, spec, key, layout)
        tasks = state if state in TASK_STATES else "—"
        rows.append((state, f"| {number} (옛) | {name} | {kind} | {statuses[0]} | {statuses[1]} | {tasks} | {WORDS[state]} |"))
    return rows


# ── 새 구조 ────────────────────────────────────────────────────────────────
def issue_row(root, folder):
    """(영역, 상태, 표 행). 문서가 하나도 없는 폴더는 None."""
    parts = split_folder(folder.name)
    if not parts:
        raise ValueError(f"invalid issue folder: {label(root, folder)}")
    docs = documents(root, folder)
    present = [fields for fields in (docs["requirements"], docs["design"], docs["tasks"]) if fields is not None]
    if not present:
        return None
    area, kind = present[0].get("area"), present[0].get("type", "—")
    if not area:
        raise ValueError(f"invalid frontmatter: {label(root, folder)}: area 가 없다")
    tasks = docs["tasks"].get("state", "") if docs["tasks"] is not None else None
    if tasks is not None and tasks not in TASK_STATES:
        raise ValueError(f"invalid frontmatter: {label(root, folder / 'tasks.md')}: state {tasks!r}")
    state = tasks or ("design" if docs["design"] is not None else "requirements")
    cells = [(docs[stage] or {}).get("status", "—") if docs[stage] is not None else "—" for stage in ("requirements", "design")]
    row = f"| {parts[0]} | {parts[1]} | {kind} | {cells[0]} | {cells[1]} | {tasks or '—'} | {WORDS[state]} |"
    return area, state, row


def area_tables(root, specs=None):
    """영역 → {"new": [(상태, 행)], "old": [(상태, 행)]}. 보드와 migrate 개수 비교가 같이 쓴다."""
    areas = {}
    for folder in issue_folders(root):
        entry = issue_row(root, folder)
        if entry:
            areas.setdefault(entry[0], {"new": [], "old": []})["new"].append(entry[1:])
    for spec in spec_roots(root) if specs is None else specs:
        rows = legacy_rows(root, spec)
        if rows:
            areas.setdefault(spec.name.removesuffix("-specs"), {"new": [], "old": []})["old"].extend(rows)
    return dict(sorted(areas.items()))


def area_counts(root):
    """영역 → 상태별 개수(새 + 옛)."""
    return {
        area: {state: sum(1 for entry in tables["new"] + tables["old"] if entry[0] == state) for state in BOARD_STATES}
        for area, tables in area_tables(root).items()
    }


def area_section(area, tables):
    return [f"### {area} (새 {len(tables['new'])} · 옛 {len(tables['old'])})", "", *TABLE_HEAD, *(row for _, row in tables["new"] + tables["old"])]


def render_index(root, specs):
    areas = area_tables(root, specs)
    totals = dict.fromkeys(BOARD_STATES, 0)
    for tables in areas.values():
        for state, _ in tables["new"] + tables["old"]:
            totals[state] += 1
    lines = ["## 이슈 보드", "", "전체 — " + " · ".join(f"{WORDS[state]} {totals[state]}" for state in BOARD_STATES), ""]
    if not areas:
        lines.append("> 아직 이슈가 없다. `scripts/new-feature.sh --next <이름> --area <영역>` 으로 시작한다.")
        return wrap(lines)
    for area, tables in areas.items():
        lines.extend([*area_section(area, tables), ""])
    lines.append("> 상태는 문서 머리(frontmatter)의 `status` · `state` 에서 계산한다. 표를 고치지 말고 `bash scripts/board.sh` 를 실행한다.")
    return wrap(lines)


def board_json(root):
    """보드와 같은 계산의 이슈 목록(`board.sh --json`, 관리 페이지 진행 탭 · 설계 06 §3.2). 새 이슈 다음 옛 이슈 순서다."""
    items = []
    for folder in issue_folders(root):
        entry = issue_row(root, folder)
        if not entry:
            continue
        parts = split_folder(folder.name)
        docs = documents(root, folder)
        present = [fields for fields in (docs["requirements"], docs["design"], docs["tasks"]) if fields is not None]
        items.append({
            "key": parts[0], "name": parts[1], "folder": label(root, folder), "area": entry[0], "type": present[0].get("type"),
            "requirements": (docs["requirements"] or {}).get("status"), "design": (docs["design"] or {}).get("status"),
            "tasks": (docs["tasks"] or {}).get("state") if docs["tasks"] is not None else None, "state": entry[1], "legacy": False,
        })
    for spec in spec_roots(root):
        area = spec.name.removesuffix("-specs")
        for key, layout in legacy_features(root, spec):
            number, kind, name = key_parts(key)
            statuses = []
            for stage in ("requirements", "design"):
                path = safe_path(root, stage_path(spec, key, layout, stage))
                statuses.append(status_of(path) if path.is_file() else None)
            state = feature_state(root, spec, key, layout)
            items.append({
                "key": key, "name": name, "folder": label(root, spec), "area": area, "type": kind, "requirements": statuses[0],
                "design": statuses[1], "tasks": state if state in TASK_STATES else None, "state": state, "legacy": True, "number": number,
            })
    return {"schema": "harness-kit.board/v1", "issues": items}


def render_area(root, area):
    check_area(area)
    areas = area_tables(root)
    if area not in areas:
        raise ValueError(f"없는 영역: {area} (있는 영역: {', '.join(areas) or '없음'})")
    return "\n".join(area_section(area, areas[area])) + "\n"


# ── 쓰기 ──────────────────────────────────────────────────────────────────
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
        plans.append((index, render_index(root, specs)))
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
