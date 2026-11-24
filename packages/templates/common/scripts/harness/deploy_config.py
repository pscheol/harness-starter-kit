"""`.agents/deploy.json` 읽기 · 검사 · 명령 자리표 채우기(설계 14 §3.3). 표준 라이브러리만 쓴다.

비밀값은 이 파일에 넣지 않는다 — 명령이 환경 변수로 받는다. 명령은 문자열 목록이고 셸을 거치지 않는다.
"""

import json
import re
from pathlib import Path

CONFIG = ".agents/deploy.json"
SCHEMA = "knots-sync.deploy/v1"
KINDS = ("verification", "production")
STEPS = ("deploy", "smoke", "health", "rollback", "e2e")
PLACEHOLDER = re.compile(r"\{(env|sha|toSha|url)\}")
SECRETISH = re.compile(r"(?i)(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S{6,}")
MAX_FAILURES = 2


def read(root):
    """(설정 사전 또는 None, 읽기 오류 문장 또는 None). 파일이 없으면 (None, None)."""
    path = Path(root) / CONFIG
    if not path.is_file():
        return None, None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        return None, f"{CONFIG}: JSON 을 읽지 못했다: {error}"
    return (data, None) if isinstance(data, dict) else (None, f"{CONFIG}: 최상위는 객체다")


def problems(data):
    """설정 검사. 문제 문장 목록(없으면 빈 목록)."""
    out = []
    if data.get("schema") != SCHEMA:
        out.append(f"{CONFIG}: schema 는 {SCHEMA}")
    envs = data.get("envs") if isinstance(data.get("envs"), dict) else None
    if envs is None:
        out.append(f"{CONFIG}: envs 가 없다")
        envs = {}
    for name, env in envs.items():
        if not isinstance(env, dict) or env.get("kind") not in KINDS:
            out.append(f"{CONFIG}: envs.{name}.kind 는 {' · '.join(KINDS)}")
    commands = data.get("commands") if isinstance(data.get("commands"), dict) else {}
    for name, command in commands.items():
        if name not in STEPS:
            out.append(f"{CONFIG}: 모르는 명령 단계 {name}({' · '.join(STEPS)})")
        elif not (isinstance(command, list) and command and all(isinstance(part, str) for part in command)):
            out.append(f"{CONFIG}: commands.{name} 는 문자열 목록이다(셸 한 줄이 아니다)")
        elif SECRETISH.search(" ".join(command)):
            out.append(f"{CONFIG}: commands.{name} 에 비밀값으로 보이는 것이 있다 — 환경 변수로 받는다")
    auto = data.get("autoVerify") if isinstance(data.get("autoVerify"), dict) else {}
    limit = auto.get("maxConsecutiveFailures", MAX_FAILURES)
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= MAX_FAILURES:
        out.append(f"{CONFIG}: autoVerify.maxConsecutiveFailures 는 1 또는 2(줄이기만 한다)")
    if auto.get("enabled") and auto.get("env") not in envs:
        out.append(f"{CONFIG}: autoVerify.env {auto.get('env')!r} 가 envs 에 없다")
    elif auto.get("enabled") and (envs.get(auto["env"]) or {}).get("kind") != "verification":
        out.append(f"{CONFIG}: autoVerify.env 는 kind verification 환경이다")
    return out


def auto_verify(data):
    """autoVerify 설정(기본값 채움). 상한은 2 로 막는다."""
    auto = data.get("autoVerify") if isinstance((data or {}).get("autoVerify"), dict) else {}
    limit = auto.get("maxConsecutiveFailures", MAX_FAILURES)
    limit = limit if isinstance(limit, int) and not isinstance(limit, bool) and 1 <= limit <= MAX_FAILURES else MAX_FAILURES
    timeout = auto.get("timeoutSec", 1800)
    return {"enabled": auto.get("enabled") is True, "env": auto.get("env", "verify"), "maxConsecutiveFailures": limit,
            "timeoutSec": timeout if isinstance(timeout, int) and timeout > 0 else 1800}


def env_kind(data, name):
    env = ((data or {}).get("envs") or {}).get(name)
    return env.get("kind") if isinstance(env, dict) else None


def command(data, step, **values):
    """단계 명령(자리표 채움). 없으면 None."""
    raw = ((data or {}).get("commands") or {}).get(step)
    if not isinstance(raw, list) or not raw:
        return None
    return [PLACEHOLDER.sub(lambda match: str(values.get(match.group(1), "")), part) for part in raw]
