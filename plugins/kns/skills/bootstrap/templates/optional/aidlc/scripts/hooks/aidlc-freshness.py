#!/usr/bin/env python3
"""AI-DLC 산출물이 어댑터 출력(units.json)보다 새로우면 sync aidlc 를 안내한다(설계 10 §3.2).

    python3 scripts/hooks/aidlc-freshness.py --root <하네스 루트>

- flow.design 이 aidlc 가 아니면 아무것도 하지 않는다.
- 연결된 Intent(.agents/docs/intents/*/intent.json)마다 AI-DLC 폴더의 가장 새 파일 시각을 intent.json 의 adaptedAt 과 견준다.
- 연결되지 않은 AI-DLC Intent 폴더(aidlc-state.md 가 있는 폴더)도 센다.
- 안내할 것이 있을 때만 Stop 훅 JSON 한 줄을 낸다. 없으면 0바이트. 모델을 부르지 않는다.
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

sys.dont_write_bytecode = True

SKIP_PARTS = ("audit",)


def read_json(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def newest(folder):
    best = 0.0
    for item in folder.rglob("*"):
        parts = item.relative_to(folder).parts
        if not item.is_file() or any(part in SKIP_PARTS or part.startswith(".aidlc-") for part in parts):
            continue
        best = max(best, item.stat().st_mtime)
    return best


def epoch(text):
    try:
        return datetime.fromisoformat(str(text)).timestamp()
    except ValueError:
        return 0.0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    root = Path(parser.parse_args().root)
    meta = read_json(root / ".agents" / "knots-sync.json") or {}
    flow = meta.get("flow") if isinstance(meta.get("flow"), dict) else {}
    if flow.get("design") != "aidlc":
        return 0
    linked = set()
    stale = []
    for link in sorted((root / ".agents" / "docs" / "intents").glob("*/intent.json")):
        data = read_json(link) or {}
        aidlc = data.get("aidlc") if isinstance(data.get("aidlc"), dict) else {}
        path = aidlc.get("path")
        if not isinstance(path, str):
            continue
        folder = (root / path).resolve()
        linked.add(folder)
        adapter = data.get("adapter") if isinstance(data.get("adapter"), dict) else {}
        if folder.is_dir() and newest(folder) > epoch(adapter.get("adaptedAt")) + 1:
            stale.append(link.parent.name)
    unlinked = 0
    for state in (root / "aidlc" / "spaces").glob("*/intents/*/aidlc-state.md"):
        if state.parent.resolve() not in linked:
            unlinked += 1
    parts = []
    if stale:
        parts.append(f"AI-DLC 산출물이 units.json 보다 새롭다({', '.join(stale)})")
    if unlinked:
        parts.append(f"킷에 연결되지 않은 AI-DLC Intent {unlinked}개")
    if parts:
        print(json.dumps({"systemMessage": " · ".join(parts) + " — knots-sync sync aidlc"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
