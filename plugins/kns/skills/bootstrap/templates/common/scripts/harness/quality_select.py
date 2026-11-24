"""분석기 고르기 · 도구 찾기 · 자리표 풀기(설계 09 §3.3 · §3.4 · VQ-R5 · VQ-R6)."""

import fnmatch
import os
import re
import shutil
import subprocess
from pathlib import Path

from harness.quality_git import tracked_files

LIST_TOKENS = {"{targets}": "targets", "{modules}": "modules", "{lockfiles}": "lockfiles", "{dirs}": "dirs"}
SCALAR_TOKENS = ("{out}", "{tmp}", "{rules}", "{root}", "{targetsCsv}", "{targetsDir}", "{ccn}")
BUILD_FILES = ("pyproject.toml", "package.json", "build.gradle.kts", "build.gradle", "pom.xml", "go.mod", "Cargo.toml")
SKIPPED_PREFIXES = (".agents/state/", ".agents/reports/")
LOCAL_BINARIES = (".venv/bin", ".venv-verify/bin", "node_modules/.bin")
VERSION = re.compile(r"(\d+)\.(\d+)(?:\.(\d+))?")
VERSION_TIMEOUT = 20


def matches(path, patterns):
    """glob 목록. `**/x` 는 루트의 `x` 에도 맞는다."""
    return any(fnmatch.fnmatchcase(path, pattern) or (pattern.startswith("**/") and fnmatch.fnmatchcase(path, pattern[3:])) for pattern in patterns or ())


def is_dependency(entry):
    return entry.get("category") == "dependency" or entry.get("scope") == "lockfiles"


def plan(registry, level, files):
    """(이번 레벨에 도는 항목, 조건이 안 맞아 안 도는 의존성 항목). 꺼진 항목 · 레벨 밖 항목은 어디에도 없다."""
    selected, untriggered = [], []
    for entry in registry.get("analyzers", []):
        if entry.get("enabled", True) is False or level not in entry["levels"]:
            continue
        if is_dependency(entry) and level != "full" and not any(matches(path, entry.get("trigger")) for path in files):
            untriggered.append(entry)
            continue
        selected.append(entry)
    return selected, untriggered


def nearest_module(root, relative):
    folder = (root / relative).parent
    while folder != root and folder.is_relative_to(root):
        if any((folder / name).is_file() for name in BUILD_FILES):
            return folder.relative_to(root).as_posix()
        folder = folder.parent
    return "."


def scope_values(entry, level, files, root):
    """자리표 목록 값. 대상이 없으면 None(그 분석기는 `no-targets`)."""
    if level == "full" or entry["scope"] == "repo":
        return {"targets": ["."], "modules": ["."], "dirs": ["./..."], "lockfiles": sorted(path for path in tracked_files(root) if matches(path, entry.get("trigger"))), "mirror": False}
    existing = [path for path in files if not path.startswith(SKIPPED_PREFIXES) and (root / path).is_file()]
    included = [path for path in existing if matches(path, entry["include"])] if entry.get("include") else existing
    values = {
        "targets": included,
        "modules": sorted({nearest_module(root, path) for path in included}),
        "dirs": sorted({"./" + Path(path).parent.as_posix() if Path(path).parent.as_posix() != "." else "." for path in included}),
        "lockfiles": [path for path in existing if matches(path, entry.get("trigger"))],
        "mirror": True,
    }
    needed = {"files": "targets", "modules": "modules", "lockfiles": "lockfiles"}[entry["scope"]]
    if is_dependency(entry):
        return values
    return values if values[needed] else None


def search_path(root, environ):
    return os.pathsep.join([*(str(root / folder) for folder in LOCAL_BINARIES), environ.get("PATH", "")])


def find_executable(name, root, environ):
    if name.startswith("./"):
        path = root / name[2:]
        return str(path) if os.access(path, os.X_OK) and path.is_file() else None
    if os.sep in name:
        return name if os.access(name, os.X_OK) else None
    return shutil.which(name, path=search_path(root, environ))


def candidates(entry):
    yield entry
    for alternative in entry.get("alternatives", []):
        if isinstance(alternative, str):
            replaced = {**entry, "cmd": [alternative, *entry["cmd"][1:]], "tool": alternative}
            if entry.get("versionCmd"):
                replaced["versionCmd"] = [alternative, *entry["versionCmd"][1:]]
            yield replaced
        else:
            yield {**entry, **alternative, "tool": alternative.get("tool") or alternative["cmd"][0]}


def tool_name(entry):
    return entry.get("tool") or Path(entry["cmd"][0]).name


def resolve(entry, root, environ):
    """(쓸 정의, 실행 파일). 앞의 것이 없으면 alternatives 의 다음 것을 쓴다. 다 없으면 (원래 정의, None)."""
    for candidate in candidates(entry):
        executable = find_executable(candidate["cmd"][0], root, environ)
        if executable:
            return candidate, executable
    return entry, None


def version_tuple(text):
    match = VERSION.search(text or "")
    return tuple(int(part or 0) for part in match.groups()) if match else None


def check_version(entry, executable, root, environ):
    """(판 문자열, 너무 낮은가). versionCmd 가 없거나 판을 읽지 못하면 (None, False)."""
    command = entry.get("versionCmd")
    if not command:
        return None, False
    try:
        result = subprocess.run([executable, *command[1:]], cwd=root, env=dict(environ), capture_output=True, text=True, timeout=VERSION_TIMEOUT, check=False, stdin=subprocess.DEVNULL)
    except (OSError, subprocess.TimeoutExpired):
        return None, False
    found = version_tuple(result.stdout + result.stderr)
    minimum = version_tuple(entry.get("minVersion"))
    text = ".".join(str(part) for part in found) if found else None
    return text, bool(found and minimum and found < minimum)


def rules_value(entry, root):
    source = (entry.get("rules") or {}).get("source", "")
    if source.startswith("registry:"):
        return source[len("registry:"):]
    if source.startswith("path:"):
        return str(root / source[len("path:"):])
    return source


def mirror(targets, root, folder):
    """폴더 하나만 받는 도구(gitleaks dir)를 위해 대상만 같은 상대 경로로 복사한다."""
    folder.mkdir(parents=True, exist_ok=True)
    for relative in targets:
        destination = folder / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / relative, destination)
    return folder


def expand(arguments, lists, scalars):
    expanded = []
    for argument in arguments:
        if argument in LIST_TOKENS:
            expanded.extend(lists[LIST_TOKENS[argument]])
            continue
        for token in SCALAR_TOKENS:
            if token in argument:
                argument = argument.replace(token, scalars[token])
        expanded.append(argument)
    return expanded
