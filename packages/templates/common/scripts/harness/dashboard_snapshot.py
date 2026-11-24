#!/usr/bin/env python3
"""관리 페이지 읽기 묶음(설계 06 §3.2): 체크아웃 하나의 보드 상태 · 이슈 게이트 판정 · 열린 리뷰 지적을 한 번에 낸다.

    python3 scripts/harness/dashboard_snapshot.py --root <체크아웃의 하네스 루트>

출력 JSON `{schema, board, gates, reviews, errors}`. board 는 `board.sh --json` 과, gates 는 `sdd_gates.py check --all` 과,
reviews 는 `review_state.py --all --json` 과 같은 함수의 결과다. 파일을 쓰지 않고 모델을 부르지 않는다.
"""

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import review_state, sdd_gates  # noqa: E402
from harness.sdd_board import board_json  # noqa: E402


def snapshot(root):
    out = {"schema": "knots-sync.dashboard-snapshot/v1", "board": {"issues": []}, "gates": [], "reviews": [], "errors": []}
    for name, compute in (("board", lambda: board_json(root)), ("gates", lambda: sdd_gates.all_results(root)), ("reviews", lambda: review_state.all_states(root))):
        try:
            out[name] = compute()
        except (OSError, ValueError) as error:
            out["errors"].append({"part": name, "message": str(error)})
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description="관리 페이지 읽기 묶음")
    parser.add_argument("--root", required=True)
    options = parser.parse_args(argv)
    root = Path(options.root).resolve()
    if not ((root / ".agents/knots-sync.json").is_file() or (root / ".agents/harness.json").is_file()):
        print(f"✖ 하네스 루트가 아니다: {root}", file=sys.stderr)
        return 2
    print(json.dumps(snapshot(root), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
