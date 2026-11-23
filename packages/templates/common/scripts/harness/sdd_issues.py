"""새 구조 `.agents/docs/issues/<키>-<이름>/` 의 문서 찾기 · 상태 · 선행 조건 · 상태 검사 · 본문 만들기(설계 01 §3.7.4 · §3.7.5)."""

import datetime
import re

from harness.sdd_frontmatter import STATUSES, TASK_STATES, TYPES, parse, render, strip
from harness.sdd_keys import AREA, ISSUES, folder_problems, is_key, split_folder
from harness.sdd_layout import legacy_plan_errors, safe_path

STAGES = ("requirements", "design", "tasks")
TASK_ID = re.compile(r"^- \[[ xX]\] (T[0-9]+)\b", re.MULTILINE)
STATUS_ROW = re.compile(r"^\|\s*상태\s*\|.*\n", re.MULTILINE)
#: 옛 템플릿이 남아 있는 리포에서도 연계 경로를 같은 폴더로 맞춘다.
LEGACY_LINKS = (
    ("../../requirements/{{FEATURE_NAME}}.md", "requirements.md"),
    ("../../design/{{FEATURE_NAME}}.md", "design.md"),
    ("../requirements/{{FEATURE_NAME}}.md", "requirements.md"),
    ("../design/{{FEATURE_NAME}}.md", "design.md"),
    ("../tasks/active/{{FEATURE_NAME}}.md", "tasks.md"),
)


def issues_dir(root):
    return safe_path(root, root / ISSUES)


def issue_folders(root):
    """이슈 폴더 목록(키 번호순). 심볼릭 링크는 거부한다."""
    issues = issues_dir(root)
    if not issues.is_dir():
        return []
    folders = []
    for path in issues.iterdir():
        safe_path(root, path)
        if path.is_dir() and not path.name.startswith(("_", ".")):
            folders.append(path)
    return sorted(folders, key=folder_sort_key)


def folder_sort_key(path):
    parts = split_folder(path.name)
    if not parts:
        return ("~", 0, path.name)
    prefix, number = parts[0].rsplit("-", 1)
    return (prefix, int(number), path.name)


def label(root, path):
    return path.relative_to(root).as_posix()


def read_doc(root, path):
    """문서 머리. 파일이 없으면 None. 머리가 없거나 형식이 틀리면 ValueError."""
    safe_path(root, path)
    if not path.is_file():
        return None
    try:
        fields = parse(path.read_text(encoding="utf-8"))
    except ValueError as error:
        raise ValueError(f"invalid frontmatter: {label(root, path)}: {error}") from error
    if fields is None:
        raise ValueError(f"invalid frontmatter: {label(root, path)}: 문서 머리(---)가 없다")
    return fields


def state_field(stage):
    return "state" if stage == "tasks" else "status"


def documents(root, folder):
    return {stage: read_doc(root, folder / f"{stage}.md") for stage in STAGES}


def find_issue(root, ident):
    """키 또는 `<키>-<이름>` 으로 폴더를 찾는다. 0개 · 2개 이상이면 ValueError."""
    parts = split_folder(ident)
    key = ident if is_key(ident) else (parts[0] if parts and is_key(parts[0]) else None)
    if key is None:
        raise ValueError(f"이슈 키 형식이 아니다: {ident!r}")
    folders = [folder for folder in issue_folders(root) if (split_folder(folder.name) or ("",))[0] == key]
    if ident != key:
        folders = [folder for folder in folders if folder.name == ident]
    if not folders:
        raise ValueError(f"이슈 폴더가 없다: {ISSUES}/{ident if ident != key else key + '-*'} — 먼저 requirements 를 만든다")
    if len(folders) > 1:
        raise ValueError(f"같은 키의 이슈 폴더가 둘 이상이다: {', '.join(folder.name for folder in folders)}")
    return folders[0]


def prerequisites(root, folder, stage):
    """앞 단계 승인 확인(R7.4). 상태의 원본은 frontmatter 다."""
    expected = [("requirements", "approved")]
    if stage in ("tasks", "implement"):
        expected.append(("design", "approved"))
    if stage == "implement":
        expected.append(("tasks", "active"))
    for document, value in expected:
        path = folder / f"{document}.md"
        fields = read_doc(root, path)
        if fields is None:
            raise ValueError(f"missing {document}: {label(root, path)}")
        field = state_field(document)
        if stage and fields.get(field, "") != value:
            raise ValueError(f"{document} must have {field} '{value}', found '{fields.get(field, '')}': {label(root, path)}")


def field_errors(name, stage, fields, key):
    errors = []
    field = state_field(stage)
    for required in ("key", "area", "type", field):
        if not fields.get(required):
            errors.append(f"{name}: frontmatter needs {required}")
    if fields.get("key") and fields["key"] != key:
        errors.append(f"{name}: key {fields['key']} does not match folder key {key}")
    if fields.get("type") and fields["type"] not in TYPES:
        errors.append(f"{name}: unknown type {fields['type']!r}")
    if fields.get("area") and not AREA.fullmatch(fields["area"]):
        errors.append(f"{name}: invalid area {fields['area']!r}")
    allowed = TASK_STATES if stage == "tasks" else STATUSES
    if fields.get(field) and fields[field] not in allowed:
        errors.append(f"{name}: unknown {field} {fields[field]!r} (allowed: {', '.join(allowed)})")
    return errors


def task_errors(root, folder, docs):
    path = folder / "tasks.md"
    name = label(root, path)
    errors = [f"{name}: missing {stage}" for stage in ("requirements", "design") if docs[stage] is None]
    ids = TASK_ID.findall(path.read_text(encoding="utf-8"))
    if not ids:
        errors.append(f"{name}: missing numbered tasks")
    if len(ids) != len(set(ids)):
        errors.append(f"{name}: duplicate task ID")
    state = docs["tasks"].get("state")
    if state in ("check", "completed") and re.search(r"^- \[ \]", path.read_text(encoding="utf-8"), re.MULTILINE):
        errors.append(f"{name}: unchecked task in {state}")
    return errors


def folder_errors(root, folder):
    problems = folder_problems(folder.name)
    if problems:
        return problems
    key = split_folder(folder.name)[0]
    try:
        docs = documents(root, folder)
    except ValueError as error:
        return [str(error)]
    if docs["requirements"] is None:
        return [f"{label(root, folder)}: missing requirements"]
    errors = []
    for stage, fields in docs.items():
        if fields is not None:
            errors += field_errors(label(root, folder / f"{stage}.md"), stage, fields, key)
    present = [fields for fields in docs.values() if fields is not None]
    for shared in ("area", "type"):
        values = {fields.get(shared) for fields in present if fields.get(shared)}
        if len(values) > 1:
            errors.append(f"{label(root, folder)}: {shared} differs between documents: {', '.join(sorted(values))}")
    if docs["tasks"] is not None:
        errors += task_errors(root, folder, docs)
    return errors


def issue_errors(root):
    """새 구조 상태 검사(fast). 같은 키 두 폴더 · 폴더 이름 · 머리 · 단계 · 작업 ID."""
    errors, seen = [], {}
    try:
        for folder in issue_folders(root):
            parts = split_folder(folder.name)
            if parts and parts[0] in seen:
                errors.append(f"{ISSUES}: duplicate key {parts[0]} in {seen[parts[0]]} and {folder.name}")
            if parts:
                seen.setdefault(parts[0], folder.name)
            errors += folder_errors(root, folder)
    except (ValueError, OSError) as error:
        errors.append(str(error))
    return errors


def plan_errors(root, strict_legacy=True):
    return issue_errors(root) + legacy_plan_errors(root, strict_legacy=strict_legacy)


def jira_link(root, key):
    """`.agents/issue-tracker.yml` 의 baseUrl 이 정해져 있으면 `<baseUrl>/browse/<키>`."""
    path = root / ".agents/issue-tracker.yml"
    try:
        match = re.search(r"^baseUrl:\s*(\S+)", path.read_text(encoding="utf-8"), re.MULTILINE)
    except OSError:
        return None
    if not match or match[1] in ("TBD", '""', "''") or not match[1].startswith(("http://", "https://")):
        return None
    return f"{match[1].rstrip('/')}/browse/{key}"


def render_doc(root, stage, folder_name, fields):
    """템플릿 머리를 떼고 실제 값으로 새 머리를 쓴다. 옛 템플릿의 상태 행 · 연계 경로도 정리한다."""
    template = safe_path(root, root / f".agents/docs/_spec-templates/{stage}/_template.md")
    body = strip(template.read_text(encoding="utf-8"))
    body = STATUS_ROW.sub("", body, count=1)
    for source, destination in LEGACY_LINKS:
        body = body.replace(source, destination)
    epic = fields.get("key") if fields.get("jira") else "미지정"
    body = body.replace("{{FEATURE_NAME}}", folder_name).replace("{{PRODUCT_SLUG}}", fields["area"]).replace("{{EPIC_ID}}", epic)
    return render(fields) + body


def today():
    return datetime.date.today().isoformat()
