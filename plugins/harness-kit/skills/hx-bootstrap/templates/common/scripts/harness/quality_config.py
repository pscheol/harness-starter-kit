"""분석기 등록 파일 `.agents/analyzers.json` · 게이트 설정 `.agents/quality-gate.json` · 기준선 형식(설계 09 §3.3 · §3.5 · §3.6).

읽기는 verify_sources.config_path 를 따른다(MR 이면 base 판). 형식 검사는 fast 레벨(`quality.py check-config`)이 부른다.
"""

import copy
import json
import re
from datetime import date, timedelta

from harness.verify_sources import config_path, tools_dir

REGISTRY, GATE, BASELINE = "analyzers.json", "quality-gate.json", "quality-baseline.json"
REGISTRY_SCHEMA = "harness-kit.analyzers/v1"
GATE_SCHEMA = "harness-kit.quality-gate/v1"
BASELINE_SCHEMA = "harness-kit.quality-baseline/v1"
LEVELS = ("changed", "affected", "full")
SCOPES = ("files", "modules", "repo", "lockfiles")
CATEGORIES = ("security", "secret", "dependency", "duplication", "complexity", "lint", "bug", "type", "coverage")
SEVERITIES = ("CRITICAL", "HIGH", "MEDIUM", "LOW")
IDENTIFIER = re.compile(r"[a-z0-9][a-z0-9._-]*")
CONVERTER = re.compile(r"convert:([a-z0-9-]+)")
ACCEPT_DAYS = 180
DEFAULT_GATE = {
    "schema": GATE_SCHEMA,
    "newIssues": {"CRITICAL": 0, "HIGH": None, "MEDIUM": None, "LOW": None},
    "duplication": {"newCodeMaxPercent": 3.0, "minChangedLines": 50},
    "complexity": {"functionMaxCcn": 15, "mode": "new-or-worsened"},
    "coverage": {"newCodeMinPercent": None},
    "dependencies": {"blockAtSeverity": "CRITICAL"},
    "review": {"openMax": {"CRITICAL": 0, "HIGH": 0}},
    "enforceAt": ["affected", "full"],
    "warnAt": ["changed"],
}


class ConfigError(ValueError):
    pass


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError as error:
        raise ConfigError(f"{path.name}: 읽지 못했다: {error}") from error
    except ValueError as error:
        raise ConfigError(f"{path.name}: JSON 이 아니다: {error}") from error


def load_registry(root, environ=None):
    """등록 파일. 없으면 None(분석기 0개). 형식이 틀리면 ConfigError."""
    path = config_path(root, REGISTRY, environ)
    if not path.is_file():
        return None
    data = read_json(path)
    errors = registry_errors(data, tools_dir(root, environ))
    if errors:
        raise ConfigError(f"{REGISTRY}: " + "; ".join(errors[:3]))
    return data


def merged(defaults, values):
    result = copy.deepcopy(defaults)
    for key, value in (values or {}).items():
        result[key] = merged(result[key], value) if isinstance(value, dict) and isinstance(result.get(key), dict) else value
    return result


def load_gate(root, environ=None):
    path = config_path(root, GATE, environ)
    data = read_json(path) if path.is_file() else {}
    errors = gate_errors(data) if data else []
    if errors:
        raise ConfigError(f"{GATE}: " + "; ".join(errors[:3]))
    return merged(DEFAULT_GATE, data)


def load_baseline(root, environ=None):
    """기준선. 없으면 None. 형식이 틀리면 ConfigError."""
    path = config_path(root, BASELINE, environ)
    if not path.is_file():
        return None
    data = read_json(path)
    errors, _ = baseline_problems(data, date.today())
    if errors:
        raise ConfigError(f"{BASELINE}: " + "; ".join(errors[:3]))
    return data


def string_list(value):
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def positive_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0


def valid_severity_map(value):
    return isinstance(value, dict) and set(value.values()) <= set(SEVERITIES)


def fetched_rules(value):
    """rules 칸이 없거나, 있으면 킷에 넣지 않은 규칙(bundled: false)이다(VQ-R18)."""
    return value is None or (isinstance(value, dict) and value.get("bundled") is False)


def valid_alternative(value):
    is_command = isinstance(value, dict) and string_list(value.get("cmd")) and bool(value.get("cmd"))
    return isinstance(value, str) or is_command


def sarif_problem(sarif, tools):
    converter = CONVERTER.fullmatch(sarif) if isinstance(sarif, str) else None
    if sarif not in ("native", "none") and not converter:
        return "sarif 는 native · none · convert:<변환기> 다"
    if converter and not (tools / "harness/sarif" / f"{converter.group(1)}.py").is_file():
        return f"변환기 {converter.group(1)} 가 없다"
    return None


def shape_problems(entry):
    problems = []
    if not isinstance(entry.get("id"), str) or not IDENTIFIER.fullmatch(entry["id"]):
        problems.append("id 는 소문자 · 숫자 · . _ - 다")
    levels = entry.get("levels")
    if not string_list(levels) or not levels or not set(levels) <= set(LEVELS):
        problems.append(f"levels 는 {'·'.join(LEVELS)} 중 하나 이상이다")
    if entry.get("scope") not in SCOPES:
        problems.append(f"scope 는 {'·'.join(SCOPES)} 중 하나다")
    if entry.get("category") not in CATEGORIES:
        problems.append("category 값이 틀렸다")
    if not string_list(entry.get("cmd")) or not entry.get("cmd"):
        problems.append("cmd 는 비지 않은 문자열 목록이다")
    return problems


def option_problems(entry):
    problems = [f"{key} 는 true · false 다" for key in ("required", "enabled") if key in entry and not isinstance(entry[key], bool)]
    problems += [f"{key} 는 문자열 목록이다" for key in ("trigger", "include", "collect", "convertArgs", "versionCmd") if key in entry and not string_list(entry[key])]
    if "timeoutSec" in entry and not positive_number(entry["timeoutSec"]):
        problems.append("timeoutSec 은 양수다")
    if entry.get("fingerprint", "auto") not in ("auto", "content"):
        problems.append("fingerprint 는 auto · content 다")
    if not valid_severity_map(entry.get("severityMap", {})):
        problems.append("severityMap 값은 심각도 넷 중 하나다")
    if not fetched_rules(entry.get("rules")):
        problems.append("rules.bundled 는 false 다(규칙은 실행할 때 받는다)")
    if not all(valid_alternative(value) for value in entry.get("alternatives", [])):
        problems.append("alternatives 는 도구 이름 또는 cmd 가 있는 객체다")
    return problems


def entry_errors(entry, tools):
    if not isinstance(entry, dict):
        return ["분석기 항목이 객체가 아니다"]
    problems = shape_problems(entry) + option_problems(entry)
    problem = sarif_problem(entry.get("sarif"), tools)
    if problem:
        problems.append(problem)
    return [f"{entry.get('id', '?')}: {problem}" for problem in problems]


def registry_errors(data, tools):
    if not isinstance(data, dict) or data.get("schema") != REGISTRY_SCHEMA:
        return [f"schema 는 {REGISTRY_SCHEMA} 다"]
    entries = data.get("analyzers")
    if not isinstance(entries, list):
        return ["analyzers 는 목록이다"]
    errors = [problem for entry in entries for problem in entry_errors(entry, tools)]
    names = [entry.get("id") for entry in entries if isinstance(entry, dict)]
    errors.extend(f"{name}: id 가 겹친다" for name in sorted({name for name in names if names.count(name) > 1}))
    return errors


def limit_ok(value):
    return value is None or (isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0)


def gate_errors(data):
    if not isinstance(data, dict) or data.get("schema") != GATE_SCHEMA:
        return [f"schema 는 {GATE_SCHEMA} 다"]
    gate = merged(DEFAULT_GATE, data)
    errors = []
    issues = gate["newIssues"]
    if not set(issues) <= set(SEVERITIES) or not all(limit_ok(value) for value in issues.values()):
        errors.append("newIssues 는 심각도 → 0 이상 숫자 또는 null 이다")
    if issues.get("CRITICAL") != 0:
        errors.append("newIssues.CRITICAL 은 0 이다(게이트 하한)")
    if (gate["review"].get("openMax") or {}).get("CRITICAL") != 0:
        errors.append("review.openMax.CRITICAL 은 0 이다(게이트 하한)")
    duplication, complexity = gate["duplication"], gate["complexity"]
    if not limit_ok(duplication.get("newCodeMaxPercent")) or not isinstance(duplication.get("minChangedLines"), int) or duplication["minChangedLines"] < 0:
        errors.append("duplication 은 newCodeMaxPercent(숫자 · null) · minChangedLines(0 이상 정수)다")
    if not isinstance(complexity.get("functionMaxCcn"), int) or complexity["functionMaxCcn"] < 1 or complexity.get("mode") != "new-or-worsened":
        errors.append("complexity 는 functionMaxCcn(1 이상 정수) · mode new-or-worsened 다")
    if gate["dependencies"].get("blockAtSeverity") not in (*SEVERITIES, None):
        errors.append("dependencies.blockAtSeverity 는 심각도 또는 null 이다")
    for key in ("enforceAt", "warnAt"):
        if not string_list(gate[key]) or not set(gate[key]) <= set(LEVELS):
            errors.append(f"{key} 는 {'·'.join(LEVELS)} 목록이다")
    if string_list(gate["enforceAt"]) and not {"affected", "full"} <= set(gate["enforceAt"]):
        errors.append("enforceAt 에 affected · full 이 있어야 한다(게이트 하한)")
    return errors


def baseline_problems(data, today):
    """(오류, 경고). 경고: 지난 accepted."""
    if not isinstance(data, dict) or data.get("schema") != BASELINE_SCHEMA:
        return [f"schema 는 {BASELINE_SCHEMA} 다"], []
    errors, warnings = [], []
    findings = data.get("findings", {})
    if not isinstance(findings, dict) or not all(isinstance(entries, dict) for entries in findings.values()):
        errors.append("findings 는 분석기 → {지문: 항목} 이다")
    for item in data.get("accepted", []) if isinstance(data.get("accepted", []), list) else [None]:
        if not isinstance(item, dict) or not isinstance(item.get("fingerprint"), str):
            errors.append("accepted 항목에 fingerprint 가 없다")
            continue
        try:
            until = date.fromisoformat(str(item.get("until")))
        except ValueError:
            errors.append(f"accepted {item['fingerprint'][:12]}: until 은 YYYY-MM-DD 다")
            continue
        if until > today + timedelta(days=ACCEPT_DAYS):
            errors.append(f"accepted {item['fingerprint'][:12]}: until 은 {ACCEPT_DAYS}일 이내다")
        elif until < today:
            warnings.append(f"accepted {item['fingerprint'][:12]}: {until} 에 끝나 무시한다")
    return errors, warnings


def semgrep_acknowledged(root):
    try:
        meta = json.loads((root / ".agents/harness-kit.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return isinstance(meta, dict) and (meta.get("analyzers") or {}).get("semgrepRulesAcknowledged") is True


def check(root, environ=None, today=None):
    """fast 형식 검사 → (오류, 경고, 분석기 수). 파일이 없으면 검사할 것도 없다."""
    today = today or date.today()
    errors, warnings, count = [], [], 0
    registry_path = config_path(root, REGISTRY, environ)
    if registry_path.is_file():
        try:
            data = read_json(registry_path)
            problems = registry_errors(data, tools_dir(root, environ))
            errors.extend(f"{REGISTRY}: {problem}" for problem in problems)
            listed = data.get("analyzers") if isinstance(data, dict) else None
            entries = [entry for entry in listed if isinstance(entry, dict)] if isinstance(listed, list) else []
            count = sum(entry.get("enabled", True) is not False for entry in entries)
            uses_semgrep = any(entry.get("enabled", True) is not False and (entry.get("id") == "semgrep" or (entry.get("cmd") or [""])[0] == "semgrep") for entry in entries)
            if uses_semgrep and not semgrep_acknowledged(root):
                warnings.append("semgrep 레지스트리 규칙은 Semgrep Rules License 를 따른다 — 확인했으면 .agents/harness-kit.json 에 analyzers.semgrepRulesAcknowledged: true")
        except ConfigError as error:
            errors.append(str(error))
    for name, checker in ((GATE, gate_errors), (BASELINE, None)):
        path = config_path(root, name, environ)
        if not path.is_file():
            continue
        try:
            data = read_json(path)
        except ConfigError as error:
            errors.append(str(error))
            continue
        if checker:
            errors.extend(f"{name}: {problem}" for problem in checker(data))
        else:
            problems, notes = baseline_problems(data, today)
            errors.extend(f"{name}: {problem}" for problem in problems)
            warnings.extend(f"{name}: {note}" for note in notes)
    return errors, warnings, count
