#!/usr/bin/env python3
"""하네스 구조 검사 — SDD 상태 · 키 충돌 · 옛 구조 동결, 문서 링크, 에이전트 설정, 규칙·스킬 복사본이 있는지.

스택과 무관한 공통 검사다. 단위 고유 검사는 scripts/check_unit.py 의 errors(root) 가 있으면 함께 부른다.
파일을 고치지 않는다.
"""

import argparse
import importlib.util
import json
import re
import subprocess
import sys
import tomllib
from pathlib import Path
from urllib.parse import unquote

sys.dont_write_bytecode = True

from harness.approvals_guard import base_errors as approval_errors
from harness.sdd_issues import plan_errors
from harness.codebase_check import run_check as codebase_check
from harness import deploy_config, ops_records, rule_candidates
from harness.intent import FOLDER as INTENT_FOLDER, INTENTS, check as intent_check
from harness.sdd_keys import issue_key_errors, legacy_frozen_errors
from harness.sdd_layout import sdd_lock

ROOT = Path(__file__).resolve().parents[1]
AGENT_DIRS = (".codex", ".claude", ".kiro")
HARNESS_DIRS = (".agents", *AGENT_DIRS)
ENTRY_DOCS = ("AGENTS.md", "CLAUDE.md", "ARCHITECTURE.md", "README.md")
REQUIRED = (
    "AGENTS.md",
    "ARCHITECTURE.md",
    ".agents/harness.json",
    ".agents/rules/guardrails.md",
    ".agents/rules/structure.md",
    ".agents/rules/tech.md",
    ".agents/docs/README.md",
    ".agents/docs/specs-index.md",
    ".agents/docs/tech-debt-tracker.md",
    "scripts/verify.sh",
    "scripts/install-git-hooks.sh",
    "scripts/git-hooks/pre-commit",
    "scripts/git-hooks/pre-push",
    "scripts/git-hooks/global-hook.sh",
    "scripts/hooks/protect-sources.sh",
)
#: 에이전트마다 필수인 파일. `.agents/harness.json` 의 `agents` 가 고른 에이전트만 본다(없으면 셋 다).
AGENT_REQUIRED = {
    "claude": ("CLAUDE.md", ".claude/settings.json"),
    "codex": (".codex/config.toml",),
    "kiro": (".kiro/hooks/harness-verify-gate.json",),
}


#: `.agents/harness.json` 의 `agents` 에 올 수 있는 이름. cursor 는 필수 파일이 없다(생성물만).
KNOWN_AGENTS = ("claude", "codex", "cursor", "kiro")


def agent_errors(root):
    """`agents` 를 적었다면 빈 목록·모르는 이름이 아니어야 한다. 틀리면 그 에이전트의 필수 파일 검사가 조용히 빠진다."""
    try:
        manifest = json.loads((root / ".agents/harness.json").read_text())
    except (OSError, ValueError):
        return []
    if "agents" not in manifest:
        return []
    agents = manifest["agents"]
    if not isinstance(agents, list) or not all(isinstance(name, str) for name in agents):
        return [".agents/harness.json: agents must be a list of names"]
    if not agents:
        return [".agents/harness.json: agents is empty"]
    return [f".agents/harness.json: unknown agent '{name}'" for name in agents if name not in KNOWN_AGENTS]


def selected_agents(root):
    """설치한 에이전트. 매니페스트에 `agents` 가 없으면 세 에이전트를 모두 쓰는 하네스로 본다."""
    try:
        agents = json.loads((root / ".agents/harness.json").read_text()).get("agents")
    except (OSError, ValueError):
        agents = None
    return set(agents) if isinstance(agents, list) else set(AGENT_REQUIRED)


def required(root):
    return REQUIRED + tuple(name for agent in sorted(selected_agents(root)) for name in AGENT_REQUIRED.get(agent, ()))
INCLUSIONS = {"always", "manual", "fileMatch", "auto"}
CODEX_ROLE_KEYS = ("name", "description", "developer_instructions")
CODEX_HOOKS_KEYS = {"description", "hooks"}


def label(root, path):
    return path.relative_to(root).as_posix()


def documents(root):
    paths = [root / name for name in ENTRY_DOCS if (root / name).is_file()]
    for directory in HARNESS_DIRS:
        paths.extend(sorted((root / directory).rglob("*.md")))
    return paths


def tracked_markdown(root):
    """git 이 추적하는 하네스 루트 아래 Markdown. git 이 없거나 리포가 아니면(격리 복사본) 빈 목록."""
    try:
        command = ["git", "-C", str(root), "ls-files", "-z", "--", "*.md"]
        result = subprocess.run(command, capture_output=True, check=False)
    except FileNotFoundError:
        return []
    if result.returncode != 0:
        return []
    return [root / name for name in result.stdout.decode().split("\0") if name and (root / name).is_file()]


def ignored_errors(root):
    """필수 파일이 무시 규칙(예: lib/)에 걸리면 작업 트리에는 있어 다른 검사가 통과해도 커밋에서 빠진다."""
    present = [name for name in required(root) if (root / name).is_file()]
    result = subprocess.run(["git", "check-ignore", *present], cwd=root, capture_output=True, text=True, check=False)
    return [f"{name}: ignored by .gitignore — it would be left out of commits" for name in result.stdout.split()]


def link_errors(root):
    """하네스 문서는 끊긴 링크와 루트 밖 링크를, 그 밖의 추적 Markdown 은 루트 밖 링크만 본다.

    리포로 떼어 낸 뒤 루트 밖을 가리키는 링크는 원격 화면에서도 깨진다. 끊긴 링크는 하네스 문서만 책임진다.
    """
    errors = []
    harness_docs = set(documents(root))
    for path in sorted(harness_docs | set(tracked_markdown(root))):
        name = label(root, path)
        if "references" in path.relative_to(root).parts or "_spec-templates" in path.relative_to(root).parts:
            continue
        text = re.sub(r"```.*?```", "", path.read_text(), flags=re.DOTALL)
        text = re.sub(r"`[^`\n]*`", "", text)
        for raw in re.findall(r'\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)', text):
            target = raw.strip("<>")
            if not target or target.startswith("#") or re.match(r"^[a-z][a-z0-9+.-]*:", target):
                continue
            resolved = (path.parent / unquote(target.split("#", 1)[0])).resolve()
            if not resolved.is_relative_to(root):
                errors.append(f"{name}: link escapes harness root: {target}")
            elif path in harness_docs and not resolved.exists():
                errors.append(f"{name}: broken link: {target}")
    return errors


def front_matter(text):
    match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not match:
        return None
    fields = {}
    for line in match.group(1).splitlines():
        key, _, value = line.partition(":")
        if value:
            fields[key.strip()] = value.strip().strip("'\"")
    return fields


def resource_errors(root, path, parsed):
    errors = []
    for resource in parsed.get("resources", []):
        if not isinstance(resource, str) or not resource.startswith(("file://", "skill://")):
            continue
        pattern = resource.split("://", 1)[1]
        if ".." in Path(pattern).parts or Path(pattern).is_absolute():
            errors.append(f"{label(root, path)}: resource escapes harness root: {resource}")
        elif not list(root.glob(pattern)):
            errors.append(f"{label(root, path)}: missing resource {pattern}")
    return errors


def config_errors(root):
    errors = agent_errors(root) + [f"{name}: missing required file" for name in required(root) if not (root / name).is_file()]
    for directory in HARNESS_DIRS:
        for path in (root / directory).rglob("*"):
            if path.is_symlink() and not path.resolve().is_relative_to(root):
                errors.append(f"{label(root, path)}: external symlink")
    manifest = root / ".agents/harness.json"
    if manifest.is_file():
        try:
            unit = json.loads(manifest.read_text())
            if not unit.get("unit") or not isinstance(unit.get("shared"), list):
                errors.append(".agents/harness.json: unit and shared list are required")
        except ValueError as error:
            errors.append(f".agents/harness.json: invalid JSON: {error}")
    for directory in AGENT_DIRS:
        for path in sorted((root / directory).rglob("*")):
            if path.suffix not in (".toml", ".json") or not path.is_file():
                continue
            try:
                parsed = tomllib.loads(path.read_text()) if path.suffix == ".toml" else json.loads(path.read_text())
            except (ValueError, OSError) as error:
                errors.append(f"{label(root, path)}: invalid configuration: {error}")
                continue
            if path.name == "config.toml":
                for name, agent in parsed.get("agents", {}).items():
                    if isinstance(agent, dict) and "config_file" in agent:
                        target = (path.parent / agent["config_file"]).resolve()
                        if not target.is_relative_to(root) or not target.is_file():
                            errors.append(f"{label(root, path)}: missing local agent config {name}")
            if directory == ".codex" and path.name == "hooks.json" and set(parsed) - CODEX_HOOKS_KEYS:
                unknown = ", ".join(sorted(set(parsed) - CODEX_HOOKS_KEYS))
                allowed = " and ".join(sorted(CODEX_HOOKS_KEYS))
                errors.append(f"{label(root, path)}: Codex ignores hooks.json with top-level keys other than {allowed}: {unknown}")
            if directory == ".codex" and path.parent.name == "agents":
                for key in CODEX_ROLE_KEYS:
                    if not parsed.get(key):
                        errors.append(f"{label(root, path)}: Codex role needs {key}")
            if directory == ".kiro" and path.parent.name == "agents":
                errors += resource_errors(root, path, parsed)
            is_kiro_hook = directory == ".kiro" and path.parent.name == "hooks"
            if is_kiro_hook and (parsed.get("version") != "v1" or not parsed.get("hooks")):
                errors.append(f"{label(root, path)}: Kiro hook file needs version v1 and hooks")
    return errors


def pointer_errors(root):
    """하네스 폴더에 원본마다 복사본 · 생성물이 있는지 본다(HK-13). 내용 대조는 scripts/harness/check_layout.py 가 lock 으로 한다."""
    errors = []
    agents = selected_agents(root)
    rules = {path.stem for path in (root / ".agents/rules").glob("*.md")}
    for rule in sorted(rules) if "kiro" in agents else []:
        steering = root / ".kiro/steering" / f"{rule}.md"
        if not steering.is_file() or f".agents/rules/{rule}.md" not in steering.read_text():
            errors.append(f"{rule}.md: missing Kiro steering")
    for steering in sorted((root / ".kiro/steering").glob("*.md")):
        text = steering.read_text()
        fields = front_matter(text)
        if fields is None or fields.get("inclusion", "always") not in INCLUSIONS:
            errors.append(f"{label(root, steering)}: steering needs front matter with a known inclusion")
        if steering.stem.startswith("hx-"):
            continue
        for target in re.findall(r"원본[:\s`]*\.agents/rules/([a-z0-9-]+)\.md", text):
            if target not in rules:
                errors.append(f"{label(root, steering)}: points to orphan rule {target}.md")
    for skill in sorted((root / ".agents/skills").glob("hx-*")):
        canonical = f".agents/skills/{skill.name}/SKILL.md"
        fields = front_matter((skill / "SKILL.md").read_text()) if (skill / "SKILL.md").is_file() else None
        if not fields or fields.get("name") != skill.name or not fields.get("description"):
            errors.append(f"{canonical}: skill needs name matching its folder and description")
        copies = {"claude": f".claude/skills/{skill.name}/SKILL.md", "kiro": f".kiro/skills/{skill.name}/SKILL.md"}
        for name in (path for agent, path in copies.items() if agent in agents):
            if not (root / name).is_file():
                errors.append(f"{name}: missing skill copy")
        kiro_skill = root / f".kiro/skills/{skill.name}/SKILL.md"
        if kiro_skill.is_file() and (front_matter(kiro_skill.read_text()) or {}).get("name") != skill.name:
            errors.append(f".kiro/skills/{skill.name}/SKILL.md: Kiro skill name must match its folder")
    roles = {path.stem for path in (root / ".agents/roles").glob("*.md")}
    for directory, pattern in ((".claude/agents", "*.md"), (".codex/agents", "*.toml")):
        for path in sorted((root / directory).glob(pattern)):
            if path.stem not in roles:
                errors.append(f"{label(root, path)}: role has no .agents/roles/{path.stem}.md")
            elif f".agents/roles/{path.stem}.md" not in path.read_text():
                errors.append(f"{label(root, path)}: role file must point to .agents/roles/{path.stem}.md")
    return errors


README_SECTIONS = ("개요", "구조", "준비물", "실행", "검증", "하네스", "기여")
ROLE_SECTIONS = ("목적", "쓰는 때", "입력", "절차", "출력", "금지", "완료 조건")
ENTRY_LIMITS = {"AGENTS.md": 150, "CLAUDE.md": 40}
STANDARD = ".agents/docs/guides/doc-standards.md"


def missing_sections(path, names):
    """코드 펜스 밖의 `## ` 헤딩만 센다 — 예시 블록 안의 헤딩이 절로 잡히면 빠진 절을 놓친다."""
    headings, fenced = set(), False
    for line in path.read_text().splitlines():
        if line.lstrip().startswith("```"):
            fenced = not fenced
        elif not fenced and line.startswith("## "):
            headings.add(line[3:].strip())
    return [name for name in names if name not in headings]


def unclosed_fence(text):
    """닫히지 않은 코드 펜스가 열린 줄 번호. 모두 닫혔으면 None."""
    opened = None
    for number, line in enumerate(text.splitlines(), 1):
        if line.lstrip().startswith("```"):
            opened = None if opened else number
    return opened


def doc_errors(root):
    """문서 기준 — 사람용 README 7절, 짧은 진입 문서, 그림 있는 ARCHITECTURE, 역할 7절."""
    errors = []
    readme = root / "README.md"
    if not readme.is_file():
        errors.append(f"README.md: missing — see {STANDARD}")
    else:
        errors += [f"README.md: missing section '## {name}' — see {STANDARD}" for name in missing_sections(readme, README_SECTIONS)]
    for name, limit in ENTRY_LIMITS.items():
        path = root / name
        if path.is_file():
            count = len(path.read_text().splitlines())
            if count > limit:
                errors.append(f"{name}: {count} lines > {limit} — move detail to ARCHITECTURE.md or .agents/rules")
    architecture = root / "ARCHITECTURE.md"
    if architecture.is_file() and "```mermaid" not in architecture.read_text():
        errors.append(f"ARCHITECTURE.md: no mermaid diagram — see {STANDARD}")
    for role in sorted((root / ".agents/roles").glob("*.md")):
        errors += [f"{label(root, role)}: missing section '## {name}' — see {STANDARD}" for name in missing_sections(role, ROLE_SECTIONS)]
    for agent in sorted((root / ".claude/agents").glob("*.md")):
        fields = front_matter(agent.read_text()) or {}
        if not fields.get("tools"):
            errors.append(f"{label(root, agent)}: front matter needs tools")
    for path in documents(root):
        line = unclosed_fence(path.read_text())
        if line:
            errors.append(f"{label(root, path)}: unclosed code fence at line {line}")
    return errors


def unit_errors(root):
    path = root / "scripts/check_unit.py"
    if not path.is_file():
        return []
    spec = importlib.util.spec_from_file_location("check_unit", path)
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(module)
        unit_check = getattr(module, "errors", None)
        if not callable(unit_check):
            return ["scripts/check_unit.py: errors(root) 함수가 없다"]
        return list(unit_check(root))
    except Exception as error:  # 단위 검사가 깨져도 어느 검사인지 보이게 한다
        return [f"scripts/check_unit.py: {type(error).__name__}: {error}"]
    finally:
        sys.path.remove(str(path.parent))


def intent_errors(root):
    """Intent 폴더마다 질문 형식 · units 규칙 · 스토리 배정 · 의존 고리(설계 08 §3.5, DS-R3 · R5~R8)."""
    base = root / INTENTS
    out = []
    if base.is_dir():
        for folder in sorted(base.iterdir()):
            if folder.is_dir() and INTENT_FOLDER.match(folder.name):
                out += [f"{INTENTS}/{folder.name}: {problem}" for problem in intent_check(folder)["problems"]]
    return out


def codebase_errors(root):
    """codebase 모델 출처 칸(DS-R22)은 실패, 오래됨(DS-R23)은 경고만(stderr)."""
    result = codebase_check(root, [])
    for warning in result["warnings"]:
        print(f"⚠ {warning}", file=sys.stderr)
    return result["problems"]


def ops_errors(root):
    """deploy.json 형식 · 운영 기록 실측 값 출처(DO-R9) · accepted 규칙 후보의 규칙 파일 변경(DO-R15). 미달 지표 미지정은 경고만(stderr)."""
    config, error = deploy_config.read(root)
    out = [error] if error else (deploy_config.problems(config) if config is not None else [])
    problems, warnings = ops_records.check(root)
    for warning in warnings:
        print(f"⚠ {warning}", file=sys.stderr)
    return out + problems + rule_candidates.errors(root)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plans-only", action="store_true")
    args = parser.parse_args()
    with sdd_lock(ROOT):
        errors = plan_errors(ROOT)
    if not args.plans_only:
        errors += ignored_errors(ROOT) + link_errors(ROOT) + config_errors(ROOT) + pointer_errors(ROOT) + doc_errors(ROOT) + unit_errors(ROOT)
        # check-issue-keys(R7.9) · check-legacy-frozen(R7.7): base 와 같은 키 · 다른 이름, 옛 구조에 새 문서.
        errors += issue_key_errors(ROOT) + legacy_frozen_errors(ROOT)
        # 승인 기록 덧붙이기 전용(VQ-R14) · 새 기록 형식 · done 승인 없는 completed(VQ-R13), base merge-base 대비(설계 09 §3.8).
        errors += approval_errors(ROOT)
        errors += intent_errors(ROOT) + codebase_errors(ROOT) + ops_errors(ROOT)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("SDD state OK" if args.plans_only else "Harness structure, links, configuration and SDD state OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
