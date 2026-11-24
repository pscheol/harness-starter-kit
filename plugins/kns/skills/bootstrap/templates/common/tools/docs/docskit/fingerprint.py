"""원본 지문. 스냅숏이 어떤 원본에서 나왔는지 기록하고, 원본이 바뀌었는지 비교한다."""

from __future__ import annotations

import hashlib
from pathlib import Path


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def migration_files(directory: Path) -> list[list[str]]:
    """마이그레이션 디렉터리의 `V*.sql`·`R__*.sql` 이름과 sha256. 이름순."""
    files = [p for p in directory.glob("*.sql") if p.name.startswith(("V", "R__"))]
    return [[p.name, file_sha256(p)] for p in sorted(files, key=lambda p: p.name)]


def migration_sources(repo: Path, directories: tuple[str, ...] | list[str]) -> list[dict]:
    return [{"dir": d, "files": migration_files(repo / d)} for d in directories]
