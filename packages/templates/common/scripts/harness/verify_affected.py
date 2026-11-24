"""affected 계획 — 바꾼 모듈과 그 모듈을 쓰는 모듈의 검사만 고른다(설계 01 §3.1).

모듈을 정하지 못한 파일은 changed 판정(관련 테스트 → 모듈 테스트 → unverified)으로 보낸다. full 로 올리지 않는다.
"""

import json
import os
import shutil
import subprocess
import sys

from harness.verify_modules import (
    DOC_SUFFIXES,
    GRADLE_FLAGS,
    KIT_STACKS,
    PYTEST,
    ModuleError,
    dependents,
    find_module,
    gradle_graph,
    gradle_task,
    go_graph,
    package_manager,
    python_runtime,
    python_tool_configured,
    read_json,
    read_toml,
    relative_to,
    script_workspace,
    uv_workspace,
)
from harness.verify_paths import CODE_EXTENSIONS, is_test, owner_for
from harness.verify_planner import command, covered_by_checks, verification_plan

SCRIPTS = ("lint", "typecheck", "test")
GATES = "tools/harness/gates.py"
SUBMODULES = "scripts/harness/check_submodules.py"
REGISTRY = "tools/harness/units.json"


def gradle_commands(build, selection, unit, harness_root):
    _, graph = gradle_graph(build.root, harness_root)
    selected = sorted(graph) if selection["all"] else sorted(dependents(graph, selection["modules"]))
    tasks = ["check"] if selection["all"] else [gradle_task(path, "check") for path in selected]
    wrapper = build.root / "gradlew"
    missing = [] if os.access(wrapper, os.X_OK) else [f"{unit['id']}: Gradle wrapper runtime missing; no download/install was attempted"]
    label = f"gradle {tasks[0]}" + (f" +{len(tasks) - 1}" if len(tasks) > 1 else "")
    arguments = [str(wrapper), *tasks, "--continue", *GRADLE_FLAGS]
    return [command(unit, build.root, "test", arguments, label=label)], missing, selected


def pnpm_commands(build, selection, unit):
    _, graph = script_workspace(build.root, "pnpm")
    changed = sorted(selection["modules"])
    selected = sorted(graph) if selection["all"] else sorted(dependents(graph, changed))
    runtime = shutil.which("pnpm")
    missing = [] if runtime else [f"{unit['id']}: pnpm runtime missing; no install was attempted"]
    filters = [] if selection["all"] else [item for name in changed for item in ("--filter", f"...{name}")]
    commands = [
        command(unit, build.root, script, [runtime or "pnpm", *filters, "--workspace-concurrency=4", "-r", "run", "--if-present", script], label=f"pnpm {script}")
        for script in SCRIPTS
    ]
    return commands, missing, selected


def npm_commands(build, selection, unit):
    _, graph = script_workspace(build.root, "npm")
    selected = sorted(graph) if selection["all"] else sorted(dependents(graph, selection["modules"]))
    runtime = shutil.which("npm")
    missing = [] if runtime else [f"{unit['id']}: npm runtime missing; no install was attempted"]
    scope = ["--workspaces"] if selection["all"] else [f"--workspace={name}" for name in selected]
    commands = [command(unit, build.root, script, [runtime or "npm", "run", script, "--if-present", *scope], label=f"npm {script}") for script in SCRIPTS]
    return commands, missing, selected


def package_commands(build, selection, unit):
    scripts = read_json(build.root / "package.json").get("scripts", {})
    defined = [script for script in SCRIPTS if isinstance(scripts, dict) and script in scripts]
    manager = package_manager(build.root, unit["root"])
    runtime = shutil.which(manager)
    missing = [] if runtime else [f"{unit['id']}: {manager} runtime missing; no install was attempted"]
    if not defined:
        missing.append(f"{relative_to(build.root / 'package.json', unit['root'])}: no lint/typecheck/test script to run")
    commands = [command(unit, build.root, script, [runtime or manager, "run", "--if-present", script], label=f"{manager} {script}") for script in defined]
    return commands, missing, sorted(selection["modules"]) or [build.root.name]


def python_commands(build, selection, unit):
    if build.stack == "uv":
        members, graph = uv_workspace(build.root)
        selected = sorted(graph) if selection["all"] else sorted(dependents(graph, selection["modules"]))
        settings = [read_toml(build.root / "pyproject.toml"), *(read_toml(members[member] / "pyproject.toml") for member in selected)]
    else:
        selected = ["."]
        settings = [read_toml(build.root / "pyproject.toml")]
    runtime = python_runtime(build.root, unit["root"])
    if runtime is None:
        return [], [f"{unit['id']}: existing Python runtime missing (.venv-verify or .venv); installation was skipped"], selected
    tests = [("tests" if member == "." else f"{member}/tests") for member in selected if (build.root / member / "tests").is_dir()]
    commands = []
    if python_tool_configured("ruff", settings, build.root):
        commands.append(command(unit, build.root, "lint", [runtime, "-m", "ruff", "check", "--no-cache", *selected], label="ruff check"))
        commands.append(command(unit, build.root, "lint", [runtime, "-m", "ruff", "format", "--check", "--no-cache", *selected], label="ruff format --check"))
    if python_tool_configured("mypy", settings, build.root):
        commands.append(command(unit, build.root, "typecheck", [runtime, "-m", "mypy", *selected], label="mypy"))
    if tests:
        commands.append(command(unit, build.root, "test", [runtime, *PYTEST, *tests], label="pytest"))
    return commands, [], selected


def go_commands(build, selection, unit):
    runtime = shutil.which("go")
    if selection["all"]:
        selected = ["./..."]
    else:
        selected = sorted(dependents(go_graph(build.root), selection["modules"]))
    commands = [
        command(unit, build.root, "lint", [runtime or "go", "vet", *selected], label="go vet"),
        command(unit, build.root, "test", [runtime or "go", "test", "-race", *selected], label="go test"),
    ]
    return commands, [], selected


def module_commands(build, selection, unit, harness_root):
    if build.stack == "gradle":
        return gradle_commands(build, selection, unit, harness_root)
    if build.stack == "pnpm":
        return pnpm_commands(build, selection, unit)
    if build.stack == "npm":
        return npm_commands(build, selection, unit)
    if build.stack == "package":
        return package_commands(build, selection, unit)
    if build.stack in {"uv", "python"}:
        return python_commands(build, selection, unit)
    return go_commands(build, selection, unit)


def unit_gate(unit):
    """킷 스택 밖 단위(tauri · flutter …)는 그래프를 만들지 않고 그 단위의 게이트를 부른다. 단위 하나의 full 이다."""
    return command(
        unit,
        unit["root"],
        "gate",
        ["bash", "scripts/verify.sh"],
        env={"HARNESS_VERIFY_LEVEL": "full", "HARNESS_VERIFY_PARENT": "affected"},
        label=f"하네스 {unit['id']} (full)",
    )


class Selection:
    """파일을 빌드 루트별 모듈 · 단위 게이트 · changed 판정 몫으로 나눈다."""

    def __init__(self, root, units):
        self.root, self.units = root, units
        self.builds, self.gates, self.leftover, self.widened, self.incomplete = {}, {}, [], [], []

    def add(self, relative):
        path = self.root / relative
        owner = owner_for(path, self.units)
        if owner["root"] != self.root and owner.get("stack") not in KIT_STACKS:
            if path.suffix in DOC_SUFFIXES:
                self.leftover.append(relative)
            else:
                self.gates.setdefault(owner["id"], owner)
            return
        if is_test(path) and not path.exists():
            self.leftover.append(relative)
            return
        try:
            found = find_module(path, owner["root"], self.root)
        except (ModuleError, OSError, ValueError) as error:
            self.incomplete.append(f"{relative}: {error}")
            return
        if found is None or (found.module is None and not found.contract):
            self.leftover.append(relative)
            return
        selection = self.builds.setdefault(found.build, {"modules": set(), "all": False, "unit": owner, "files": []})
        selection["files"].append(relative)
        if found.contract:
            selection["all"] = True
            build = relative_to(found.build.root, self.root) if found.build.root != self.root else "."
            self.widened.append({"reason": "build-contract", "file": relative, "build": build})
        else:
            selection["modules"].add(found.module)
        if path.suffix not in CODE_EXTENSIONS:
            self.leftover.append(relative)  # json · toml 은 changed 의 정적 검사로도 읽는다


def domain_rows(root, base, relative_files):
    """multi-harness 루트(gates.py · units.json)면 도메인 행에 그 아래 바뀐 파일을 붙여 돌려준다. 아니면 None.

    Git 변경이면 gates.py --changed 의 네 규칙(설계 01 §3.4)으로, --files · --session 이면 파일이 든 도메인으로 고른다.
    """
    if not (root / GATES).is_file() or not (root / REGISTRY).is_file():
        return None
    arguments = [sys.executable, str(root / GATES), "--repo", str(root), "--json"]
    if base is not None:
        arguments += ["--changed", "--base", base["ref"]]
    try:
        result = subprocess.run(arguments, capture_output=True, text=True, timeout=120, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ValueError(f"{GATES} failed: {error}") from error
    if result.returncode:
        raise ValueError((result.stderr.strip().splitlines() or [f"{GATES} failed"])[-1].lstrip("✖ "))
    rows = json.loads(result.stdout)
    for row in rows:
        row["files"] = [relative for relative in relative_files if relative == row["path"] or relative.startswith(row["path"] + "/")]
        if base is None:
            row["changed"] = bool(row["files"])
    return rows


def domain_gate(root, row, units, explicit):
    """바뀐 도메인의 게이트 — 같은 레벨(affected)로, 하위 단위의 HK-2 보조 점검을 통과하도록 PARENT 를 준다."""
    unit = next((unit for unit in units if unit["id"] == row["id"]), {"id": row["id"], "root": root / row["path"]})
    arguments = ["bash", "scripts/verify.sh", "--affected", "--summary"]
    if explicit:
        arguments += ["--files", *(relative[len(row["path"]) + 1:] for relative in row["files"])]
    return command(
        unit,
        root / row["path"],
        "gate",
        arguments,
        env={"HARNESS_VERIFY_LEVEL": "affected", "HARNESS_VERIFY_PARENT": "affected"},
        label=f"하네스 {row['id']} (affected)",
    )


def submodule_gate(root, row, units):
    """바뀐 도메인이 submodule 이고 multi-harness 의 check_submodules.py 가 있으면 그 도메인만 검사하는 명령(설계 10 §3.5). 아니면 None."""
    if not (root / SUBMODULES).is_file() or not (root / row["path"] / ".git").exists():
        return None
    unit = next((unit for unit in units if unit["id"] == row["id"]), {"id": row["id"], "root": root / row["path"]})
    return command(unit, root, "gate", [sys.executable, str(root / SUBMODULES), "--repo", str(root), "--domain", row["path"]], label=f"submodule {row['path']}")


def delegate_domains(root, relative_files, units, base):
    """(도메인 게이트 명령, 건너뛴 도메인, 도메인에 넘긴 파일, 미완료)."""
    rows = domain_rows(root, base, relative_files)
    if rows is None:
        return [], [], set(), []
    gates, skipped, delegated, missing = [], [], set(), []
    for row in rows:
        delegated.update(row["files"])
        if not row["changed"]:
            skipped.append({"id": row["id"], "reason": "no-change"})
            continue
        guard = submodule_gate(root, row, units)
        if guard:
            gates.append(guard)
        if not (root / row["path"] / "scripts/verify.sh").is_file():
            missing.append(f"{row['id']}: {row['path']}/scripts/verify.sh missing; the domain gate could not run")
        else:
            gates.append(domain_gate(root, row, units, explicit=base is None))
    return gates, skipped, delegated, missing


def merge_commands(plan_commands, extra):
    """정적 검사를 앞에 두고(가장 싸다), 모듈 · 게이트 명령, 그다음 changed 판정 명령 순서."""
    static = [item for item in plan_commands if item["kind"] == "static"]
    return static + extra + [item for item in plan_commands if item["kind"] != "static"]


def affected_plan(root, relative_files, explicit_tests, units, base=None):
    gates, skipped_units, delegated, incomplete = delegate_domains(root, relative_files, units, base)
    remaining = [relative for relative in relative_files if relative not in delegated]
    covered = covered_by_checks(root, remaining)
    selection = Selection(root, units)
    for relative in remaining:
        if relative not in covered:
            selection.add(relative)
    extra, modules = list(gates), []
    incomplete.extend(selection.incomplete)
    for build, chosen in sorted(selection.builds.items(), key=lambda entry: str(entry[0].root)):
        try:
            commands, missing, selected = module_commands(build, chosen, chosen["unit"], root)
        except (ModuleError, OSError, ValueError) as error:
            incomplete.extend(f"{relative}: {error}" for relative in chosen["files"])
            continue
        extra.extend(commands)
        incomplete.extend(missing)
        modules.append({
            "unit": chosen["unit"]["id"],
            "stack": build.stack,
            "build": relative_to(build.root, root) if build.root != root else ".",
            "changed": sorted(chosen["modules"]),
            "selected": selected,
            "widened": chosen["all"],
        })
    for unit in selection.gates.values():
        extra.append(unit_gate(unit))
        selection.widened.append({"reason": "no-module-graph", "unit": unit["id"]})
    tests = [path.relative_to(root).as_posix() for path in explicit_tests]
    leftover = selection.leftover + [test for test in tests if test not in selection.leftover]
    plan = verification_plan(root, leftover, explicit_tests if leftover else [], units, scope_files=remaining)
    contract_files = {item["file"] for item in selection.widened if item.get("reason") == "build-contract"}
    plan["commands"] = merge_commands(plan["commands"], extra)
    plan["recommendations"] = [item for item in plan["recommendations"] if item.split(": ", 1)[0] not in contract_files]
    plan["incomplete"] = incomplete + plan["incomplete"]
    plan["widened"] = selection.widened + plan.get("widened", [])
    plan["locks"] = sorted({item["lock"] for item in plan["commands"] if item["lock"]})
    plan.update({
        "status": "plan" if relative_files else "noop",
        "level": "affected",
        "scope": "L1" if extra or plan["scope"] == "L1" else "L0",
        "files": relative_files,
        "base": base,
        "modules": modules,
        "skippedUnits": skipped_units,
    })
    return plan
