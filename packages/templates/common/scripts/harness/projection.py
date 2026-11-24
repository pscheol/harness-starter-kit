#!/usr/bin/env python3
"""하네스 배치 — `.agents/` 원본에서 하네스 폴더의 복사본(mirror) · 생성물(render) · 병합(merge)을 만든다(HK-13).

    projection.py plan  [--root R] [--agents a,b] [--token K=V] [--json]   원하는 작업과 해시(쓰지 않는다)
    projection.py apply --root R --mode setup|update --lock L [--prev-lock P] [--agents a,b] [--token K=V]
                        [--force] [--accept-all] [--dry-run]                setup.sh · update.sh 용(v1 lock 줄을 L 에 덧붙인다)
    projection.py sync  [--root R] [--changed P]…                            lock 기준으로 다시 만든다(Node 없는 repair)

판정 · 형식은 CLI(packages/cli/src/projection)와 같다(design §4~§7). 표준 라이브러리만 쓴다. 모델을 부르지 않는다.
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import argparse  # noqa: E402
import json  # noqa: E402
from pathlib import Path  # noqa: E402

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from projection_engine import (  # noqa: E402
    delete_want_path,
    Engine,
    Entry,
    Op,
    owner_kind,
    parse_v1_lines,
    read_lock,
    read_text,
    run_install,
    run_update,
    state,
    write_atomic,
    write_v2_lock,
    write_want,
)
from projection_merge import MERGERS  # noqa: E402
from projection_wants import (  # noqa: E402
    build_wants,
    byte_sorted,
    HARNESSES,
    load_spec,
    LOCK_REL,
    PROJECTION_OPS,
    ProjectionError,
    read_meta,
    records,
)


# ── 명령 ─────────────────────────────────────────────────────────────────────


def selection(root: Path, args) -> tuple[list[str], dict]:
    meta = read_meta(root)
    agents = [a for a in (args.agents.replace(",", " ").split() if args.agents else meta.get("agents") or []) if a in HARNESSES]
    tokens = {k: v for k, v in (meta.get("tokens") or {}).items() if isinstance(v, str)}
    for raw in args.token or []:
        k, _, v = raw.partition("=")
        tokens[k] = v
    return agents, tokens


ACTION_ORDER = ("create", "new", "restore", "update", "replace", "merge", "unmerge", "conflict", "keep-modified", "delete", "retire", "skip-user", "keep", "defer")


def summary(ops: list[Op]) -> str:
    counts = {a: sum(1 for o in ops if o.action == a) for a in ACTION_ORDER}
    shown = " · ".join(f"{a} {n}" for a, n in counts.items() if n)
    return f"  배치: {shown or '바꿀 것 없음'}"


def cmd_plan(args) -> int:
    root = Path(args.root).resolve()
    agents, tokens = selection(root, args)
    wants, findings = build_wants(root, load_spec(), tokens, agents)
    if args.json:
        print(json.dumps({"ops": records(wants, root), "findings": findings}, ensure_ascii=False, indent=2))
    else:
        for r in records(wants, root):
            print(f"  {r['op']:<7} {r['path']}")
    return 0


def cmd_apply(args) -> int:
    root = Path(args.root).resolve()
    agents, tokens = selection(root, args)
    engine = Engine(root, load_spec(), tokens, agents, dry_run=args.dry_run)
    prev = parse_v1_lines(Path(args.prev_lock).read_text(encoding="utf-8")) if args.prev_lock and Path(args.prev_lock).is_file() else []
    if args.mode == "setup":
        run_install(engine, prev, args.force)
    else:
        lock_text = Path(args.lock).read_text(encoding="utf-8") if Path(args.lock).is_file() else ""
        copy_now = {e.path for e in parse_v1_lines(lock_text) if e.op == "copy"}
        run_update(engine, prev, copy_now, args.accept_all)
    for f in engine.findings:
        print(f"  ✖ {f['kind']:<16} {f['path']} — {f['hint']}" if f["severity"] == "error" else f"  ⚠ {f['kind']:<16} {f['path']} — {f['hint']}")
    for o in engine.ops:
        if o.action in ("same", "keep"):
            continue
        extra = "".join(f"  → {n}" for n in o.new_files) + "".join(f"  (수정본 → {b})" for b in o.backups)
        print(f"  {o.action:<13} {o.path}{extra}{'  ' + o.reason if o.reason else ''}")
    print(summary(engine.ops))
    if not args.dry_run and args.lock:
        with open(args.lock, "a", encoding="utf-8") as handle:
            for e in sorted(engine.entries, key=lambda e: e.path.encode("utf-8")):
                handle.write(e.v1_line() + "\n")
    return 0


def cmd_sync(args) -> int:
    """lock 의 배치 항목을 지금 원본으로 다시 만든다. 사람이 고친 생성 파일은 건드리지 않고 한 줄로 알린다."""
    root = Path(args.root).resolve()
    agents, tokens = selection(root, args)
    fmt, entries, raw = read_lock(root)
    if fmt == "missing":
        print("lock 이 없다 — 설치는 harness-kit init", file=sys.stderr)
        return 1
    spec = load_spec()
    wants, _ = build_wants(root, spec, tokens, agents)
    changed = [c.rstrip("/") for c in args.changed or []]

    def chosen(source: str | None) -> bool:
        return not changed or any(source and (c == source or c.startswith(source + "/") or source.startswith(c + "/")) for c in changed)

    def merge_chosen(kind: str) -> bool:
        # 역할이 바뀌면 config.toml 역할 표, 훅 원본이 바뀌면 settings · .codex/hooks.json 훅을 다시 맞춘다(HK-24).
        if kind == "codex-config":
            return True
        return kind in ("settings", "codex-hooks") and any(c in (".agents/hooks.json", ".agents/model-policy.json") for c in changed)

    by_path = {e.path: e for e in entries}
    drifted: list[str] = []
    for w in wants:
        if w.deferred or (w.op != "merge" and not chosen(w.source)) or (w.op == "merge" and changed and not merge_chosen(w.kind)):
            continue
        e = by_path.get(w.path)
        if w.op == "merge":
            merge, _, _ = MERGERS[w.kind]
            cur = read_text(root, w.path)
            r = merge(cur, w.merge, e.keys if e and e.keys is not None else None)
            if r["ok"] and r["text"] != cur:
                write_atomic(root / w.path, r["text"].encode("utf-8"), False)
            if r["ok"]:
                by_path[w.path] = Entry(w.path, "merge", "kit", None, w.harness, keys=r["keys"], created=bool(e and e.created) or r["created"])
            continue
        if e is not None and owner_kind(e.owner) != "kit":
            continue
        cur = state(root, w.path, w.kind == "dir")
        if cur["kind"] == "other":
            continue
        if cur["kind"] == "file" and cur["sha"] != w.sha and e is not None and e.sha is not None and cur["sha"] != e.sha:
            drifted.append(w.path)
            continue
        if cur["kind"] == "file" and e is None and cur["sha"] != w.sha:
            continue
        if cur["kind"] != "file" or cur["sha"] != w.sha:
            write_want(root, w)
        by_path[w.path] = Entry(w.path, w.op, "kit", w.sha, w.harness, w.source, w.from_sha, label=e.label if e else "")
    wanted = {w.path for w in wants}
    for path, e in list(by_path.items()):
        if e.op in ("mirror", "render") and owner_kind(e.owner) == "kit" and path not in wanted and (not changed or chosen(e.source)):
            p = root / path
            is_dir = p.is_dir() and not p.is_symlink()
            cur = state(root, path, is_dir)
            if cur["kind"] == "none" or (cur["kind"] == "file" and e.sha is not None and cur["sha"] == e.sha):
                delete_want_path(root, path, is_dir)
                del by_path[path]
    if fmt == "v2":
        old = {e["path"]: e for e in raw.get("entries", [])}
        merged = []
        for path, e in by_path.items():
            base = old.get(path, {})
            if e.op in PROJECTION_OPS:
                merged.append(e.v2())
            else:
                merged.append(base)
        write_v2_lock(root, raw, merged)
    else:
        text = (root / LOCK_REL).read_text(encoding="utf-8")
        head = [l for l in text.split("\n") if l.startswith("#")]
        body = [l for l in text.split("\n")[1:] if l and not l.startswith("#") and (len(l.split("\t")) != 4 or l.split("\t")[1].rstrip("+") not in PROJECTION_OPS)]
        proj = [by_path[p].v1_line() for p in byte_sorted(by_path) if by_path[p].op in PROJECTION_OPS]
        write_atomic(root / LOCK_REL, ("\n".join(head + body + proj) + "\n").encode("utf-8"), False)
    if drifted:
        line = f"생성 파일을 직접 고쳤다: {drifted[0]}{f' 외 {len(drifted) - 1}' if len(drifted) > 1 else ''} — 원본을 고친 뒤 harness-kit repair"
        print(line.encode("utf-8")[:200].decode("utf-8", errors="ignore"), file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="projection.py", description="하네스 배치(mirror · render · merge)")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("plan", "apply", "sync"):
        p = sub.add_parser(name)
        p.add_argument("--root", default=str(HERE.parents[1]))
        p.add_argument("--agents")
        p.add_argument("--token", action="append")
        if name == "plan":
            p.add_argument("--json", action="store_true")
        if name == "apply":
            p.add_argument("--mode", choices=("setup", "update"), required=True)
            p.add_argument("--lock", required=True)
            p.add_argument("--prev-lock")
            p.add_argument("--force", action="store_true")
            p.add_argument("--accept-all", action="store_true")
            p.add_argument("--dry-run", action="store_true")
        if name == "sync":
            p.add_argument("--changed", action="append")
    args = parser.parse_args(argv)
    try:
        return {"plan": cmd_plan, "apply": cmd_apply, "sync": cmd_sync}[args.command](args)
    except ProjectionError as error:
        print(f"✖ {error}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
