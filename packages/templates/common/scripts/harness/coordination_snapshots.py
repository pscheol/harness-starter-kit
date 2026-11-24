"""명시적으로 점유한 경로의 내용·모드 변경을 기준선과 비교한다."""

import hashlib
import os
import stat
from pathlib import Path

from .coordination_paths import assert_no_symlink, paths_overlap


def fingerprint_file(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as content:
        metadata = os.fstat(content.fileno())
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError("claimed paths can contain only regular files and directories")
        digest = hashlib.sha256()
        for chunk in iter(lambda: content.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"{stat.S_IMODE(metadata.st_mode):o}:{digest.hexdigest()}"


def snapshot_directory(root, directory):
    fingerprints = {}
    for parent, directories, filenames in os.walk(directory, followlinks=False):
        for name in directories + filenames:
            child = Path(parent) / name
            relative_path = child.relative_to(root).as_posix()
            if name == ".git" or relative_path.startswith(".agents/coordination/") or relative_path == ".agents/coordination":
                continue
            assert_no_symlink(root, relative_path)
        directories[:] = [name for name in directories if name != ".git" and (Path(parent) / name).relative_to(root).as_posix() != ".agents/coordination"]
        for name in filenames:
            if name == ".git":
                continue
            child = Path(parent) / name
            fingerprints[child.relative_to(root).as_posix()] = fingerprint_file(child)
    return fingerprints


def snapshot_paths(root, claimed_paths):
    fingerprints = {}
    for relative_path in claimed_paths:
        path = assert_no_symlink(root, relative_path)
        if path.is_dir():
            fingerprints.update(snapshot_directory(root, path))
        elif path.exists():
            fingerprints[relative_path] = fingerprint_file(path)
    return fingerprints


def extend_baseline(root, session, new_paths):
    previous_paths = session["files"]
    additional = snapshot_paths(root, new_paths)
    newly_covered = {path: value for path, value in additional.items() if not any(paths_overlap(path, owned_path) for owned_path in previous_paths)}
    return {**session["baseline"], **newly_covered}


def changed_files(root, session):
    current = snapshot_paths(root, session["files"])
    baseline = {path: value for path, value in session["baseline"].items() if any(paths_overlap(path, owned_path) for owned_path in session["files"])}
    return sorted(path for path in baseline.keys() | current.keys() if baseline.get(path) != current.get(path))
