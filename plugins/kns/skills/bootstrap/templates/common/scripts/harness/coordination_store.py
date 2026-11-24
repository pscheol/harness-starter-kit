"""공유 상태를 프로세스 잠금과 원자적 교체로 읽고 쓴다."""

import json
import os
import tempfile
import time
from contextlib import contextmanager

from .coordination_schema import validate_state

try:
    import fcntl
except ImportError:
    fcntl = None


STATE_VERSION = 1
LOCK_TIMEOUT_SECONDS = 10


def validate_regular_file(path):
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise ValueError(f"runtime path must be a regular file without a symlink: {path.name}")


def runtime_directory(root, create=False):
    directory = root / ".agents/coordination"
    if (root / ".agents").is_symlink() or directory.is_symlink():
        raise ValueError("coordination runtime directory cannot be a symlink")
    if directory.exists() and not directory.is_dir():
        raise ValueError("coordination runtime path is not a directory")
    if create:
        directory.mkdir(mode=0o700, exist_ok=True)
        ignore = directory / ".gitignore"
        validate_regular_file(ignore)
        try:
            descriptor = os.open(ignore, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        except FileExistsError:
            validate_regular_file(ignore)
        else:
            with os.fdopen(descriptor, "w") as content:
                content.write("*\n!.gitignore\n")
    return directory


def empty_state():
    return {"version": STATE_VERSION, "sessions": {}, "notices": []}


def read_state(directory):
    path = directory / "state.json"
    validate_regular_file(path)
    if not path.exists():
        return empty_state()
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "r") as content:
        try:
            state = json.load(content)
        except (ValueError, UnicodeError) as error:
            raise ValueError("coordination state is invalid; preserve it and investigate") from error
    return validate_state(directory.parent.parent, state, STATE_VERSION)


@contextmanager
def locked_state(root, writable=False):
    if fcntl is None:
        raise ValueError("session coordination requires POSIX flock; use macOS, Linux or WSL")
    directory = runtime_directory(root, create=writable)
    if not directory.exists():
        yield empty_state()
        return
    lock_path = directory / "state.lock"
    validate_regular_file(lock_path)
    if not writable and not lock_path.exists():
        yield read_state(directory)
        return
    open_flags = os.O_CREAT | os.O_RDWR if writable else os.O_RDONLY
    descriptor = os.open(lock_path, open_flags | os.O_NOFOLLOW, 0o600)
    try:
        deadline = time.monotonic() + LOCK_TIMEOUT_SECONDS
        while True:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise ValueError("coordination lock is busy; retry without deleting it") from None
                time.sleep(0.025)
        yield read_state(directory)
    finally:
        os.close(descriptor)


def write_state(root, state):
    directory = runtime_directory(root)
    target = directory / "state.json"
    validate_regular_file(target)
    descriptor, temporary = tempfile.mkstemp(prefix="state-", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(descriptor, "w") as content:
            json.dump(state, content, ensure_ascii=False, indent=2)
            content.write("\n")
            content.flush()
            os.fsync(content.fileno())
        os.replace(temporary, target)
        directory_descriptor = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
