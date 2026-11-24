#!/usr/bin/env python3
"""SubagentStop 판정(설계 12 MR-R10): 위임 결과가 길면 exit 2 와 stderr 한 줄. 그 밖에는 출력 없이 exit 0.

결과 글: 입력의 last_assistant_message, 없으면 agent_transcript_path(그 위임의 기록) 마지막 assistant 글.
stop_hook_active 면(이 훅이 이미 한 번 막았다) 통과시킨다 — 되풀이를 막는다. 해석하지 못한 입력은 통과.
"""

import argparse
import json
import sys
from pathlib import Path

DEFAULT_LIMIT = 6000
TAIL_BYTES = 2 * 1024 * 1024


def limit_of(root: Path) -> int:
    for rel in (".agents/model-policy.json",):
        try:
            data = json.loads((root / rel).read_text(encoding="utf-8"))
            value = int((data.get("limits") or {}).get("subagentResultMaxChars", DEFAULT_LIMIT))
            if value > 0:
                return value
        except (OSError, ValueError, TypeError, AttributeError):
            continue
    return DEFAULT_LIMIT


def text_of(message) -> str:
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(part.get("text", "") for part in content if isinstance(part, dict) and part.get("type") == "text")
    return ""


def last_from_transcript(path: Path) -> str:
    try:
        with path.open("rb") as handle:
            handle.seek(0, 2)
            size = handle.tell()
            handle.seek(max(0, size - TAIL_BYTES))
            lines = handle.read().decode("utf-8", errors="ignore").splitlines()
    except OSError:
        return ""
    for line in reversed(lines):
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict) and row.get("type") == "assistant":
            text = text_of(row.get("message"))
            if text.strip():
                return text
    return ""


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    args = parser.parse_args(argv)
    raw = sys.stdin.read() if not sys.stdin.isatty() else ""
    try:
        payload = json.loads(raw)
    except ValueError:
        return 0
    if not isinstance(payload, dict) or payload.get("stop_hook_active") is True:
        return 0
    text = payload.get("last_assistant_message")
    if not isinstance(text, str):
        path = payload.get("agent_transcript_path")
        text = last_from_transcript(Path(path)) if isinstance(path, str) and path.endswith(".jsonl") else ""
    limit = limit_of(Path(args.root))
    if len(text) <= limit:
        return 0
    sys.stderr.write(f"위임 결과가 {len(text):,}자다 — 결론 · 근거만 남겨 {limit:,}자 이하로 다시 끝낸다(설계 12 MR-R10).\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())
