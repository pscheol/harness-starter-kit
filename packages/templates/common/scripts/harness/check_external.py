#!/usr/bin/env python3
"""외부 도구 파일이 안 바뀌었는지 본다(설계 11 §3.9 · 10 MD-R7).

킷 update · repair · remove 앞뒤로 lock 의 `owner: external:<도구>` 항목(AI-DLC · Entire 가 만든 파일)의 sha256 을 비교한다.
킷은 그 파일을 쓰지 않아야 한다. 이 스크립트도 읽기만 한다(--save 가 쓰는 파일 하나 빼고).

    python3 scripts/harness/check_external.py --save .agents/state/external-before.json
    (update · repair 등)
    python3 scripts/harness/check_external.py --snapshot .agents/state/external-before.json

--snapshot 은 --save 가 쓴 파일이나 `add <모듈>` 이 남긴 `.agents/state/module-snapshots/<모듈>-<시각>.json`(그때 있던 외부 파일)을 받는다.
도구가 계속 덧붙이는 기록 파일(`*.log`, `logs/` 아래)은 비교에서 뺀다. exit 0 = 바뀐 것 없음, 1 = 바뀌었거나 없어졌음, 2 = 입력 오류.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

LOCK = ".agents/knots-sync.lock"
SCHEMA = "knots-sync.external-check/v1"


def volatile(rel: str) -> bool:
    return rel.endswith(".log") or "/logs/" in f"/{rel}"


def sha_of(root: Path, rel: str) -> str | None:
    path = root / rel
    if path.is_symlink() or not path.is_file():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def external_paths(root: Path) -> list[str]:
    lock = root / LOCK
    try:
        data = json.loads(lock.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"✖ {LOCK} 이 없다 — 킷이 설치된 리포 루트에서 실행한다")
    except ValueError:
        raise SystemExit(f"✖ {LOCK} 을 JSON 으로 읽지 못했다(v1 lock 에는 외부 항목이 없다 — update 뒤에 쓴다)")
    entries = data.get("entries") if isinstance(data, dict) else None
    if not isinstance(entries, list):
        raise SystemExit(f"✖ {LOCK} 에 entries 가 없다")
    return sorted({e["path"] for e in entries if isinstance(e, dict) and str(e.get("owner", "")).startswith("external:") and isinstance(e.get("path"), str)})


def save(root: Path, out: Path) -> int:
    files = {rel: sha for rel in external_paths(root) if not volatile(rel) and (sha := sha_of(root, rel))}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"schema": SCHEMA, "files": files}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"✔ 외부 파일 {len(files)}개의 sha256 을 적었다: {out}")
    return 0


def compare(root: Path, snapshot: Path) -> int:
    try:
        data = json.loads(snapshot.read_text(encoding="utf-8"))
    except (OSError, ValueError) as err:
        print(f"✖ 스냅숏을 읽지 못했다: {snapshot} ({err})", file=sys.stderr)
        return 2
    before = data.get("files", data.get("external")) if isinstance(data, dict) else None
    if not isinstance(before, dict):
        print(f"✖ 스냅숏에 files(또는 external) 표가 없다: {snapshot}", file=sys.stderr)
        return 2
    changed, missing, skipped = [], [], 0
    for rel, sha in sorted(before.items()):
        if volatile(rel):
            skipped += 1
            continue
        now = sha_of(root, rel)
        if now is None:
            missing.append(rel)
        elif now != sha:
            changed.append(rel)
    for rel in changed:
        print(f"✖ 바뀜: {rel}")
    for rel in missing:
        print(f"✖ 없어짐: {rel}")
    total = len(before) - skipped
    tail = f" · 기록 파일 {skipped}개는 뺐다" if skipped else ""
    if changed or missing:
        print(f"외부 파일 {total}개 중 바뀜 {len(changed)} · 없어짐 {len(missing)}{tail}")
        return 1
    print(f"✔ 외부 파일 {total}개 그대로{tail}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--save", metavar="파일", help="지금 외부 파일 sha256 을 적는다")
    group.add_argument("--snapshot", metavar="파일", help="적어 둔 값과 비교한다")
    parser.add_argument("--root", default=".", help="리포 루트(기본: 지금 폴더)")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    if args.save:
        return save(root, Path(args.save))
    return compare(root, Path(args.snapshot))


if __name__ == "__main__":
    sys.exit(main())
