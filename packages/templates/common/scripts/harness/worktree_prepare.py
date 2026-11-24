"""worktree 를 만든 뒤의 준비: sparse · `.worktreeinclude` 복사 · 의존성 · `.env.worktree`(설계 05 §3.4 ~ §3.7). 표준 라이브러리만 쓴다."""

import fnmatch
import hashlib
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from harness.worktree_repo import WtError, run_git

SPARSE_BASE = (".agents", "docs", "scripts")
SKIP_DIRS = (".git", "node_modules", "build", "dist", ".venv", "target")
MAX_FILE_BYTES = 50 * 1024 * 1024
MAX_FILES = 200
PORT_LINE = re.compile(r"^([A-Z0-9_]*_PORT)=([0-9]{2,5})$")
DEPS_SECONDS = 900
LOCKS = {"pnpm-lock.yaml": "pnpm", "uv.lock": "uv", "package-lock.json": "npm", "Cargo.toml": "cargo"}


def warn(message):
    print(f"⚠ {message}", file=sys.stderr)


# ── sparse ───────────────────────────────────────────────────────────────────


def sparse_folders(only):
    seen = []
    for folder in (*SPARSE_BASE, *only):
        folder = folder.strip("/")
        if folder and folder not in seen:
            seen.append(folder)
    return seen


def apply_sparse(place, branch, folders):
    """worktree 안에서만 sparse 를 켜고 체크아웃한다(`git worktree add --no-checkout` 뒤)."""
    steps = (("sparse-checkout", "set", "--cone", *folders), ("read-tree", "-mu", "HEAD"))
    for step in steps:
        code, _, err = run_git(place, *step, timeout=120)
        if code != 0:
            raise WtError(f"git {step[0]} 실패: {err.strip()}", 3)


# ── .worktreeinclude ─────────────────────────────────────────────────────────


def glob_regex(pattern):
    """gitignore 패턴 한 줄 → 정규식. 앞 `/` 는 루트 고정, `/` 가 든 패턴도 루트 고정, 끝 `/` 는 폴더."""
    anchored = pattern.startswith("/") or "/" in pattern.rstrip("/")
    body = pattern.strip("/") if pattern.startswith("/") else pattern.rstrip("/")
    out, i = [], 0
    while i < len(body):
        c = body[i]
        if body.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
        elif body.startswith("/**", i) and i + 3 == len(body):
            out.append("/.*")
            i += 3
        elif body.startswith("**", i):
            out.append(".*")
            i += 2
        elif c == "*":
            out.append("[^/]*")
            i += 1
        elif c == "?":
            out.append("[^/]")
            i += 1
        elif c == "[":
            end = body.find("]", i + 1)
            if end < 0:
                out.append(re.escape(c))
                i += 1
            else:
                out.append(fnmatch.translate(body[i:end + 1])[len("(?s:"):-len(r")\Z")])
                i = end + 1
        else:
            out.append(re.escape(c))
            i += 1
    prefix = "^" if anchored else "^(?:.*/)?"
    return re.compile(prefix + "".join(out) + "(?:/.*)?$")


def parse_include(text):
    rules = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        negate = line.startswith("!")
        rules.append((negate, glob_regex(line[1:] if negate else line)))
    return rules


def included(rules, rel):
    chosen = False
    for negate, regex in rules:
        if regex.match(rel):
            chosen = not negate
    return chosen


def ignored_candidates(main):
    """gitignore 된 파일(무시된 폴더는 들어가지 않는다). 무시 판정은 git 이 한다."""
    code, out, _ = run_git(main, "ls-files", "-z", "-o", "-i", "--exclude-standard", "--directory", timeout=60)
    if code != 0:
        return []
    names = [name for name in out.split("\0") if name and not name.endswith("/")]
    return [name for name in names if not set(name.split("/")) & set(SKIP_DIRS)]


def in_sparse(rel, folders):
    return folders is None or "/" not in rel or any(rel == f or rel.startswith(f + "/") for f in folders)


def clone_or_copy(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if sys.platform == "darwin" and subprocess.run(["cp", "-c", str(source), str(target)], capture_output=True, check=False).returncode == 0:
        return
    shutil.copy2(source, target)


def copy_includes(main, place, folders):
    """메인 폴더 `.worktreeinclude` 에 맞고 gitignore 된 파일만 복사한다(없는 파일만). 복사한 상대 경로 목록."""
    path = main / ".worktreeinclude"
    if not path.is_file():
        return []
    rules = parse_include(path.read_text(encoding="utf-8", errors="replace"))
    copied = []
    for rel in sorted(ignored_candidates(main)):
        if not included(rules, rel) or not in_sparse(rel, folders):
            continue
        source, target = main / rel, place / rel
        try:
            size = source.stat().st_size
        except OSError:
            continue
        if not source.is_file() or source.is_symlink():
            continue
        if size > MAX_FILE_BYTES:
            warn(f"{rel}: {size // (1024 * 1024)}MB 가 파일당 50MB 를 넘어 복사하지 않는다")
            continue
        if len(copied) >= MAX_FILES:
            warn(f"복사 합계 {MAX_FILES}개를 넘어 {rel} 부터 복사하지 않는다")
            break
        if target.exists() or target.is_symlink():
            continue
        try:
            clone_or_copy(source, target)
            copied.append(rel)
        except OSError as error:
            warn(f"{rel}: 복사 실패 — {error}")
    return copied


# ── 의존성 ───────────────────────────────────────────────────────────────────


def sha_of(path):
    try:
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()
    except OSError:
        return None


def detect_units(place):
    code, out, _ = run_git(place, "ls-files", "-z", timeout=60)
    units = []
    if code != 0:
        return units
    for name in out.split("\0"):
        base = name.rsplit("/", 1)[-1]
        if base in LOCKS and not set(name.split("/")) & set(SKIP_DIRS):
            units.append((LOCKS[base], name.rsplit("/", 1)[0] if "/" in name else "."))
    return sorted(set(units))


def run_command(command, cwd):
    try:
        result = subprocess.run(command, cwd=str(cwd), capture_output=True, text=True, timeout=DEPS_SECONDS, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        warn(f"{' '.join(command)} 실패 — {error}")
        return False
    if result.returncode != 0:
        warn(f"{' '.join(command)} 실패(exit {result.returncode}): {result.stderr.strip()[:200]}")
        return False
    return True


COMMANDS = {
    "pnpm": ["pnpm", "install", "--frozen-lockfile", "--prefer-offline"],
    "uv": ["uv", "sync", "--frozen"],
    "npm": ["npm", "ci"],
}


def handle_deps(main, place, run):
    """단위마다 판정한다. (안내 줄 목록, cargo 여부). 기본은 설치를 실행하지 않는다(05 §3.6)."""
    lines, cargo = [], False
    for kind, folder in detect_units(place):
        if kind == "cargo":
            cargo = True
            continue
        where = "." if folder == "." else folder
        if kind == "npm" and sys.platform == "darwin":
            src, dst = main / folder / "node_modules", place / folder / "node_modules"
            lock_main, lock_new = sha_of(main / folder / "package-lock.json"), sha_of(place / folder / "package-lock.json")
            if src.is_dir() and not dst.exists() and lock_main is not None and lock_main == lock_new:
                if subprocess.run(["cp", "-c", "-R", str(src), str(dst)], capture_output=True, check=False).returncode == 0:
                    lines.append(f"node_modules 를 APFS 복제로 가져왔다 ← {where}")
                    continue
                shutil.rmtree(dst, ignore_errors=True)
        command = COMMANDS[kind]
        text = " ".join(command)
        if run:
            ok = run_command(command, place / folder)
            lines.append(f"{text} {'실행함' if ok else '실패'} ← {where}")
        else:
            lines.append(f"{text}   ← {where}")
    return lines, cargo


# ── .env.worktree ────────────────────────────────────────────────────────────


def collect_ports(place):
    ports = {}
    for name in (".env.local", ".env", ".env.example"):
        path = place / name
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
            match = PORT_LINE.match(raw.strip())
            if match and match[1] not in ports:
                ports[match[1]] = int(match[2])
    return ports


def pick_index(used, maximum):
    for i in range(1, maximum + 1):
        if i not in used:
            return i
    return maximum + 1


def write_env(place, key, repo_name, index, cargo_dir):
    """`.env.worktree`(05 §3.7). 쓴 변수 이름 → 값 딕셔너리를 돌려준다."""
    offset = index * 100
    values = {"HARNESS_WT_INDEX": str(index), "HARNESS_WT_KEY": key, "HARNESS_PORT_OFFSET": str(offset)}
    for name, port in collect_ports(place).items():
        if port + offset > 65535:
            warn(f"{name}={port} + {offset} 가 65535 를 넘어 .env.worktree 에 쓰지 않는다")
            continue
        values[name] = str(port + offset)
    values["COMPOSE_PROJECT_NAME"] = re.sub(r"[^a-z0-9_-]", "-", f"{repo_name}-{key}".lower())
    if cargo_dir:
        values["CARGO_TARGET_DIR"] = cargo_dir
    header = f"# knots-sync 생성 — worktree {index}번, 포트 +{offset}. 앱이 .env 다음에 이 파일을 읽어야 한다."
    (place / ".env.worktree").write_text("\n".join([header, *[f"{k}={v}" for k, v in values.items()]]) + "\n", encoding="utf-8")
    return values
