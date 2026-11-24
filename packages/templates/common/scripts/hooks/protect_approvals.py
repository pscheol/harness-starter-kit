#!/usr/bin/env python3
"""PreToolUse 판정: 승인 기록 · 기준선 · 관리 페이지 토큰 보호(VQ-R12), done 승인 없는 완료(VQ-R13), 승인 상태 · 승인 명령(설계 09 §3.8).

stdin 의 훅 입력(Claude · Codex · Kiro)을 읽어 막을 때만 exit 2 와 stderr 2~3줄을 낸다. 그 밖에는 출력 없이 exit 0 이다.
해석하지 못한 입력은 통과시킨다(HK-2 R2.4). 셸 명령은 쓰기 형태만 막고 읽기(cat · grep · git show · git diff)는 둔다.
"""

import glob
import json
import re
import shlex
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import approvals  # noqa: E402
from harness.intent import parse_questions  # noqa: E402
from harness.sdd_frontmatter import parse as parse_frontmatter  # noqa: E402

HARNESS_ROOT = Path(__file__).resolve().parents[2]
SHELL_TOOLS = frozenset({"Bash", "bash", "shell", "execute_bash", "executeBash"})
READ_TOOLS = frozenset({"Read", "read", "fs_read", "readFile", "read_file"})
PATH_KEYS = ("file_path", "notebook_path", "path", "targetFile", "sourcePath", "destinationPath")
NEW_KEYS = ("new_string", "newStr", "new_str", "newText", "content", "contents", "file_text", "text")
OLD_KEYS = frozenset({"old_string", "oldStr", "old_str", "oldText"})
PROTECTED = (".agents/quality-baseline.json", ".agents/state/dashboard.token", ".agents/state/approvals-log.jsonl")
NAMES = re.compile(r"approvals\.md|quality-baseline\.json|approvals-log\.jsonl|intents/[^/\s]+/mob\.json")
PATCH_HEADER = re.compile(r"^\s*\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$", re.M)
COMPLETED = re.compile(r"(?m)^[+\s]*state:\s*completed\b")
APPROVED = re.compile(r"(?m)^[+\s]*status:\s*approved\b")
SHELL_COMPLETED = re.compile(r"state:\s*completed\b")
SHELL_APPROVED = re.compile(r"status:\s*approved\b")
ISSUE_DOC = re.compile(r"(?:^|/)\.agents/docs/issues/[^/]+/(requirements|design|tasks)\.md$")
QUESTIONS_DOC = re.compile(r"(?:^|/)\.agents/docs/(?:intents|issues)/[^/]+/questions\.md$")
ANSWER_LINE = re.compile(r"(?m)^[+\s]*- 답:[ \t]*\S")
FULL_KEYS = ("content", "contents", "file_text", "text")
ANSWER_HOW = "→ 답은 사람이 관리 페이지 질문 화면 · knots-sync answer 로 쓴다(08 §3.3). 에이전트는 질문 · 선택지 · 빈 '- 답:' 줄만 쓴다."
APPROVE_COMMAND = re.compile(r"\bapprove\.py\b|\bknots-sync(?:\.js)?\s+(?:approve|answer(?![^|;&\n]*--list)|review\s+decide|mob\s+(?:start|next|close|end))\b"
                             r"|\bmob\.py\s+(?:start|next|close|end)\b")
#: 관리 페이지의 승인 · 질문 답 · 리뷰 판단 API(06 §3.15). 토큰 · PIN 이 없어도 부르는 명령 자체를 막는다
PIN_API = re.compile(r"api/v1/(?:p/[0-9a-f]{12}/)?(?:approvals\b|questions/[^/\s]+/[^/\s]+/answer\b|reviews/[^/\s]+/[^/\s]+/decision\b)")
WRITE_WORDS = frozenset({"mv", "rm", "truncate", "touch", "ln", "dd", "unlink", "install", "shred"})
COPY_WORDS = frozenset({"cp", "rsync"})
GIT_WRITES = frozenset({"checkout", "restore", "rm", "mv", "reset", "stash", "apply", "am", "clean", "switch"})
PREFIX_WORDS = frozenset({"sudo", "command", "exec", "env", "nohup", "time"})
WRITE_API = re.compile(r"open\([^)]*['\"][wax+]|write_text|write_bytes|writeFile|appendFile|\.write\(|>\s*open")
HOW = "→ 승인은 사람이 자기 터미널에서 python3 scripts/harness/approve.py <키> <게이트> 로 한다. 채팅에서 한 말은 승인이 아니다."


class Blocked(Exception):
    pass


def strings(value, skip=frozenset()):
    """입력 안의 모든 문자열(skip 키는 뺀다)."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for key, item in value.items():
            if key not in skip:
                yield from strings(item, skip)
    elif isinstance(value, list):
        for item in value:
            yield from strings(item, skip)


def new_text(tool_input):
    """편집이 쓸 내용. 새 내용 칸이 있으면 그것, 없으면 옛 내용 칸을 뺀 모든 문자열. 패치는 + 줄."""
    found = [item for item in strings(tool_input, OLD_KEYS)]
    patches = [text for text in found if "*** Begin Patch" in text or PATCH_HEADER.search(text)]
    if patches:
        return "\n".join(line[1:] for text in patches for line in text.splitlines() if line.startswith("+"))
    known = []
    for key in NEW_KEYS:
        if isinstance(tool_input.get(key), str):
            known.append(tool_input[key])
    for edit in tool_input.get("edits") or []:
        if isinstance(edit, dict):
            known += [edit[key] for key in NEW_KEYS if isinstance(edit.get(key), str)]
    return "\n".join(known or found)


def resolve(path, cwd):
    candidate = Path(path).expanduser()
    if not candidate.is_absolute():
        candidate = Path(cwd) / candidate
    return candidate


def is_protected(path):
    text = str(path).replace("\\", "/")
    if re.search(r"(?:^|/)\.agents/docs/intents/[^/]+/mob\.json$", text):
        return True
    return text.rsplit("/", 1)[-1] == "approvals.md" or any(text == name or text.endswith("/" + name) for name in PROTECTED)


def harness_root_of(path):
    for folder in Path(path).resolve().parents:
        if (folder / ".agents/knots-sync.json").is_file() or (folder / ".agents/harness.json").is_file():
            return folder
    return HARNESS_ROOT


def front(path):
    try:
        return parse_frontmatter(Path(path).read_text(encoding="utf-8")) or {}
    except (OSError, ValueError, UnicodeDecodeError):
        return {}


def done_approved(tasks_path):
    root = harness_root_of(tasks_path)
    try:
        meta = json.loads((root / ".agents/knots-sync.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        meta = {}
    entries = approvals.read_entries(Path(tasks_path).parent / "approvals.md")
    return approvals.approval_state(entries, "done", None, approvals.policy_of(meta)) == "valid"


def check_completion(path):
    if front(path).get("state") == "completed" or done_approved(path):
        return
    raise Blocked(f"차단: {Path(path).name} 를 state: completed 로 바꾸려면 유효한 done 승인 기록이 있어야 한다(VQ-R13).\n"
                  "→ 사람이 python3 scripts/harness/approve.py <키> done 으로 승인한 뒤 바꾼다. 채팅에서 한 말은 승인이 아니다.")


def check_status(path):
    if front(path).get("status") == "approved":
        return
    raise Blocked(f"차단: {Path(path).name} 머리 status 를 approved 로 바꾸는 것은 승인 명령만 한다.\n{HOW}")


def answers_of(text):
    try:
        return {q["id"]: (q["answer"] or None) for q in parse_questions(text)["questions"]}
    except (KeyError, TypeError, ValueError):
        return {}


def after_edit(path, tool_input):
    """편집 뒤 파일 전체. 전체 내용 칸이면 그것, old/new 편집이면 지금 파일에 적용한 결과. 모르면 None."""
    for key in FULL_KEYS:
        if isinstance(tool_input.get(key), str):
            return tool_input[key]
    try:
        text = Path(path).read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        text = ""
    edits = [tool_input] if any(k in tool_input for k in OLD_KEYS) else [e for e in tool_input.get("edits") or [] if isinstance(e, dict)]
    if not edits:
        return None
    for edit in edits:
        old = next((edit[k] for k in OLD_KEYS if isinstance(edit.get(k), str)), None)
        new = next((edit[k] for k in NEW_KEYS if isinstance(edit.get(k), str)), None)
        if old is None or new is None or (old and old not in text):
            return None
        text = text.replace(old, new) if edit.get("replace_all") else text.replace(old, new, 1)
    return text


def check_answers(path, tool_input, content):
    """questions.md 의 답 줄: 새 답이 생기거나 있던 답이 바뀌면 막는다. 빈 답 줄을 둔 새 질문은 된다."""
    after = after_edit(path, tool_input)
    if after is None:
        if ANSWER_LINE.search(content):
            raise Blocked(f"차단: {Path(path).name} 의 '- 답:' 줄에 값을 쓰는 편집이다.\n{ANSWER_HOW}")
        return
    try:
        before = answers_of(Path(path).read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError):
        before = {}
    now = answers_of(after)
    changed = sorted(q for q in set(before) | set(now) if before.get(q) != now.get(q) and (before.get(q) or now.get(q)))
    if changed:
        raise Blocked(f"차단: {Path(path).name} 의 답({', '.join(changed)})은 사람만 쓴다.\n{ANSWER_HOW}")


def protected_block(path):
    raise Blocked(f"차단: {path} 는 사람만 쓴다(승인 기록 · 기준선 · 관리 페이지 토큰, VQ-R12).\n{HOW}")


# ── 쓰기 도구 ────────────────────────────────────────────────────────────────
def written_paths(tool_input):
    paths = [tool_input[key] for key in PATH_KEYS if isinstance(tool_input.get(key), str) and tool_input[key]]
    for text in strings(tool_input):
        paths += PATCH_HEADER.findall(text)
    return paths


def check_write(tool_input, cwd):
    content = new_text(tool_input)
    for raw in written_paths(tool_input):
        path = resolve(raw, cwd)
        if is_protected(raw):
            protected_block(raw)
        if QUESTIONS_DOC.search(str(path).replace("\\", "/")):
            check_answers(path, tool_input, content)
            continue
        match = ISSUE_DOC.search(str(path).replace("\\", "/"))
        if not match:
            continue
        if match.group(1) == "tasks" and COMPLETED.search(content):
            check_completion(path)
        if APPROVED.search(content):
            check_status(path)


# ── 셸 ───────────────────────────────────────────────────────────────────────
def words(segment):
    try:
        tokens = shlex.split(segment, posix=True)
    except ValueError:
        tokens = segment.split()
    while tokens and (re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", tokens[0]) or tokens[0] in PREFIX_WORDS):
        tokens = tokens[1:]
    return tokens


def redirect_into(segment, pattern):
    return re.search(r">>?\s*['\"]?[^\s'\";&|]*(?:" + pattern + r")", segment)


def segment_writes(segment, pattern):
    """segment 가 pattern 에 맞는 파일을 바꾸는 명령인가."""
    tokens = words(segment)
    first = Path(tokens[0]).name if tokens else ""
    if redirect_into(segment, pattern) or re.search(r"\btee\b", segment):
        return True
    if re.search(r"\bsed\b[^|;&]*\s-i", segment) or re.search(r"\bperl\b[^|;&]*\s-\w*i", segment):
        return True
    if first in WRITE_WORDS:
        return True
    if first in COPY_WORDS and tokens and re.search(pattern, tokens[-1]):
        return True
    if first == "git" and len(tokens) > 1 and tokens[1] in GIT_WRITES:
        return True
    return bool(WRITE_API.search(segment))


def segments(command):
    return [part for part in re.split(r"\|\||&&|[;|\n]", command) if part.strip()]


def doc_paths(segment, name, cwd):
    found = []
    for token in words(segment):
        token = token.strip("'\"")
        if token.endswith(name):
            matches = glob.glob(str(resolve(token, cwd)))
            found += matches or [str(resolve(token, cwd))]
    return found


def check_shell(command, cwd):
    if APPROVE_COMMAND.search(command):
        raise Blocked(f"차단: 승인 명령은 사람이 자기 터미널에서 실행한다. 에이전트는 부르지 않는다.\n{HOW}")
    if "dashboard.token" in command or PIN_API.search(command):
        raise Blocked(f"차단: 관리 페이지 토큰 · 승인 API 는 에이전트가 쓰지 않는다(VQ-R12).\n{HOW}")
    for raw_path in PATCH_HEADER.findall(command):
        if is_protected(raw_path):
            protected_block(raw_path)
    for segment in segments(command):
        if NAMES.search(segment) and segment_writes(segment, NAMES.pattern):
            protected_block(NAMES.search(segment).group(0))
        if "questions.md" in segment and "답:" in command and segment_writes(segment, r"questions\.md"):
            raise Blocked(f"차단: 셸로 questions.md 의 답 줄을 쓰지 않는다.\n{ANSWER_HOW}")
        if "tasks.md" in segment and SHELL_COMPLETED.search(command) and segment_writes(segment, r"tasks\.md"):
            paths = doc_paths(segment, "tasks.md", cwd)
            if not paths:
                check_completion(Path(cwd) / "tasks.md")
            for path in paths:
                check_completion(path)
        if re.search(r"(requirements|design|tasks)\.md", segment) and SHELL_APPROVED.search(command) and segment_writes(segment, r"(?:requirements|design|tasks)\.md"):
            for path in doc_paths(segment, ".md", cwd) or [Path(cwd) / "x.md"]:
                if re.search(r"(requirements|design|tasks)\.md$", str(path)):
                    check_status(path)


def judge(payload):
    tool = payload.get("tool_name")
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return
    cwd = payload.get("cwd") if isinstance(payload.get("cwd"), str) else str(HARNESS_ROOT)
    if tool in SHELL_TOOLS or (tool is None and isinstance(tool_input.get("command"), str) and not PATCH_HEADER.search(tool_input["command"])):
        command = tool_input.get("command")
        if isinstance(command, str):
            check_shell(command, cwd)
        return
    if tool in READ_TOOLS:
        target = next((tool_input[key] for key in PATH_KEYS if isinstance(tool_input.get(key), str)), "")
        if target.endswith("dashboard.token"):
            raise Blocked(f"차단: 관리 페이지 토큰은 에이전트가 읽지 않는다(VQ-R12).\n{HOW}")
        return
    check_write(tool_input, cwd)


def main():
    raw = sys.stdin.read() if not sys.stdin.isatty() else ""
    try:
        payload = json.loads(raw)
    except ValueError:
        return 0
    if not isinstance(payload, dict):
        return 0
    try:
        judge(payload)
    except Blocked as blocked:
        sys.stderr.write(str(blocked) + "\n")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
