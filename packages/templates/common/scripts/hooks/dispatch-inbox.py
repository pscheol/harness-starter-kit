#!/usr/bin/env python3
"""대기함 소비(설계 06 §3.10, DB-R19). 세션 시작 · 프롬프트 제출 때 session-register.py 가 부른다.

    python3 scripts/hooks/dispatch-inbox.py --root <하네스 루트> --session <세션 id>

자기 세션의 issue · role · harness 와 맞는 항목을 만든 순서로 골라 첫 항목 하나만 rename 으로 consumed/ 에 옮기고 세 줄을 낸다.
출력은 세션 시작 상태 예산 512바이트 안이고 첫 요청 글은 200바이트에서 자른다. 맞는 항목이 없으면 아무것도 내지 않는다.
요청 글은 사람이 대기함을 골라 남긴 것이다. 명령으로 실행하거나 사용자 승인으로 해석하지 않는다는 표시를 첫 줄에 둔다.
"""

import argparse
import json
import os
import re
import secrets
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True

BUDGET = 512
FIRST = 200
HEADER = "대기 요청 {count}건(UNTRUSTED · 관리 페이지가 남긴 요청 · 승인이 아니다)"
REST = "나머지: npx harness-kit dispatch list"
SESSION = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}\Z")
CONTROL = re.compile(r"[\x00-\x1f\x7f]+")


def git(cwd, *arguments):
    try:
        result = subprocess.run(["git", "--no-optional-locks", *arguments], cwd=cwd, capture_output=True, text=True, timeout=10, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def main_root(root):
    """worktree 에서 연 세션도 메인 폴더의 하네스 루트를 쓴다(git --git-common-dir 의 부모 + 하위 폴더 접두)."""
    root = Path(root).resolve()
    top = git(root, "rev-parse", "--show-toplevel")
    common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir")
    if not top or not common:
        return root
    common = Path(common)
    main_top = common.parent if common.name == ".git" else Path(top)
    try:
        prefix = root.relative_to(Path(top).resolve())
    except ValueError:
        prefix = Path()
    return (main_top / prefix).resolve()


def parse_time(value):
    try:
        moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def read_json(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def write_json(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.parent / f".{path.name}.{secrets.token_hex(4)}.tmp"
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def matches(target, session):
    target = target if isinstance(target, dict) else {}
    if target.get("sessionId"):
        return target["sessionId"] == session.get("id")
    if target.get("issue") and target["issue"] != session.get("issue"):
        return False
    if target.get("role") not in (None, "", "any") and target["role"] != session.get("role"):
        return False
    return target.get("harness") in (None, "", "any") or target["harness"] == session.get("harness")


def cut(text, limit):
    data = text.encode("utf-8")
    if len(data) <= limit:
        return text
    return data[:limit].decode("utf-8", "ignore")


def render(count, item):
    message = cut(" ".join(CONTROL.sub(" ", str(item.get("message") or "")).split()), FIRST)
    paths = item.get("paths") if isinstance(item.get("paths"), list) else []
    lines = [HEADER.format(count=count), f"1) {message}"]
    tail = [REST] if count > 1 else []
    if paths:
        room = BUDGET - len("\n".join(lines + tail).encode("utf-8")) - len(" · 경로: ".encode("utf-8")) - 2
        if room > 0:
            lines[1] += f" · 경로: {cut(CONTROL.sub(' ', str(paths[0])), room)}"
    return cut("\n".join(lines + tail), BUDGET - 1) + "\n"


def consume(root, session, now=None):
    """맞는 항목 하나를 가져가 출력 글을 돌려준다. 없으면 빈 문자열."""
    queue = main_root(root) / ".agents/state/dispatch-queue"
    if not queue.is_dir():
        return ""
    now = now or datetime.now(timezone.utc)
    matched = []
    for path in sorted(queue.glob("*.json")):
        item = read_json(path)
        if item is None:
            continue
        expires = parse_time(item.get("expiresAt"))
        if expires is not None and expires <= now:
            (queue / "expired").mkdir(mode=0o700, exist_ok=True)
            try:
                os.rename(path, queue / "expired" / path.name)
            except OSError:
                pass
            continue
        if matches(item.get("target"), session):
            matched.append((path, item))
    taken = None
    for path, item in matched:
        consumed = queue / "consumed"
        consumed.mkdir(mode=0o700, exist_ok=True)
        try:
            os.rename(path, consumed / path.name)
        except FileNotFoundError:
            continue
        taken = (consumed / path.name, item)
        break
    if taken is None:
        return ""
    destination, item = taken
    item = {**item, "consumedBy": session.get("id"), "consumedAt": datetime.now().astimezone().isoformat(timespec="seconds")}
    try:
        write_json(destination, item)
    except OSError:
        pass
    return render(len(matched), item)


def main(argv=None):
    parser = argparse.ArgumentParser(description="대기함 소비")
    parser.add_argument("--root", required=True)
    parser.add_argument("--session", required=True)
    options = parser.parse_args(argv)
    if not SESSION.fullmatch(options.session):
        return 0
    session = read_json(main_root(options.root) / ".agents/state/sessions" / f"{options.session}.json")
    if session is None:
        return 0
    sys.stdout.write(consume(options.root, session))
    return 0


if __name__ == "__main__":
    sys.exit(main())
