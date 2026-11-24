"""공유 하네스 루트와 루트 상대 점유 경로를 검증한다."""

import json
import re
from pathlib import Path, PurePosixPath, PureWindowsPath

SESSION_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}\Z")


def validate_session_id(session_id):
    if not SESSION_PATTERN.fullmatch(session_id):
        raise ValueError("session ID must use 1-64 letters, digits, dots, underscores or hyphens")
    return session_id


def validate_text(value, name, maximum_length):
    if not value.strip() or len(value) > maximum_length:
        raise ValueError(f"{name} must contain 1-{maximum_length} characters")
    if any(ord(character) < 32 and character not in "\n\t" for character in value):
        raise ValueError(f"{name} contains unsupported control characters")
    return value


def validate_harness_root(root):
    manifest = root / ".agents/harness.json"
    if not root.is_dir() or root.is_symlink():
        raise ValueError("root must be an existing harness directory, without a symlink")
    if (root / ".agents").is_symlink() or manifest.is_symlink() or not manifest.is_file():
        raise ValueError(f"root has no regular .agents/harness.json: {root}")
    try:
        configuration = json.loads(manifest.read_text())
    except (ValueError, OSError) as error:
        raise ValueError("harness manifest is unreadable or invalid JSON") from error
    if not isinstance(configuration, dict) or not isinstance(configuration.get("unit"), str):
        raise TypeError("harness manifest must be an object with a unit string")
    return root


def find_shared_root(explicit_root=None):
    if explicit_root:
        candidate = Path(explicit_root).absolute()
        if candidate.is_symlink():
            raise ValueError("root cannot be a symlink")
        return validate_harness_root(candidate.resolve())
    current = Path.cwd().resolve()
    candidates = [path for path in (current, *current.parents) if (path / ".agents/harness.json").exists()]
    if not candidates:
        raise ValueError("no harness root found; use --root with a harness directory")
    return validate_harness_root(candidates[-1])


def assert_no_symlink(root, relative_path):
    current = root
    for part in PurePosixPath(relative_path).parts:
        current = current / part
        if current.is_symlink():
            raise ValueError(f"symlink is not allowed in claimed path: {relative_path}")
    return current


def normalize_claim_path(root, value, check_filesystem=True):
    parts = value.rstrip("/").split("/")
    if not value or "\\" in value or value.startswith("/") or PureWindowsPath(value).drive or any(part in ("", ".", "..") for part in parts):
        raise ValueError(f"claimed path must be a root-relative path without traversal: {value}")
    if ".git" in parts or parts[:2] == [".agents", "coordination"]:
        raise ValueError(f"reserved coordination or Git path cannot be claimed: {value}")
    relative_path = PurePosixPath(*parts).as_posix()
    if check_filesystem:
        assert_no_symlink(root, relative_path)
    return relative_path


def normalized_claim_paths(root, values):
    return sorted({normalize_claim_path(root, value) for value in values})


def paths_overlap(first, second):
    return first == second or first.startswith(second + "/") or second.startswith(first + "/")
