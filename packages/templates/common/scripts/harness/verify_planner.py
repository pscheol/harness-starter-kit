"""언어별 변경 검증 명령을 구성하고 검증 누락을 표시한다."""

import fnmatch
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path

from harness.verify_mapping import (
    SCRIPT_EXTENSIONS,
    jvm_module,
    jvm_test_names,
    related_tests,
)
from harness.verify_modules import CONTRACT, ModuleError, module_test
from harness.verify_paths import CODE_EXTENSIONS, is_test, owner_for, project_for, uv_workspace_root
from harness.verify_sources import config_path, tools_dir


def lock_for(project):
    key = hashlib.sha256(str(project).encode()).hexdigest()[:24]
    return str(Path(tempfile.gettempdir()) / f"harness-changed-{os.getuid()}-{key}.lock")


def command(unit, project, kind, arguments, env=None, label=None):
    lock = lock_for(project) if kind not in {"static", "diagnostic", "gate"} else None
    item = {
        "unit": unit["id"],
        "cwd": str(project),
        "kind": kind,
        "arguments": arguments,
        "lock": lock,
    }
    if env:
        item["env"] = env
    if label:
        item["label"] = label
    return item


CHECKS_FILE = ".agents/verify-checks.json"


CHECKS_DIR = "verify-checks.d"
PROJECT_CHECKS = "project.json"


def read_checks(path, label):
    """검사 파일 하나. 형식이 틀리면 계획을 만들지 않고 실패한다(조용히 건너뛰지 않는다)."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"{label}: {error}") from error
    checks = raw.get("checks", [])
    for check in checks:
        paths, arguments = check.get("paths"), check.get("command")
        valid = isinstance(paths, list) and isinstance(arguments, list) and arguments
        if not valid or not all(isinstance(item, str) for item in [*paths, *arguments]):
            raise ValueError(f"{label}: check {check.get('id')!r} needs 'paths' and 'command' string lists")
        if not isinstance(check.get("covers", False), bool):
            raise ValueError(f"{label}: check {check.get('id')!r} 'covers' must be true or false")
    return checks


def load_path_checks(root):
    """하네스 루트 `.agents/verify-checks.json`(킷) + `.agents/verify-checks.d/*.json`(팩 · 프로젝트, HK-14)의 검사 목록.

    형식: {"checks": [{"id": "...", "paths": ["docs/**"], "command": ["python3", "tools/x.py", "check"], "cwd": ".", "covers": false}]}
    `covers: true` 면 그 경로의 코드 파일(생성물·리포에 둔 외부 라이브러리)은 관련 시험을 따로 찾지 않고 이 검사가 책임진다.
    `verify-checks.d` 는 이름 순으로 읽고 `project.json` 이 마지막이다. 팩 파일끼리 · 킷과 같은 id 는 오류, project.json 은 같은 id 를 덮는다.
    MR 이면 둘 다 base 판이다(설계 09 §3.7).
    """
    path = config_path(root, Path(CHECKS_FILE).name)
    checks = read_checks(path, CHECKS_FILE) if path.is_file() else []
    folder = config_path(root, CHECKS_DIR)
    if not folder.is_dir():
        return checks
    names = sorted((n for n in os.listdir(folder) if n.endswith(".json") and not n.startswith(".")), key=lambda n: (n == PROJECT_CHECKS, n))
    for name in names:
        label = f".agents/{CHECKS_DIR}/{name}"
        index = {check.get("id"): i for i, check in enumerate(checks)}
        for check in read_checks(folder / name, label):
            if name == PROJECT_CHECKS and check.get("id") in index:
                checks[index[check.get("id")]] = check
            elif check.get("id") in index:
                raise ValueError(f"{label}: check {check.get('id')!r} 가 다른 층에도 있다")
            else:
                checks.append(check)
    return checks


def matches(relative, patterns):
    return any(fnmatch.fnmatchcase(relative, pattern) for pattern in patterns)


def covered_by_checks(root, relative_files):
    """`covers: true` 인 경로 검사가 책임지는 바뀐 파일."""
    patterns = [pattern for check in load_path_checks(root) if check.get("covers") for pattern in check["paths"]]
    return {relative for relative in relative_files if matches(relative, patterns)}


def path_checks(root, relative_files, units):
    """경로 → 검사 명령. 바뀐 파일이 경로 패턴에 맞을 때만 더한다."""
    return [
        command(units[-1], root / check.get("cwd", "."), "check", list(check["command"]))
        for check in load_path_checks(root)
        if any(matches(changed, check["paths"]) for changed in relative_files)
    ]


def relative_paths(project, files):
    return ["./" + path.relative_to(project).as_posix() for path in sorted(files)]


def python_commands(unit, project, files, tests):
    manifest = project / "pyproject.toml"
    if not manifest.is_file():
        commands = [
            command(
                unit,
                project,
                "test",
                [
                    sys.executable,
                    "-m",
                    "unittest",
                    "discover",
                    "-s",
                    str(test.parent),
                    "-p",
                    test.name,
                ],
            )
            for test in sorted(tests)
        ]
        return commands, []
    # uv workspace 는 상위에 환경 하나를 둔다 — 프로젝트에서 단위 뿌리까지 올라가며 처음 찾은 것을 쓴다.
    bases = [project, *(parent for parent in project.parents if parent.is_relative_to(unit["root"]))]
    runtime = next(
        (
            str(base / environment / "bin/python")
            for base in bases
            for environment in (".venv-verify", ".venv")
            if os.access(base / environment / "bin/python", os.X_OK)
        ),
        None,
    )
    if runtime is None:
        return [], [f"{unit['id']}: existing Python runtime missing (.venv-verify or .venv); installation was skipped"]
    settings = tomllib.loads(manifest.read_text())
    commands = []
    if "ruff" in str(settings.get("dependency-groups", {})) or "ruff" in settings.get("tool", {}):
        checked = relative_paths(
            project,
            {path for path in files | tests if path.is_file() and path.suffix == ".py"},
        )
        if checked:
            commands.extend(
                [
                    command(
                        unit,
                        project,
                        "lint",
                        [runtime, "-m", "ruff", "check", "--no-cache", *checked],
                    ),
                    command(
                        unit,
                        project,
                        "lint",
                        [
                            runtime,
                            "-m",
                            "ruff",
                            "format",
                            "--check",
                            "--no-cache",
                            *checked,
                        ],
                    ),
                ]
            )
    if tests:
        commands.append(
            command(
                unit,
                project,
                "test",
                [
                    runtime,
                    "-m",
                    "pytest",
                    "-p",
                    "no:cacheprovider",
                    "-o",
                    "addopts=",
                    "-m",
                    "not model",
                    "-q",
                    *relative_paths(project, tests),
                ],
            )
        )
    return commands, []


def script_commands(unit, project, files, tests):
    manifest = project / "package.json"
    if not manifest.is_file():
        return [], [f"{unit['id']}: package.json missing; JavaScript runtime/test framework was not guessed"]
    package = json.loads(manifest.read_text())
    dependencies = {
        **package.get("dependencies", {}),
        **package.get("devDependencies", {}),
    }
    commands, missing = [], []
    binaries = project / "node_modules/.bin"
    checked = relative_paths(project, {path for path in files | tests if path.is_file()})
    if tests:
        if "vitest" in dependencies and os.access(binaries / "vitest", os.X_OK):
            commands.append(
                command(
                    unit,
                    project,
                    "test",
                    [str(binaries / "vitest"), "run", *relative_paths(project, tests)],
                )
            )
        elif all(path.suffix == ".mjs" for path in tests) and shutil.which("node"):
            commands.append(
                command(
                    unit,
                    project,
                    "test",
                    [shutil.which("node"), "--test", *relative_paths(project, tests)],
                )
            )
        else:
            missing.append(f"{unit['id']}: installed test runtime missing or unsupported; no install or whole-suite run was attempted")
    linter = next((name for name in ("oxlint", "eslint") if name in dependencies), None)
    if linter and checked:
        if os.access(binaries / linter, os.X_OK):
            arguments = [str(binaries / linter)]
            if linter == "eslint":
                arguments.append("--no-cache")
            commands.append(command(unit, project, "lint", [*arguments, *checked]))
        else:
            missing.append(f"{unit['id']}: installed {linter} runtime missing")
    if any(path.suffix in {".ts", ".tsx"} for path in files | tests):
        configurations = [path for name in ("tsconfig.json", "tsconfig.renderer.json") if (path := project / name).is_file()]
        if "typescript" in dependencies and os.access(binaries / "tsc", os.X_OK) and configurations:
            commands.extend(
                command(
                    unit,
                    project,
                    "typecheck",
                    [
                        str(binaries / "tsc"),
                        "--noEmit",
                        "--incremental",
                        "false",
                        "-p",
                        "./" + configuration.name,
                    ],
                )
                for configuration in configurations
            )
        else:
            missing.append(f"{unit['id']}: TypeScript runtime/tsconfig missing; typecheck was skipped")
    return commands, missing


def is_gradle_module_missing(settings, module_prefix):
    if settings is None:
        return True
    return module_prefix not in settings.read_text()


def jvm_commands(unit, project, files, tests):
    wrapper = project / "gradlew"
    if not os.access(wrapper, os.X_OK):
        return [], [f"{unit['id']}: Gradle wrapper runtime missing; no download/install was attempted"]
    settings = next(
        (project / name for name in ("settings.gradle.kts", "settings.gradle") if (project / name).is_file()),
        None,
    )
    modules = {}
    missing = []
    for test in tests:
        module = jvm_module(test, project)
        if module is None:
            missing.append(f"{test.relative_to(project)}: Gradle module could not be verified")
            continue
        relative = module.relative_to(project).as_posix()
        task_prefix = "" if relative == "." else ":" + relative.replace("/", ":")
        if task_prefix and is_gradle_module_missing(settings, task_prefix):
            missing.append(f"{relative}: module is not declared in settings.gradle; test task was not guessed")
            continue
        names = jvm_test_names(test)
        if not names:
            missing.append(f"{test.relative_to(project)}: concrete test class name could not be verified")
            continue
        modules.setdefault(task_prefix, set()).update(names)
    commands = []
    for prefix, names in sorted(modules.items()):
        arguments = [
            str(wrapper),
            prefix + ":test",
            "--no-daemon",
            "--console=plain",
            "--dependency-verification=strict",
        ]
        for name in sorted(names):
            arguments.extend(["--tests", name])
        commands.append(command(unit, project, "test", arguments))
    return commands, missing


def dart_commands(unit, project, files, tests):
    runtime = shutil.which("flutter")
    if runtime is None:
        return [], [f"{unit['id']}: flutter runtime missing; no SDK/dependency installation was attempted"]
    commands = []
    checked = relative_paths(project, {path for path in files | tests if path.is_file()})
    if checked:
        commands.extend(command(unit, project, "lint", [runtime, "analyze", "--no-pub", path]) for path in checked)
    if tests:
        commands.append(
            command(
                unit,
                project,
                "test",
                [runtime, "test", "--no-pub", *relative_paths(project, tests)],
            )
        )
    return commands, []


def python_and_shell_commands(unit, project, files, tests):
    planned, missing = python_commands(unit, project, files, tests)
    syntax = [
        command(
            unit,
            project,
            "static",
            ["bash", "-n", "./" + path.relative_to(project).as_posix()],
        )
        for path in sorted(files)
        if path.suffix == ".sh" and path.is_file()
    ]
    return syntax + planned, missing


def go_directory(root, directory):
    return "." if directory == root else "./" + directory.relative_to(root).as_posix()


def go_commands(unit, project, files, tests):
    """Go 패키지 시험 — 관련 시험은 같은 폴더의 *_test.go 다(패키지 하나가 시험 단위)."""
    runtime = shutil.which("go")
    if runtime is None:
        return [], [f"{unit['id']}: go runtime missing; no SDK installation was attempted"]
    roots = {}
    for path in sorted(files | tests):
        root = next((parent for parent in path.parents if parent.is_relative_to(unit["root"]) and (parent / "go.mod").is_file()), None)
        if root is None:
            return [], [f"{path.relative_to(unit['root'])}: go.mod not found; Go package was not guessed"]
        entry = roots.setdefault(root, {"vet": set(), "test": set()})
        if path in files and path.parent.is_dir():
            entry["vet"].add(go_directory(root, path.parent))
        if path in tests:
            entry["test"].add(go_directory(root, path.parent))
    commands = []
    for root, entry in sorted(roots.items()):
        if entry["vet"]:
            commands.append(command(unit, root, "lint", [runtime, "vet", *sorted(entry["vet"])]))
        if entry["test"]:
            commands.append(command(unit, root, "test", [runtime, "test", *sorted(entry["test"])]))
    return commands, []


LANGUAGE_FAMILIES = (
    ({".py", ".sh"}, python_and_shell_commands),
    (SCRIPT_EXTENSIONS, script_commands),
    ({".kt", ".kts", ".gradle", ".java"}, jvm_commands),
    ({".dart"}, dart_commands),
    ({".go"}, go_commands),
)


def commands_for(unit, project, files, tests):
    """프로젝트 하나의 검증 명령. 언어가 섞이면(파이썬 도구 + 사이트 JS 등) 언어 묶음마다 따로 고른다."""
    known = set().union(*(extensions for extensions, _ in LANGUAGE_FAMILIES))
    if any(path.suffix not in known for path in files | tests):
        return [], [f"{unit['id']}: language/test mapping is unsupported; select --tests <test-file>"]
    commands, missing = [], []
    for extensions, planner in LANGUAGE_FAMILIES:
        family_files = {path for path in files if path.suffix in extensions}
        family_tests = {path for path in tests if path.suffix in extensions}
        if family_files or family_tests:
            planned, absent = planner(unit, project, family_files, family_tests)
            commands.extend(planned)
            missing.extend(absent)
    return commands, missing


def harness_source(root):
    source = json.loads((root / ".agents/harness.json").read_text()).get("source")
    return root / source if source else None


def deployed_copy(test, source, units):
    """공통 원본은 단위 파일이 없고 자리표시자(__UNIT_ID__)가 남아 단위로 돌 수 없다. 내용이 같은 배포 사본을 찾는다."""
    relative = test.relative_to(source).as_posix()
    for unit in units:
        copy = unit["root"] / relative.replace("__UNIT_ID__", unit["id"])
        if copy.is_file() and copy.read_bytes() == test.read_bytes():
            return unit, copy
    return None


def shared_source_commands(root, source, units, tests):
    commands, missing = [], []
    for test in sorted(tests):
        found = deployed_copy(test, source, units)
        if found is None:
            missing.append(f"{test.relative_to(root)}: shared source test has no identical deployed copy; deploy with tools/harness/sync.py and verify again")
            continue
        unit, copy = found
        arguments = [sys.executable, "-m", "unittest", "discover", "-s", str(copy.parent), "-p", copy.name]
        commands.append(command(unit, copy.parent.parent, "test", arguments))
    return commands, missing


def tests_for_project(root, project, changed_files, explicit_tests):
    """(관련 시험, 미완료, 관련 시험이 없는 파일). 없는 파일은 widen_untested 가 모듈 시험으로 넓힌다."""
    if explicit_tests:
        changed_tests = {path for path in changed_files if is_test(path) and path.is_file()}
        return set(explicit_tests) | changed_tests, [], []
    inferred_tests, missing, untested = set(), [], []
    for source in sorted(changed_files):
        mapped_tests = related_tests(source, project)
        inferred_tests.update(mapped_tests)
        if mapped_tests:
            continue
        if not source.exists() and not deleted_from_git(source):
            missing.append(f"{source.relative_to(root)}: file not found and unknown to git; check the path or select --tests <test-file>")
        else:
            untested.append(source)
    return inferred_tests, missing, untested


def widen_untested(root, unit, sources, planned):
    """관련 시험이 없는 파일은 그 모듈의 시험 하나로 넓힌다(R3.1). 모듈 시험도 없으면 unverified 다(R3.2).

    planned 는 (폴더, 인자) → 명령. 같은 모듈 시험은 한 번만 돈다.
    """
    widened, unverified, missing = [], [], []
    for source in sorted(sources):
        relative = source.relative_to(root).as_posix()
        try:
            found = module_test(source, unit["root"], root)
        except (ModuleError, OSError, ValueError) as error:
            missing.append(f"{relative}: {error}")
            continue
        if found == CONTRACT:
            unverified.append({"file": relative, "reason": "build-contract"})
        elif found is None or found.arguments is None:
            unverified.append({"file": relative, "reason": "no-module-test"})
        elif found.missing:
            missing.append(f"{unit['id']}: {found.missing}")
        else:
            key = (str(found.cwd), found.arguments)
            if key not in planned:
                planned[key] = {**command(unit, found.cwd, "test", list(found.arguments), label=f"{found.test} (모듈 시험)"), "widenedFiles": []}
            planned[key]["widenedFiles"].append(relative)
            widened.append({"file": relative, "module": found.module, "test": found.test, "reason": "no-related-test"})
    return widened, unverified, missing


def deleted_from_git(path):
    """작업 트리에 없고, 그 파일이 속한 저장소가 아는 파일인가(submodule 안 파일도 그 저장소에서 본다).
    HEAD 에 있으면 커밋 전에 지운 것, HEAD 에 없어도 기록에 있으면 base..HEAD 사이에 커밋으로 지운 것이다(HK-22b — 모듈 remove 가 지운 훅 스크립트)."""
    folder = next((parent for parent in path.parents if parent.is_dir()), None)
    if folder is None:
        return False
    top = subprocess.run(["git", "-C", str(folder), "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=False)
    if top.returncode != 0:
        return False
    toplevel = Path(top.stdout.strip())
    relative = os.path.relpath(path, toplevel)
    if relative.startswith(".."):
        relative = os.path.relpath(path.resolve(), toplevel.resolve())
    rel = Path(relative).as_posix()
    found = subprocess.run(["git", "-C", str(toplevel), "cat-file", "-e", f"HEAD:{rel}"], capture_output=True, check=False)
    if found.returncode == 0:
        return True
    history = subprocess.run(["git", "-C", str(toplevel), "rev-list", "-1", "HEAD", "--", rel], capture_output=True, text=True, check=False)
    return history.returncode == 0 and bool(history.stdout.strip())


def verification_plan(root, relative_files, explicit_tests, units, scope_files=None):
    """changed 계획. scope_files 는 경로 검사 · 유지보수 진단에 쓸 바뀐 파일 전체다(affected 가 일부만 넘길 때)."""
    scope_files = relative_files if scope_files is None else scope_files
    groups, documents = {}, []
    missing, recommendations, skipped = [], [], []
    widened, unverified, module_tests = [], [], {}
    covered = covered_by_checks(root, relative_files)
    for test in explicit_tests:
        if not is_test(test) or any(character in test.name for character in "*?[]"):
            raise ValueError(f"expected an individual named test file: {test.relative_to(root)}")
    for relative in relative_files:
        path = root / relative
        if path.suffix not in CODE_EXTENSIONS:
            documents.append(relative)
            if path.name in {
                "package.json",
                "pyproject.toml",
                "settings.gradle.kts",
                "settings.gradle",
            } or path.suffix in {".sql", ".lock"}:
                recommendations.append(f"{relative}: dependencies/schema/build contract changed; run bash scripts/verify.sh --affected before the MR")
            continue
        if relative in covered:
            continue
        if is_test(path) and not path.exists() and deleted_from_git(path):
            # 지운 시험은 돌릴 수 없다. 관련 시험을 찾지 않고 대체 시험이 그 경우를 덮는지 확인하라고 남긴다.
            # git 이 모르는 없는 경로(오타)는 여기로 오지 않고 "관련 시험 없음"으로 남는다.
            recommendations.append(f"{relative}: deleted test; confirm a replacement test covers its cases")
            continue
        owner = owner_for(path, units)
        project = project_for(path, owner["root"])
        groups.setdefault((owner["id"], project), {"unit": owner, "files": set()})["files"].add(path)
        if path.suffix in {".kts", ".gradle"}:
            recommendations.append(f"{relative}: Gradle build contract changed; run bash scripts/verify.sh --affected before the MR")
        if any(part in {"shared", "contracts", "contract", "common", "core"} for part in path.parts):
            recommendations.append(f"{relative}: shared/contract change; review consumer coverage and run bash scripts/verify.sh --affected before the MR")
    for test in explicit_tests:
        owner = owner_for(test, units)
        project = project_for(test, owner["root"])
        if (owner["id"], project) not in groups:
            raise ValueError(f"explicit test does not belong to a selected code project: {test.relative_to(root)}")
    commands = []
    if documents:
        commands.append(
            command(
                units[-1],
                root,
                "static",
                [
                    sys.executable,
                    str(tools_dir(root) / "harness/verify_static.py"),
                    "--root",
                    str(root),
                    *documents,
                ],
            )
        )
    source = harness_source(root)
    for (_, project), group in sorted(groups.items(), key=lambda entry: str(entry[0])):
        selected_tests = {test for test in explicit_tests if test.is_relative_to(project) and project_for(test, group["unit"]["root"]) == project}
        # uv workspace 하위면 상위 전체에서 고른다 — 이 하위를 쓰는 다른 하위의 시험도 영향 범위다.
        search = uv_workspace_root(project, group["unit"]["root"]) or project
        tests, missing_tests, untested = tests_for_project(root, search, group["files"], selected_tests)
        missing.extend(missing_tests)
        more_widened, more_unverified, absent_modules = widen_untested(root, group["unit"], untested, module_tests)
        widened.extend(more_widened)
        unverified.extend(more_unverified)
        missing.extend(absent_modules)
        others = {}
        for test in tests:
            owner_project = project_for(test, group["unit"]["root"])
            if owner_project != project:
                others.setdefault(owner_project, set()).add(test)
        tests = {test for test in tests if test not in set().union(*others.values())} if others else tests
        if source and project.is_relative_to(source):
            redirected, stale = shared_source_commands(root, source, units, tests)
            commands.extend(redirected)
            missing.extend(stale)
            tests = set()
        planned, absent = commands_for(group["unit"], project, group["files"], tests)
        commands.extend(planned)
        missing.extend(absent)
        for other, other_tests in sorted(others.items(), key=lambda entry: str(entry[0])):
            planned, absent = commands_for(group["unit"], other, set(), other_tests)
            commands.extend(planned)
            missing.extend(absent)
        skipped.append(f"{group['unit']['id']}: whole-suite run, coverage, E2E and dependency installation not selected")
    commands.extend(module_tests.values())
    commands.extend(path_checks(root, scope_files, units))
    diagnostic = tools_dir(root) / "check-maintenance.py"
    covered = covered | covered_by_checks(root, scope_files)
    code = [relative for relative in scope_files if (root / relative).suffix in CODE_EXTENSIONS and (root / relative).is_file() and relative not in covered]
    if code and diagnostic.is_file():
        commands.append(
            command(
                units[-1],
                root,
                "diagnostic",
                [sys.executable, str(diagnostic), "--files", *code],
            )
        )
    scope = "L1" if groups else "L0"
    return {
        "status": "plan" if relative_files else "noop",
        "level": scope,
        "scope": scope,
        "files": relative_files,
        "commands": commands,
        "locks": sorted({item["lock"] for item in commands if item["lock"]}),
        "incomplete": list(dict.fromkeys(missing)),
        "unverified": unverified,
        "widened": widened,
        "skipped": skipped,
        "recommendations": sorted(set(recommendations)),
        "test_commands": 0,
    }
