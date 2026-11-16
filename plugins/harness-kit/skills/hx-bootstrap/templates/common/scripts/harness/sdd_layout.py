"""SDD 경로·상태를 해석한다. 기존 stage 경로는 이동하지 않는다."""

import fcntl
import hashlib
import os
import re
import stat
import tempfile
import uuid
from contextlib import contextmanager, suppress
from pathlib import Path

STATES = ("active", "check", "completed", "superseded")
TYPES = ("feat", "fix", "refactor", "perf", "chore", "docs")
TOKEN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
KEY = re.compile(r"^([0-9]+)-(feat|fix|refactor|perf|chore|docs)-([a-z0-9]+(?:-[a-z0-9]+)*)$")
STATUS_ROW = re.compile(r"^\|\s*상태\s*\|\s*(.*?)\s*\|\s*$", re.MULTILINE)


def validate_token(value, label):
    if not TOKEN.fullmatch(value):
        raise ValueError(f"invalid {label}: {value!r}")


def safe_path(root, path):
    relative = path.relative_to(root)
    current = root
    for part in relative.parts:
        if part in (".", ".."):
            raise ValueError(f"path escapes harness root: {path}")
        current = current / part
        if current.is_symlink():
            raise ValueError(f"symlink is not allowed for SDD: {current}")
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"path escapes harness root: {path}")
    return path


def spec_roots(root):
    docs = safe_path(root, root / ".agents/docs")
    return [safe_path(root, path) for path in sorted(docs.glob("*-specs")) if path.is_dir()]


def files_at(root, directory, pattern):
    safe_path(root, directory)
    paths = []
    for path in sorted(directory.glob(pattern)):
        safe_path(root, path)
        if path.is_file() and not path.name.startswith("_") and path.name != "README.md":
            paths.append(path)
    return paths


def feature_locations(root, spec):
    """(key, layout) 별 위치. 두 구조에 같은 키가 있으면 별도 후보로 보존한다."""
    locations = set()
    for stage in ("requirements", "design", *(f"tasks/{state}" for state in STATES)):
        for path in files_at(root, spec / stage, "*.md"):
            locations.add((path.stem, "legacy"))
    issues = safe_path(root, spec / "issues")
    for issue in sorted(issues.glob("*")):
        safe_path(root, issue)
        if issue.is_dir() and not issue.name.startswith("_"):
            if not KEY.fullmatch(issue.name):
                raise ValueError(f"invalid issue folder key: {issue}")
            for stage in ("requirements", "design"):
                safe_path(root, stage_path(spec, issue.name, "issue", stage))
            for state in STATES:
                safe_path(root, stage_path(spec, issue.name, "issue", "tasks", state))
            locations.add((issue.name, "issue"))
    return sorted(locations, key=lambda entry: sort_key(entry[0]))


def stage_path(spec, key, layout, stage, state="active"):
    if layout == "issue":
        issue = spec / "issues" / key
        return issue / "tasks" / f"{state}.md" if stage == "tasks" else issue / f"{stage}.md"
    return spec / "tasks" / state / f"{key}.md" if stage == "tasks" else spec / stage / f"{key}.md"


def resolve_feature(root, spec, name):
    validate_token(name, "이름/키")
    locations = feature_locations(root, spec)
    exact = [(key, layout) for key, layout in locations if key == name]
    candidates = exact or [(key, layout) for key, layout in locations if key.endswith(f"-{name}")]
    candidates = [entry for entry in candidates if stage_path(spec, *entry, "requirements").is_file()]
    if not candidates:
        raise ValueError(f"missing requirements for {name}: {spec}")
    if len(candidates) != 1:
        raise ValueError(f"ambiguous requirements for {name}: {candidates}; use the full key")
    return candidates[0]


def status_of(path):
    statuses = STATUS_ROW.findall(path.read_text(encoding="utf-8"))
    return statuses[0] if statuses else ""


def prerequisites(root, spec, key, layout, stage):
    expected = [("requirements", "approved")]
    if stage in ("tasks", "implement"):
        expected.append(("design", "approved"))
    if stage == "implement":
        expected.append(("tasks", "active"))
    for document, status in expected:
        path = safe_path(root, stage_path(spec, key, layout, document))
        if not path.is_file():
            raise ValueError(f"missing {document}: {path}")
        if stage and status_of(path) != status:
            raise ValueError(f"{document} must have status '{status}', found '{status_of(path)}': {path}")


def sort_key(key):
    match = re.match(r"^([0-9]+)-", key)
    return int(match[1]) if match else 9999, key


def key_parts(key):
    match = KEY.fullmatch(key)
    if match:
        return match[1], match[2], match[3]
    match = re.match(r"^([0-9]+)-(.*)$", key)
    return (match[1], "—", match[2]) if match else ("—", "—", key)


def task_records(root, spec):
    for key, layout in feature_locations(root, spec):
        for state in STATES:
            task = safe_path(root, stage_path(spec, key, layout, "tasks", state))
            if task.is_file():
                yield key, layout, state, task


def plan_task_records(root, spec, strict_legacy):
    for state in STATES:
        directory = safe_path(root, spec / "tasks" / state)
        for task in sorted(directory.glob("*.md")):
            safe_path(root, task)
            if task.name == "README.md" or (not strict_legacy and task.name == "_template.md"):
                continue
            if task.is_file():
                yield task.stem, "legacy", state, task
    for record in task_records(root, spec):
        if record[1] == "issue":
            yield record


def task_state_errors(name, state, actual):
    return [] if actual == state else [f"{name}: state mismatch, expected {state}, found {actual or 'none'}"]


def legacy_status_token(body):
    for line in body.splitlines():
        if "상태" in line:
            match = re.search(r"superseded|check|completed|active", line, flags=re.IGNORECASE)
            if match:
                return match[0].lower()
    return ""


def strict_task_errors(root, spec, key, layout, state, task):
    name = task.relative_to(root).as_posix()
    body = task.read_text(encoding="utf-8")
    errors = task_state_errors(name, state, status_of(task))
    if not KEY.fullmatch(key):
        errors.append(f"{name}: invalid task filename")
    for stage in ("requirements", "design"):
        if not safe_path(root, stage_path(spec, key, layout, stage)).is_file():
            errors.append(f"{name}: missing {stage}")
    ids = re.findall(r"^- \[[ xX]\] (T[0-9]+)\b", body, re.MULTILINE)
    if not ids:
        errors.append(f"{name}: missing numbered tasks")
    if len(ids) != len(set(ids)):
        errors.append(f"{name}: duplicate task ID")
    if state in ("check", "completed") and re.search(r"^- \[ \]", body, re.MULTILINE):
        errors.append(f"{name}: unchecked task in {state}")
    return errors


def plan_errors(root, strict_legacy=True):
    errors = []
    try:
        for spec in spec_roots(root):
            seen = {}
            for key, layout in feature_locations(root, spec):
                if key in seen and seen[key] != layout:
                    errors.append(f"{spec.relative_to(root)}/{key}: duplicate issue across layouts")
                seen[key] = layout
            seen_tasks = {}
            for key, layout, state, task in plan_task_records(root, spec, strict_legacy):
                name = task.relative_to(root).as_posix()
                if layout == "legacy" and not strict_legacy:
                    actual = legacy_status_token(task.read_text(encoding="utf-8"))
                    errors.extend(task_state_errors(name, state, actual))
                    continue
                if key in seen_tasks:
                    errors.append(f"{name}: duplicate task in {seen_tasks[key]} and {state}")
                seen_tasks[key] = state
                errors.extend(strict_task_errors(root, spec, key, layout, state, task))
    except (ValueError, OSError) as error:
        errors.append(str(error))
    return errors


@contextmanager
def sdd_lock(root):
    """동시 scaffold와 board가 같은 번호와 중간 파일을 읽지 않도록 직렬화한다."""
    key = hashlib.sha256(str(root.resolve()).encode()).hexdigest()[:24]
    path = Path(tempfile.gettempdir()) / f"harness-sdd.{os.getuid()}.{key}.lock"
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(descriptor, "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


@contextmanager
def parent_descriptor(root, path, create=False):
    """각 부모를 no-follow로 열어 경로 교체가 파일 쓰기를 다른 디렉터리로 돌리지 못하게 한다."""
    safe_path(root, path)
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    descriptor = os.open(root, flags)
    try:
        for component in path.parent.relative_to(root).parts:
            if create:
                with suppress(FileExistsError):
                    os.mkdir(component, mode=0o755, dir_fd=descriptor)
            child = os.open(component, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        yield descriptor
    finally:
        os.close(descriptor)


def fingerprint(metadata):
    return (
        stat.S_IMODE(metadata.st_mode),
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
    )


def read_snapshot(directory, name):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
    with os.fdopen(descriptor, "rb") as current:
        before = os.fstat(current.fileno())
        if not stat.S_ISREG(before.st_mode):
            raise ValueError(f"SDD target is not a regular file: {name}")
        content = current.read()
        after = os.fstat(current.fileno())
    at_path = os.stat(name, dir_fd=directory, follow_symlinks=False)
    if fingerprint(before) != fingerprint(after) or fingerprint(after) != fingerprint(at_path):
        raise ValueError(f"concurrent edit while reading SDD index: {name}")
    return content, fingerprint(after)


def file_snapshot(root, path):
    with parent_descriptor(root, path) as directory:
        return read_snapshot(directory, path.name)


def assert_unchanged(directory, path, expected):
    try:
        actual = read_snapshot(directory, path.name)
    except OSError as error:
        raise ValueError(f"concurrent edit of SDD index: {path}; rerun board after the writer finishes") from error
    if actual != expected:
        raise ValueError(f"concurrent edit of SDD index: {path}; rerun board after the writer finishes")


def atomic_write(root, path, text, replace=False, expected=None):
    if replace and expected is None:
        raise ValueError("replacing an SDD index requires its expected content and mode")
    with parent_descriptor(root, path, create=True) as directory:
        temporary = f".{path.name}.{uuid.uuid4().hex}.tmp"
        descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o644, dir_fd=directory)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                os.fchmod(output.fileno(), expected[1][0] if replace else 0o644)
                output.write(text)
                output.flush()
                os.fsync(output.fileno())
            safe_path(root, path)
            if replace:
                assert_unchanged(directory, path, expected)
                os.replace(temporary, path.name, src_dir_fd=directory, dst_dir_fd=directory)
            else:
                os.link(temporary, path.name, src_dir_fd=directory, dst_dir_fd=directory, follow_symlinks=False)
        finally:
            with suppress(FileNotFoundError):
                os.unlink(temporary, dir_fd=directory)
