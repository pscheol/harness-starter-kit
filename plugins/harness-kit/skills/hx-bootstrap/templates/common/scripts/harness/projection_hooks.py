#!/usr/bin/env python3
"""훅 원본 `.agents/hooks.json` → 하네스별 훅(HK-24 design §2 · §3, 03 §3.4).

TS `packages/cli/src/projection/hooks.ts` 와 같은 결과를 낸다(시험이 같은 fixture 로 묶는다). 쓰지 않는다. 표준 라이브러리만 쓴다.
"""

from __future__ import annotations

import json
import re

HOOKS_REL = ".agents/hooks.json"
SCHEMA = "harness-kit.hooks/v1"
HOOK_ID = re.compile(r"^harness-[a-z0-9-]+$")
ENV_KEY = re.compile(r"^[A-Z][A-Z0-9_]*$")
SCRIPT = re.compile(r"^scripts/[A-Za-z0-9._/-]+$")
OWNER = re.compile(r"^(kit|user|pack:[a-z0-9-]+)$")
TOOLS = ("write", "shell")
FIELDS = {"id", "event", "tools", "script", "timeoutSec", "owner", "floor", "env", "harnesses", "module", "description",
          "title", "maxOutputBytes", "subagents"}
FORBIDDEN_ENV = {"ANTHROPIC_MODEL", "CLAUDE_CODE_EFFORT_LEVEL", "MAX_THINKING_TOKENS", "CLAUDE_CODE_SUBAGENT_MODEL",
                 "CLAUDE_CODE_SUBAGENT_MODEL_FORCE", "CLAUDE_CODE_SUBAGENT_EFFORT"}


class HooksError(ValueError):
    """hooks.json 이 형식을 어겼다. 배치 계획을 세우지 않는다."""


def _positive_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _check(h: object, i: int, hook_map: dict, seen: set[str]) -> dict:
    where = f"hooks.json hooks[{i}]"
    if not isinstance(h, dict):
        raise HooksError(f"{where}: 객체가 아니다")
    extra = sorted(set(h) - FIELDS)
    if extra:
        raise HooksError(f"{where}: 모르는 필드 {', '.join(extra)}")
    hid = h.get("id")
    if not isinstance(hid, str) or not HOOK_ID.match(hid):
        raise HooksError(f"{where}: id 는 harness-<소문자 · 숫자 · ->")
    if hid in seen:
        raise HooksError(f"{where}: id {hid} 가 두 번 나온다")
    seen.add(hid)
    if h.get("event") not in hook_map["events"]:
        raise HooksError(f"{where} {hid}: 모르는 event {h.get('event')!r}")
    tools = h.get("tools")
    if tools is not None:
        if h["event"] not in ("pre-tool", "post-tool"):
            raise HooksError(f"{where} {hid}: tools 는 pre-tool · post-tool 에만 둔다")
        if not isinstance(tools, list) or not tools or any(t not in TOOLS for t in tools):
            raise HooksError(f"{where} {hid}: tools 는 write · shell 목록")
    script = h.get("script")
    if not isinstance(script, str) or not SCRIPT.match(script) or ".." in script.split("/"):
        raise HooksError(f"{where} {hid}: script 는 scripts/ 아래 상대 경로")
    if not _positive_int(h.get("timeoutSec")):
        raise HooksError(f"{where} {hid}: timeoutSec 는 양의 정수")
    if not isinstance(h.get("owner"), str) or not OWNER.match(h["owner"]):
        raise HooksError(f"{where} {hid}: owner 는 kit · user · pack:<이름>")
    for key in ("floor", "subagents"):
        if key in h and not isinstance(h[key], bool):
            raise HooksError(f"{where} {hid}: {key} 는 true · false")
    if "maxOutputBytes" in h and not _positive_int(h["maxOutputBytes"]):
        raise HooksError(f"{where} {hid}: maxOutputBytes 는 양의 정수")
    harnesses = h.get("harnesses")
    known = set(hook_map["harnessOf"].values())
    if harnesses is not None and (not isinstance(harnesses, list) or not harnesses or any(x not in known for x in harnesses)):
        raise HooksError(f"{where} {hid}: harnesses 는 {' · '.join(sorted(known))} 목록")
    for key in ("module", "description", "title"):
        if key in h and (not isinstance(h[key], str) or not h[key]):
            raise HooksError(f"{where} {hid}: {key} 는 빈 글이 아니다")
    env = h.get("env")
    if env is not None:
        if not isinstance(env, dict):
            raise HooksError(f"{where} {hid}: env 는 객체")
        for k, per in env.items():
            if not ENV_KEY.match(k) or k in FORBIDDEN_ENV or (k.startswith("ANTHROPIC_DEFAULT_") and k.endswith("_MODEL")):
                raise HooksError(f"{where} {hid}: env {k} 를 쓸 수 없다(대문자 · 숫자 · _, 모델 환경변수 금지)")
            if not isinstance(per, dict) or any(x not in known or not isinstance(v, str) or not re.fullmatch(r"[A-Za-z0-9._/:-]*", v) for x, v in per.items()):
                raise HooksError(f"{where} {hid}: env {k} 는 하네스 → 값(영문 · 숫자 · ._/:-)")
    return h


def parse_hooks(text: str | None, hook_map: dict) -> list[dict] | None:
    """없으면 None. 형식을 어기면 HooksError."""
    if text is None:
        return None
    try:
        data = json.loads(text)
    except ValueError as error:
        raise HooksError(f"hooks.json 을 해석할 수 없다: {error}") from error
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        raise HooksError(f"hooks.json schema 는 {SCHEMA}")
    hooks = data.get("hooks")
    if not isinstance(hooks, list):
        raise HooksError("hooks.json hooks 가 배열이 아니다")
    seen: set[str] = set()
    return [_check(h, i, hook_map, seen) for i, h in enumerate(hooks)]


def wanted(hooks: list[dict], target: str, hook_map: dict, modules: list[str]) -> list[dict]:
    harness = hook_map["harnessOf"][target]
    return [h for h in hooks
            if target in hook_map["events"][h["event"]]
            and (h.get("harnesses") is None or harness in h["harnesses"])
            and (h.get("module") is None or h["module"] in modules)]


def command(h: dict, target: str, hook_map: dict) -> str:
    harness = hook_map["harnessOf"][target]
    prefix = "".join(f"{k}={per[harness]} " for k, per in (h.get("env") or {}).items() if harness in per)
    return prefix + hook_map["commands"][target].replace("{id}", h["id"]).replace("{script}", h["script"])


def tool_names(h: dict, target: str, hook_map: dict) -> list[str]:
    out: list[str] = []
    for tool in h.get("tools") or []:
        for name in hook_map["tools"][tool][target].split("|"):
            if name not in out:
                out.append(name)
    return out


def settings_hooks(hooks: list[dict], target: str, hook_map: dict, modules: list[str]) -> list[dict]:
    """Claude settings · Codex hooks.json 병합에 쓰는 원하는 훅(HK-13 settings want 의 hooks 모양)."""
    out = []
    for h in wanted(hooks, target, hook_map, modules):
        item = {"id": h["id"], "event": hook_map["events"][h["event"]][target]}
        names = tool_names(h, target, hook_map)
        if names:
            item["matcher"] = "|".join(names)
        item["script"] = h["script"]
        item["hook"] = {"type": "command", "command": command(h, target, hook_map), "timeout": h["timeoutSec"]}
        out.append(item)
    return out


def kiro_ide_files(hooks: list[dict], hook_map: dict, modules: list[str]) -> list[tuple[str, str]]:
    """Kiro IDE `.kiro/hooks/<id>.json` — 훅 하나에 파일 하나."""
    out = []
    for h in wanted(hooks, "kiroIde", hook_map, modules):
        entry: dict = {"name": h.get("title", h["id"]), "trigger": hook_map["events"][h["event"]]["kiroIde"]}
        if "description" in h:
            entry["description"] = h["description"]
        names = tool_names(h, "kiroIde", hook_map)
        if names:
            entry["matcher"] = "|".join(names)
        entry["action"] = {"type": "command", "command": command(h, "kiroIde", hook_map), "timeout": h["timeoutSec"]}
        out.append((f".kiro/hooks/{h['id']}.json", json.dumps({"version": "v1", "hooks": [entry]}, ensure_ascii=False, indent=2) + "\n"))
    return out


def kiro_cli_hooks(hooks: list[dict], hook_map: dict, modules: list[str], subagents_only: bool = False) -> dict:
    """Kiro CLI 에이전트 `hooks`. matcher 는 도구 하나만 받으므로 도구마다 항목을 하나씩 만든다."""
    out: dict = {}
    for h in wanted(hooks, "kiroCli", hook_map, modules):
        if subagents_only and not h.get("subagents"):
            continue
        cmd = command(h, "kiroCli", hook_map)
        names = tool_names(h, "kiroCli", hook_map)
        entries = [{"matcher": n, "command": cmd, "timeout_ms": h["timeoutSec"] * 1000} for n in names] or [
            {"command": cmd, "timeout_ms": h["timeoutSec"] * 1000}]
        out.setdefault(hook_map["events"][h["event"]]["kiroCli"], []).extend(entries)
    return out


def substitute(value: object, tokens: dict) -> object:
    """`{{kit:KEY}}` · `{{KEY}}` 를 파싱한 JSON 문자열 안에서 바꾼다. projection.json 은 설치 때 치환하지 않는 `{{kit:KEY}}` 를 쓴다
    (원문 치환이면 값의 `\\` · `"` 가 JSON 을 깨뜨린다)."""
    if isinstance(value, str):
        for k, v in tokens.items():
            if v:
                value = value.replace("{{kit:" + k + "}}", v).replace("{{" + k + "}}", v)
        return value
    if isinstance(value, list):
        return [substitute(x, tokens) for x in value]
    if isinstance(value, dict):
        return {k: substitute(x, tokens) for k, x in value.items()}
    return value


def render_kiro_coordinator(spec: dict, tokens: dict, cli_hooks: dict) -> str:
    obj = substitute(spec["kiroCoordinator"], tokens)
    if cli_hooks:
        obj = {**obj, "hooks": cli_hooks}
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


def kit_script_suffixes(hooks: list[dict] | None, hook_map: dict) -> list[str]:
    """v1 · HK-13 판 명령의 꼬리(`scripts/hooks/<이름>` · `_ <이름>`)로 옛 킷 항목을 알아본다."""
    names: list[str] = []
    for script in [h["script"] for h in hooks or []] + [f"scripts/hooks/{n}" for n in hook_map.get("legacyScripts", [])]:
        if script not in names:
            names.append(script)
    out: list[str] = []
    for script in names:
        for s in (script, "_ " + script.rsplit("/", 1)[-1]):
            if s not in out:
                out.append(s)
    return out


# ── 주인별 훅 파일 합치기(HK-14 design §1 · §4) ───────────────────────────────

HOOKS_DIR = ".agents/hooks.d"
PROJECT_FILE = "project.json"


def hook_doc_paths(names: list[str]) -> list[str]:
    """`.agents/hooks.d/` 의 파일 이름 → 읽는 순서(이름 순, project.json 은 마지막)."""
    jsons = sorted((n for n in names if n.endswith(".json") and not n.startswith(".")), key=lambda n: (n == PROJECT_FILE, n.encode("utf-8")))
    return [f"{HOOKS_DIR}/{n}" for n in jsons]


def merge_hook_docs(docs: list[tuple[str, str]], hook_map: dict, floor: tuple[str, ...]) -> tuple[list[dict], list[dict]]:
    """[(경로, 내용)] — 첫째가 킷 hooks.json. 팩 파일끼리 · 킷과 같은 id 는 HooksError.
    project.json 은 같은 id 를 덮고(하한 id 는 버리고 floor-override), 새 id 는 뒤에 붙인다."""
    hooks: list[dict] = []
    findings: list[dict] = []
    for rel, text in docs:
        items = parse_hooks(text, hook_map) or []
        project = rel == f"{HOOKS_DIR}/{PROJECT_FILE}"
        index = {h["id"]: i for i, h in enumerate(hooks)}
        for item in items:
            if not project:
                if item["id"] in index:
                    raise HooksError(f"{rel}: 훅 id {item['id']} 가 다른 층에도 있다(팩 훅 id 는 harness-<팩>- 로 시작한다)")
                hooks.append(item)
                continue
            if item["id"] in floor:
                findings.append({"kind": "floor-override", "severity": "error", "path": rel,
                                 "hint": f"하한 훅 {item['id']} 는 프로젝트가 덮지 못한다 — 이 항목은 쓰지 않았다"})
            elif item["id"] in index:
                hooks[index[item["id"]]] = item
            else:
                hooks.append(item)
    return hooks, findings
