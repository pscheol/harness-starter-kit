#!/usr/bin/env python3
"""생성 파일 직접 편집 차단(설계 03 §3.12 · R4.3, HK-24 design §5). protect-generated.sh 가 부른다.

lock 의 킷 mirror · render 항목(폴더 mirror 는 그 아래 전부)에 쓰려 하면 exit 2 와 원본 경로를 알린다.
lock 이 없거나 읽을 수 없으면 통과한다. 사람 몫(owner user) 항목은 막지 않는다. 모델을 부르지 않는다.
"""

import json
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(1, str(HERE.parent / "harness"))

import hook_paths  # noqa: E402

HARNESS_DIRS = (".claude/", ".codex/", ".cursor/", ".kiro/")


def read_payload():
    if sys.stdin.isatty():
        return {}
    try:
        data = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def generated(root):
    try:
        from projection_engine import read_lock
        _, entries, _ = read_lock(root)
    except Exception:  # noqa: BLE001 — lock 을 못 읽으면 막지 않는다(fast 검증이 stale 로 잡는다)
        return []
    return [(e.path, e.source) for e in entries if e.op in ("mirror", "render") and e.owner == "kit"]


def source_of(root, path):
    """v1 lock 배치 줄에는 원본이 없다 — 지금 원본에서 원하는 작업을 다시 세워 찾는다."""
    try:
        from projection_wants import HARNESSES, build_wants, load_spec, read_meta
        meta = read_meta(root)
        agents = [a for a in meta.get("agents") or [] if a in HARNESSES]
        tokens = {k: v for k, v in (meta.get("tokens") or {}).items() if isinstance(v, str)}
        wants, _ = build_wants(root, load_spec(), tokens, agents)
    except Exception:  # noqa: BLE001 — 원본을 못 찾아도 차단은 한다
        return None
    return next((w.source for w in wants if w.path == path), None)


def main():
    root = Path(os.environ.get("HARNESS_ROOT") or HERE.parents[1]).resolve()
    targets = [p for p in hook_paths.tool_paths(read_payload(), root) if p.startswith(HARNESS_DIRS)]
    if not targets:
        return 0
    entries = generated(root)
    for target in targets:
        for path, source in entries:
            if target == path or target.startswith(path + "/"):
                origin = source or source_of(root, path) or ".agents/ 아래 원본"
                print(f"차단: {target} 는 생성 파일이다. 원본 {origin} 을 고친다(고친 뒤 동기화 훅이 다시 만든다).", file=sys.stderr)
                return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
