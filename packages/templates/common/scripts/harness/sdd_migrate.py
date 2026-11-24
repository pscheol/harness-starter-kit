"""옛 구조를 새 이슈 폴더로 옮기기(`migrate`)와 키 바꾸기(`rekey`) — 설계 01 §3.7.6 · §3.7.3.

dry-run 은 `.agents/state/migrate-map.json` 만 쓴다. apply 는 지도대로 `git mv` 하고 머리를 넣고 링크를 고친 뒤,
영역별 상태 개수가 dry-run 때와 다르면 `.agents/docs` 를 HEAD 로 되돌린다. 커밋하지 않는다.
"""

import datetime
import json
import os
import re
import shutil
from dataclasses import replace
from pathlib import Path

from harness.sdd_board import area_counts, update_boards
from harness.sdd_frontmatter import STATUSES, TYPES, parse, render, update
from harness.sdd_issues import STATUS_ROW as ROW_LINE
from harness.sdd_issues import find_issue, today
from harness.sdd_keys import (
    AREA,
    ISSUES,
    PREFIX,
    KeyConflict,
    UsageError,
    git,
    git_lines,
    has_ref,
    in_repo,
    is_key,
    name_problems,
    settings,
    split_folder,
    used_numbers,
    work_folders,
)
from harness.sdd_layout import STATES, STATUS_ROW, files_at, safe_path, sort_key, spec_roots

SCHEMA = "knots-sync.migrate-map/v1"
MAP = ".agents/state/migrate-map.json"
DOCS = ".agents/docs"
LEGACY_FOLDER = re.compile(r"^([0-9]+)-([a-z]+)-(.+)$")
STATUS_WORD = re.compile(r"\b(draft|in[- ]review|approved|superseded)\b", re.IGNORECASE)
LINK = re.compile(r"(\[[^\]]*\]\()([^)\s]+)((?:\s+\"[^\"]*\")?\))")


class MigrateBlocked(ValueError):
    """지도 검사 실패. 아무것도 옮기지 않는다. exit 3."""


def rel(root, path):
    return path.relative_to(root).as_posix()


# ── dry-run ──────────────────────────────────────────────────────────────────
def legacy_status(path):
    match = STATUS_ROW.search(path.read_text(encoding="utf-8"))
    word = STATUS_WORD.search(match[1]) if match else None
    return word[1].lower().replace(" ", "-") if word else ""


def suggest_slug(raw, area):
    """slug 규칙(§3.7.2)에 맞춘 이름. 맞으면 그대로다."""
    if not name_problems(raw):
        return raw
    words = [word for word in re.sub(r"[^a-z0-9]+", "-", raw.lower()).split("-") if word]
    if len(words) < 2 or words[0] in TYPES or words[0][0].isdigit():
        words = [word for word in area.split("-") if word] + words
    words = words[:5]
    while len(words) > 2 and len("-".join(words)) > 40:
        words = words[:-1]
    return "-".join(words)[:40].strip("-")


def issue_files(root, folder, warnings):
    files, tasks = [], folder / "tasks"
    for path in sorted(folder.iterdir()):
        safe_path(root, path)
        if path.name == "tasks" and path.is_dir():
            continue
        entry = {"from": path.name + ("/" if path.is_dir() else ""), "to": path.name + ("/" if path.is_dir() else "")}
        if path.name in ("requirements.md", "design.md") and path.is_file():
            entry["status"] = legacy_status(path)
        files.append(entry)
    if tasks.is_dir():
        found = [state for state in reversed(STATES) if (tasks / f"{state}.md").is_file()]
        for path in sorted(tasks.iterdir()):
            safe_path(root, path)
            name = path.name + ("/" if path.is_dir() else "")
            if found and path.name == f"{found[0]}.md":
                files.append({"from": f"tasks/{name}", "to": "tasks.md", "state": found[0]})
            else:
                files.append({"from": f"tasks/{name}", "to": f"tasks/{name}"})
        if len(found) > 1:
            warnings.append({"item": rel(root, folder), "code": "tasks", "detail": f"상태 파일 {len(found)}개 — {found[0]} 만 tasks.md 로 옮긴다"})
    return files


def stage_files(root, spec, key):
    files = []
    for stage in ("requirements", "design"):
        path = spec / stage / f"{key}.md"
        if safe_path(root, path).is_file():
            files.append({"from": f"{stage}/{key}.md", "to": f"{stage}.md", "status": legacy_status(path)})
    for state in reversed(STATES):
        path = spec / "tasks" / state / f"{key}.md"
        if safe_path(root, path).is_file():
            files.append({"from": f"tasks/{state}/{key}.md", "to": "tasks.md", "state": state})
            break
    for path in files_at(root, spec / "checklists", f"{key}-*.md"):
        files.append({"from": f"checklists/{path.name}", "to": f"checklists/{path.name.removeprefix(key + '-')}"})
    return files


def stage_keys(root, spec):
    keys = set()
    for stage in ("requirements", "design", *(f"tasks/{state}" for state in STATES)):
        keys |= {path.stem for path in files_at(root, spec / stage, "*.md")}
    return sorted(keys, key=sort_key)


def new_item(root, area, source, layout, key_text, files, warnings):
    match = LEGACY_FOLDER.fullmatch(key_text)
    number, kind, raw = (int(match[1]), match[2], match[3]) if match else (None, "", key_text)
    if kind not in TYPES:
        warnings.append({"item": rel(root, source), "code": "type", "detail": f"종류 {kind!r} 를 몰라 feat 로 둔다"})
        kind = "feat"
    slug = suggest_slug(raw, area)
    if slug != raw:
        warnings.append({"item": rel(root, source) + ("" if layout == "issue" else f"/{key_text}"), "code": "slug", "from": raw, "suggest": slug})
    return {"action": "move", "from": rel(root, source), "layout": layout, "area": area, "type": kind, "oldNumber": number, "key": None, "slug": slug, "to": None, "files": files}


def dirty(root, paths):
    lines = git_lines(root, "status", "--porcelain", "--", *paths)
    return bool(lines)


def scan(root, include_legacy, areas):
    items, warnings, scanned = [], [], 0
    for spec in spec_roots(root):
        area = spec.name.removesuffix("-specs")
        if areas and area not in areas:
            continue
        scanned += 1
        issue_names = set()
        issues = safe_path(root, spec / "issues")
        for folder in sorted(issues.iterdir()) if issues.is_dir() else []:
            safe_path(root, folder)
            if not folder.is_dir() or folder.name.startswith("_"):
                continue
            issue_names.add(folder.name)
            item = new_item(root, area, folder, "issue", folder.name, issue_files(root, folder, warnings), warnings)
            if dirty(root, [item["from"]]):
                warnings.append({"item": item["from"], "code": "dirty"})
            items.append(item)
        for key in stage_keys(root, spec) if include_legacy else []:
            files = stage_files(root, spec, key)
            if key in issue_names:
                warnings.append({"item": f"{rel(root, spec)}/{key}", "code": "duplicate"})
            item = new_item(root, area, spec, "stage", key, files, warnings)
            if dirty(root, [f"{item['from']}/{entry['from']}" for entry in files]):
                warnings.append({"item": f"{item['from']}/{key}", "code": "dirty"})
            items.append(item)
    return items, warnings, scanned


def write_json(root, path, data):
    safe_path(root, path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def dry_run(root, include_legacy, prefix, start, areas):
    config = settings(root)
    if prefix:
        if not PREFIX.fullmatch(prefix):
            raise UsageError(f"--prefix 형식이 아니다: {prefix!r}")
        config = replace(config, prefix=prefix)
    items, warnings, scanned = scan(root, include_legacy, areas)
    first = start if start is not None else max(used_numbers(root, config), default=0) + 1
    items.sort(key=lambda item: (item["area"], item["oldNumber"] if item["oldNumber"] is not None else 10**9, item["slug"]))
    for index, item in enumerate(items):
        item["key"] = f"{config.prefix}-{first + index}"
        item["to"] = f"{ISSUES}/{item['key']}-{item['slug']}"
    base_ref = f"origin/{config.base}"
    sha = git_lines(root, "rev-parse", base_ref) if has_ref(root, base_ref) else None
    data = {
        "schema": SCHEMA,
        "createdAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "base": {"ref": base_ref, "sha": sha[0] if sha else None},
        "issueKey": {"source": config.source, "prefix": config.prefix},
        "counts": {"areas": scanned, "items": len(items), "legacyItems": sum(1 for item in items if item["layout"] == "stage")},
        "items": items,
        "boardBefore": area_counts(root),
        "warnings": warnings,
    }
    path = root / MAP
    write_json(root, path, data)
    print(f"✔ 지도: {MAP} — 영역 {scanned}, 항목 {len(items)}, 경고 {len(warnings)}. 파일은 옮기지 않았다.")
    for warning in warnings:
        print(f"  ⚠ {warning['code']}: {warning['item']}" + (f" → {warning['suggest']}" if warning.get("suggest") else ""))
    print(f"  다음: 지도를 확인 · 수정한 뒤 python3 scripts/sdd-layout.py migrate --apply --map {MAP} --rewrite-links")
    return 0


# ── apply ────────────────────────────────────────────────────────────────────
def validate(root, data):
    if not in_repo(root):
        return ["git 리포가 아니다 — migrate 는 git mv 로 옮긴다"]
    if data.get("schema") != SCHEMA or not isinstance(data.get("items"), list):
        return [f"지도 schema 가 {SCHEMA} 가 아니다"]
    problems, keys = [], {}
    taken = {split_folder(name)[0] for name in work_folders(root) if split_folder(name)}
    for item in (entry for entry in data["items"] if entry.get("action") == "move"):
        source, key, slug = item.get("from", ""), item.get("key"), item.get("slug", "")
        if not is_key(key):
            problems.append(f"{source}: key 형식이 아니다: {key!r}")
        problems += [f"{source}: slug {slug!r}: {problem}" for problem in name_problems(slug)]
        if item.get("to") != f"{ISSUES}/{key}-{slug}":
            problems.append(f"{source}: to 는 {ISSUES}/{key}-{slug} 여야 한다: {item.get('to')!r}")
        if key in keys:
            problems.append(f"{source}: duplicate key {key} ({keys[key]})")
        keys.setdefault(key, source)
        if key in taken:
            problems.append(f"{source}: key {key} 는 {ISSUES}/ 에 이미 있다")
        if not AREA.fullmatch(item.get("area") or "") or item.get("type") not in TYPES:
            problems.append(f"{source}: area · type 형식이 아니다")
        if (root / str(item.get("to"))).exists():
            problems.append(f"{source}: 대상이 이미 있다: {item.get('to')}")
        missing = [entry["from"] for entry in item.get("files", []) if not (root / source / entry["from"].rstrip("/")).exists()]
        if not (root / source).exists() or missing:
            problems.append(f"{source}: 옮길 파일이 없다: {', '.join(missing) or source}")
    if dirty(root, [DOCS]):
        problems.append(f"{DOCS} 에 커밋 안 된 변경이 있다 — 커밋하거나 되돌린 뒤 다시 한다")
    return problems


def git_mv(root, source, target):
    safe_path(root, target)
    target.parent.mkdir(parents=True, exist_ok=True)
    result = git(root, "mv", rel(root, source), rel(root, target))
    if not result or result.returncode != 0:
        raise ValueError(f"git mv {rel(root, source)} → {rel(root, target)} 실패: {result.stderr.strip() if result else 'git 없음'}")


def remove_empty(path, stop):
    while path != stop and path.is_dir() and not any(path.iterdir()):
        path.rmdir()
        path = path.parent


def move_item(root, item, moved):
    source, target = root / item["from"], root / item["to"]
    for entry in item["files"]:
        old, new = source / entry["from"].rstrip("/"), target / entry["to"].rstrip("/")
        git_mv(root, old, new)
        moved[rel(root, old)] = rel(root, new)
        if old.parent != source:
            remove_empty(old.parent, source)
    if item["layout"] == "issue":
        for rest in sorted(source.iterdir()) if source.is_dir() else []:
            if (target / rest.name).exists():
                continue
            git_mv(root, rest, target / rest.name)
            moved[rel(root, rest)] = rel(root, target / rest.name)
        moved[item["from"]] = item["to"]
        remove_empty(source, source.parent)


def heading_fix(text, old, new):
    return re.sub(rf"(?m)^(# [^\n]*?){re.escape(old)}", lambda match: match[1] + new, text, count=1)


def add_frontmatter(root, item):
    target = root / item["to"]
    for entry in item["files"]:
        if entry["to"] not in ("requirements.md", "design.md", "tasks.md"):
            continue
        path = target / entry["to"]
        text = path.read_text(encoding="utf-8")
        field = "state" if entry["to"] == "tasks.md" else "status"
        value = entry.get(field) or (legacy_status(path) if field == "status" else "active")
        if field == "status" and value not in STATUSES:
            value = "draft"
        legacy = item["from"] if item["layout"] == "issue" else f"{item['from']}/{entry['from']}"
        fields = {
            "key": item["key"],
            "area": item["area"],
            "type": item["type"],
            "title": item["slug"],
            field: value,
            "legacy": legacy.removeprefix(f"{DOCS}/"),
            "created": today(),
        }
        body = ROW_LINE.sub("", text, count=1)
        old_name = Path(item["from"]).name if item["layout"] == "issue" else Path(entry["from"]).stem
        body = heading_fix(body, old_name, Path(item["to"]).name)
        try:
            existing = parse(body)
        except ValueError:
            existing = None
        path.write_text(update(body, fields) if existing is not None else render(fields) + body, encoding="utf-8")


def mapped(moved, path):
    if path in moved:
        return moved[path]
    for old in sorted(moved, key=len, reverse=True):
        if path.startswith(old + "/"):
            return moved[old] + path[len(old) :]
    return None


def rewrite(text, old_dir, new_dir, moved, rebase):
    """마크다운 상대 링크를 새 위치 기준으로. rebase 면 옮기지 않은 대상도 새 위치에서 다시 계산한다."""
    changed = False

    def replace_link(match):
        nonlocal changed
        target = match[2]
        if target.startswith(("#", "/", "<")) or re.match(r"^[a-z][a-z0-9+.-]*:", target):
            return match[0]
        path, _, anchor = target.partition("#")
        resolved = os.path.normpath(os.path.join(old_dir, path))
        if resolved.startswith(".."):
            return match[0]
        destination = mapped(moved, resolved) or (resolved if rebase else None)
        if destination is None:
            return match[0]
        changed = True
        return match[1] + os.path.relpath(destination, new_dir) + (f"#{anchor}" if anchor else "") + match[3]

    return LINK.sub(replace_link, text), changed


def rewrite_links(root, moved, everywhere):
    """옮긴 문서의 링크는 항상, `.agents/docs` 의 다른 문서는 everywhere 일 때 고친다. 고치지 않은 곳은 목록으로 낸다."""
    new_files = {new: old for old, new in moved.items() if new.endswith(".md")}
    for new, old in new_files.items():
        path = root / new
        text, changed = rewrite(path.read_text(encoding="utf-8"), os.path.dirname(old), os.path.dirname(new), moved, True)
        if changed:
            path.write_text(text, encoding="utf-8")
    pending = []
    for path in sorted((root / DOCS).rglob("*.md")):
        name = rel(root, path)
        if name in new_files or "_spec-templates" in path.parts:
            continue
        directory = os.path.dirname(name)
        text, changed = rewrite(path.read_text(encoding="utf-8"), directory, directory, moved, False)
        if changed and everywhere:
            path.write_text(text, encoding="utf-8")
        elif changed:
            pending.append(name)
    olds = list(moved)
    for name in git_lines(root, "ls-files", "--", "*.md") or []:
        if name.startswith(f"{DOCS}/") or not (root / name).is_file():
            continue
        if any(old in (root / name).read_text(encoding="utf-8", errors="replace") for old in olds):
            pending.append(name)
    return pending


def rollback(root, items, issues_existed):
    git(root, "restore", "--source=HEAD", "--staged", "--worktree", "--", DOCS)
    for item in items:
        target = root / item["to"]
        if target.exists():
            shutil.rmtree(target)
    issues = root / ISSUES
    if not issues_existed and issues.is_dir() and not any(issues.iterdir()):
        issues.rmdir()


def count_difference(before, after):
    lines = []
    for area in sorted(set(before) | set(after)):
        for state in sorted(set(before.get(area, {})) | set(after.get(area, {}))):
            old, new = before.get(area, {}).get(state, 0), after.get(area, {}).get(state, 0)
            if old != new:
                lines.append(f"  {area} · {state}: {old} → {new}")
    return lines


def apply(root, map_path, everywhere):
    data = json.loads(map_path.read_text(encoding="utf-8"))
    problems = validate(root, data)
    if problems:
        raise MigrateBlocked("지도 검사 실패 — 아무것도 옮기지 않았다:\n  " + "\n  ".join(problems))
    items = [item for item in data["items"] if item.get("action") == "move"]
    issues_existed = (root / ISSUES).exists()
    moved = {}
    try:
        for item in items:
            move_item(root, item, moved)
        for item in items:
            add_frontmatter(root, item)
        pending = rewrite_links(root, moved, everywhere)
        update_boards(root)
        difference = count_difference(data.get("boardBefore", {}), area_counts(root))
    except Exception:
        rollback(root, items, issues_existed)
        raise
    if difference:
        rollback(root, items, issues_existed)
        raise ValueError("영역별 상태 개수가 옮기기 전과 다르다 — 되돌렸다:\n" + "\n".join(difference))
    print(f"✔ 옮김: 항목 {len(items)}개 → {ISSUES}/ (영역별 상태 개수 같음). 커밋하지 않았다.")
    if pending:
        print("  옛 경로를 쓰는 파일(직접 고친다 — .agents/docs 는 --rewrite-links 로 고친다):")
        print("\n".join(f"    {name}" for name in pending))
    status = git_lines(root, "status", "--short") or []
    print(f"  git status --short: {len(status)}줄")
    print('  커밋 예: git add -A .agents/docs && git commit -m "docs: SDD 이슈를 .agents/docs/issues/ 로 옮긴다"')
    return 0


# ── rekey ────────────────────────────────────────────────────────────────────
def key_pattern(key):
    return re.compile(rf"(?<![A-Z0-9]){re.escape(key)}(?=-|$)")


def rekey(root, key, new_key, config):
    folder = find_issue(root, key)
    name = split_folder(folder.name)[1]
    if new_key == key:
        raise UsageError("새 키가 지금 키와 같다")
    target = folder.parent / f"{new_key}-{name}"
    if target.exists() or any((split_folder(other) or ("",))[0] == new_key for other in work_folders(root)):
        raise KeyConflict(f"키 충돌: {new_key} 가 이미 {ISSUES}/ 에 있다")
    tracked = git_lines(root, "ls-files", "--", rel(root, folder)) if in_repo(root) else None
    if tracked:
        git_mv(root, folder, target)
    else:
        folder.rename(target)
    for path in sorted(target.rglob("*.md")):
        text = path.read_text(encoding="utf-8").replace(folder.name, target.name)
        try:
            fields = parse(text)
        except ValueError:
            fields = None
        if fields and fields.get("key") == key:
            text = update(text, {"key": new_key})
        path.write_text(text, encoding="utf-8")
    update_boards(root)
    print(f"✔ {ISSUES}/{folder.name} → {ISSUES}/{target.name} (key {key} → {new_key})")
    branch = git_lines(root, "rev-parse", "--abbrev-ref", "HEAD") if in_repo(root) else None
    if branch and key_pattern(key).search(branch[0]):
        print(f"→ git branch -m {branch[0]} {key_pattern(key).sub(new_key, branch[0])}")
    return 0


def resolve_map(root, value):
    path = Path(value)
    if not path.is_absolute() and not path.exists():
        path = root / value
    if not path.is_file():
        raise UsageError(f"지도 파일이 없다: {value} — 먼저 migrate --dry-run")
    return path

