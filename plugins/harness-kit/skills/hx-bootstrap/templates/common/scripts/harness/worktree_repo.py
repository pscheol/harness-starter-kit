"""worktree 운영의 리포 · 자리 · 설정 읽기(설계 05 §3.1 · §3.3 · §3.9, HK-15 design §3). 표준 라이브러리만 쓴다.

- 메인 폴더 M · 상위 리포 S · root · 이슈 worktree 자리를 정한다.
- 설정은 S 의 `.agents/harness-kit.json`(없으면 M)에서 읽고, IDE 만 개인 층 `.agents/local/harness-kit.local.json` 이 앞선다.
- 모델을 부르지 않는다. git 과 파일 시스템만 쓴다.
"""

import json
import os
import re
import subprocess
from pathlib import Path

from harness.sdd_frontmatter import TYPES, parse
from harness.sdd_keys import ISSUES, split_folder

DEFAULT_ROOT = "../{repo}.worktrees"
DEFAULT_BASE = "develop"
DEFAULT_MAX = 3
ISSUE_NAME = re.compile(r"^[A-Z][A-Z0-9]{1,9}-[0-9]+(-[a-z0-9-]+)?$")
LOCAL_CONFIG = ".agents/local/harness-kit.local.json"
META = ".agents/harness-kit.json"
AGENTS_DIR = "_agents"


class WtError(Exception):
    """사용자에게 이유를 보이고 끝내는 오류. code 는 종료 코드(05 §3.2)다."""

    def __init__(self, message, code=3, hint=None):
        super().__init__(message)
        self.code = code
        self.hint = hint


def run_git(cwd, *arguments, timeout=30):
    """(종료 코드, 표준 출력, 표준 오류). git 이 없거나 시간이 넘으면 (127 · 124, '', 이유)."""
    try:
        result = subprocess.run(["git", "--no-optional-locks", *arguments], cwd=str(cwd), capture_output=True, text=True, timeout=timeout, check=False)
    except FileNotFoundError:
        return 127, "", "git 을 찾지 못했다"
    except subprocess.TimeoutExpired:
        return 124, "", f"git {' '.join(arguments[:2])} 가 {timeout}초를 넘었다"
    except OSError as error:
        return 126, "", str(error)
    return result.returncode, result.stdout, result.stderr


def git_out(cwd, *arguments, timeout=30):
    code, out, _ = run_git(cwd, *arguments, timeout=timeout)
    return out.strip() if code == 0 else None


def real(path):
    return Path(os.path.realpath(str(path)))


def inside(path, folder):
    try:
        real(path).relative_to(real(folder))
        return True
    except ValueError:
        return False


def read_json(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def worktree_list(cwd):
    """`git worktree list --porcelain` → [{path, branch, head, bare, prunable}]. 첫 항목이 메인 폴더."""
    code, out, _ = run_git(cwd, "worktree", "list", "--porcelain")
    if code != 0:
        return []
    items, current = [], None
    for line in out.splitlines():
        if line.startswith("worktree "):
            current = {"path": line[len("worktree "):], "branch": None, "head": None, "bare": False, "prunable": False}
            items.append(current)
        elif current is not None:
            if line.startswith("branch "):
                current["branch"] = line[len("branch "):].removeprefix("refs/heads/")
            elif line.startswith("HEAD "):
                current["head"] = line[len("HEAD "):]
            elif line == "bare":
                current["bare"] = True
            elif line.startswith("prunable"):
                current["prunable"] = True
    if items:
        items[0]["path"] = main_tree(items[0]["path"])
    return items


def main_tree(path):
    """submodule 은 첫 worktree 줄이 작업 트리가 아니라 `.git/modules/<이름>` 이다. 그때는 core.worktree 로 작업 트리를 찾는다."""
    folder = Path(path)
    if not (folder / "HEAD").is_file() or (folder / ".git").exists():
        return path
    code, out, _ = run_git(folder, "config", "--file", str(folder / "config"), "core.worktree")
    if code != 0 or not out.strip():
        return path
    tree = Path(out.strip())
    return str(tree if tree.is_absolute() else Path(os.path.normpath(str(folder / tree))))


def git_version():
    out = git_out(".", "--version") or ""
    match = re.search(r"(\d+)\.(\d+)", out)
    return (int(match[1]), int(match[2])) if match else None


class Context:
    """한 번의 명령이 쓰는 리포 정보."""

    def __init__(self, main, sup, repo_id, meta, root, base, max_per_repo):
        self.main = main
        self.super = sup
        self.repo_id = repo_id
        self.meta = meta
        self.root = root
        self.base = base
        self.max_per_repo = max_per_repo

    @property
    def repo_name(self):
        return self.super.name

    @property
    def state_dir(self):
        return self.super / ".agents/state/worktrees"

    def place_for_issue(self, key, slug):
        folder = f"{key}-{slug}"
        return self.root / folder if self.repo_id == "." else self.root / self.repo_id / folder

    def place_for_agent(self, name):
        return self.root / AGENTS_DIR / name

    def relative(self, place):
        return real(place).relative_to(real(self.root)).as_posix()


def find_main(cwd):
    """cwd 가 속한 리포의 메인 작업 트리. 리포가 아니면 WtError(3)."""
    if not Path(cwd).is_dir():
        raise WtError(f"작업 폴더가 없다: {cwd}", 3)
    if git_out(cwd, "rev-parse", "--is-inside-work-tree") != "true":
        raise WtError("git 리포가 아니다", 3, "리포 안에서 실행한다")
    items = worktree_list(cwd)
    if not items:
        raise WtError("git worktree list 를 읽지 못했다", 3)
    return real(items[0]["path"])


def superproject(main):
    out = git_out(main, "rev-parse", "--show-superproject-working-tree")
    return real(out) if out else main


def read_meta(sup, main):
    return read_json(sup / META) or read_json(main / META) or {}


def git_settings(meta):
    section = meta.get("git") if isinstance(meta.get("git"), dict) else {}
    base = str(section.get("base") or DEFAULT_BASE)
    root_setting = str(section.get("worktreeRoot") or DEFAULT_ROOT)
    maximum = section.get("maxPerRepo")
    maximum = maximum if isinstance(maximum, int) and not isinstance(maximum, bool) and maximum >= 1 else DEFAULT_MAX
    ide = section.get("ide") if isinstance(section.get("ide"), str) else None
    return base, root_setting, maximum, ide


def resolve_root(setting, sup):
    text = setting.replace("{repo}", sup.name)
    path = Path(os.path.expanduser(text))
    if not path.is_absolute():
        path = sup / path
    return Path(os.path.realpath(os.path.normpath(str(path))))


def has_submodules(sup):
    return (sup / ".gitmodules").is_file()


def resolve_context(cwd, domain=None, docs=False):
    """05 §3.3 의 1번: M · S · root 를 정한다. 상위 리포에서 `--docs` · `--domain` 이 없으면 WtError(3)."""
    main = find_main(cwd)
    sup = superproject(main)
    repo_id = "." if sup == main else main.relative_to(sup).as_posix() if inside(main, sup) else main.name
    if domain is not None:
        target = real(sup / domain)
        if sup != main or not has_submodules(sup):
            raise WtError("--domain 은 submodule 을 가진 상위 리포 폴더에서만 쓴다", 3)
        if not inside(target, sup) or target == sup or not (target / ".git").exists():
            raise WtError(f"도메인 리포가 아니다(초기화되지 않았거나 submodule 이 아니다): {domain}", 3, "git submodule update --init <경로> 로 먼저 받는다")
        main, repo_id = target, target.relative_to(sup).as_posix()
    elif sup == main and has_submodules(sup) and not docs:
        raise WtError("이 리포는 submodule 을 가진 상위 리포다. 도메인 리포 안에서 실행하거나 --domain <경로> 를 준다", 3, "문서만 쓰려면 --docs")
    meta = read_meta(sup, main)
    base, root_setting, maximum, _ = git_settings(meta)
    return Context(main, sup, repo_id, meta, resolve_root(root_setting, sup), base, maximum)


def resolve_context_loose(cwd):
    """done · list · gc · open 용: submodule 검사 없이 S · root 만 정한다."""
    main = find_main(cwd)
    sup = superproject(main)
    repo_id = "." if sup == main else main.relative_to(sup).as_posix() if inside(main, sup) else main.name
    meta = read_meta(sup, main)
    base, root_setting, maximum, _ = git_settings(meta)
    return Context(main, sup, repo_id, meta, resolve_root(root_setting, sup), base, maximum)


def personal_ide(sup, main):
    """개인 층 git.ide(TS readLocalConfig 와 같은 규칙: 객체 git 안의 ide 문자열, 깨진 JSON 은 없는 것)."""
    for folder in (sup, main):
        data = read_json(folder / LOCAL_CONFIG)
        if data is not None and isinstance(data.get("git"), dict) and isinstance(data["git"].get("ide"), str):
            return data["git"]["ide"]
    return None


def choose_ide(ctx, flag):
    """플래그 > 개인 git.ide > 프로젝트 git.ide > code."""
    project = git_settings(ctx.meta)[3]
    return flag or personal_ide(ctx.super, ctx.main) or project or "code"


class Issue:
    def __init__(self, key, slug, folder, type_, design_status, design_source):
        self.key, self.slug, self.folder, self.type, self.design_status, self.design_source = key, slug, folder, type_, design_status, design_source

    @property
    def branch(self):
        return f"{self.type}/{self.key}-{self.slug}"


def _doc_fields(text):
    try:
        return parse(text) or {}
    except ValueError:
        return {}


def find_issue(ctx, key):
    """S 의 이슈 폴더(작업 트리 → origin/<base>). 없으면 WtError(3)."""
    folder, source = None, "작업 트리"
    issues = ctx.super / ISSUES
    if issues.is_dir():
        for path in sorted(issues.iterdir()):
            parts = split_folder(path.name)
            if path.is_dir() and parts and parts[0] == key:
                folder = path.name
                break
    if folder is None:
        out = git_out(ctx.super, "ls-tree", "--name-only", f"origin/{ctx.base}", f"{ISSUES}/") or ""
        for line in out.splitlines():
            name = line.rsplit("/", 1)[-1]
            parts = split_folder(name)
            if parts and parts[0] == key:
                folder, source = name, f"origin/{ctx.base}"
                break
    if folder is None:
        raise WtError(f"이슈 폴더가 없다: {key}", 3, "scripts/new-feature.sh 로 먼저 만든다")

    def read(name):
        if source == "작업 트리":
            path = issues / folder / name
            return path.read_text(encoding="utf-8") if path.is_file() else None
        return git_out(ctx.super, "show", f"origin/{ctx.base}:{ISSUES}/{folder}/{name}")

    requirements, design = read("requirements.md"), read("design.md")
    fields = _doc_fields(requirements) if requirements is not None else {}
    design_fields = _doc_fields(design) if design is not None else {}
    kind = fields.get("type") or design_fields.get("type") or "feat"
    if kind not in TYPES:
        kind = "feat"
    status = design_fields.get("status") if design is not None else None
    return Issue(key, split_folder(folder)[1], folder, kind, status, source)


def remote_ref_exists(cwd, ref):
    return run_git(cwd, "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}")[0] == 0


def local_branch_exists(cwd, branch):
    return run_git(cwd, "show-ref", "--verify", "--quiet", f"refs/heads/{branch}")[0] == 0
