"""승인 기록 `approvals.md` 파서 · 쓰기 · 승인 sha · 유효성(설계 06 §3.3 · §3.7, 09 §3.8). 표준 라이브러리만 쓴다.

관리 페이지의 Node 파서와 같은 결과를 내야 한다. 두 구현은 킷 `tests/fixtures/approvals/` 의 입력 · 기대값으로 시험한다.
이 형식을 바꾸면 그 fixture 와 Node 파서를 같이 고친다. 승인은 네 경로(terminal · dashboard · jira · aidlc)로만 생긴다.
"""

import hashlib
import os
import re
import secrets
import time
from datetime import datetime

HEADING = re.compile(r"^## (\S+) · ([a-z]+(?:/F-\d+)?) · (approved|changes-requested|risk-accepted|fix-required)$")
TITLE = re.compile(r"^# 승인 기록 — (\S+)\s*$")
FIELD = re.compile(r"^- ([^:]+):\s*(.*?)\s*$")
TIME = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$")
APPROVER = re.compile(r"^(?P<email>[^\s@()]+@[^\s@()]+)(?: \((?P<name>[^()]*)\))?(?: · 그룹: (?P<group>\S+))?$")
ENTRY_ID = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")
JIRA_SHA = "(jira)"  # 경로 jira 기록은 그 시점 문서 sha 를 알 수 없어 이 값으로 남긴다(설계 10 §3.4). 그 뒤 문서 변경과 비교하지 않는다
TARGET_PARTS = (("sha256", re.compile(r"^sha256: ([0-9a-f]{64}|\(jira\))$")), ("fingerprint", re.compile(r"^지문: ([0-9a-f]{12,64})$")),
                ("head", re.compile(r"^head: ([0-9a-f]{7,40})$")))
CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

PATHS = ("terminal", "dashboard", "jira", "aidlc")
DOC_GATES = ("codebase", "intent", "plans", "requirements", "design", "tasks", "deploy")
GATES = DOC_GATES[:-1] + ("mr", "done", "deploy")
REVIEW_GATE = re.compile(r"^review/(F-\d+)$")
GATE_DECISIONS = ("approved", "changes-requested")
REVIEW_DECISIONS = ("risk-accepted", "fix-required")
FIELDS = {"승인자": "approver", "대상": "target", "문구": "phrase", "경로": "path", "기록 ID": "entryId",
          "근거": "evidence", "source": "source", "규칙 후보": "ruleCandidate", "롤백 면제": "rollbackWaiver"}
FORMAT_NOTE = "<!-- 덧붙이기만 한다. 에이전트는 이 파일을 쓰지 않는다. 형식과 승인 경로: .agents/rules/approval-vocabulary.md -->"


# ── 읽기 ─────────────────────────────────────────────────────────────────────
def new_entry(line, at, gate, decision):
    return {
        "line": line, "at": at, "gate": gate, "decision": decision,
        "approver": None, "target": None, "phrase": None, "path": None, "entryId": None,
        "source": None, "evidence": None, "ruleCandidate": False, "rollbackWaiver": None,
        "errors": [], "valid": True,
    }


def valid_time(value):
    if not TIME.match(value):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def parse_target(value):
    """`이름 · sha256: … · 지문: … · head: …`. 모르는 조각이 있으면 None."""
    parts = value.split(" · ")
    if not parts[0]:
        return None
    target = {"name": parts[0], "sha256": None, "fingerprint": None, "head": None}
    for part in parts[1:]:
        for key, pattern in TARGET_PARTS:
            match = pattern.match(part)
            if match and target[key] is None:
                target[key] = match.group(1)
                break
        else:
            return None
    return target


def unquote(value):
    return value[1:-1] if len(value) >= 2 and value[0] == value[-1] == '"' else value


def set_field(entry, seen, name, value):
    """칸 하나를 기록에 넣고 오류 코드를 돌려준다."""
    key = FIELDS.get(name)
    if key is None:
        return ["unknown-field"]
    if key in seen:
        return ["duplicate-field"]
    seen.add(key)
    if key == "approver":
        match = APPROVER.match(value)
        if not match:
            return ["bad-approver"]
        entry["approver"] = {"email": match["email"], "name": match["name"], "group": match["group"]}
    elif key == "target":
        entry["target"] = parse_target(value)
        return [] if entry["target"] else ["bad-target"]
    elif key == "phrase":
        entry["phrase"] = unquote(value)
    elif key == "ruleCandidate":
        if value != "예":
            return ["bad-rule-candidate"]
        entry["ruleCandidate"] = True
    else:
        entry[key] = value
    return []


def gate_errors(entry):
    errors = []
    if not valid_time(entry["at"]):
        errors.append("bad-time")
    review = REVIEW_GATE.match(entry["gate"])
    if not review and entry["gate"] not in GATES:
        errors.append("unknown-gate")
    allowed = REVIEW_DECISIONS if review else GATE_DECISIONS
    if entry["gate"] in GATES or review:
        if entry["decision"] not in allowed:
            errors.append("decision-mismatch")
    return errors


def required_errors(entry, seen):
    """칸을 다 읽은 뒤의 필수 · 허용 검사."""
    errors = []
    path = entry["path"]
    if "approver" not in seen:
        errors.append("missing-approver")
    if "target" not in seen:
        errors.append("missing-target")
    elif entry["target"]:
        target = entry["target"]
        if entry["gate"] in DOC_GATES and not target["sha256"]:
            errors.append("bad-target")
        if target["sha256"] == JIRA_SHA and path != "jira":
            errors.append("bad-target")
        if REVIEW_GATE.match(entry["gate"]) and not target["fingerprint"]:
            errors.append("bad-target")
    if "path" not in seen or not path:
        errors.append("missing-path")
    elif path not in PATHS:
        errors.append("unknown-path")
    if path in ("terminal", "dashboard") and not entry["phrase"]:
        errors.append("missing-phrase")
    if path in ("jira", "aidlc") and not entry["evidence"]:
        errors.append("missing-evidence")
    if path == "aidlc" and entry["source"] != "aidlc":
        errors.append("missing-source")
    if "entryId" not in seen or not entry["entryId"]:
        errors.append("missing-entry-id")
    elif not ENTRY_ID.match(entry["entryId"]):
        errors.append("bad-entry-id")
    if "ruleCandidate" in seen and entry["decision"] != "changes-requested":
        errors.append("field-not-allowed")
    if "rollbackWaiver" in seen and entry["gate"] != "deploy":
        errors.append("field-not-allowed")
    return errors


def finish(entry, seen, errors, ids):
    errors = errors + gate_errors(entry) + required_errors(entry, seen)
    if entry["entryId"] and ENTRY_ID.match(entry["entryId"]):
        if entry["entryId"] in ids:
            errors.append("duplicate-entry-id")
        ids.add(entry["entryId"])
    entry["errors"] = sorted(set(errors))
    entry["valid"] = not entry["errors"]
    return entry


def parse(text):
    """`{key, entries, errors}`. 기록 오류는 기록의 `errors` · `valid: false`, 맞지 않는 제목 줄은 파일 `errors`."""
    if isinstance(text, bytes):
        text = text.decode("utf-8")
    key, entries, file_errors, ids = None, [], [], set()
    current, seen, errors = None, set(), []
    skipping = False
    for number, raw in enumerate(text.split("\n"), 1):
        line = raw[:-1] if raw.endswith("\r") else raw
        if line.startswith("## "):
            if current:
                entries.append(finish(current, seen, errors, ids))
            current, seen, errors = None, set(), []
            match = HEADING.match(line)
            if not match:
                file_errors.append({"line": number, "code": "bad-heading"})
                skipping = True
                continue
            skipping = False
            current = new_entry(number, match.group(1), match.group(2), match.group(3))
            continue
        if current is None:
            title = TITLE.match(line)
            if title and key is None and not entries and not skipping:
                key = title.group(1)
            continue
        if not line.strip() or line.lstrip().startswith("<!--"):
            continue
        field = FIELD.match(line)
        if not field:
            errors.append("stray-line")
            continue
        errors += set_field(current, seen, field.group(1).strip(), field.group(2))
    if current:
        entries.append(finish(current, seen, errors, ids))
    return {"key": key, "entries": entries, "errors": file_errors}


# ── 판정 ─────────────────────────────────────────────────────────────────────
def allowed(email, gate, policy):
    """`approvers[gate]`(이메일 또는 그룹 이름)에 있는가. 설정이 없거나 그 게이트 칸이 비면 누구나 된다(설계 README §5)."""
    approvers = (policy or {}).get("approvers") or {}
    names = approvers.get(gate)
    if not names:
        return True
    groups = (policy or {}).get("groups") or {}
    wanted = (email or "").lower()
    for name in names:
        if "@" in name:
            if name.lower() == wanted:
                return True
        elif wanted in {member.lower() for member in groups.get(name) or ()}:
            return True
    return False


HIGH_GATES = ("design", "mr", "deploy")


def sha_matches(entry, sha256):
    """기록의 대상 sha 가 sha256 과 같은가. 경로 jira 의 `(jira)` 기록은 어떤 sha 와도 맞는다(승인 시점 = Jira 기록 시각)."""
    target = entry["target"]
    return bool(target) and (target["sha256"] == sha256 or (target["sha256"] == JIRA_SHA and entry["path"] == "jira"))


def approval_state(entries, gate, sha256=None, policy=None, need=1):
    """설계 06 §3.3: none · valid(sha 같음) · stale(승인 뒤 바뀜) · invalid(승인자가 approvers 밖) ·
    partial(risk high 라 서로 다른 승인자 need 명이 필요한데 모자람, 08 DS-R26)."""
    found = [entry for entry in entries if entry["valid"] and entry["gate"] == gate and entry["decision"] == "approved"]
    if not found:
        return "none"
    if sha256 is not None:
        found = [entry for entry in found if sha_matches(entry, sha256)]
        if not found:
            return "stale"
    people = {entry["approver"]["email"].lower() for entry in found if allowed(entry["approver"]["email"], gate, policy)}
    if not people:
        return "invalid"
    return "valid" if len(people) >= max(need, 1) else "partial"


def approvers_of(entries, gate, sha256=None):
    """그 게이트 · 그 내용으로 승인한 사람(email 소문자)."""
    return {entry["approver"]["email"].lower() for entry in entries if entry["valid"] and entry["gate"] == gate and entry["decision"] == "approved"
            and (sha256 is None or sha_matches(entry, sha256))}


def need_of(meta, risk, gate):
    """risk high 의 design · mr · deploy 는 risk.highApprovals(기본 2, 줄이지 못한다)명, 그 밖은 1명(08 §3.15 · DS-R26)."""
    if risk != "high" or gate not in HIGH_GATES:
        return 1
    conf = meta.get("risk") if isinstance(meta, dict) and isinstance(meta.get("risk"), dict) else {}
    try:
        return max(2, int(conf.get("highApprovals", 2)))
    except (TypeError, ValueError):
        return 2


def review_decision(entries, finding_id, fingerprint, policy=None):
    """리뷰 지적 하나의 마지막 유효 판단(risk-accepted · fix-required). 승인자는 approvers.mr 로 본다."""
    decision = None
    for entry in entries:
        if not entry["valid"] or entry["gate"] != f"review/{finding_id}":
            continue
        recorded = (entry["target"] or {}).get("fingerprint") or ""
        if not recorded or not (fingerprint or "").startswith(recorded):
            continue
        if allowed(entry["approver"]["email"], "mr", policy):
            decision = entry["decision"]
    return decision


def approval_sha(data):
    """승인 sha: 문서 머리(첫 줄 `---` 부터 다음 `---` 까지)의 `status:` · `state:` 줄을 뺀 바이트의 sha256."""
    if isinstance(data, str):
        data = data.encode("utf-8")
    lines = data.splitlines(keepends=True)
    if not lines or lines[0].rstrip(b"\r\n") != b"---":
        return hashlib.sha256(data).hexdigest()
    end = next((index for index in range(1, len(lines)) if lines[index].rstrip(b"\r\n") == b"---"), None)
    if end is None:
        return hashlib.sha256(data).hexdigest()
    kept = [line for index, line in enumerate(lines) if not (0 < index < end and re.match(rb"^(status|state):", line))]
    return hashlib.sha256(b"".join(kept)).hexdigest()


# ── 쓰기 ─────────────────────────────────────────────────────────────────────
def new_entry_id(now=None):
    """ULID(시각 48비트 + 난수 80비트, Crockford base32 26자)."""
    value = (int((now if now is not None else time.time()) * 1000) << 80) | int.from_bytes(secrets.token_bytes(10), "big")
    return "".join(CROCKFORD[(value >> shift) & 31] for shift in range(125, -1, -5))


def new_file_text(key):
    return f"# 승인 기록 — {key}\n\n{FORMAT_NOTE}\n"


def render_entry(entry):
    approver = entry["approver"]
    who = approver["email"] + (f" ({approver['name']})" if approver.get("name") else "") + (f" · 그룹: {approver['group']}" if approver.get("group") else "")
    target = entry["target"]
    parts = [target["name"]]
    for key, label in (("sha256", "sha256"), ("fingerprint", "지문"), ("head", "head")):
        if target.get(key):
            parts.append(f"{label}: {target[key]}")
    phrase = " ".join(str(entry.get("phrase") or "").split())
    lines = [f"## {entry['at']} · {entry['gate']} · {entry['decision']}", f"- 승인자: {who}", f"- 대상: {' · '.join(parts)}"]
    if phrase:
        lines.append(f'- 문구: "{phrase}"')
    lines.append(f"- 경로: {entry['path']}")
    if entry.get("ruleCandidate"):
        lines.append("- 규칙 후보: 예")
    if entry.get("rollbackWaiver"):
        lines.append(f"- 롤백 면제: {entry['rollbackWaiver']}")
    lines.append(f"- 기록 ID: {entry['entryId']}")
    return "\n".join(lines) + "\n"


def appended_text(current, key, entry):
    """지금 내용 뒤에 기록 하나를 덧붙인 내용. 파일이 없으면 머리를 만든다. 기존 바이트는 그대로 둔다."""
    text = current if current is not None else new_file_text(key)
    if text and not text.endswith("\n"):
        text += "\n"
    return text + "\n" + render_entry(entry)


def now_text():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def read_entries(path):
    """파일의 기록 목록. 없으면 빈 목록."""
    try:
        return parse(path.read_bytes())["entries"]
    except OSError:
        return []


def policy_of(meta):
    meta = meta if isinstance(meta, dict) else {}
    approvers = meta.get("approvers") if isinstance(meta.get("approvers"), dict) else {}
    groups = meta.get("groups") if isinstance(meta.get("groups"), dict) else {}
    return {"approvers": approvers, "groups": groups}


def atomic_write(path, data):
    """같은 폴더 임시 파일 → fsync → rename. 권한은 원래 파일을 따른다."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.parent / f".{path.name}.{secrets.token_hex(4)}.tmp"
    with open(temporary, "wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    if path.exists():
        os.chmod(temporary, path.stat().st_mode & 0o777)
    os.replace(temporary, path)
