"""배포 기록 파일 `.agents/docs/ops/deploys/<날짜>-<키>.md`의 읽기 · 구간 · 계획 sha · 결과 쓰기(설계 14 §3.3). 표준 라이브러리만 쓴다.

승인 대상은 계획 구간(`PLAN:BEGIN` ~ `PLAN:END` 표지 줄 사이)이고, 승인 sha 는 그 구간 줄을 `\\n` 으로 이은 바이트의 sha256 이다.
결과 구간(`RESULT:BEGIN` ~ `RESULT:END`)은 승인 sha 에 들지 않아 배포 뒤 결과를 써도 승인이 유지된다.
"""

import hashlib
import re
from pathlib import Path

DEPLOYS = ".agents/docs/ops/deploys"
STATES = ("planned", "approved", "deploying", "succeeded", "rolled-back", "failed")
RESULT_STATES = ("deploying", "succeeded", "rolled-back", "failed")
PLAN_BEGIN = re.compile(r"^<!--\s*PLAN:BEGIN\b")
PLAN_END = re.compile(r"^<!--\s*PLAN:END\b")
RESULT_BEGIN = re.compile(r"^<!--\s*RESULT:BEGIN\b")
RESULT_END = re.compile(r"^<!--\s*RESULT:END\b")
FM_LINE = re.compile(r"^([a-z][a-zA-Z0-9]*):\s*(.*?)(\s+#.*)?$")
TEST_LINE = re.compile(r"^- 시험:\s*(.*\S)\s*$")
FULL_LINE = re.compile(r"^- full:\s*(.*\S)\s*$")
GATE_LINE = re.compile(r"^- quality-gate:\s*(.*\S)\s*$")
SHA_PART = re.compile(r"\bsha ([0-9a-f]{7,40})\b")
RISK_ORDER = ("low", "medium", "high")


def inline(value):
    """`{ a: b, c: d }` → 사전, `[a, b]` → 목록, `null` → None, 그 밖은 문자열."""
    value = value.strip()
    if value in ("", "null", "~"):
        return None
    if value.startswith("{") and value.endswith("}"):
        out = {}
        for part in value[1:-1].split(","):
            key, _, item = part.partition(":")
            if key.strip():
                out[key.strip()] = item.strip() or None
        return out
    if value.startswith("[") and value.endswith("]"):
        return [item.strip() for item in value[1:-1].split(",") if item.strip()]
    return value.strip("\"'")


def split_text(text):
    """(머리 사전, 본문 줄 목록). 머리가 없으면 ({}, 전체 줄)."""
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines or lines[0] != "---":
        return {}, lines
    for index in range(1, len(lines)):
        if lines[index] == "---":
            fields = {}
            for raw in lines[1:index]:
                match = FM_LINE.match(raw)
                if match:
                    fields[match.group(1)] = inline(match.group(2))
            return fields, lines[index + 1 :]
    return {}, lines


def between(lines, begin, end):
    """표지 줄 사이의 줄 목록(표지 제외). 표지가 없으면 None."""
    start = next((index for index, line in enumerate(lines) if begin.match(line)), None)
    if start is None:
        return None
    stop = next((index for index in range(start + 1, len(lines)) if end.match(lines[index])), None)
    return lines[start + 1 : stop] if stop is not None else None


def plan_lines(text):
    return between(split_text(text)[1], PLAN_BEGIN, PLAN_END)


def plan_sha(text):
    lines = plan_lines(text)
    if lines is None:
        return None
    return hashlib.sha256("\n".join(lines).strip("\n").encode("utf-8")).hexdigest()


def risk_max(values):
    ranked = [value for value in values if value in RISK_ORDER]
    return max(ranked, key=RISK_ORDER.index) if ranked else "low"


def sections(lines):
    """`## <번호>. 제목` 절 → {번호: 줄 목록}. 표지 줄은 뺀다."""
    out, current = {}, None
    for line in lines:
        match = re.match(r"^## (\d+)\.", line)
        if match:
            current = match.group(1)
            out[current] = []
        elif current is not None and not re.match(r"^<!--\s*(PLAN|RESULT):", line):
            out[current].append(line)
    return out


def table(lines):
    rows = []
    for line in lines:
        if not line.startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if set("".join(cells)) <= set("-: ") or not cells:
            continue
        rows.append(cells)
    return rows[1:] if rows else []


class Record:
    """배포 기록 하나(읽기 전용 보기)."""

    def __init__(self, path, text):
        self.path = Path(path)
        self.text = text
        self.fm, self.body = split_text(text)
        plan = between(self.body, PLAN_BEGIN, PLAN_END)
        self.plan = plan if plan is not None else []
        self.parts = sections(self.plan)

    @property
    def id(self):
        return self.path.stem

    @property
    def issues(self):
        value = self.fm.get("issues")
        return value if isinstance(value, list) else []

    @property
    def commit(self):
        value = self.fm.get("commit")
        return value if isinstance(value, dict) else {}

    @property
    def env(self):
        return self.fm.get("env") or "production"

    @property
    def state(self):
        return self.fm.get("state") or "planned"

    @property
    def risk(self):
        return self.fm.get("risk") if self.fm.get("risk") in RISK_ORDER else "low"

    @property
    def sha(self):
        return plan_sha(self.text)

    def rollback_test(self):
        """§4 `- 시험:` 줄 → {status, env, url, at}. 줄이 없으면 status none."""
        for line in self.parts.get("4", []):
            match = TEST_LINE.match(line)
            if match:
                pieces = [piece.strip() for piece in match.group(1).split(" · ")]
                env = pieces[1][4:] if len(pieces) > 1 and pieces[1].startswith("env ") else None
                return {"status": pieces[0], "env": env, "url": pieces[2] if len(pieces) > 2 else None, "at": pieces[3] if len(pieces) > 3 else None}
        return {"status": "none", "env": None, "url": None, "at": None}

    def verification(self):
        """§6 → {full: {status, sha, url}, gate: {status, sha}}."""
        out = {"full": {"status": "none", "sha": None, "url": None}, "gate": {"status": "none", "sha": None}}
        for line in self.parts.get("6", []):
            for key, pattern in (("full", FULL_LINE), ("gate", GATE_LINE)):
                match = pattern.match(line)
                if match:
                    pieces = [piece.strip() for piece in match.group(1).split(" · ")]
                    sha = SHA_PART.search(match.group(1))
                    out[key] = {"status": pieces[0], "sha": sha.group(1) if sha else None, "url": pieces[-1] if len(pieces) > 2 else None}
        return out

    def checklist(self):
        """§5 표 → [(항목, 이슈, 상태)]."""
        return [(row[0], row[1], row[2]) for row in table(self.parts.get("5", [])) if len(row) >= 3]

    def design_shas(self):
        """§1 표 → {이슈: design §13 sha}."""
        return {row[0]: row[2] for row in table(self.parts.get("1", [])) if len(row) >= 3}

    def finished_at(self):
        """§7 deploy 행의 끝 시각(없으면 None)."""
        rows = between(self.body, RESULT_BEGIN, RESULT_END) or []
        for row in table(rows):
            if row and row[0] == "deploy" and len(row) >= 4 and row[2] not in ("", "—", "-"):
                return row[2]
        return None

    def result_ok(self):
        rows = between(self.body, RESULT_BEGIN, RESULT_END) or []
        return {row[0]: row[3] for row in table(rows) if len(row) >= 4}


def load(path):
    path = Path(path)
    return Record(path, path.read_text(encoding="utf-8"))


def folder(root):
    return Path(root) / DEPLOYS


def resolve(root, name):
    """기록 경로. `2026-12-01-INT-7` · `…md` · 상대 경로를 받는다. 없으면 FileNotFoundError."""
    root = Path(root)
    for candidate in (Path(name), root / name, folder(root) / name, folder(root) / f"{name}.md"):
        if candidate.is_file():
            return candidate.resolve()
    raise FileNotFoundError(f"배포 기록이 없다: {name}")


def all_records(root):
    base = folder(root)
    if not base.is_dir():
        return []
    out = []
    for path in sorted(base.glob("*.md")):
        try:
            out.append(load(path))
        except OSError:
            continue
    return out


def set_fm(text, changes):
    """머리 한 줄(`키: 값`)씩 바꾼다. 없는 키는 머리 끝에 더한다. 본문 · 다른 줄은 그대로."""
    lines = text.replace("\r\n", "\n").split("\n")
    end = next((index for index in range(1, len(lines)) if lines[index] == "---"), None)
    if lines[0] != "---" or end is None:
        return text
    for key, value in changes.items():
        pattern = re.compile(rf"^{key}:")
        hit = next((index for index in range(1, end) if pattern.match(lines[index])), None)
        line = f"{key}: {value}"
        if hit is None:
            lines.insert(end, line)
            end += 1
        else:
            lines[hit] = line
    return "\n".join(lines)


def replace_between(text, begin, end, new_lines, fallback):
    """표지 줄 사이를 바꾼다. 표지가 없으면 fallback(표지 줄 둘)을 끝에 붙여 쓴다."""
    lines = text.replace("\r\n", "\n").split("\n")
    start = next((index for index, line in enumerate(lines) if begin.match(line)), None)
    stop = next((index for index in range(start + 1, len(lines)) if end.match(lines[index])), None) if start is not None else None
    if start is None or stop is None:
        return text.rstrip("\n") + "\n\n" + "\n".join([fallback[0], *new_lines, fallback[1]]) + "\n"
    return "\n".join([*lines[: start + 1], *new_lines, *lines[stop:]])


def set_plan_line(text, prefix, new_line):
    """계획 구간 안에서 `prefix` 로 시작하는 줄을 바꾼다(없으면 같은 절 끝에 더하지 않고 None)."""
    lines = text.replace("\r\n", "\n").split("\n")
    start = next((index for index, line in enumerate(lines) if PLAN_BEGIN.match(line)), None)
    stop = next((index for index in range(start + 1, len(lines)) if PLAN_END.match(lines[index])), None) if start is not None else None
    if start is None or stop is None:
        return None
    for index in range(start + 1, stop):
        if lines[index].startswith(prefix):
            lines[index] = new_line
            return "\n".join(lines)
    return None
