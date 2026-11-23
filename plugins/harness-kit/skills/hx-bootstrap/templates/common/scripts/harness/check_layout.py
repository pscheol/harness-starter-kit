#!/usr/bin/env python3
"""배치 검사 — lock 의 mirror · render · merge · copy 항목을 지금 파일과 견준다(HK-13 R6, 03 §3.9).

    python3 scripts/harness/check_layout.py [--root R] [--json] [--verbose]
    python3 scripts/harness/check_layout.py --context [--json]      세션마다 실리는 바이트(하네스별, design §11)

오류가 있으면 exit 1. v1(TSV) lock 이면 한 줄을 내고 exit 0. 판정은 `harness-kit doctor` 와 같다. 파일을 고치지 않는다.
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import argparse  # noqa: E402
import json  # noqa: E402
import re  # noqa: E402
import tomllib  # noqa: E402
from pathlib import Path  # noqa: E402

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from projection import (  # noqa: E402
    HARNESSES,
    LOCK_REL,
    ProjectionError,
    build_wants,
    full_merge_want,
    load_sources,
    load_spec,
    read_lock,
    read_meta,
    read_text,
    sha256,
    tree_sha,
    walk_files,
)
from projection_merge import MERGE_KIND, MERGERS  # noqa: E402
from projection_render import parse_frontmatter, split_frontmatter  # noqa: E402

LIMIT = 24 * 1024
MARK = {"error": "✖", "warn": "⚠", "info": "·"}
SOURCE_DIRS = (".agents/rules/", ".agents/skills/", ".agents/roles/")
LINK = re.compile(r"\[[^\]]*\]\((\.\./[^)\s]*)\)")


def finding(kind: str, severity: str, path: str, hint: str) -> dict:
    return {"kind": kind, "severity": severity, "path": path, "hint": hint}


def current_sha(p: Path, is_dir: bool) -> str | None:
    if p.is_symlink() or not p.exists():
        return None
    if is_dir:
        return tree_sha(walk_files(p)) if p.is_dir() else None
    return sha256(p.read_bytes()) if p.is_file() else None


def links_inside(p: Path) -> list[str]:
    if not p.is_dir() or p.is_symlink():
        return []
    return sorted(q.relative_to(p).as_posix() for q in p.rglob("*") if q.is_symlink())


def relative_refs(text: str) -> bool:
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"`[^`\n]*`", "", text)
    return bool(LINK.search(text))


def projection_findings(root: Path, entries) -> tuple[list[dict], int]:
    """lock 항목별 판정. (발견, 본 항목 수)."""
    out: list[dict] = []
    spec = None
    sources = None
    meta = read_meta(root)
    tokens = {k: v for k, v in (meta.get("tokens") or {}).items() if isinstance(v, str)}
    for e in entries:
        p = root / e.path
        if e.owner != "kit":
            continue
        if e.op in ("mirror", "render"):
            is_dir = e.op == "mirror" and ((p.is_dir() and not p.is_symlink()) or bool(e.source and (root / e.source).is_dir()))
            if p.is_symlink():
                out.append(finding("symlink-found", "error", e.path, "링크 대신 실제 파일을 둔다 → npx harness-kit repair"))
                continue
            for inner in links_inside(p):
                out.append(finding("symlink-found", "error", f"{e.path}/{inner}", "링크 대신 실제 파일을 둔다 → npx harness-kit repair"))
            cur = current_sha(p, is_dir)
            if cur is None:
                out.append(finding("missing", "error", e.path, f"원본 {e.source or '?'} 에서 다시 만든다 → npx harness-kit repair"))
                continue
            if e.sha is None or cur != e.sha:
                out.append(finding("drifted", "error", e.path, f"복사본 · 생성물을 직접 고쳤다. 원본 {e.source or '?'} 을 고친다 → npx harness-kit repair"))
                continue
            if e.source and e.from_sha:
                src = root / e.source
                now = current_sha(src, src.is_dir())
                if now is None:
                    out.append(finding("stale", "error", e.path, f"원본 {e.source} 이 없다 → npx harness-kit update"))
                elif now != e.from_sha:
                    out.append(finding("stale", "error", e.path, f"원본 {e.source} 가 바뀌었다 → npx harness-kit repair"))
        elif e.op == "merge" and e.keys:
            kind = MERGE_KIND.get(e.path)
            if kind is None:
                continue
            if spec is None:
                spec = load_spec()
                sources = load_sources(root)
            cur = read_text(root, e.path)
            _, _, missing = MERGERS[kind]
            lost = list(e.keys) if cur is None else missing(cur, e.keys, full_merge_want(kind, spec, tokens, sources))
            if lost:
                out.append(finding("merge-missing", "error", e.path, f"킷 키 {', '.join(lost[:3])}{' …' if len(lost) > 3 else ''} 가 없다 → npx harness-kit repair"))
        elif e.op == "copy":
            if not p.is_file() or p.is_symlink():
                out.append(finding("missing", "error", e.path, "킷 파일이 없다 → npx harness-kit repair"))
            elif e.path.startswith(SOURCE_DIRS) and e.path.endswith(".md") and relative_refs(p.read_text(encoding="utf-8", errors="replace")):
                out.append(finding("relative-ref", "error", e.path, "킷 원본은 `../` 대신 리포 기준 경로(.agents/…)를 쓴다(복사본에서 깨진다)"))
    for e in entries:
        for side in (f"{e.path}.new", f"{e.path}.bak"):
            if (root / side).exists():
                out.append(finding("pending-new", "warn", side, f"병합하거나 지운다(diff -u {e.path} {side})"))
    return out, len(entries)


def model_findings(root: Path) -> list[dict]:
    meta = read_meta(root)
    agents = [a for a in meta.get("agents") or [] if a in HARNESSES]
    tokens = {k: v for k, v in (meta.get("tokens") or {}).items() if isinstance(v, str)}
    try:
        _, found = build_wants(root, load_spec(), tokens, agents)
    except ProjectionError as error:
        return [finding("layout-conflict", "error", ".agents", str(error))]
    return found


def size_findings(root: Path) -> list[dict]:
    out = []
    entry = sum((root / n).stat().st_size for n in ("AGENTS.md", "CLAUDE.md") if (root / n).is_file())
    if entry > LIMIT:
        out.append(finding("entry-size", "warn", "AGENTS.md", f"AGENTS.md + CLAUDE.md = {entry:,} bytes (기준 {LIMIT:,})"))
    always = context(root)["kiro"]["rules"]
    if always > LIMIT:
        out.append(finding("steering-size", "warn", ".kiro/steering", f"inclusion: always steering = {always:,} bytes (기준 {LIMIT:,})"))
    return out


# ── 세션 적재량(design §11) ──────────────────────────────────────────────────


def _fm(path: Path) -> dict:
    block, _ = split_frontmatter(path.read_text(encoding="utf-8", errors="replace"))
    return parse_frontmatter(block) if block is not None else {}


def _desc(path: Path) -> int:
    try:
        if path.suffix == ".toml":
            value = tomllib.loads(path.read_text(encoding="utf-8")).get("description", "")
        elif path.suffix == ".json":
            value = json.loads(path.read_text(encoding="utf-8")).get("description", "")
        else:
            value = _fm(path).get("description", "")
    except (ValueError, OSError):
        return 0
    return len(value.encode("utf-8")) if isinstance(value, str) else 0


def _files(root: Path, pattern: str) -> list[Path]:
    return sorted(p for p in root.glob(pattern) if p.is_file())


def context(root: Path) -> dict[str, dict[str, int]]:
    entry = sum((root / n).stat().st_size for n in ("AGENTS.md", "CLAUDE.md") if (root / n).is_file())
    out: dict[str, dict[str, int]] = {}
    for h in HARNESSES:
        rules = 0
        descs: list[Path] = []
        if h == "claude":
            rules = sum(p.stat().st_size for p in _files(root, ".claude/rules/*.md") if "paths" not in _fm(p))
            descs = _files(root, ".claude/skills/*/SKILL.md") + _files(root, ".claude/commands/**/*.md") + _files(root, ".claude/agents/*.md")
        elif h == "codex":
            descs = _files(root, ".agents/skills/*/SKILL.md") + _files(root, ".codex/agents/*.toml")
        elif h == "cursor":
            for p in _files(root, ".cursor/rules/*.mdc"):
                fm = _fm(p)
                rules += p.stat().st_size if fm.get("alwaysApply") == "true" else len(str(fm.get("description") or "").encode("utf-8"))
            descs = _files(root, ".cursor/commands/*.md")
        else:
            rules = sum(p.stat().st_size for p in _files(root, ".kiro/steering/*.md") if (_fm(p).get("inclusion") or "always") == "always")
            descs = _files(root, ".kiro/skills/*/SKILL.md") + _files(root, ".kiro/agents/*.json")
        d = sum(_desc(p) for p in descs)
        out[h] = {"entry": entry, "rules": rules, "descriptions": d, "total": entry + rules + d}
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="check_layout.py", description="lock 기준 배치 검사")
    parser.add_argument("--root", default=str(HERE.parents[1]))
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--context", action="store_true")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    if args.context:
        sizes = context(root)
        if args.json:
            print(json.dumps({"context": sizes}, ensure_ascii=False, indent=2))
        else:
            for h, v in sizes.items():
                print(f"  {h:<7} {v['total']:>7,} bytes = 진입 {v['entry']:,} + 늘 싣는 규칙 {v['rules']:,} + 설명 {v['descriptions']:,}")
        return 0
    fmt, entries, _ = read_lock(root)
    if fmt == "missing":
        print("lock 없음 — 배치 검사를 건너뛴다")
        return 0
    if fmt == "v1":
        print("lock v1 — 배치 검사는 v2부터")
        return 0
    found, count = projection_findings(root, entries)
    found += model_findings(root) + size_findings(root)
    if args.verbose:
        for e in entries:
            p = root / e.path
            if e.op == "copy" and e.owner == "kit" and p.is_file() and e.sha and sha256(p.read_bytes()) != e.sha:
                found.append(finding("drifted", "info", e.path, "사람이 고친 킷 파일이다. update 때 .new 로 받는다"))
    errors = sum(1 for f in found if f["severity"] == "error")
    warnings = sum(1 for f in found if f["severity"] == "warn")
    if args.json:
        print(json.dumps({"entries": count, "errors": errors, "warnings": warnings, "findings": found}, ensure_ascii=False, indent=2))
    else:
        for f in found:
            print(f"{MARK[f['severity']]} {f['kind']:<12} {f['path']} — {f['hint']}")
        print(f"배치 검사: 항목 {count}개, 오류 {errors}, 경고 {warnings}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
