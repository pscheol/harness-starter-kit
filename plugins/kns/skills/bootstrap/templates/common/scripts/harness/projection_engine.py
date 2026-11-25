#!/usr/bin/env python3
"""하네스 배치 판정 · 쓰기 · lock(HK-13 design §6 · §7) — 설치 · 업데이트 판정과 v1/v2 lock 읽기 · 쓰기."""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import json  # noqa: E402
import os  # noqa: E402
import secrets  # noqa: E402
from dataclasses import dataclass, field  # noqa: E402
from pathlib import Path  # noqa: E402

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from projection_merge import (  # noqa: E402
    MERGE_KIND,
    MERGERS,
)
from projection_wants import (  # noqa: E402
    build_wants,
    byte_sorted,
    full_merge_want,
    HARNESS_DIRS,
    load_sources,
    LOCK_REL,
    PROJECTION_OPS,
    read_text,
    regular,
    sha256,
    tree_sha,
    V1_HEADER,
    walk_files,
    Want,
)


# ── 지금 상태 · 쓰기 ─────────────────────────────────────────────────────────


def blocked(root: Path, rel: str) -> bool:
    cur = root
    for part in rel.split("/")[:-1]:
        cur = cur / part
        if cur.is_symlink() or (cur.exists() and not cur.is_dir()):
            return True
    return False


def state(root: Path, w_path: str, is_dir: bool) -> dict:
    p = root / w_path
    if blocked(root, w_path):
        return {"kind": "other", "what": "상위 경로가 폴더가 아니다"}
    if p.is_symlink():
        return {"kind": "link"}
    if not p.exists():
        return {"kind": "none"}
    if is_dir:
        if not p.is_dir():
            return {"kind": "other", "what": "폴더 자리에 파일이 있다"}
        files = walk_files(p)
        return {"kind": "file", "sha": tree_sha(files), "files": {rel: data for rel, data, _ in files}}
    if not p.is_file():
        return {"kind": "other", "what": "같은 이름의 폴더가 있다"}
    data = p.read_bytes()
    return {"kind": "file", "sha": sha256(data), "data": data}


def write_atomic(path: Path, data: bytes, executable: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.hk-{secrets.token_hex(4)}"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o777 if executable else 0o666)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def remove_empty_dirs(base: Path, stop: Path) -> None:
    for dirpath, _dirs, _files in sorted(os.walk(base), key=lambda t: -len(t[0])):
        p = Path(dirpath)
        try:
            if p != stop and not any(p.iterdir()):
                p.rmdir()
        except OSError:
            pass
    cur = base
    while cur != stop and cur.exists():
        try:
            cur.rmdir()
        except OSError:
            break
        cur = cur.parent


def unlink_target(root: Path, rel: str) -> None:
    p = root / rel
    if p.is_symlink() or p.is_file():
        p.unlink()


def write_want(root: Path, w: Want) -> None:
    p = root / w.path
    if p.is_symlink():
        p.unlink()
    if w.kind != "dir":
        write_atomic(p, w.data, w.executable)
        return
    if p.exists() and not p.is_dir():
        p.unlink()
    wanted = {rel for rel, _, _ in w.files}
    for rel, _data, _ in walk_files(p):
        if rel not in wanted:
            (p / rel).unlink()
    for rel, data, executable in w.files:
        target = p / rel
        if target.is_file() and not target.is_symlink() and target.read_bytes() == data and bool(target.stat().st_mode & 0o100) == executable:
            continue
        write_atomic(target, data, executable)
    for dirpath, _dirs, _files in sorted(os.walk(p), key=lambda t: -len(t[0])):
        q = Path(dirpath)
        if q != p and not any(q.iterdir()):
            q.rmdir()


def delete_want_path(root: Path, rel: str, is_dir: bool) -> None:
    p = root / rel
    if is_dir and p.is_dir() and not p.is_symlink():
        for f, _d, _x in walk_files(p):
            (p / f).unlink()
        remove_empty_dirs(p, root)
    else:
        unlink_target(root, rel)
        remove_empty_dirs(p.parent, root)


def differing(w: Want, cur: dict) -> list[str]:
    """mirror 폴더에서 D 와 다른(또는 C 에 없는) 파일."""
    have = cur.get("files", {})
    return [rel for rel, data, _ in w.files if have.get(rel) != data]


def extra_files(w: Want, cur: dict) -> list[str]:
    wanted = {rel for rel, _, _ in w.files}
    return [rel for rel in cur.get("files", {}) if rel not in wanted]


# ── lock ─────────────────────────────────────────────────────────────────────


@dataclass
class Entry:
    path: str
    op: str
    owner: str = "kit"
    sha: str | None = None
    harness: str = ""
    source: str | None = None
    from_sha: str | None = None
    keys: list | None = None
    created: bool = False
    label: str = ""          # v1 copy 줄의 레이어 라벨(다시 적을 때)

    def v1_line(self) -> str:
        if self.op == "copy":
            return f"{self.sha or '-'}\t{self.label}\t{self.harness}\t{self.path}"
        label = "merge+" if self.op == "merge" and self.created else self.op
        sha = "-" if self.op == "merge" or self.owner != "kit" else (self.sha or "-")
        return f"{sha}\t{label}\t{self.harness or 'core'}\t{self.path}"

    def v2(self) -> dict:
        out: dict = {"path": self.path, "op": self.op, "owner": self.owner}
        if self.op == "merge" and self.owner == "kit":
            out["keys"] = list(self.keys or [])
            if self.created:
                out["createdByKit"] = True
            return out
        out["sha256"] = self.sha if self.owner == "kit" else None
        if self.owner == "kit" and self.source:
            out["from"] = self.source
            out["fromSha256"] = self.from_sha
        return out


def parse_v1_lines(text: str) -> list[Entry]:
    out: list[Entry] = []
    for line in text.split("\n")[1:]:
        line = line.rstrip("\r")
        if not line or line.startswith("#"):
            continue
        cols = line.split("\t")
        if len(cols) != 4:
            continue
        sha, label, harness, rel = cols
        op = label.rstrip("+") if label.rstrip("+") in PROJECTION_OPS else "copy"
        out.append(Entry(rel, op, "kit", None if sha == "-" else sha, harness, created=label == "merge+", label=label))
    return out


def read_lock(root: Path) -> tuple[str, list[Entry], dict | None]:
    p = root / LOCK_REL
    if not regular(p):
        return "missing", [], None
    text = p.read_text(encoding="utf-8")
    if text.startswith(V1_HEADER):
        return "v1", parse_v1_lines(text), None
    raw = json.loads(text)
    out = []
    for e in raw.get("entries", []):
        out.append(Entry(e["path"], e["op"], e.get("owner", "kit"), e.get("sha256"), "", e.get("from"), e.get("fromSha256"),
                         e.get("keys"), bool(e.get("createdByKit")), e.get("layer", "")))
    return "v2", out, raw


def _inline(v) -> str:
    if v is None or not isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        return "[" + ", ".join(_inline(x) for x in v) + "]"
    return "{" + ", ".join(f"{json.dumps(k, ensure_ascii=False)}: {_inline(x)}" for k, x in v.items()) + "}"


def _block(v, indent: str) -> str:
    if v is None or not isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    inner = indent + "  "
    if isinstance(v, list):
        if not v or all(x is None or not isinstance(x, (dict, list)) for x in v):
            return _inline(v)
        return "[\n" + ",\n".join(inner + _inline(x) for x in v) + "\n" + indent + "]"
    if not v:
        return "{}"
    return "{\n" + ",\n".join(f"{inner}{json.dumps(k, ensure_ascii=False)}: {_block(x, inner)}" for k, x in v.items()) + "\n" + indent + "}"


def format_json(value) -> str:
    """CLI core/json.ts formatJson 과 같은 바이트."""
    return _block(value, "") + "\n"


ENTRY_ORDER = ("path", "op", "owner", "sha256", "layer", "from", "fromSha256", "keys", "createdByKit")


def write_v2_lock(root: Path, raw: dict, entries: list[dict]) -> None:
    by_path = {e["path"]: e for e in entries}
    ordered = []
    for p in byte_sorted(by_path):
        e = by_path[p]
        ordered.append({**{k: e[k] for k in ENTRY_ORDER if k in e}, **{k: v for k, v in e.items() if k not in ENTRY_ORDER}})
    lock = {"schema": raw.get("schema"), "kit": raw.get("kit"), "packs": raw.get("packs", []), "entries": ordered}
    write_atomic(root / LOCK_REL, format_json(lock).encode("utf-8"), False)


# ── 판정 ─────────────────────────────────────────────────────────────────────


@dataclass
class Op:
    path: str
    op: str
    action: str
    reason: str = ""
    new_files: list = field(default_factory=list)
    backups: list = field(default_factory=list)


def owner_kind(owner: str) -> str:
    if owner in ("kit", "user"):
        return owner
    if owner.startswith("external:"):
        return "external"
    if owner.startswith("pack:"):
        return "pack"
    return "unknown"


# 훅 설정 병합(.claude/settings.json · .codex/hooks.json)
HOOK_MERGE_KINDS = frozenset({"settings", "codex-hooks"})
# v1.0.7 이하 킷이 훅 스크립트를 둔 폴더(v1.0.8 부터 scripts/hooks/)
LEGACY_HOOK_DIRS = (".claude/hooks/", ".codex/hooks/")
KEPT_LEGACY_HOOK = "사람이 고친 옛 훅 스크립트다 — 지우지 않았고 설정의 호출 줄도 남겼다(새 훅과 함께 돈다). 고친 내용을 새 훅으로 옮긴 뒤 호출 줄과 파일을 지운다"


class Engine:
    """설치 · update 판정과 적용(design §6.2 · §6.3). dry_run 이면 판정만 한다."""

    def __init__(self, root: Path, spec: dict, tokens: dict, agents: list[str], dry_run: bool = False):
        self.root = root
        self.spec = spec
        self.tokens = tokens
        self.agents = agents
        self.dry_run = dry_run
        self.wants, self.findings = build_wants(root, spec, tokens, agents)
        self.sources = load_sources(root)
        self.ops: list[Op] = []
        self.entries: list[Entry] = []
        # 이번 update 가 지우는 v1 포인터 경로. 그 경로로 끝나는 훅 줄은 킷 줄로 보고 새 훅으로 바꾼다 — 남기면 지운 파일을 부른다.
        self.gone_scripts: list[str] = []

    def will_remove(self, e: Entry) -> bool:
        """drop 이 지울 항목인가(킷 소유 copy 이고 파일이 없거나 설치 때 그대로다). drop 의 판정과 같다."""
        if owner_kind(e.owner) != "kit" or e.op == "merge":
            return False
        p = self.root / e.path
        cur = state(self.root, e.path, p.is_dir() and not p.is_symlink())
        return cur["kind"] == "none" or (cur["kind"] == "file" and e.sha is not None and cur["sha"] == e.sha)

    def with_gone_scripts(self, w: Want) -> dict:
        if not self.gone_scripts or w.kind not in HOOK_MERGE_KINDS:
            return w.merge
        return {**w.merge, "suffixes": list(w.merge.get("suffixes") or []) + self.gone_scripts}

    def wants_by_path(self) -> dict[str, Want]:
        return {w.path: w for w in self.wants}

    def emit(self, op: Op, entry: Entry | None) -> None:
        self.ops.append(op)
        if entry is not None:
            self.entries.append(entry)

    def kit_entry(self, w: Want, sha: str | None = None) -> Entry:
        return Entry(w.path, w.op, "kit", w.sha if sha is None else sha, w.harness, w.source, w.from_sha)

    # merge(설치 · update 공통)
    def merge(self, w: Want, prev: Entry | None, claimed: list[Entry]) -> None:
        cur = read_text(self.root, w.path)
        p = self.root / w.path
        if cur is None and p.exists():
            self.emit(Op(w.path, "merge", "conflict", "일반 파일이 아니다"), prev)
            return
        merge, _, _ = MERGERS[w.kind]
        want = self.with_gone_scripts(w)
        v1 = next((c for c in claimed if c.path == w.path), None)
        created = bool(prev and prev.created)
        if v1 is not None and cur is not None:
            unmodified = v1.sha is not None and sha256(cur.encode("utf-8")) == v1.sha
            if w.kind == "claude-md":
                lines = cur.split("\n")
                has_block = any(line.startswith("<!-- knots-sync:begin claude") for line in lines)
                if unmodified:
                    cur, created = None, True
                elif not has_block:
                    fresh = merge(None, want)
                    self.emit(Op(w.path, "merge", "conflict", "v1 CLAUDE.md 를 사람이 고쳤다", new_files=[f"{w.path}.new"]), v1)
                    if not self.dry_run:
                        write_atomic(self.root / f"{w.path}.new", fresh["text"].encode("utf-8"), False)
                    return
            else:
                created = unmodified
        r = merge(cur, want, prev.keys if prev and prev.keys is not None else None)
        if not r["ok"]:
            self.emit(Op(w.path, "merge", "conflict", r["reason"]), prev or Entry(w.path, "merge", "kit", harness=w.harness, keys=[]))
            return
        created = created or r["created"]
        action = "create" if cur is None and not p.exists() else ("same" if cur == r["text"] else "merge")
        if action != "same" and not self.dry_run:
            write_atomic(p, r["text"].encode("utf-8"), False)
        self.emit(Op(w.path, "merge", action), Entry(w.path, "merge", "kit", None, w.harness, keys=r["keys"], created=created))

    def install(self, w: Want, prev: Entry | None, force: bool) -> None:
        if w.op == "merge":
            self.merge(w, prev, [])
            return
        if w.deferred:
            self.emit(Op(w.path, w.op, "defer", "원본이 .new 대기 중이다"), prev)
            return
        cur = state(self.root, w.path, w.kind == "dir")
        if cur["kind"] == "none":
            action, entry = "create", self.kit_entry(w)
        elif cur["kind"] != "file":
            action, entry = "skip-user", prev or Entry(w.path, w.op, "user", None, w.harness)
            self.emit(Op(w.path, w.op, action, cur.get("what", "링크다")), entry)
            return
        elif cur["sha"] == w.sha:
            action, entry = "same", self.kit_entry(w)
        elif prev is not None and owner_kind(prev.owner) == "kit":
            self.emit(Op(w.path, w.op, "keep"), prev)
            return
        elif force:
            action, entry = "replace", self.kit_entry(w)
        else:
            self.emit(Op(w.path, w.op, "skip-user", "사람이 둔 파일이다"), Entry(w.path, w.op, "user", None, w.harness))
            return
        if action in ("create", "replace") and not self.dry_run:
            write_want(self.root, w)
        self.emit(Op(w.path, w.op, action), entry)

    def unmodified_claimed(self, w: Want, cur: dict, claimed: list[Entry]) -> bool:
        if w.kind != "dir":
            c = next((c for c in claimed if c.path == w.path), None)
            return c is not None and c.sha is not None and cur.get("sha") == c.sha
        shas = {c.path[len(w.path) + 1:]: c.sha for c in claimed if c.path.startswith(w.path + "/")}
        files = cur.get("files", {})
        return bool(shas) and all(rel in shas and shas[rel] is not None and sha256(data) == shas[rel] for rel, data in files.items())

    def update(self, w: Want, prev: Entry | None, claimed: list[Entry], accept_all: bool) -> None:
        if w.op == "merge":
            self.merge(w, prev, claimed)
            return
        if w.deferred:
            self.emit(Op(w.path, w.op, "defer", "원본이 .new 대기 중이다"), prev)
            for c in claimed:
                self.entries.append(c)
            return
        if prev is not None and owner_kind(prev.owner) != "kit":
            kind = owner_kind(prev.owner)
            self.emit(Op(w.path, w.op, {"user": "skip-user", "external": "skip-external", "pack": "skip-pack"}.get(kind, "skip-user")), prev)
            return
        cur = state(self.root, w.path, w.kind == "dir")
        tracked = prev is not None or bool(claimed)
        if cur["kind"] == "link":
            self.write(w, "replace", "symlink-found")
            return
        if cur["kind"] == "other":
            self.emit(Op(w.path, w.op, "skip-user", cur["what"]), prev or Entry(w.path, w.op, "user", None, w.harness))
            return
        if not tracked:
            if cur["kind"] == "none":
                self.write(w, "new")
            elif cur["sha"] == w.sha:
                self.emit(Op(w.path, w.op, "same"), self.kit_entry(w))
            else:
                self.emit(Op(w.path, w.op, "skip-user", "사람이 둔 파일이다"), Entry(w.path, w.op, "user", None, w.harness))
            return
        if cur["kind"] == "none":
            self.write(w, "restore")
            return
        if cur["sha"] == w.sha:
            self.emit(Op(w.path, w.op, "same"), self.kit_entry(w))
            return
        unmodified = (prev.sha is not None and cur["sha"] == prev.sha) if prev is not None else self.unmodified_claimed(w, cur, claimed)
        if unmodified:
            self.write(w, "update")
            return
        base = prev.sha if prev is not None else (next((c.sha for c in claimed if c.path == w.path), None) if w.kind != "dir" else None)
        if accept_all:
            backups = [f"{w.path}.bak"] if w.kind != "dir" else [f"{w.path}/{rel}.bak" for rel in differing(w, cur) + extra_files(w, cur) if rel in cur.get("files", {})]
            if not self.dry_run:
                for b in backups:
                    os.replace(self.root / b.removesuffix(".bak"), self.root / b)
            self.write(w, "replace", backups=backups)
            return
        new_files = [f"{w.path}.new"] if w.kind != "dir" else [f"{w.path}/{rel}.new" for rel in differing(w, cur)]
        if not self.dry_run:
            if w.kind != "dir":
                write_atomic(self.root / f"{w.path}.new", w.data, False)
            else:
                data = {rel: d for rel, d, _ in w.files}
                for n in new_files:
                    write_atomic(self.root / n, data[n[len(w.path) + 1: -len(".new")]], False)
        self.emit(Op(w.path, w.op, "conflict", "복사본 · 생성물을 직접 고쳤다 — 원본을 고친다", new_files=new_files), self.kit_entry(w, sha=base or ""))
        self.entries[-1].sha = base

    def write(self, w: Want, action: str, reason: str = "", backups: list | None = None) -> None:
        if not self.dry_run:
            write_want(self.root, w)
        self.emit(Op(w.path, w.op, action, reason, backups=backups or []), self.kit_entry(w))

    def drop(self, e: Entry, why: str = "") -> None:
        """원하지 않게 된 배치 항목 · retire(design §6.3). merge 는 킷 키를 뺀다."""
        if owner_kind(e.owner) != "kit":
            self.entries.append(e)
            return
        if e.op == "merge":
            kind = MERGE_KIND.get(e.path)
            cur = read_text(self.root, e.path)
            if kind is None or cur is None:
                self.ops.append(Op(e.path, "merge", "delete" if cur is None else "keep-modified", why))
                return
            merge, unmerge, _ = MERGERS[kind]
            want = full_merge_want(kind, self.spec, self.tokens, self.sources)
            keys = e.keys if e.keys is not None else merge(None, want)["keys"]
            r = unmerge(cur, keys, want)
            if not r["ok"]:
                self.emit(Op(e.path, "merge", "conflict", r["reason"]), e)
                return
            if r["empty"] and e.created:
                if not self.dry_run:
                    delete_want_path(self.root, e.path, False)
                self.ops.append(Op(e.path, "merge", "delete"))
            else:
                if r["text"] != cur and not self.dry_run:
                    write_atomic(self.root / e.path, r["text"].encode("utf-8"), False)
                self.ops.append(Op(e.path, "merge", "unmerge"))
            return
        p = self.root / e.path
        is_dir = p.is_dir() and not p.is_symlink()
        cur = state(self.root, e.path, is_dir)
        action = "retire" if e.op == "copy" else "delete"
        if cur["kind"] == "none":
            self.ops.append(Op(e.path, e.op, action, "파일이 이미 없다"))
            return
        if cur["kind"] == "file" and e.sha is not None and cur["sha"] == e.sha:
            if not self.dry_run:
                delete_want_path(self.root, e.path, is_dir)
            self.ops.append(Op(e.path, e.op, action, why))
            return
        reason = KEPT_LEGACY_HOOK if e.path.startswith(LEGACY_HOOK_DIRS) else "사람이 고친 파일이다 — 지우지 않았다"
        self.emit(Op(e.path, e.op, "keep-modified", reason), Entry(e.path, e.op, "user", None, e.harness, label=e.label))


def claims(w: Want, path: str) -> bool:
    return path == w.path or (w.kind == "dir" and path.startswith(w.path + "/"))


def replacement_deferred(path: str, wants: dict[str, Want]) -> bool:
    if path.startswith(".claude/commands/") and path.endswith(".md"):
        w = wants.get(f".claude/skills/{path[len('.claude/commands/'):-len('.md')]}")
        return bool(w and w.deferred)
    return False


def run_install(engine: Engine, prev: list[Entry], force: bool) -> None:
    by_path = {e.path: e for e in prev if e.op in PROJECTION_OPS}
    for w in sorted(engine.wants, key=lambda w: w.path.encode("utf-8")):
        engine.install(w, by_path.get(w.path), force)


def run_update(engine: Engine, prev: list[Entry], copy_now: set[str], accept_all: bool) -> None:
    wants = engine.wants_by_path()
    projection = {e.path: e for e in prev if e.op in PROJECTION_OPS}
    orphans = [e for e in prev if e.op == "copy" and e.path not in copy_now]
    claimed: dict[str, list[Entry]] = {}
    rest: list[Entry] = []
    for e in orphans:
        w = next((w for w in wants.values() if claims(w, e.path)), None)
        if w is not None:
            claimed.setdefault(w.path, []).append(e)
        else:
            rest.append(e)
    retiring = [e for e in rest if e.path.startswith(HARNESS_DIRS) and not replacement_deferred(e.path, wants)]
    engine.gone_scripts = [e.path for e in sorted(retiring, key=lambda e: e.path.encode("utf-8")) if engine.will_remove(e)]
    for w in sorted(engine.wants, key=lambda w: w.path.encode("utf-8")):
        engine.update(w, projection.get(w.path), claimed.get(w.path, []), accept_all)
    for path in byte_sorted(p for p in projection if p not in wants):
        engine.drop(projection[path], "원본이 없다")
    for e in sorted(rest, key=lambda e: e.path.encode("utf-8")):
        if not e.path.startswith(HARNESS_DIRS):
            continue
        if replacement_deferred(e.path, wants):
            engine.emit(Op(e.path, "copy", "defer", "바꿀 스킬 원본이 .new 대기 중이다"), e)
            continue
        engine.drop(e, "v1 포인터 — 복사본 · 생성물로 바뀌었다")
