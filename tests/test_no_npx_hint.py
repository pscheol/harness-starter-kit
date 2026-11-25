"""배포하는 안내 문구에 `npx knots-sync` · `npx kns` 가 없다(HK-22, 2026-11-25).

npm 이름 knots-sync 는 아직 등록하지 않았고(v2.2 에 올린다) kns 는 다른 사람 것이다. `npx knots-sync …` 를 따라 치면
npm 저장소에서 남의 패키지를 받을 수 있다. 설치된 명령은 `knots-sync …`, 판 고정은 `npx -y github:<owner>/<repo>#v<판> …` 로 안내한다.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

KIT = Path(__file__).resolve().parents[1]
ROOTS = ("packages", "plugins/kns")
SKIP_DIRS = {"node_modules", "dist", ".git"}
SUFFIXES = {".ts", ".tsx", ".mjs", ".js", ".py", ".sh", ".md", ".json", ".yml", ".yaml", ".html", ".toml"}
BAD = re.compile(r"npx\s+(?:-y\s+)?(?:knots-sync|kns)(?![\w-])")


def shipped_files() -> list[Path]:
    out: list[Path] = []
    for root in ROOTS:
        for p in (KIT / root).rglob("*"):
            if p.is_file() and p.suffix in SUFFIXES and not SKIP_DIRS.intersection(p.relative_to(KIT).parts):
                out.append(p)
    return out


class NoNpxHintTest(unittest.TestCase):
    def test_no_npx_knots_sync_in_shipped_sources(self):
        hits = []
        for p in shipped_files():
            for n, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                if BAD.search(line):
                    hits.append(f"{p.relative_to(KIT)}:{n}: {line.strip()[:120]}")
        self.assertEqual(hits, [], "\n".join(hits[:40]))


if __name__ == "__main__":
    unittest.main()
