"""배치(HK-13) 시험 공용: v1.0.8 킷 풀기 · 세션 적재량 기준값 · 하네스 폴더 목록.

v1.0.8 킷은 이 저장소의 커밋 e181b6f(v1.0.8 병합)의 plugins/harness-kit 을 git archive 로 푼다. 커밋이 없으면 None.
"""

from __future__ import annotations

import io
import subprocess
import tarfile
from pathlib import Path

KIT = Path(__file__).resolve().parents[1]
V108_COMMIT = "e181b6f"
HARNESS_DIRS = (".claude", ".codex", ".cursor", ".kiro")
CHECK_LAYOUT = KIT / "packages/templates/common/scripts/harness/check_layout.py"
TOKENS = {"PROJECT_NAME": "Acme Notes", "PROJECT_SLUG": "acme-notes", "PACKAGE_NS": "com.acme.notes", "SERVICE_NAME": "notes-api"}
# design §11 실측(e181b6f, 위 토큰, --agents=all, 모듈 없음)
V108_CONTEXT = {
    "jvm": {"claude": 10311, "codex": 9894, "cursor": 9075, "kiro": 26579},
    "python": {"claude": 10567, "codex": 10150, "cursor": 9331, "kiro": 26830},
    "go": {"claude": 10991, "codex": 10574, "cursor": 9755, "kiro": 27258},
    "web": {"claude": 12025, "codex": 11608, "cursor": 10789, "kiro": 33191},
    "electron": {"claude": 12431, "codex": 12014, "cursor": 11195, "kiro": 33924},
}


def extract_v108(dest: Path) -> Path | None:
    """e181b6f 의 플러그인을 dest 에 푼다. setup.sh 경로(없으면 None)."""
    r = subprocess.run(["git", "-C", str(KIT), "archive", V108_COMMIT, "plugins/harness-kit"], capture_output=True, timeout=120)
    if r.returncode != 0:
        return None
    with tarfile.open(fileobj=io.BytesIO(r.stdout)) as tar:
        tar.extractall(dest, filter="data")
    setup = dest / "plugins/harness-kit/skills/hx-bootstrap/setup.sh"
    return setup if setup.is_file() else None


def harness_files(root: Path) -> list[str]:
    out: list[str] = []
    for d in HARNESS_DIRS:
        base = root / d
        if base.exists():
            out += sorted(p.relative_to(root).as_posix() for p in base.rglob("*") if p.is_file() or p.is_symlink())
    return out
