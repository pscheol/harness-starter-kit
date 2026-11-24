"""design 템플릿 §13 "배포 · 롤백"의 검사 · 모으기(설계 14 §3.2 · §3.6, DO-R1). 표준 라이브러리만 쓴다.

- `problems(design_text)`: design 승인 앞 조건. §13.1 · §13.2 값 칸이 차 있고 §13.2 판단 기준에 숫자가 있고 §13.3 항목마다 체크 또는
  "해당 없음: <이유>"가 있어야 한다. §13 전체가 `배포 없음: <이유>` 한 줄이면 통과한다.
- 옛 템플릿(제목이 `13. Migration / Rollout` 뿐)의 design 은 이 검사를 건너뛴다(새 템플릿 제목에 `배포 · 롤백`이 있을 때만 본다).
- `checklist(text)`: §13.3 항목 → `deploy plan` 이 배포 기록 §5 에 모은다.
- `section_sha(text)`: §13 절 전체의 sha256 앞 12자(배포 기록 §1 의 "design §13 sha").
"""

import hashlib
import re

HEADING = re.compile(r"^## 13\.\s*(.*?)\s*$")
NEXT_H2 = re.compile(r"^## \S")
SUB = re.compile(r"^### 13\.(\d)\b")
NONE_LINE = re.compile(r"^배포 없음:\s*(.*\S)\s*$")
ITEM = re.compile(r"^- \[([ xX])\]\s*(.*)$")
NA = re.compile(r"해당 없음:\s*(.*\S)")
DIGIT = re.compile(r"\d")
PLACEHOLDER_REASON = {"<이유>", "이유"}
MARK = "배포 · 롤백"
CHECK_ITEMS = ("로그", "지표", "알람", "SLO", "런북", "비밀값", "환경 차이")


def section(text):
    """§13 절의 (제목, 줄 목록). 코드 펜스 안의 `## `는 절 경계로 보지 않는다. 없으면 None."""
    lines = text.split("\n")
    fenced = False
    start = None
    for index, raw in enumerate(lines):
        line = raw.rstrip("\r")
        if line.lstrip().startswith("```"):
            fenced = not fenced
            continue
        if fenced:
            continue
        if start is None:
            match = HEADING.match(line)
            if match:
                start = (index, match.group(1))
        elif NEXT_H2.match(line):
            return start[1], [item.rstrip("\r") for item in lines[start[0] + 1 : index]]
    return (start[1], [item.rstrip("\r") for item in lines[start[0] + 1 :]]) if start else None


def is_new(text):
    found = section(text)
    return bool(found) and MARK in found[0]


def section_sha(text):
    found = section(text)
    if not found:
        return None
    body = "\n".join([found[0], *found[1]]).strip()
    return hashlib.sha256(body.encode("utf-8")).hexdigest()[:12]


def unfilled(value):
    """빈 칸 · `(안내 문장)` · `<자리표>`는 값이 아니다."""
    value = value.strip()
    return (not value) or (value.startswith("(") and value.endswith(")")) or (value.startswith("<") and value.endswith(">"))


def subsections(lines):
    """{'1': [줄…], '2': …}. `### 13.n` 앞의 줄은 '0'."""
    out, current = {"0": []}, "0"
    for line in lines:
        match = SUB.match(line)
        if match:
            current = match.group(1)
            out[current] = []
        else:
            out[current].append(line)
    return out


def table_rows(lines):
    """`| 항목 | 값 |` 표의 (항목, 값) 목록. 머리 · 구분선은 뺀다."""
    rows = []
    for line in lines:
        if not line.startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) < 2 or set("".join(cells)) <= set("-: ") or cells[0] == "항목":
            continue
        rows.append((cells[0], "|".join(cells[1:]).strip()))
    return rows


def none_reason(lines):
    for line in lines:
        match = NONE_LINE.match(line)
        if match and match.group(1) not in PLACEHOLDER_REASON and not unfilled(match.group(1)):
            return match.group(1)
    return None


def checklist(text):
    """§13.3 항목 [(이름, '체크' 또는 '해당 없음: 이유' 또는 None)]. §13 이 없거나 `배포 없음`이면 빈 목록."""
    found = section(text)
    if not found or none_reason(found[1]):
        return []
    items = []
    for line in subsections(found[1]).get("3", []):
        match = ITEM.match(line.strip())
        if not match:
            continue
        name = re.split(r"[:：]", match.group(2), maxsplit=1)[0].strip()
        na = NA.search(match.group(2))
        if na and na.group(1) not in PLACEHOLDER_REASON:
            state = f"해당 없음: {na.group(1).strip()}"
        else:
            state = "체크" if match.group(1) in "xX" else None
        items.append((name, state))
    return items


def values(text, sub):
    """§13.<sub> 표의 {항목: 값}. 절이 없으면 빈 사전."""
    found = section(text)
    return dict(table_rows(subsections(found[1]).get(sub, []))) if found else {}


def problems(text):
    """design 승인 앞 조건 위반 목록(한 줄씩). 비어 있으면 통과."""
    found = section(text)
    if not found or MARK not in found[0]:
        return []
    heading, lines = found
    if none_reason(lines):
        return []
    subs = subsections(lines)
    out = []
    for sub in ("1", "2"):
        rows = table_rows(subs.get(sub, []))
        if not rows:
            out.append(f"§13.{sub} 표가 없다(배포하지 않는 변경은 §13 을 '배포 없음: <이유>' 한 줄로 둔다)")
            continue
        out += [f"§13.{sub} '{name}' 값이 비었다" for name, value in rows if unfilled(value)]
    criteria = dict(table_rows(subs.get("2", []))).get("판단 기준", "")
    if not unfilled(criteria) and not DIGIT.search(criteria):
        out.append("§13.2 '판단 기준'에 숫자가 없다(예: 5xx 비율 1% 초과가 5분 이어짐)")
    items = checklist(text)
    if not items:
        out.append("§13.3 운영 점검 항목이 없다")
    out += [f"§13.3 '{name}'에 체크도 '해당 없음: <이유>'도 없다" for name, state in items if state is None]
    rows = table_rows(subs.get("4", []))
    if rows and any(not unfilled(value) for _, value in rows):
        out += [f"§13.4 '{name}' 값이 비었다" for name, value in rows if unfilled(value)]
    return out
