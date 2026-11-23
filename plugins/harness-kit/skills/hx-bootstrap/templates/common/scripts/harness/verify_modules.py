"""스택별 빌드 루트 · 파일 → 모듈 · 모듈 그래프 · 계약 파일 판정(설계 01 §3.1). 파일을 바꾸지 않는다.

빌드 도구는 그래프를 정적으로 읽지 못할 때만 부른다(Gradle 초기화 스크립트 · `go list`).
"""

import fnmatch
import hashlib
import json
import os
import re
import shutil
import subprocess
import tomllib
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from harness.verify_paths import IGNORED_DIRECTORIES

GRADLE_EXTENSIONS = frozenset({".kt", ".kts", ".gradle", ".java"})
SCRIPT_EXTENSIONS = frozenset({".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"})
DOC_SUFFIXES = frozenset({".md", ".mdx", ".txt", ".rst", ".adoc"})
KIT_STACKS = frozenset({"jvm", "python", "go", "web", "electron"})
SETTINGS = ("settings.gradle.kts", "settings.gradle")
BUILD_FILES = ("build.gradle.kts", "build.gradle")
GRADLE_CONTRACT = frozenset({*SETTINGS, *BUILD_FILES, "gradle.properties", "gradle/libs.versions.toml"})
PNPM_CONTRACT = frozenset({"pnpm-lock.yaml", "package.json", "pnpm-workspace.yaml", "tsconfig.base.json"})
NPM_CONTRACT = frozenset({"package-lock.json", "npm-shrinkwrap.json", "package.json"})
PACKAGE_CONTRACT = frozenset({"package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock"})
PYTHON_CONTRACT = frozenset({"pyproject.toml", "uv.lock"})
GO_CONTRACT = frozenset({"go.mod", "go.sum", "go.work", "go.work.sum"})
GRAPH_LINE = "HARNESS_GRAPH "
# changed 와 같은 Gradle 옵션 — 데몬 없이, 의존 검증을 엄격하게, TTY 없는 로그로.
GRADLE_FLAGS = ("--console=plain", "--no-daemon", "--dependency-verification=strict")


class ModuleError(ValueError):
    """판정기가 그래프를 읽지 못했다. 계획은 incomplete 로 남는다."""


@dataclass(frozen=True)
class Build:
    stack: str  # gradle | pnpm | npm | package | uv | python | go
    root: Path


@dataclass(frozen=True)
class Found:
    build: Build
    module: str | None  # None 이면 계약 파일(빌드 루트 전체)
    contract: bool


def ancestors(path, stop):
    """path 의 상위 폴더를 가까운 순서로, stop(포함)까지."""
    for directory in path.parents:
        if not directory.is_relative_to(stop):
            return
        yield directory
        if directory == stop:
            return


def nearest(path, stop, predicate):
    return next((directory for directory in ancestors(path, stop) if predicate(directory)), None)


def relative_to(path, root):
    return path.relative_to(root).as_posix()


def read_toml(path):
    try:
        return tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError):
        return {}


def read_json(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def dependents(graph, selected):
    """역방향 닫힘 — selected 와, selected 를 (전이적으로) 쓰는 모듈. graph 는 모듈 → 의존 모듈 집합."""
    affected = set(selected)
    while True:
        consumers = {module for module, uses in graph.items() if module not in affected and uses & affected}
        if not consumers:
            return affected
        affected |= consumers


def project_globs(root, patterns):
    """워크스페이스 패턴(`apps/*` · `libs/**` · `!x`)에 맞는 폴더. node_modules 같은 산출물 폴더는 뺀다."""
    included = [pattern for pattern in patterns if not pattern.startswith("!")]
    excluded = [pattern[1:] for pattern in patterns if pattern.startswith("!")]
    found = set()
    for pattern in included:
        for directory in root.glob(pattern.rstrip("/")):
            relative = relative_to(directory, root)
            if not directory.is_dir() or any(part in IGNORED_DIRECTORIES for part in directory.relative_to(root).parts):
                continue
            if not any(fnmatch.fnmatchcase(relative, skip.rstrip("/")) for skip in excluded):
                found.add(directory)
    return sorted(found)


# ── Gradle ─────────────────────────────────────────────────────────────────────

INCLUDE = re.compile(r"\binclude\b\s*(?:\(([^)]*)\)|([^\n;]+))")
LITERAL = re.compile(r"""\s*(["'])([^"'$]+)\1\s*""")
PROJECT_DIR = re.compile(r"""project\(\s*["'](:[^"']+)["']\s*\)\.projectDir\s*=\s*([^\n;]+)""")
FILE_LITERAL = re.compile(r"""(?:new\s+)?file\(\s*["']([^"'$]+)["']\s*\)""")
PROJECT_REF = re.compile(r"""\bproject\(\s*["'](:[^"']+)["']\s*\)""")
ACCESSOR = re.compile(r"\bprojects\.([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)")


def has_any(directory, names):
    return any((directory / name).is_file() for name in names)


def gradle_root(path, unit_root):
    root = nearest(path, unit_root, lambda directory: has_any(directory, SETTINGS))
    if root is not None and root.name in {"buildSrc", "build-logic"} and root != unit_root and has_any(root.parent, SETTINGS):
        return root.parent
    return root


def strip_comments(text):
    return re.sub(r"(?m)//.*$", "", re.sub(r"/\*.*?\*/", "", text, flags=re.S))


def gradle_text(directory, names):
    return next((strip_comments((directory / name).read_text(errors="replace")) for name in names if (directory / name).is_file()), "")


def static_projects(build_root):
    """settings 의 리터럴 include · projectDir 로 {경로: 폴더}. 해석할 수 없는 구문이면 None."""
    text = gradle_text(build_root, SETTINGS)
    if re.search(r"\binclude(Build|Flat)\b", text):
        return None
    projects = {":": build_root}
    for match in INCLUDE.finditer(text):
        arguments = (match.group(1) if match.group(1) is not None else match.group(2)).split(",")
        for argument in arguments:
            literal = LITERAL.fullmatch(argument)
            if literal is None:
                return None
            name = literal.group(2)
            path = name if name.startswith(":") else ":" + name
            projects[path] = build_root / path.strip(":").replace(":", "/")
    overrides = list(PROJECT_DIR.finditer(text))
    if len(overrides) != text.count("projectDir"):
        return None
    for match in overrides:
        target = FILE_LITERAL.fullmatch(match.group(2).strip())
        if target is None or match.group(1) not in projects:
            return None
        projects[match.group(1)] = (build_root / target.group(1)).resolve()
    return projects


def accessor_key(path):
    return ".".join(segment.replace("-", "").replace("_", "").lower() for segment in path.strip(":").split(":"))


def project_references(text, projects):
    references = set(PROJECT_REF.findall(text))
    keys = {accessor_key(path): path for path in projects if path != ":"}
    for accessor in ACCESSOR.findall(text):
        segments = accessor.split(".")
        # projects.a.b.dependencyProject 같은 뒤쪽 이름은 프로젝트가 아니다 — 가장 긴 앞부분을 쓴다.
        for length in range(len(segments), 0, -1):
            key = ".".join(segment.replace("_", "").lower() for segment in segments[:length])
            if key in keys:
                references.add(keys[key])
                break
    return references & set(projects)


def static_gradle_graph(build_root):
    projects = static_projects(build_root)
    if projects is None:
        return None
    graph = {}
    for path, directory in projects.items():
        graph[path] = project_references(gradle_text(directory, BUILD_FILES), projects) - {path}
    return projects, graph


def build_file_digest(build_root):
    digest = hashlib.sha256()
    for directory, folders, names in os.walk(build_root):
        folders[:] = sorted(folder for folder in folders if folder not in IGNORED_DIRECTORIES and not folder.startswith("."))
        for name in sorted(names):
            if name in (*SETTINGS, *BUILD_FILES):
                path = Path(directory) / name
                digest.update(relative_to(path, build_root).encode() + b"\0" + path.read_bytes() + b"\0")
    return digest.hexdigest()[:16]


def init_script_graph(build_root, harness_root):
    """정적 파싱이 멈춘 빌드의 그래프. `.agents/state/gradle-graph-<해시>.json` 에 캐시한다."""
    cache = harness_root / f".agents/state/gradle-graph-{build_file_digest(build_root)}.json"
    rows = None
    if cache.is_file():
        try:
            rows = json.loads(cache.read_text(encoding="utf-8"))
        except ValueError:
            rows = None
    if rows is None:
        wrapper = build_root / "gradlew"
        script = harness_root / "scripts/harness/gradle/affected-graph.init.gradle"
        if not os.access(wrapper, os.X_OK) or not script.is_file():
            raise ModuleError("Gradle settings are not static and the wrapper/init script is missing")
        try:
            result = subprocess.run(
                [str(wrapper), "-q", "--no-configuration-cache", "--init-script", str(script), "harnessProjectGraph"],
                cwd=build_root, capture_output=True, text=True, timeout=600, check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise ModuleError(f"Gradle project graph could not be read: {error}") from error
        line = next((line for line in result.stdout.splitlines() if line.startswith(GRAPH_LINE)), None)
        if result.returncode or line is None:
            raise ModuleError("Gradle project graph could not be read; harnessProjectGraph failed")
        rows = json.loads(line[len(GRAPH_LINE):])
        try:
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(rows), encoding="utf-8")
        except OSError:
            pass
    projects = {row["path"]: Path(row["projectDir"]).resolve() for row in rows}
    graph = {row["path"]: set(row.get("projectDeps", [])) & set(projects) for row in rows}
    return projects, graph


@lru_cache(maxsize=None)
def gradle_graph(build_root, harness_root):
    return static_gradle_graph(build_root) or init_script_graph(build_root, harness_root)


def gradle_find(path, unit_root, harness_root):
    build_root = gradle_root(path, unit_root)
    if build_root is None:
        return None
    build = Build("gradle", build_root)
    relative = relative_to(path, build_root)
    if relative in GRADLE_CONTRACT or relative.startswith(("buildSrc/", "build-logic/")):
        return Found(build, None, True)
    projects, _ = gradle_graph(build_root, harness_root)
    folders = {directory.resolve(): name for name, directory in projects.items()}
    for directory in ancestors(path, build_root):
        if has_any(directory, BUILD_FILES) or directory == build_root:
            name = folders.get(directory.resolve())
            return Found(build, name, False) if name else None
    return None


def gradle_task(path, task):
    return f":{task}" if path == ":" else f"{path}:{task}"


# ── pnpm · npm · 단일 패키지 ────────────────────────────────────────────────────


def pnpm_patterns(root):
    text = (root / "pnpm-workspace.yaml").read_text(errors="replace")
    inline = re.search(r"(?m)^packages:\s*\[([^\]]*)\]", text)
    if inline:
        return [item.strip().strip("'\"") for item in inline.group(1).split(",") if item.strip()]
    patterns, inside = [], False
    for line in text.splitlines():
        if re.match(r"^packages:\s*$", line):
            inside = True
            continue
        if inside:
            item = re.match(r"^\s*-\s*(.+?)\s*$", line)
            if item:
                patterns.append(item.group(1).split(" #")[0].strip().strip("'\""))
            elif line.strip() and not line.startswith((" ", "\t", "#")):
                inside = False
    return patterns


def npm_patterns(manifest):
    workspaces = read_json(manifest).get("workspaces")
    if isinstance(workspaces, dict):
        workspaces = workspaces.get("packages")
    return [item for item in workspaces if isinstance(item, str)] if isinstance(workspaces, list) else []


@lru_cache(maxsize=None)
def script_workspace(root, stack):
    """{이름: 폴더}, {이름: 같은 워크스페이스 의존 이름}."""
    patterns = pnpm_patterns(root) if stack == "pnpm" else npm_patterns(root / "package.json")
    packages = {}
    for directory in project_globs(root, patterns):
        name = read_json(directory / "package.json").get("name")
        if isinstance(name, str) and name and directory != root:
            packages[name] = directory
    graph = {}
    for name, directory in packages.items():
        manifest = read_json(directory / "package.json")
        uses = set()
        for field in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            values = manifest.get(field)
            if isinstance(values, dict):
                uses |= set(values)
        graph[name] = (uses & set(packages)) - {name}
    return packages, graph


def script_find(path, unit_root):
    pnpm = nearest(path, unit_root, lambda directory: (directory / "pnpm-workspace.yaml").is_file())
    npm = nearest(path, unit_root, lambda directory: bool(npm_patterns(directory / "package.json")))
    root, stack = (pnpm, "pnpm") if pnpm is not None else (npm, "npm")
    if root is not None:
        build = Build(stack, root)
        relative = relative_to(path, root)
        if relative in (PNPM_CONTRACT if stack == "pnpm" else NPM_CONTRACT):
            return Found(build, None, True)
        packages, _ = script_workspace(root, stack)
        folders = {directory: name for name, directory in packages.items()}
        owner = nearest(path, root, lambda directory: directory in folders)
        return Found(build, folders[owner], False) if owner is not None else None
    package = nearest(path, unit_root, lambda directory: (directory / "package.json").is_file())
    if package is None:
        return None
    build = Build("package", package)
    if relative_to(path, package) in PACKAGE_CONTRACT:
        return Found(build, None, True)
    name = read_json(package / "package.json").get("name")
    return Found(build, name if isinstance(name, str) and name else package.name, False)


def package_manager(directory, stop):
    """lock 파일로 pnpm/npm 을 고른다(폴더부터 stop 까지)."""
    for candidate in ancestors(directory / "_", stop):
        if (candidate / "pnpm-lock.yaml").is_file():
            return "pnpm"
        if (candidate / "package-lock.json").is_file():
            return "npm"
    return "npm"


# ── uv workspace · Python 단일 ──────────────────────────────────────────────────


def normalized(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def requirement_name(text):
    match = re.match(r"\s*([A-Za-z0-9][A-Za-z0-9._-]*)", text) if isinstance(text, str) else None
    return normalized(match.group(1)) if match else None


def declared_dependencies(settings):
    project = settings.get("project", {})
    texts = list(project.get("dependencies", []))
    for values in project.get("optional-dependencies", {}).values():
        texts.extend(values)
    for values in settings.get("dependency-groups", {}).values():
        texts.extend(value for value in values if isinstance(value, str))
    return {name for name in map(requirement_name, texts) if name}


def workspace_sources(settings):
    sources = settings.get("tool", {}).get("uv", {}).get("sources", {})
    return {normalized(name) for name, value in sources.items() if isinstance(value, dict) and value.get("workspace") is True}


def uv_workspace_settings(directory):
    manifest = directory / "pyproject.toml"
    if not manifest.is_file():
        return None
    settings = read_toml(manifest)
    return settings if "workspace" in settings.get("tool", {}).get("uv", {}) else None


@lru_cache(maxsize=None)
def uv_workspace(root):
    """{멤버 상대 경로: 폴더}, {멤버 상대 경로: 같은 워크스페이스 의존 멤버}. 루트에 [project] 가 있으면 "." 도 멤버다."""
    settings = uv_workspace_settings(root) or {}
    workspace = settings["tool"]["uv"]["workspace"] if settings else {}
    members = {relative_to(directory, root): directory for directory in project_globs(root, [*workspace.get("members", []), *("!" + item for item in workspace.get("exclude", []))]) if (directory / "pyproject.toml").is_file()}
    if "project" in settings:
        members["."] = root
    names, manifests = {}, {}
    for member, directory in members.items():
        manifests[member] = settings if member == "." else read_toml(directory / "pyproject.toml")
        name = manifests[member].get("project", {}).get("name")
        names[normalized(name) if isinstance(name, str) else normalized(directory.name)] = member
    shared = workspace_sources(settings)
    graph = {}
    for member, manifest in manifests.items():
        linked = shared | workspace_sources(manifest)
        graph[member] = {names[name] for name in declared_dependencies(manifest) if name in names and name in linked} - {member}
    return members, graph


def python_find(path, unit_root):
    for directory in ancestors(path, unit_root):
        if uv_workspace_settings(directory) is None:
            continue
        build = Build("uv", directory)
        relative = relative_to(path, directory)
        if relative in PYTHON_CONTRACT:
            return Found(build, None, True)
        members, _ = uv_workspace(directory)
        owners = [member for member, folder in members.items() if member != "." and path.is_relative_to(folder)]
        if owners:
            return Found(build, max(owners, key=len), False)
        return Found(build, ".", False) if "." in members else None
    project = nearest(path, unit_root, lambda directory: (directory / "pyproject.toml").is_file())
    if project is None:
        return None
    build = Build("python", project)
    return Found(build, None, True) if relative_to(path, project) in PYTHON_CONTRACT else Found(build, ".", False)


def python_runtime(project, unit_root):
    """이미 있는 검증 환경(.venv-verify → .venv). 프로젝트에서 단위 뿌리까지 올라가며 처음 찾은 것. 설치하지 않는다."""
    bases = [project, *(parent for parent in project.parents if parent.is_relative_to(unit_root))]
    return next(
        (str(base / environment / "bin/python") for base in bases for environment in (".venv-verify", ".venv") if os.access(base / environment / "bin/python", os.X_OK)),
        None,
    )


def python_tool_configured(tool, settings_list, root):
    if any(tool in settings.get("tool", {}) or tool in str(settings.get("dependency-groups", {})) for settings in settings_list):
        return True
    names = {"ruff": ("ruff.toml", ".ruff.toml"), "mypy": ("mypy.ini", ".mypy.ini")}[tool]
    return has_any(root, names)


# ── Go ─────────────────────────────────────────────────────────────────────────


def go_module_path(root):
    match = re.search(r"(?m)^module\s+(\S+)", (root / "go.mod").read_text(errors="replace"))
    if match is None:
        raise ModuleError(f"{root.name}/go.mod has no module line")
    return match.group(1)


def go_package(directory, root):
    relative = relative_to(directory, root) if directory != root else "."
    return go_module_path(root) if relative == "." else f"{go_module_path(root)}/{relative}"


# `go list -test` 의 시험 변형은 "pkg [pkg.test]" 처럼 공백 뒤 대괄호가 붙는다 — 한 토큰으로 읽는다.
GO_TOKEN = re.compile(r"\S+(?: \[[^\]]+\])?")


def go_name(token):
    name = token.split(" [", 1)[0]
    return name.removesuffix(".test").removesuffix("_test")


@lru_cache(maxsize=None)
def go_graph(root):
    runtime = shutil.which("go")
    if runtime is None:
        raise ModuleError("go runtime missing; no SDK installation was attempted")
    try:
        result = subprocess.run(
            [runtime, "list", "-test", "-f", "{{.ImportPath}} {{join .Deps \" \"}}", "./..."],
            cwd=root, capture_output=True, text=True, timeout=300, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ModuleError(f"go list failed: {error}") from error
    if result.returncode:
        raise ModuleError("go list failed: " + (result.stderr.strip().splitlines() or ["no output"])[-1][:200])
    graph = {}
    for line in result.stdout.splitlines():
        tokens = GO_TOKEN.findall(line)
        if not tokens:
            continue
        package = go_name(tokens[0])
        graph.setdefault(package, set()).update(go_name(token) for token in tokens[1:])
    return {package: uses - {package} for package, uses in graph.items()}


def go_find(path, unit_root):
    root = nearest(path, unit_root, lambda directory: (directory / "go.mod").is_file())
    if root is None:
        return None
    build = Build("go", root)
    if relative_to(path, root) in GO_CONTRACT:
        return Found(build, None, True)
    package = nearest(path, root, lambda directory: any(directory.glob("*.go")))
    return Found(build, go_package(package, root), False) if package is not None else None


# ── 판정 ───────────────────────────────────────────────────────────────────────


def find_module(path, unit_root, harness_root):
    """파일의 (빌드, 모듈, 계약 여부). 코드 파일은 확장자 묶음의 판정기만, 그 밖의 파일은 모듈 폴더가 가장 깊은 판정기를 쓴다."""
    if path.suffix in GRADLE_EXTENSIONS:
        return gradle_find(path, unit_root, harness_root)
    if path.suffix in SCRIPT_EXTENSIONS:
        return script_find(path, unit_root)
    if path.suffix == ".py":
        return python_find(path, unit_root)
    if path.suffix == ".go":
        return go_find(path, unit_root)
    if path.suffix in DOC_SUFFIXES or path.suffix in {".sh", ".dart"}:
        return None
    candidates = [found for found in (
        gradle_find(path, unit_root, harness_root),
        script_find(path, unit_root),
        python_find(path, unit_root),
        go_find(path, unit_root),
    ) if found is not None]
    return max(candidates, key=lambda found: len(found.build.root.parts), default=None)
