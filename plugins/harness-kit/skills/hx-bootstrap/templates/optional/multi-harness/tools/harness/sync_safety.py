"""배포 상태 비교, 심볼릭 링크 차단, 잠금과 파일 단위 원자 쓰기."""
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import uuid


class SafetyError(Exception):
    pass


def validate_path(root, path, *, directory=False):
    relative = path.relative_to(root)
    current = root
    for index, part in enumerate(relative.parts):
        if part in ('', '.', '..'):
            raise SafetyError(f'invalid path: {path}')
        current = current / part
        try:
            mode = current.lstat().st_mode
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(mode):
            raise SafetyError(f'symlink path refused: {current}')
        is_parent = index < len(relative.parts) - 1 or directory
        if is_parent and not stat.S_ISDIR(mode):
            raise SafetyError(f'not a directory: {current}')
        if not is_parent and not stat.S_ISREG(mode):
            raise SafetyError(f'not a regular file: {current}')


@contextmanager
def parent_descriptor(root, relative, *, create=False):
    descriptors = [os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)]
    try:
        for part in Path(relative).parts[:-1]:
            if create:
                try:
                    os.mkdir(part, dir_fd=descriptors[-1])
                except FileExistsError:
                    pass
            descriptors.append(os.open(
                part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptors[-1]
            ))
        yield descriptors[-1]
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)


def descriptor_state(parent, name):
    try:
        descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    except FileNotFoundError:
        return None
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise SafetyError(f'not a regular file: {name}')
        digest = hashlib.sha256()
        while chunk := os.read(descriptor, 65536):
            digest.update(chunk)
        after = os.fstat(descriptor)
        if (before.st_mtime_ns, before.st_size, before.st_mode) != (
            after.st_mtime_ns, after.st_size, after.st_mode
        ):
            raise SafetyError(f'changed while reading: {name}')
        return {'sha256': digest.hexdigest(), 'mode': stat.S_IMODE(after.st_mode)}
    finally:
        os.close(descriptor)


def file_state(root, relative):
    path = root / relative
    validate_path(root, path)
    try:
        with parent_descriptor(root, relative) as parent:
            return descriptor_state(parent, path.name)
    except FileNotFoundError:
        return None


def collect_states(root, paths):
    return {relative: file_state(root, relative) for relative in sorted(set(paths))}


def state_changes(root, expected):
    return [
        f'changed since snapshot: {relative}'
        for relative, original in expected.items()
        if file_state(root, relative) != original
    ]


def load_snapshot(path):
    data = json.loads(path.read_text())
    if not isinstance(data, dict):
        raise ValueError('snapshot must be an object of repository-relative paths')
    for relative, state in data.items():
        if not relative or Path(relative).is_absolute() or '..' in Path(relative).parts:
            raise ValueError(f'invalid snapshot path: {relative!r}')
        if state is None:
            continue
        if not isinstance(state, dict) or not re.fullmatch(r'[0-9a-f]{64}', str(state.get('sha256', ''))):
            raise ValueError(f'invalid snapshot fingerprint: {relative}')
        mode = state.get('mode')
        if type(mode) is not int or not 0 <= mode <= 0o7777:
            raise ValueError(f'invalid snapshot mode: {relative}')
    return data


def assert_unchanged(root, relative, parent, expected):
    validate_path(root, root / relative)
    if descriptor_state(parent, Path(relative).name) != expected:
        raise SafetyError(f'changed since snapshot: {relative}')


def atomic_write(root, relative, text, mode, expected):
    validate_path(root, root / relative)
    temporary = f'.harness-sync-{uuid.uuid4().hex}.tmp'
    with parent_descriptor(root, relative, create=True) as parent:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
        try:
            with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
                output.write(text)
                output.flush()
                os.fchmod(output.fileno(), mode)
                os.fsync(output.fileno())
            assert_unchanged(root, relative, parent, expected)
            os.replace(temporary, Path(relative).name, src_dir_fd=parent, dst_dir_fd=parent)
        finally:
            try:
                os.unlink(temporary, dir_fd=parent)
            except FileNotFoundError:
                pass


def safe_unlink(root, relative, expected):
    with parent_descriptor(root, relative) as parent:
        assert_unchanged(root, relative, parent, expected)
        os.unlink(Path(relative).name, dir_fd=parent)


def lock_path(root):
    repository_digest = hashlib.sha256(str(root.resolve()).encode()).hexdigest()
    return Path(tempfile.gettempdir()) / f'harness-sync-{os.getuid()}-{repository_digest}.lock'


@contextmanager
def deployment_lock(root):
    descriptor = os.open(lock_path(root), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise SafetyError('harness sync lock must be a regular file')
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise SafetyError('another harness sync is running; retry after it finishes') from error
        yield
    finally:
        os.close(descriptor)
