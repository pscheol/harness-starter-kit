"""이슈 키 · 이름 규칙, 설정, `--next` 번호, 키 충돌 · 옛 구조 동결 · 브랜치 검사(설계 01 §3.7.2 · §3.7.3 · §3.7.7 · §3.7.8)."""

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from harness.sdd_frontmatter import TYPES

KEY = re.compile(r"^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5}$")
PREFIX = re.compile(r"^[A-Z][A-Z0-9]{1,9}$")
NAME = re.compile(r"^[a-z0-9]+(-[a-z0-9]+){1,4}$")
AREA = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
FOLDER = re.compile(r"^([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-(.+)$")
INTENT = re.compile(r"^INT-[1-9][0-9]*$")
UNIT = re.compile(r"^U-[1-9][0-9]*$")
BRANCH = re.compile(r"^(feat|fix|refactor|perf|chore|docs)/([A-Z][A-Z0-9]{1,9}-[0-9]+)-[a-z0-9-]+$")
NAME_LIMIT = 40
FOLDER_LIMIT = 60
FETCH_SECONDS = 10
ISSUES = ".agents/docs/issues"
LEGACY_PATHS = tuple(f".agents/docs/*-specs/{stage}/*" for stage in ("issues", "requirements", "design", "tasks"))


class UsageError(ValueError):
    """인자 · 형식 오류. exit 2."""


class KeyConflict(ValueError):
    """같은 키가 다른 이름으로 있다. exit 3."""


def is_key(value):
    return bool(KEY.fullmatch(value or ""))


def name_problems(name):
    """이름(slug) 규칙 위반 목록. 비면 통과다."""
    problems = []
    if len(name) > NAME_LIMIT:
        problems.append(f"{NAME_LIMIT}자 이하")
    if not NAME.fullmatch(name):
        problems.append("영문 소문자 · 숫자 2~5단어를 - 로 잇는다(예: upload-cleanup)")
        return problems
    words = name.split("-")
    if words[0] in TYPES:
        problems.append(f"종류 접두({words[0]}-)를 붙이지 않는다 — --type 을 쓴다")
    if words[0][0].isdigit():
        problems.append("첫 단어를 숫자로 시작하지 않는다")
    return problems


def check_name(name):
    problems = name_problems(name)
    if problems:
        raise UsageError(f"이름 형식이 아니다: {name!r} — " + "; ".join(problems))


def check_area(area):
    if not AREA.fullmatch(area or ""):
        raise UsageError(f"영역(--area) 형식이 아니다: {area!r} — 영문 소문자 · 숫자 kebab-case")


def split_folder(name):
    """`<키>-<이름>` → (키, 이름). 형식이 아니면 None."""
    match = FOLDER.fullmatch(name)
    return (match[1], match[2]) if match else None


def folder_problems(name):
    parts = split_folder(name)
    if not parts:
        return [f"invalid issue folder {name!r}: <키>-<이름> 형식이 아니다"]
    problems = [f"invalid issue folder {name!r}: {problem}" for problem in name_problems(parts[1])]
    if len(name) > FOLDER_LIMIT:
        problems.append(f"invalid issue folder {name!r}: {FOLDER_LIMIT}자 이하")
    return problems


def derive_prefix(slug):
    """PROJECT_SLUG → 키 접두. 대문자 · 영숫자만 · 앞 숫자 제거 · 10자. 2자 미만이면 ISSUE."""
    letters = re.sub(r"^[0-9]+", "", re.sub(r"[^A-Z0-9]", "", (slug or "").upper()))[:10]
    return letters if PREFIX.fullmatch(letters) else "ISSUE"


@dataclass(frozen=True)
class Settings:
    source: str
    prefix: str
    base: str


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def settings(root):
    """`.agents/harness-kit.json` 의 issueKey · git.base. 없으면 v1.1 기본값(§3.7.2)."""
    meta = read_json(root / ".agents/harness-kit.json")
    issue = meta.get("issueKey") if isinstance(meta.get("issueKey"), dict) else {}
    source = issue.get("source", "kit")
    if source not in ("kit", "jira"):
        raise UsageError(f".agents/harness-kit.json issueKey.source 는 kit 또는 jira 다: {source!r}")
    prefix = issue.get("prefix")
    if prefix is None:
        slug = (meta.get("tokens") or {}).get("PROJECT_SLUG") or read_json(root / ".agents/harness.json").get("unit", "")
        prefix = derive_prefix(slug)
    if not PREFIX.fullmatch(str(prefix)):
        raise UsageError(f".agents/harness-kit.json issueKey.prefix 형식이 아니다: {prefix!r}")
    git_section = meta.get("git") if isinstance(meta.get("git"), dict) else {}
    base = str(git_section.get("base") or "develop")
    return Settings(source, prefix, base)


def check_key(key, config):
    """키 형식과 접두. kit 이면 접두가 같아야 하고, jira 면 다를 때 경고만 낸다."""
    if not is_key(key):
        raise UsageError(f"이슈 키 형식이 아니다: {key!r} — 예: KNOTS-17")
    prefix = key.rsplit("-", 1)[0]
    if prefix == config.prefix:
        return
    if config.source == "kit":
        raise UsageError(f"키 접두가 issueKey.prefix({config.prefix})와 다르다: {key}")
    print(f"⚠ 키 접두 {prefix} 가 issueKey.prefix({config.prefix})와 다르다 — Jira 프로젝트가 여럿이면 그대로 둔다", file=sys.stderr)


# ── git ──────────────────────────────────────────────────────────────────────
def git(root, *arguments, timeout=30, env=None):
    """git 을 부른다. git 이 없거나 시간이 넘으면 None."""
    try:
        return subprocess.run(
            ["git", "-C", str(root), *arguments],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            env=env,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None


def git_lines(root, *arguments):
    result = git(root, *arguments)
    return result.stdout.splitlines() if result and result.returncode == 0 else None


def in_repo(root):
    result = git(root, "rev-parse", "--is-inside-work-tree")
    return bool(result and result.returncode == 0 and result.stdout.strip() == "true")


def has_ref(root, ref):
    result = git(root, "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}")
    return bool(result and result.returncode == 0)


def fetch_base(root, base):
    """origin 원격이 있으면 base 를 받는다(10초 상한). 실패하면 경고하고 캐시된 ref 를 쓴다."""
    remote = git(root, "remote", "get-url", "origin")
    if not remote or remote.returncode != 0:
        return
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    result = git(root, "fetch", "origin", base, "--quiet", timeout=FETCH_SECONDS, env=env)
    if not result or result.returncode != 0:
        print(f"⚠ git fetch origin {base} 실패 — 캐시된 origin/{base} 로 번호를 정한다", file=sys.stderr)


def base_folders(root, base):
    """origin/<base> 트리의 이슈 폴더 이름. ref 가 없으면 None."""
    ref = f"origin/{base}"
    if not has_ref(root, ref):
        return None
    lines = git_lines(root, "ls-tree", "--name-only", ref, "--", f"{ISSUES}/")
    return [Path(line).name for line in lines or []]


def work_folders(root):
    issues = root / ISSUES
    return sorted(path.name for path in issues.iterdir() if path.is_dir()) if issues.is_dir() and not issues.is_symlink() else []


def used_numbers(root, config):
    """접두 P 의 쓰인 번호(§3.7.3): base 트리 · 작업 트리 · 로컬/원격 브랜치 · worktree."""
    folder = re.compile(rf"^{config.prefix}-([0-9]+)-")
    branch = re.compile(rf"(?:^|/){config.prefix}-([0-9]+)(?=-|$)")
    numbers = {int(match[1]) for name in work_folders(root) if (match := folder.match(name))}
    if not in_repo(root):
        return numbers
    fetch_base(root, config.base)
    numbers |= {int(match[1]) for name in base_folders(root, config.base) or [] if (match := folder.match(name))}
    for line in git_lines(root, "for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes") or []:
        numbers |= {int(match) for match in branch.findall(line)}
    for line in git_lines(root, "worktree", "list", "--porcelain") or []:
        if line.startswith("worktree "):
            numbers |= {int(match) for match in branch.findall(Path(line[9:]).name)}
        elif line.startswith("branch "):
            numbers |= {int(match) for match in branch.findall(line[7:].removeprefix("refs/heads/"))}
    return numbers


def next_key(root, config):
    if config.source == "jira":
        raise UsageError(
            "issueKey.source 가 jira 라서 키를 만들지 않는다. Jira 이슈 키를 넣는다"
            "(예: scripts/new-feature.sh KNOTS-123 desktop-parity --area app).\n"
            "  Jira 없이 쓰려면 .agents/harness-kit.json 의 issueKey.source 를 kit 로 바꾼다."
        )
    return f"{config.prefix}-{max(used_numbers(root, config), default=0) + 1}"


# ── fast 검사 ────────────────────────────────────────────────────────────────
def collision_message(key, folder, base, other):
    return (
        f"✖ 키 충돌: {key} 이 origin/{base} 에 {other} 로 이미 있다(이 작업: {folder}).\n"
        f"  → python3 scripts/sdd-layout.py rekey {key} --next   (폴더 · frontmatter 를 새 키로 옮기고 브랜치 이름 변경 명령을 출력한다)"
    )


def base_conflict(root, config, key, name):
    """origin/<base> 에 같은 키 · 다른 이름 폴더가 있으면 그 이름."""
    for other in base_folders(root, config.base) or []:
        parts = split_folder(other)
        if parts and parts[0] == key and parts[1] != name:
            return other
    return None


def issue_key_errors(root):
    """check-issue-keys(R7.9). origin/<base> 가 없으면 건너뛴다."""
    try:
        config = settings(root)
    except UsageError as error:
        return [str(error)]
    if not in_repo(root) or base_folders(root, config.base) is None:
        return []
    errors = []
    for folder in work_folders(root):
        parts = split_folder(folder)
        other = parts and base_conflict(root, config, *parts)
        if other:
            errors.append(collision_message(parts[0], folder, config.base, other))
    return errors


def added_legacy_files(root, base):
    if not in_repo(root) or not has_ref(root, "HEAD"):
        return []
    start = "HEAD"
    if has_ref(root, f"origin/{base}"):
        merge_base = git_lines(root, "merge-base", "HEAD", f"origin/{base}")
        start = merge_base[0] if merge_base else "HEAD"
    added = git_lines(root, "diff", "-M", "--diff-filter=A", "--name-only", "--relative", start, "--", *LEGACY_PATHS) or []
    added += git_lines(root, "ls-files", "--others", "--exclude-standard", "--", *LEGACY_PATHS) or []
    return sorted(set(added))


def legacy_frozen_errors(root):
    """check-legacy-frozen(R7.7). 옛 구조에 새 이슈 폴더 · 단계 문서가 생기면 실패한다. 수정 · 이름 변경은 통과한다."""
    try:
        base = settings(root).base
    except UsageError as error:
        return [str(error)]
    return [
        f"✖ 옛 구조는 읽기 전용이다: {path} 가 새로 생겼다. 새 이슈는 scripts/new-feature.sh 로 {ISSUES}/ 에 만들고, "
        "옛 이슈는 python3 scripts/sdd-layout.py migrate 로 옮긴다"
        for path in added_legacy_files(root, base)
    ]


# ── 브랜치(pre-push) ─────────────────────────────────────────────────────────
def superproject(root):
    lines = git_lines(root, "rev-parse", "--show-superproject-working-tree")
    return Path(lines[0]) if lines else None


def has_issue_folder(root, key, commit):
    parent = superproject(root)
    if parent:
        issues = parent / ISSUES
        return issues.is_dir() and any(path.is_dir() for path in issues.glob(f"{key}-*"))
    lines = git_lines(root, "ls-tree", "--name-only", commit, "--", f"{ISSUES}/") or []
    return any(Path(line).name.startswith(f"{key}-") for line in lines)


def branch_messages(root, refs_text):
    """push ref 목록(`<local ref> <local sha> <remote ref> <remote sha>`) → (오류, 경고)."""
    try:
        base = settings(root).base
    except UsageError as error:
        return [str(error)], []
    quiet = {base, "main", "master"}
    errors, warnings = [], []
    for line in refs_text.splitlines():
        fields = line.split()
        if len(fields) != 4 or not fields[2].startswith("refs/heads/") or not fields[1].strip("0"):
            continue
        branch, commit = fields[2].removeprefix("refs/heads/"), fields[1]
        if branch.startswith("exp/") or branch in quiet:
            continue
        match = BRANCH.fullmatch(branch)
        if not match:
            warnings.append(f"⚠ 브랜치 이름이 <종류>/<이슈키>-<이름> 형식이 아니다: {branch} (예: feat/KNOTS-17-desktop-parity)")
        elif not has_issue_folder(root, match[2], commit):
            errors.append(
                f"✖ {branch}: 올리는 커밋에 {ISSUES}/{match[2]}-* 이슈 폴더가 없다. "
                f"scripts/new-feature.sh {match[2]} <이름> --area <영역> 으로 만들고 커밋한다"
            )
    return errors, warnings
