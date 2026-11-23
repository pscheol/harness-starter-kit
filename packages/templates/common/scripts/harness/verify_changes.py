"""Git·세션 변경 목록을 읽는다. 작업 트리를 수정하지 않는다."""

import json
import re
import subprocess
from pathlib import Path

from harness.verify_paths import safe_file


def git_output(root, *arguments, optional=False):
    result = subprocess.run(
        ["git", "-C", str(root), *arguments],
        capture_output=True,
        timeout=15,
        check=False,
    )
    if result.returncode:
        if optional:
            return b""
        raise ValueError(f"git could not read changed files in {root.name}; select --files explicitly")
    return result.stdout


REF_FORMAT = re.compile(r"[A-Za-z0-9_./@{}~^+-]+")


def check_ref_format(reference):
    if not REF_FORMAT.fullmatch(reference) or reference.startswith("-"):
        raise ValueError("invalid git ref for --base")


def validate_ref(root, reference):
    check_ref_format(reference)
    revision = git_output(root, "rev-parse", "--verify", "--end-of-options", reference + "^{commit}")
    return revision.decode().strip()


META_FILE = ".agents/harness-kit.json"
DEFAULT_BASE = "develop"
BRANCH_NAME = re.compile(r"\w[\w./-]*")


def git_base_name(root):
    """`.agents/harness-kit.json` 의 `git.base`. 하네스 루트부터 저장소 뿌리까지 찾고, 없거나 형식이 틀리면 develop."""
    for directory in (root, *root.parents):
        meta = directory / META_FILE
        if meta.is_file():
            try:
                value = json.loads(meta.read_text(encoding="utf-8")).get("git", {}).get("base")
            except (ValueError, OSError, AttributeError):
                return DEFAULT_BASE
            return value if isinstance(value, str) and BRANCH_NAME.fullmatch(value) else DEFAULT_BASE
        if (directory / ".git").exists():
            break
    return DEFAULT_BASE


def commit_of(root, reference):
    result = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "--verify", "--quiet", "--end-of-options", reference + "^{commit}"],
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def resolve_base(root, reference=None):
    """affected 의 비교 기준 {"ref", "sha", "mergeBase"}. 지정 ref, 아니면 origin/<git.base> → <git.base> 순서로 찾는다."""
    if reference:
        check_ref_format(reference)
        candidates = [reference]
    else:
        name = git_base_name(root)
        candidates = [f"origin/{name}", name]
    for candidate in candidates:
        sha = commit_of(root, candidate)
        if sha:
            merge_base = git_output(root, "merge-base", "HEAD", sha).decode().strip()
            return {"ref": candidate, "sha": sha, "mergeBase": merge_base}
    missing = candidates[0]
    branch = missing.removeprefix("origin/")
    raise ValueError(f"base ref 없음: {missing} — git fetch origin {branch} 뒤 다시 실행")


def status_paths(raw):
    fields = raw.decode("utf-8", "surrogateescape").split("\0")
    paths = []
    index = 0
    while index < len(fields) and fields[index]:
        field = fields[index]
        paths.append(field[3:])
        if "R" in field[:2] or "C" in field[:2]:
            index += 1
            paths.append(fields[index])
        index += 1
    return paths


def diff_paths(raw):
    fields = raw.decode("utf-8", "surrogateescape").split("\0")
    paths = []
    index = 0
    while index < len(fields) and fields[index]:
        status = fields[index]
        index += 1
        count = 2 if status.startswith(("R", "C")) else 1
        paths.extend(fields[index : index + count])
        index += count
    return paths


def gitlinks(root, optional=False):
    links = {}
    for entry in git_output(root, "ls-files", "--stage", "-z", optional=optional).decode("utf-8", "surrogateescape").split("\0"):
        if entry.startswith("160000 "):
            metadata, path = entry.split("\t", 1)
            links[path] = metadata.split()[1]
    return links


def gitlink_tree(root, reference, optional=False):
    if reference and re.fullmatch(r"0{40}|0{64}", reference):
        return {}
    revision = validate_ref(root, reference) if not optional else "HEAD"
    entries = git_output(root, "ls-tree", "-r", "-z", revision, "--", optional=optional)
    links = {}
    for entry in entries.decode("utf-8", "surrogateescape").split("\0"):
        if entry.startswith("160000 "):
            metadata, path = entry.split("\t", 1)
            links[path] = metadata.split()[2]
    return links


def gitlink_changed_paths(root, relative, previous, current):
    nested = safe_file(root, relative + "/_verification_path").parent
    if not (nested / ".git").exists():
        raise ValueError(f"gitlink is not initialized: {relative}; initialize it before verification")
    if current is None:
        raise ValueError(f"gitlink was removed: {relative}; review removal and select explicit tests or full")
    head = git_output(nested, "rev-parse", "HEAD").decode().strip()
    if head != current:
        raise ValueError(f"gitlink checkout does not match selected pointer: {relative}; select the matching harness checkout")
    if previous == current:
        return []
    if previous:
        paths = diff_paths(git_output(nested, "diff", "--name-status", "-z", previous, current, "--"))
    else:
        paths = git_output(nested, "ls-tree", "--name-only", "-r", "-z", current, "--").decode("utf-8", "surrogateescape").split("\0")
        paths = [path for path in paths if path]
    expanded = expand_gitlink_files(nested, paths, previous or "0" * 40, current)
    return [relative + "/" + path for path in expanded]


def expand_gitlink_files(root, selected, base=None, head=None):
    indexed = gitlinks(root, optional=True)
    before = gitlink_tree(root, base, optional=base is None)
    after = gitlink_tree(root, head) if head else indexed
    known = set(indexed) | set(before) | set(after)
    expanded = []
    for relative in selected:
        if relative not in known:
            expanded.append(safe_file(root, relative).relative_to(root).as_posix())
        else:
            expanded.extend(gitlink_changed_paths(root, relative, before.get(relative), after.get(relative)))
    return sorted(set(expanded))


def changed_files(root, base=None):
    revision = validate_ref(root, base) if base else None
    prefix = git_output(root, "rev-parse", "--show-prefix").decode().strip()
    paths = status_paths(git_output(root, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "."))
    if prefix:
        if any(not path.startswith(prefix) for path in paths):
            raise ValueError("rename crosses this unit boundary; run verification from the shared root")
        paths = [path[len(prefix) :] for path in paths]
    if revision:
        paths.extend(
            diff_paths(
                git_output(
                    root,
                    "diff",
                    "--relative",
                    "--name-status",
                    "-z",
                    revision,
                    "HEAD",
                    "--",
                    ".",
                )
            )
        )
    for relative in gitlinks(root):
        marker = safe_file(root, relative + "/_verification_path").parent
        if not marker.is_relative_to(root):
            raise ValueError(f"submodule path is outside the harness: {relative}")
        if not (marker / ".git").exists():
            raise ValueError(f"submodule is missing: {relative}; initialize it or select --files")
        nested_paths = changed_files(marker)
        baseline = git_output(
            root,
            "ls-tree",
            "-z",
            revision or "HEAD",
            "--",
            relative,
            optional=not revision,
        )
        if baseline:
            previous = baseline.decode().split()[2]
            difference = git_output(marker, "diff", "--name-status", "-z", previous, "HEAD", "--")
            nested_paths.extend(diff_paths(difference))
        paths = [path for path in paths if path != relative]
        paths.extend(relative + "/" + path for path in nested_paths)
    return sorted(set(paths))


def session_files(root, session):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", session):
        raise ValueError("invalid session ID")
    helper = root / "scripts/session-coordination.py"
    if not helper.is_file():
        raise ValueError("session coordination helper is missing; select --files explicitly")
    import sys

    result = subprocess.run(
        [sys.executable, str(helper), "changed-files", "--session", session, "--json"],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    if result.returncode:
        raise ValueError(f"session snapshot is unavailable: {session}; select --files explicitly")
    try:
        snapshot = json.loads(result.stdout)
        files = snapshot["files"]
    except (ValueError, KeyError, TypeError) as error:
        raise ValueError("session helper did not return a files snapshot") from error
    if not isinstance(files, list) or not all(isinstance(path, str) for path in files):
        raise ValueError("session files snapshot must contain relative file paths")
    shared_root = snapshot.get("root", str(root))
    if not isinstance(shared_root, str) or not Path(shared_root).is_absolute():
        raise ValueError("session snapshot root must be an absolute harness directory")
    shared_root = Path(shared_root).resolve()
    if not root.is_relative_to(shared_root) or not (shared_root / ".agents/harness.json").is_file():
        raise ValueError("session snapshot root is not an ancestor harness of this verifier")
    selected = [safe_file(shared_root, path) for path in files]
    if any(not path.is_relative_to(root) for path in selected):
        raise ValueError(f"session includes files outside this unit; run verification from shared root: {shared_root}")
    return [path.relative_to(root).as_posix() for path in selected]
