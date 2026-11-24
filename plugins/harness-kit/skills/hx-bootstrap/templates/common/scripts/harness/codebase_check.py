#!/usr/bin/env python3
"""codebase 모델 · current-state 검사(설계 08 §3.13 · DS-R22 · DS-R23, HK-19 design §5).

    python3 scripts/harness/codebase_check.py check [<파일|폴더>…] [--json]   # 출처 형식(실패 exit 1) + 오래됨(경고)
    python3 scripts/harness/codebase_check.py gate <Intent 키|폴더> [--json]  # codebase 게이트 앞 조건(관리 페이지 승인 API 가 부른다)

- 출처 칸: `static:<도구>` · `inferred · <파일:줄>` · `confirmed:Q-<n>` 중 하나. inferred 는 근거 위치(파일:줄)가 있어야 한다.
- 오래됨: baseSha 가 base HEAD 의 조상이 아니거나, baseSha..base HEAD 의 그 모델 paths 변경 줄 합 > codebase.staleLines(200)
  또는 추가 · 삭제 · 이름 바꿈 파일 수 ≥ codebase.staleFiles(3). 판정은 git 출력만 본다(모델을 부르지 않는다).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import intent as intents  # noqa: E402
from harness.sdd_frontmatter import split as split_frontmatter, unquote  # noqa: E402

CODEBASE = ".agents/docs/codebase"
SOURCE_STATIC = re.compile(r"^static:\S+")
LOCATION = re.compile(r"[\w.\-/]+\.\w+:\d+")
SOURCE_INFERRED = re.compile(r"^inferred · .*?[\w.\-/]+\.\w+:\d+")
SOURCE_CONFIRMED = re.compile(r"^confirmed:Q-\d+$")
FLOW_HEAD = re.compile(r"^### (F-\d+) .*· 출처: (.+?)(?: · 근거: (.+))?$")
TABLES = ("1", "2", "3", "5")
DEFAULT_STALE_LINES = 200
DEFAULT_STALE_FILES = 3


# ── 머리(흐름 형식 값: [..] · {..}) ──────────────────────────────────────────


class FlowError(ValueError):
    pass


def parse_flow(text: str):
    """YAML 흐름 형식의 부분 집합: [a, "b"] · {k: v} · null · true/false · 정수 · 따옴표 문자열 · 맨 문자열."""
    pos = 0

    def skip() -> None:
        nonlocal pos
        while pos < len(text) and text[pos] in " \t":
            pos += 1

    def scalar(stop: str) -> str:
        nonlocal pos
        skip()
        if pos < len(text) and text[pos] in "\"'":
            quote = text[pos]
            end = text.find(quote, pos + 1)
            if end < 0:
                raise FlowError("따옴표가 닫히지 않았다")
            value, pos = text[pos + 1:end], end + 1
            return value
        start = pos
        while pos < len(text) and text[pos] not in stop:
            pos += 1
        return text[start:pos].strip()

    def atom(raw: str):
        if raw in ("null", "~", ""):
            return None
        if raw in ("true", "false"):
            return raw == "true"
        return int(raw) if re.fullmatch(r"-?\d+", raw) else raw

    def value(stop: str):
        nonlocal pos
        skip()
        if pos < len(text) and text[pos] == "[":
            pos += 1
            out = []
            skip()
            if pos < len(text) and text[pos] == "]":
                pos += 1
                return out
            while True:
                out.append(value(",]"))
                skip()
                if pos >= len(text):
                    raise FlowError("] 가 없다")
                if text[pos] == "]":
                    pos += 1
                    return out
                pos += 1
        if pos < len(text) and text[pos] == "{":
            pos += 1
            out = {}
            skip()
            if pos < len(text) and text[pos] == "}":
                pos += 1
                return out
            while True:
                key = scalar(":}")
                if pos >= len(text) or text[pos] != ":":
                    raise FlowError(f"{key!r} 뒤에 : 가 없다")
                pos += 1
                out[key] = value(",}")
                skip()
                if pos >= len(text):
                    raise FlowError("} 가 없다")
                if text[pos] == "}":
                    pos += 1
                    return out
                pos += 1
        quoted = pos < len(text) and text[pos] in "\"'"
        raw = scalar(stop)
        return raw if quoted else atom(raw)

    result = value("")
    skip()
    if pos != len(text):
        raise FlowError(f"남은 글자: {text[pos:]!r}")
    return result


def head_of(text: str) -> dict:
    """머리 → 값. `key: [..]` · `key: {..}` 는 흐름 형식, `key:` 다음 `  - {..}` 줄들은 목록이다. 형식이 틀리면 ValueError."""
    lines, _ = split_frontmatter(text)
    if lines is None:
        return {}
    out: dict = {}
    current = None
    for number, raw in enumerate(lines, 2):
        line = raw.rstrip("\r")
        if not line.strip():
            continue
        item = re.match(r"^\s+- (.+)$", line)
        if item and current is not None and isinstance(out.get(current), list):
            out[current].append(parse_flow(item[1].strip()))
            continue
        m = re.match(r"^([a-z][a-zA-Z0-9]*):\s*(.*?)(\s+#.*)?$", line)
        if not m:
            raise ValueError(f"머리 {number}번 줄 형식: {line!r}")
        key, value = m[1], m[2].strip()
        current = key
        if value == "":
            out[key] = []
        elif value[0] in "[{":
            out[key] = parse_flow(value)
        else:
            out[key] = None if value in ("null", "~") else unquote(value)
    return out


# ── 출처 칸(DS-R22) ──────────────────────────────────────────────────────────


def source_problem(source: str) -> str | None:
    s = source.strip()
    if SOURCE_STATIC.match(s) or SOURCE_CONFIRMED.match(s):
        return None
    if s.startswith("inferred"):
        return None if SOURCE_INFERRED.match(s) else "inferred 행에 근거 위치(파일:줄)가 없다"
    return "출처가 static:<도구> · inferred · <파일:줄> · confirmed:Q-<n> 중 하나가 아니다" if s else "출처가 비었다"


def model_problems(text: str) -> list[str]:
    out = []
    lines = text.splitlines()
    section = None
    seen_header: set[str] = set()
    for number, line in enumerate(lines, 1):
        m = re.match(r"^## (\d+)\. ", line)
        if m:
            section = m[1]
            continue
        if section == "4":
            f = FLOW_HEAD.match(line)
            if line.startswith("### F-") and not f:
                out.append(f"{number}: 흐름 제목은 '### F-<n> <이름> · 출처: … · 근거: <파일:줄>'")
            elif f and f[2].strip().startswith("inferred"):
                if not (f[3] and LOCATION.search(f[3])):
                    out.append(f"{number}: {f[1]} inferred 흐름에 근거 위치(파일:줄)가 없다")
            elif f and (problem := source_problem(f[2])):
                out.append(f"{number}: {f[1]} {problem}")
            continue
        if section not in TABLES or not line.strip().startswith("|"):
            continue
        if section not in seen_header:
            seen_header.add(section)
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-+:?", c) for c in cells if c):
            continue
        problem = source_problem(cells[-1])
        if problem:
            out.append(f"{number}: §{section} {cells[0] or '(빈 ID)'} — {problem}")
    return out


# ── 오래됨(DS-R23) ───────────────────────────────────────────────────────────


def git(root: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-c", "core.quotePath=false", *args], cwd=root, capture_output=True, text=True, check=False)


def base_head(root: Path, meta: dict) -> str | None:
    base = (meta.get("git") or {}).get("base") if isinstance(meta.get("git"), dict) else None
    for ref in [r for r in (base, f"origin/{base}" if base else None, "HEAD") if r]:
        r = git(root, "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}")
        if r.returncode == 0:
            return r.stdout.strip()
    return None


def thresholds(meta: dict) -> tuple[int, int]:
    conf = meta.get("codebase") if isinstance(meta.get("codebase"), dict) else {}
    return int(conf.get("staleLines", DEFAULT_STALE_LINES)), int(conf.get("staleFiles", DEFAULT_STALE_FILES))


def pathspecs(paths) -> list[str]:
    return [f":(glob){p}" for p in paths if isinstance(p, str) and p.strip()] if isinstance(paths, list) else []


def staleness(root: Path, head: dict, meta: dict) -> dict:
    """{stale, reason, lines, files}. paths 가 없으면 판정하지 않는다(stale False, reason)."""
    base_sha = head.get("baseSha")
    specs = pathspecs(head.get("paths"))
    if not base_sha:
        return {"stale": True, "reason": "baseSha 가 없다 — codebase_scan.py 로 만든다", "lines": None, "files": None}
    if not specs:
        return {"stale": False, "reason": "paths 가 없다 — 판정하지 않는다", "lines": None, "files": None}
    tip = base_head(root, meta)
    if tip is None or git(root, "merge-base", "--is-ancestor", str(base_sha), tip).returncode != 0:
        return {"stale": True, "reason": f"기준 커밋 {base_sha} 가 base HEAD 의 조상이 아니다", "lines": None, "files": None}
    numstat = git(root, "diff", "--numstat", f"{base_sha}..{tip}", "--", *specs).stdout
    lines = sum(int(a) + int(d) for a, d, *_ in (row.split("\t") for row in numstat.splitlines() if row.strip()) if a.isdigit() and d.isdigit())
    status = git(root, "diff", "--name-status", "-M", f"{base_sha}..{tip}", "--", *specs).stdout
    files = sum(1 for row in status.splitlines() if row[:1] in ("A", "D", "R"))
    max_lines, max_files = thresholds(meta)
    stale = lines > max_lines or files >= max_files
    reason = f"baseSha 뒤 바뀐 줄 {lines}(기준 {max_lines}) · 추가 · 삭제 · 이름 바꿈 파일 {files}(기준 {max_files})"
    return {"stale": stale, "reason": reason, "lines": lines, "files": files}


# ── 파일 단위 ────────────────────────────────────────────────────────────────


def check_model(root: Path, path: Path, meta: dict) -> dict:
    rel = path.relative_to(root).as_posix() if path.is_relative_to(root) else str(path)
    text = path.read_text(encoding="utf-8")
    try:
        head = head_of(text)
    except ValueError as err:
        return {"path": rel, "problems": [f"머리: {err}"], "stale": None}
    problems = [f"{rel}:{p}" for p in model_problems(text)]
    if head.get("kind") != "codebase-model":
        problems.insert(0, f"{rel}: 머리 kind 는 codebase-model")
    return {"path": rel, "problems": problems, "stale": staleness(root, head, meta)}


def models_of(root: Path, current_state: Path) -> tuple[list[dict], list[str]]:
    try:
        head = head_of(current_state.read_text(encoding="utf-8"))
    except ValueError as err:
        return [], [f"current-state.md 머리: {err}"]
    models = head.get("models") or []
    if not isinstance(models, list) or not all(isinstance(m, dict) and isinstance(m.get("path"), str) for m in models):
        return [], ["current-state.md 머리 models 는 [{path, sha256, baseSha}] 목록이다"]
    return models, []


def is_model(root: Path, path: Path) -> bool:
    if "_spec-templates" in path.parts:
        return False
    if path.parent == root / CODEBASE:
        return True
    try:
        return head_of(path.read_text(encoding="utf-8")).get("kind") == "codebase-model"
    except (OSError, ValueError):
        return False


def targets(root: Path, given: list[str]) -> list[Path]:
    """검사할 파일: codebase 모델과 current-state.md 만. 아무것도 안 주면 codebase/ 전부와 Intent 폴더의 current-state.md."""
    if not given:
        given = [CODEBASE, intents.INTENTS]
    out = []
    for g in given:
        p = Path(g) if Path(g).is_absolute() else root / g
        files = sorted(p.rglob("*.md")) if p.is_dir() else [p]
        out += [f for f in files if f.is_file() and (f.name == "current-state.md" or is_model(root, f))]
    return list(dict.fromkeys(out))


def run_check(root: Path, given: list[str]) -> dict:
    meta = intents.meta_of(root)
    results = []
    for path in targets(root, given):
        if path.name == "current-state.md":
            models, problems = models_of(root, path)
            missing = [f"{path.relative_to(root).as_posix()}: 모델 {m['path']} 가 없다" for m in models if not (root / m["path"]).is_file()]
            results.append({"path": path.relative_to(root).as_posix(), "problems": problems + missing, "stale": None})
        else:
            results.append(check_model(root, path, meta))
    problems = [p for r in results for p in r["problems"]]
    warnings = [f"{r['path']}: 역공학 문서 오래됨 — {r['stale']['reason']}" for r in results if r["stale"] and r["stale"]["stale"]]
    return {"ok": not problems, "problems": problems, "warnings": warnings, "files": results}


def run_gate(root: Path, target: str) -> dict:
    """codebase 게이트 앞 조건(08 §3.6 표). reasons 는 422 gate_precondition, stale 은 422 model_stale."""
    folder = intents.find_folder(root, target)
    meta = intents.meta_of(root)
    head = intents.front(folder / "intent.md")
    reasons, stale = [], []
    if head.get("kind") not in intents.RE_KINDS:
        reasons.append(f"intent.md kind 가 {head.get('kind')} 이다 — codebase 게이트는 feature · change · refactor 만")
    cs = folder / "current-state.md"
    if not cs.is_file():
        return {"reasons": reasons + ["current-state.md 가 없다"], "stale": [], "files": [], "folder": folder.relative_to(root).as_posix()}
    qpath = folder / "questions.md"
    if qpath.is_file():
        open_q = [q["id"] for q in intents.parse_questions(qpath.read_text(encoding="utf-8"))["questions"] if q["answer"] is None and q["gate"] == "codebase"]
        if open_q:
            reasons.append(f"막는 게이트가 codebase 인 열린 질문 {len(open_q)}건({', '.join(open_q)})")
    cs_head = head_of(cs.read_text(encoding="utf-8"))
    if not cs_head.get("headSha"):
        reasons.append("current-state.md 머리 headSha 가 없다(§4 시험 기준선의 커밋)")
    models, problems = models_of(root, cs)
    reasons += problems
    if not models and not problems:
        reasons.append("current-state.md 머리 models 가 비었다 — 참조하는 codebase 모델을 적는다")
    rel = folder.relative_to(root).as_posix()
    files = [{"name": "current-state.md", "path": f"{rel}/current-state.md"}]
    for m in models:
        path = root / m["path"]
        if not path.is_file():
            reasons.append(f"모델 {m['path']} 가 없다")
            continue
        result = check_model(root, path, meta)
        reasons += result["problems"]
        if result["stale"] and result["stale"]["stale"]:
            stale.append({"path": m["path"], **result["stale"]})
        files.append({"name": m["path"], "path": m["path"]})
    return {"reasons": reasons, "stale": stale, "files": files, "folder": rel}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="codebase_check.py", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.add_argument("paths", nargs="*")
    c.add_argument("--json", action="store_true")
    g = sub.add_parser("gate")
    g.add_argument("target")
    g.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    root = intents.harness_root(Path.cwd())
    if args.cmd == "gate":
        r = run_gate(root, args.target)
        if args.json:
            print(json.dumps(r, ensure_ascii=False))
        else:
            for line in r["reasons"] + [f"오래됨: {s['path']} — {s['reason']}" for s in r["stale"]]:
                print(f"✖ {line}")
        return 0 if not r["reasons"] and not r["stale"] else 1
    r = run_check(root, args.paths)
    if args.json:
        print(json.dumps(r, ensure_ascii=False))
    else:
        for w in r["warnings"]:
            print(f"⚠ {w}", file=sys.stderr)
        for p in r["problems"]:
            print(f"✖ {p}", file=sys.stderr)
    return 0 if r["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
