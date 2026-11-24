#!/usr/bin/env python3
"""codebase 모델의 정적 행 만들기(설계 08 §3.13, HK-19 design §5).

    python3 scripts/harness/codebase_scan.py <영역> [--paths <glob>…] [--stack jvm|python|web|electron|go] [--dry-run] [--json]

- `.agents/docs/codebase/<영역>.md` 의 §1 모듈 · §2 의존 · §3 데이터 모델에서 출처가 `static:` 인 행만 다시 만든다.
  `inferred` · `confirmed` 행과 §4~§6 은 그대로 둔다. 모듈 ID(M-n)는 이름이 같으면 유지한다.
- 그 컴퓨터에 있는 것만 쓴다(설정 파일 · import 줄 · 마이그레이션 파일 · 엔티티 표지). 없는 도구는 머리 scanner.missing 에 적는다.
- 머리 baseSha 를 base HEAD 로 올린다. 모델을 부르지 않는다.
"""

from __future__ import annotations

import argparse
import ast
import fnmatch
import json
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import intent as intents  # noqa: E402
from harness.codebase_check import CODEBASE, base_head, head_of, pathspecs  # noqa: E402
from harness.sdd_frontmatter import split as split_frontmatter  # noqa: E402

STACKS = ("jvm", "python", "web", "electron", "go")
DEP_TOOL = {"jvm": "import-lines", "python": "ast", "web": "import-lines", "electron": "import-lines", "go": "import-lines"}
MAX_FILES = 5000
MAX_BYTES = 1024 * 1024
TEMPLATE = ".agents/docs/_spec-templates/codebase/_template.md"
CREATE_TABLE = re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?[`\"\[]?([\w.]+)[`\"\]]?", re.I)
HEADERS = {
    "1": "| ID | 모듈 | 경로 | 책임 | 출처 |\n|---|---|---|---|---|",
    "2": "| 출발 | 도착 | 종류(import · 호출 · 이벤트 · DB) | 출처 |\n|---|---|---|---|",
    "3": "| 테이블 · 엔티티 | 키 | 주인 모듈 | 출처 |\n|---|---|---|---|",
}


# ── 파일 목록 ────────────────────────────────────────────────────────────────


def files_in(root: Path, paths: list[str]) -> list[str]:
    specs = pathspecs(paths) or ["."]
    r = subprocess.run(["git", "-c", "core.quotePath=false", "ls-files", "-co", "--exclude-standard", "--", *specs], cwd=root, capture_output=True, text=True, check=False)
    if r.returncode == 0:
        names = r.stdout.splitlines()
    else:
        names = [p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file() and ".git" not in p.parts]
        names = [n for n in names if not paths or any(fnmatch.fnmatch(n, p) for p in paths)]
    return sorted(n for n in names if not n.startswith(".agents/"))[:MAX_FILES]


def read(root: Path, name: str) -> str:
    path = root / name
    try:
        return path.read_text(encoding="utf-8", errors="replace") if path.stat().st_size <= MAX_BYTES else ""
    except OSError:
        return ""


# ── 모듈 ────────────────────────────────────────────────────────────────────


def modules_jvm(root: Path, files: list[str]) -> list[dict]:
    out = []
    for settings in ("settings.gradle", "settings.gradle.kts"):
        text = read(root, settings) if (root / settings).is_file() else ""
        for call in re.findall(r"include\s*\(?([^)\n]+)\)?", text):
            for name in re.findall(r"['\"]:?([\w\-:]+)['\"]", call):
                out.append({"name": name.split(":")[-1], "path": name.replace(":", "/") + "/", "tool": "gradle-settings"})
    if (root / "pom.xml").is_file():
        for name in re.findall(r"<module>\s*([^<\s]+)\s*</module>", read(root, "pom.xml")):
            out.append({"name": Path(name).name, "path": name.rstrip("/") + "/", "tool": "maven-pom"})
    return out


def modules_python(root: Path, files: list[str]) -> list[dict]:
    tops = set()
    for f in files:
        parts = f.split("/")
        if parts[-1] == "__init__.py":
            base = 1 if parts[0] == "src" and len(parts) > 2 else 0
            if len(parts) == base + 2:
                tops.add("/".join(parts[: base + 1]))
    return [{"name": t.split("/")[-1], "path": t + "/", "tool": "pyproject" if (root / "pyproject.toml").is_file() else "python-packages"} for t in sorted(tops)]


def modules_web(root: Path, files: list[str]) -> list[dict]:
    try:
        pkg = json.loads(read(root, "package.json") or "{}")
    except ValueError:
        pkg = {}
    workspaces = pkg.get("workspaces") or []
    if isinstance(workspaces, dict):
        workspaces = workspaces.get("packages") or []
    out = []
    for pattern in workspaces if isinstance(workspaces, list) else []:
        for manifest in sorted(root.glob(f"{str(pattern).rstrip('/')}/package.json")):
            try:
                name = json.loads(manifest.read_text(encoding="utf-8")).get("name") or manifest.parent.name
            except ValueError:
                name = manifest.parent.name
            out.append({"name": name, "path": manifest.parent.relative_to(root).as_posix() + "/", "tool": "package-workspaces"})
    return out


def modules_go(root: Path, files: list[str]) -> list[dict]:
    mod = re.search(r"^module\s+(\S+)", read(root, "go.mod"), re.M)
    dirs = sorted({str(Path(f).parent) for f in files if f.endswith(".go") and not f.endswith("_test.go")})
    prefix = mod[1] if mod else ""
    return [{"name": f"{prefix}/{d}".strip("/") if d != "." else prefix or ".", "path": ("" if d == "." else d + "/"), "tool": "go-mod"} for d in dirs]


MODULES = {"jvm": modules_jvm, "python": modules_python, "web": modules_web, "electron": modules_web, "go": modules_go}


def owner(modules: list[dict], name: str) -> dict | None:
    hits = [m for m in modules if name.startswith(m["path"]) or m["path"] == ""]
    return max(hits, key=lambda m: len(m["path"])) if hits else None


# ── 의존 ────────────────────────────────────────────────────────────────────


def deps(stack: str, root: Path, files: list[str], modules: list[dict]) -> list[tuple[str, str, str]]:
    edges: set[tuple[str, str, str]] = set()
    by_name = {m["name"]: m for m in modules}
    packages: dict[str, dict] = {}
    if stack == "jvm":
        for f in files:
            if f.endswith((".java", ".kt")) and (m := owner(modules, f)):
                for pkg in re.findall(r"^\s*package\s+([\w.]+)", read(root, f), re.M):
                    packages.setdefault(pkg, m)
    for f in files:
        src = owner(modules, f)
        if not src:
            continue
        text = read(root, f)
        targets: list[dict] = []
        if stack == "python" and f.endswith(".py"):
            try:
                tree = ast.parse(text)
            except (SyntaxError, ValueError):
                continue
            names = [a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names]
            names += [n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom) and n.module and not n.level]
            targets = [by_name[n.split(".")[0]] for n in names if n.split(".")[0] in by_name]
        elif stack == "jvm" and f.endswith((".java", ".kt")):
            for imp in re.findall(r"^\s*import\s+(?:static\s+)?([\w.]+)", text, re.M):
                hits = [p for p in packages if imp.startswith(p + ".")]
                if hits:
                    targets.append(packages[max(hits, key=len)])
        elif stack in ("web", "electron") and f.endswith((".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue")):
            for spec in re.findall(r"(?:from\s+|import\s*\(\s*|require\s*\(\s*)['\"]([^'\"]+)['\"]", text):
                if spec.startswith("."):
                    t = owner(modules, (Path(f).parent / spec).as_posix().replace("/./", "/"))
                    target = owner(modules, str(Path(Path(f).parent, spec).resolve().relative_to(root.resolve())) + "/") if t is None else t
                else:
                    name = "/".join(spec.split("/")[:2]) if spec.startswith("@") else spec.split("/")[0]
                    target = by_name.get(name)
                if target:
                    targets.append(target)
        elif stack == "go" and f.endswith(".go"):
            block = re.findall(r"^import\s*\(([^)]*)\)|^import\s+\"([^\"]+)\"", text, re.M)
            specs = [s for b, single in block for s in (re.findall(r"\"([^\"]+)\"", b) + ([single] if single else []))]
            targets = [by_name[s] for s in specs if s in by_name]
        for t in targets:
            if t is not src:
                edges.add((src["name"], t["name"], "import"))
    return sorted(edges)


# ── 데이터 모델 ─────────────────────────────────────────────────────────────


def primary_key(sql: str, start: int) -> str:
    body = sql[start: sql.find(";", start) if ";" in sql[start:] else len(sql)]
    inline = re.search(r"^\s*[`\"]?(\w+)[`\"]?\s+[^,\n]*primary\s+key", body, re.I | re.M)
    table = re.search(r"primary\s+key\s*\(\s*([^)]+)\)", body, re.I)
    return inline[1] if inline else (table[1].replace("`", "").replace('"', "").strip() if table else "")


def data(stack: str, root: Path, files: list[str], modules: list[dict]) -> list[tuple[str, str, str, str]]:
    rows: set[tuple[str, str, str, str]] = set()
    for f in files:
        name = Path(f).name
        text = None
        own = (owner(modules, f) or {}).get("name", "")
        if f.endswith(".sql") and (stack in ("jvm", "go") or "migration" in f):
            text = read(root, f)
            tool = f"flyway {name}" if re.match(r"^V\d+.*__.+\.sql$", name) else f"sql-migration {name}"
            for m in CREATE_TABLE.finditer(text):
                rows.add((m[1], primary_key(text, m.end()), own, tool))
        elif stack == "jvm" and f.endswith((".java", ".kt")):
            text = read(root, f)
            if re.search(r"^\s*@Entity\b", text, re.M):
                cls = re.search(r"\bclass\s+(\w+)", text)
                table = re.search(r"@Table\s*\(\s*name\s*=\s*\"(\w+)\"", text)
                key = re.search(r"@Id\b[\s\S]{0,200}?\b(?:val|var|private|protected|public)?\s*(?:\w+\s+)?(\w+)\s*[:;=]", text)
                rows.add((table[1] if table else (cls[1] if cls else name), key[1] if key else "", own, "jpa-entity"))
        elif stack == "jvm" and f.endswith((".xml", ".yaml", ".yml")) and "changelog" in f.lower():
            for t in re.findall(r"(?:<createTable[^>]*tableName=\"|createTable:\s*\n\s*tableName:\s*)(\w+)", read(root, f)):
                rows.add((t, "", own, "liquibase"))
        elif stack == "python" and f.endswith(".py"):
            text = read(root, f)
            for t in re.findall(r"op\.create_table\(\s*['\"](\w+)['\"]", text):
                rows.add((t, "", own, "alembic"))
            for t in re.findall(r"__tablename__\s*=\s*['\"](\w+)['\"]", text):
                rows.add((t, "", own, "sqlalchemy"))
        elif stack in ("web", "electron") and f.endswith(".prisma"):
            text = read(root, f)
            for m in re.finditer(r"^model\s+(\w+)\s*\{([^}]*)\}", text, re.M):
                key = re.search(r"^\s*(\w+)\s+\S+[^\n]*@id\b", m[2], re.M)
                rows.add((m[1], key[1] if key else "", own, "prisma"))
    return sorted(rows)


# ── 문서 쓰기 ────────────────────────────────────────────────────────────────


def cells(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def flow(value) -> str:
    if isinstance(value, list):
        return "[" + ", ".join(flow(v) for v in value) + "]"
    if isinstance(value, dict):
        return "{ " + ", ".join(f"{k}: {flow(v)}" for k, v in value.items()) + " }"
    if value is None:
        return "null"
    text = str(value)
    return json.dumps(text, ensure_ascii=False) if re.search(r"[\s,:\[\]{}#*\"']", text) or text == "" else text


def rewrite(text: str, rows: dict[str, list[str]]) -> str:
    """§1~§3 표의 static 행을 바꾼다. 그 밖의 줄은 그대로."""
    out, section, done = [], None, set()
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^## (\d+)\. ", line)
        if m:
            section = m[1]
        if section in rows and section not in done and line.strip().startswith("|"):
            table = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table.append(lines[i])
                i += 1
            kept = [r for r in table[2:] if not cells(r)[-1].startswith("static:")]
            out += [*HEADERS[section].split("\n"), *kept, *rows[section]]
            done.add(section)
            continue
        out.append(line)
        i += 1
    return "\n".join(out)


def scan(root: Path, area: str, paths: list[str] | None, stack: str | None, today: str) -> dict:
    if not intents.KEBAB.match(area):
        raise SystemExit(f"영역 이름은 kebab-case: {area}")
    meta = intents.meta_of(root)
    stack = stack or str(meta.get("stack") or "")
    if stack not in STACKS:
        raise SystemExit(f"스택을 모른다({stack or '없음'}) — --stack {'|'.join(STACKS)}")
    path = root / CODEBASE / f"{area}.md"
    if path.is_file():
        text = path.read_text(encoding="utf-8")
    else:
        tpl = root / TEMPLATE
        if not tpl.is_file():
            raise SystemExit(f"템플릿이 없다: {TEMPLATE} — knots-sync repair")
        text = intents.fill(tpl.read_text(encoding="utf-8"), {"AREA": area, "CREATED": today})
    head = head_of(text)
    paths = paths or [p for p in head.get("paths") or [] if isinstance(p, str)]
    if not paths:
        raise SystemExit("paths 가 없다 — --paths 'src/payment/**' 처럼 준다")
    files = files_in(root, paths)
    modules = MODULES[stack](root, files)
    if paths:
        modules = [m for m in modules if any(f.startswith(m["path"]) for f in files)] or modules
    old_ids = {}
    for line in intents.sections(text).get("1", []):
        c = cells(line) if line.strip().startswith("|") else []
        if len(c) >= 2 and re.fullmatch(r"M-\d+", c[0]):
            old_ids[c[1]] = c[0]
    next_n = max([int(v[2:]) for v in old_ids.values()] + [0]) + 1
    ids = {}
    for m in modules:
        if m["name"] in old_ids:
            ids[m["name"]] = old_ids[m["name"]]
        else:
            ids[m["name"]] = f"M-{next_n}"
            next_n += 1
    edges = deps(stack, root, files, modules)
    tables = data(stack, root, files, modules)
    missing = sorted({"jdeps"} if stack == "jvm" and not shutil.which("jdeps") else set()) + (["go"] if stack == "go" and not shutil.which("go") else [])
    rows = {
        "1": [f"| {ids[m['name']]} | {m['name']} | {m['path'] or '.'} |  | static:{m['tool']} |" for m in modules],
        "2": [f"| {ids.get(a, a)} | {ids.get(b, b)} | {kind} | static:{DEP_TOOL[stack]} |" for a, b, kind in edges],
        "3": [f"| {t} | {k} | {ids.get(o, o)} | static:{tool} |" for t, k, o, tool in tables],
    }
    body = rewrite(split_frontmatter(text)[1], rows)
    new_head = {**head, "kind": "codebase-model", "area": area, "paths": paths, "baseSha": base_head(root, meta),
                "scanner": {"name": "codebase_scan.py", "version": 1, "stack": stack, "missing": missing}, "updated": today}
    out = "---\n" + "\n".join(f"{k}: {flow(v)}" for k, v in new_head.items()) + "\n---\n\n" + body.lstrip("\n")
    return {"path": path, "text": out, "modules": len(modules), "deps": len(edges), "tables": len(tables), "missing": missing, "files": len(files)}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="codebase_scan.py", description=__doc__)
    parser.add_argument("area")
    parser.add_argument("--paths", nargs="+")
    parser.add_argument("--stack", choices=STACKS)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    root = intents.harness_root(Path.cwd())
    r = scan(root, args.area, args.paths, args.stack, date.today().isoformat())
    if not args.dry_run:
        r["path"].parent.mkdir(parents=True, exist_ok=True)
        r["path"].write_text(r["text"], encoding="utf-8")
    summary = {k: v for k, v in r.items() if k != "text"} | {"path": r["path"].relative_to(root).as_posix(), "written": not args.dry_run}
    if args.json:
        print(json.dumps(summary, ensure_ascii=False))
    else:
        print(f"✔ {summary['path']} — 파일 {r['files']} · 모듈 {r['modules']} · 의존 {r['deps']} · 데이터 {r['tables']}" + (f" · 없는 도구 {', '.join(r['missing'])}" if r["missing"] else "") + (" (dry-run)" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
