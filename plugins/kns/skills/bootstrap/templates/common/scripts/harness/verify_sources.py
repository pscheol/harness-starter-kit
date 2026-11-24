"""검증 코드 · 설정을 어디서 읽는가(설계 09 §3.7 · VQ-R11).

MR 파이프라인은 base 브랜치의 검증 코드 · 설정을 `.agents/state/ci-base/` 에 꺼내고(verify-entry.sh --from-base)
아래 환경 변수로 그 판을 가리킨다. 판정 대상(바뀐 파일 · 빌드 그래프)은 KNS_ROOT 의 작업 트리다.

    KNS_ROOT             판정 대상 하네스 루트(MR head 작업 트리)
    KNS_TOOLS_DIR        검증 스크립트 폴더(base 판 scripts/)
    KNS_GATE_CONFIG_DIR  검증 설정 · 기준선을 읽을 폴더(그 아래 .agents/). base 에 없던 파일은 없는 것으로 본다
    KNS_FROM_BASE        base ref(affected 비교 기준)
    KNS_VERIFY_BOOTSTRAP base 에 하네스가 없어 head 판으로 돈다는 표지
"""

import os
from pathlib import Path

ROOT_ENV, TOOLS_ENV, CONFIG_ENV = "KNS_ROOT", "KNS_TOOLS_DIR", "KNS_GATE_CONFIG_DIR"
BASE_ENV, BOOTSTRAP_ENV = "KNS_FROM_BASE", "KNS_VERIFY_BOOTSTRAP"


def harness_root(default, environ=None):
    environ = os.environ if environ is None else environ
    value = environ.get(ROOT_ENV)
    return Path(value).resolve() if value else Path(default).resolve()


def tools_dir(root, environ=None):
    environ = os.environ if environ is None else environ
    value = environ.get(TOOLS_ENV)
    return Path(value).resolve() if value else Path(root) / "scripts"


def config_path(root, name, environ=None):
    """`.agents/<name>` 자리. base 판 판정이면 꺼낸 폴더의 것(없으면 없는 자리)이다."""
    environ = os.environ if environ is None else environ
    value = environ.get(CONFIG_ENV)
    return (Path(value) if value else Path(root)) / ".agents" / name


def judged_by(environ=None):
    environ = os.environ if environ is None else environ
    return "base" if environ.get(BASE_ENV) else "head"


def is_bootstrap(environ=None):
    environ = os.environ if environ is None else environ
    return environ.get(BOOTSTRAP_ENV) == "1"
