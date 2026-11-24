#!/usr/bin/env python3
"""상위 리포의 submodule(도메인 리포) 경계 검사와 기록(설계 10 §3.5, MD-R17). 표준 라이브러리만 쓴다. 모델을 부르지 않는다.

    python3 scripts/harness/check_submodules.py [--domain <경로>]… [--changed [--base <ref>]] [--json]
    python3 scripts/harness/check_submodules.py --record <이슈 키> [--merged YYYY-MM-DD] [--stage <단계>]

검사(실패하면 exit 1, 도메인 폴더가 submodule 이 아니면 건너뛴다):
  init     `git submodule status` 가 `-`(초기화 안 됨)
  pointer  상위 색인의 gitlink SHA 가 submodule 의 어느 원격 브랜치에도 없다(제공 리포 push 전에 포인터를 먼저 커밋)
  dirty    submodule 에 커밋 안 된 변경이 있는데 그 포인터를 상위에서 커밋하려 한다(포인터가 스테이징됐다). 아니면 경고만
  branch   상위 브랜치의 이슈 키와 submodule 브랜치의 이슈 키가 다르다(같은 기능이면 같은 이름)
--changed 는 tools/harness/gates.py --changed 가 바뀌었다고 판정한 도메인만 본다(affected 레벨이 이것을 부른다).

--record 는 상위 `.agents/docs/specs-index.md` 의 `<!-- DOMAINS:BEGIN -->` 구간에 그 이슈 행(도메인별 submodule SHA)을 적는다.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True

KEY = re.compile(r"(?<![A-Za-z0-9])([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})(?![0-9])")
BEGIN = "<!-- DOMAINS:BEGIN — scripts/harness/check_submodules.py --record 가 생성한다. 손으로 고치지 않는다 -->"
END = "<!-- DOMAINS:END -->"
INDEX = ".agents/docs/specs-index.md"
GATES = "tools/harness/gates.py"


def git(directory: Path, *arguments: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(directory), *arguments], capture_output=True, text=True, timeout=60, check=False)


def submodules(repo: Path) -> dict[str, dict]:
    """`git submodule status` → {경로: {state, sha}}. state: ok · uninit · moved · conflict."""
    result = git(repo, "submodule", "status")
    found: dict[str, dict] = {}
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        flag = line[0]
        parts = line[1:].split()
        if len(parts) < 2:
            continue
        found[parts[1]] = {"state": {"-": "uninit", "+": "moved", "U": "conflict"}.get(flag, "ok"), "head": parts[0]}
    return found


def gitlink(repo: Path, path: str) -> str | None:
    """상위 색인의 gitlink SHA(상위가 커밋하게 될 포인터)."""
    out = git(repo, "ls-files", "-s", "--", path).stdout.split()
    return out[1] if len(out) >= 2 and out[0] == "160000" else None


def staged_pointer(repo: Path, path: str) -> bool:
    """HEAD 와 색인의 gitlink 가 다르다(포인터 변경이 스테이징됐다)."""
    head = git(repo, "ls-tree", "HEAD", "--", path).stdout.split()
    in_head = head[2] if len(head) >= 3 and head[0] == "160000" else None
    return gitlink(repo, path) != in_head


def key_of(branch: str) -> str | None:
    m = KEY.search(branch or "")
    return m[1] if m else None


def branch_of(directory: Path) -> str:
    name = git(directory, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    return "" if name in ("", "HEAD") else name


def check_domain(repo: Path, path: str, info: dict, parent_branch: str, commit: bool) -> tuple[list[dict], list[str]]:
    """(문제, 경고). 문제 하나 = {domain, code, message}."""
    problems: list[dict] = []
    warnings: list[str] = []

    def problem(code: str, message: str) -> None:
        problems.append({"domain": path, "code": code, "message": message})

    if info["state"] == "uninit":
        problem("init", "초기화되지 않았다 — git submodule update --init " + path)
        return problems, warnings
    folder = repo / path
    pointer = gitlink(repo, path)
    if pointer:
        gone = git(folder, "cat-file", "-e", pointer + "^{commit}")
        if gone.returncode != 0:
            problem("pointer", f"상위가 가리키는 커밋 {pointer[:7]} 가 이 submodule 에 없다 — git -C {path} fetch")
        elif git(folder, "rev-list", "-n", "1", pointer, "--not", "--remotes").stdout.strip():
            problem("pointer", f"상위가 가리키는 커밋 {pointer[:7]} 가 {path} 의 원격에 없다 — 제공 리포를 먼저 push 한 뒤 상위 포인터를 커밋한다")
    dirty = git(folder, "status", "--porcelain").stdout.strip()
    if dirty:
        count = len(dirty.splitlines())
        if commit or staged_pointer(repo, path):
            problem("dirty", f"커밋 안 된 변경 {count}개가 있는데 상위에서 포인터를 커밋하려 한다 — {path} 에서 먼저 커밋 · push")
        else:
            warnings.append(f"{path}: 커밋 안 된 변경 {count}개(상위 포인터는 아직 그대로다)")
    parent_key, child_key = key_of(parent_branch), key_of(branch_of(folder))
    if parent_key and child_key and parent_key != child_key:
        problem("branch", f"이슈 키가 다르다: 상위 {parent_key} · {path} {child_key} — 같은 기능이면 같은 이름의 브랜치를 쓴다")
    return problems, warnings


def changed_domains(repo: Path, base: str | None) -> list[str]:
    gates = repo / GATES
    if not gates.is_file():
        raise SystemExit(f"{GATES} 가 없다 — --changed 는 multi-harness 루트에서만 쓴다")
    arguments = [sys.executable, str(gates), "--repo", str(repo), "--json", "--changed"] + (["--base", base] if base else [])
    r = subprocess.run(arguments, capture_output=True, text=True, timeout=120, check=False)
    if r.returncode:
        raise SystemExit((r.stderr.strip().splitlines() or ["gates.py 실패"])[-1].lstrip("✖ "))
    return [row["path"] for row in json.loads(r.stdout) if row.get("changed")]


def run_check(args) -> int:
    repo = args.repo.resolve()
    found = submodules(repo)
    wanted = list(args.domain) + (changed_domains(repo, args.base) if args.changed else [])
    paths = [p.rstrip("/") for p in wanted] if (args.domain or args.changed) else sorted(found)
    parent_branch = branch_of(repo)
    problems: list[dict] = []
    warnings: list[str] = []
    checked: list[str] = []
    for path in sorted(set(paths)):
        if path not in found:
            continue  # submodule 이 아닌 도메인 폴더는 이 검사 대상이 아니다
        checked.append(path)
        p, w = check_domain(repo, path, found[path], parent_branch, args.commit)
        problems += p
        warnings += w
    if args.json:
        print(json.dumps({"checked": checked, "problems": problems, "warnings": warnings}, ensure_ascii=False))
    else:
        for item in problems:
            print(f"✖ {item['domain']}: [{item['code']}] {item['message']}")
        for w in warnings:
            print(f"▲ {w}")
        print(f"submodule {len(checked)}개 확인 — 문제 {len(problems)} · 경고 {len(warnings)}")
    return 1 if problems else 0


# ── record ───────────────────────────────────────────────────────────────────
def stage_of(repo: Path, key: str) -> str:
    for folder in sorted((repo / ".agents/docs/issues").glob(f"{key}-*")):
        for name, field in (("tasks.md", "state"), ("design.md", "status"), ("requirements.md", "status")):
            doc = folder / name
            if doc.is_file():
                m = re.search(rf"^{field}:\s*(\S+)", doc.read_text(encoding="utf-8"), re.M)
                if m:
                    return m[1]
    return "—"


def parse_rows(section: str) -> tuple[list[str], dict[str, dict]]:
    columns: list[str] = []
    rows: dict[str, dict] = {}
    for line in section.splitlines():
        if not line.startswith("|") or set(line) <= set("|-: "):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells[0] == "이슈":
            columns = cells[2:-1]
            continue
        if len(cells) < 4 or not columns:
            continue
        key = cells[0].split()[0]
        rows[key] = {"label": cells[0], "stage": cells[1], "sha": dict(zip(columns, cells[2:-1])), "merged": cells[-1]}
    return columns, rows


def render(columns: list[str], rows: dict[str, dict]) -> str:
    cols = sorted(columns)
    lines = [BEGIN, "", "## 도메인 포인터(이슈별 submodule SHA)", "", "| 이슈 | 단계 | " + " | ".join(cols) + " | 병합 |", "|---|---|" + "---|" * len(cols) + "---|"]
    for key in sorted(rows):
        r = rows[key]
        lines.append(f"| {r['label']} | {r['stage']} | " + " | ".join(r["sha"].get(c, "—") for c in cols) + f" | {r['merged']} |")
    lines += ["", END]
    return "\n".join(lines) + "\n"


def run_record(args) -> int:
    repo = args.repo.resolve()
    if not re.fullmatch(KEY.pattern, args.key):
        print(f"✖ 이슈 키 형식이 아니다: {args.key}", file=sys.stderr)
        return 2
    found = submodules(repo)
    shas = {}
    for path, info in found.items():
        pointer = gitlink(repo, path)
        if pointer and info["state"] != "uninit":
            shas[path] = pointer[:7]
    if not shas:
        print("✖ 초기화된 submodule 이 없다", file=sys.stderr)
        return 3
    index = repo / INDEX
    text = index.read_text(encoding="utf-8") if index.is_file() else "# 스펙 색인\n"
    m = re.search(re.escape(BEGIN.split(" —")[0]) + r"[^\n]*\n(.*?)" + re.escape(END) + r"\n?", text, re.S)
    columns, rows = parse_rows(m[1]) if m else ([], {})
    folder = next(iter(sorted((repo / ".agents/docs/issues").glob(f"{args.key}-*"))), None)
    label = f"{args.key} {folder.name[len(args.key) + 1:]}" if folder else args.key
    previous = rows.get(args.key, {})
    rows[args.key] = {
        "label": label,
        "stage": args.stage or stage_of(repo, args.key),
        "sha": {**previous.get("sha", {}), **shas},
        "merged": args.merged or previous.get("merged", "—"),
    }
    columns = sorted(set(columns) | set(shas))
    block = render(columns, rows)
    new = (text[: m.start()] + block + text[m.end():]) if m else text.rstrip("\n") + "\n\n" + block
    index.parent.mkdir(parents=True, exist_ok=True)
    temporary = index.with_name(f".{index.name}.{os.getpid()}.tmp")
    temporary.write_text(new, encoding="utf-8")
    os.replace(temporary, index)
    print(f"✔ {args.key}: " + " · ".join(f"{p} {s}" for p, s in sorted(shas.items())) + f" → {INDEX}")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2], help=argparse.SUPPRESS)
    parser.add_argument("--domain", action="append", default=[], help="검사할 도메인 경로(여러 번)")
    parser.add_argument("--changed", action="store_true", help="바뀐 도메인만(tools/harness/gates.py --changed)")
    parser.add_argument("--base", help="--changed 의 비교 기준 ref")
    parser.add_argument("--commit", action="store_true", help="상위 커밋 직전 검사: 커밋 안 된 변경이 있으면 실패")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--record", metavar="KEY", help="검사 대신 상위 specs-index.md 에 그 이슈의 도메인별 submodule SHA 를 적는다")
    parser.add_argument("--merged", help="--record: 병합일(YYYY-MM-DD)")
    parser.add_argument("--stage", help="--record: 단계(기본은 이슈 문서 머리에서 읽는다)")
    args = parser.parse_args(argv)
    if args.record:
        args.key = args.record
        return run_record(args)
    return run_check(args)


if __name__ == "__main__":
    sys.exit(main())
