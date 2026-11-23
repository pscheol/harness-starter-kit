"""이슈 문서 머리(frontmatter)의 부분 집합 파서(설계 01 §3.7.4). 표준 라이브러리만 쓴다.

형식: 첫 줄 `---` 부터 다음 `---` 까지, 줄마다 `이름: 값`. 값은 문자열이고 중첩은 없다.
값 뒤 ` # …` 는 주석으로 뗀다. 빈 줄은 건너뛴다. 그 밖의 줄이 있으면 ValueError 다.
"""

import re

LINE = re.compile(r"^([a-z][a-zA-Z0-9]*):\s*(.*?)(\s+#.*)?$")
FENCE = "---"

STATUSES = ("draft", "in-review", "approved", "superseded")
TASK_STATES = ("active", "check", "completed", "superseded")
TYPES = ("feat", "fix", "refactor", "perf", "chore", "docs")
#: 쓰는 순서. 여기에 없는 키는 뒤에 원래 순서대로 둔다.
ORDER = ("key", "area", "type", "title", "status", "state", "intent", "unit", "jira", "legacy", "created")


def split(text):
    """(머리 줄 목록, 본문). 머리가 없으면 (None, text). 닫는 줄이 없으면 ValueError."""
    lines = text.split("\n")
    if not lines or lines[0].rstrip("\r") != FENCE:
        return None, text
    for index in range(1, len(lines)):
        if lines[index].rstrip("\r") == FENCE:
            return lines[1:index], "\n".join(lines[index + 1 :])
    raise ValueError("frontmatter is not closed with ---")


def unquote(value):
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def parse(text):
    """머리의 키 → 값. 머리가 없으면 None. 형식이 틀리면 ValueError."""
    head, _ = split(text)
    if head is None:
        return None
    fields = {}
    for number, raw in enumerate(head, 2):
        line = raw.rstrip("\r")
        if not line.strip():
            continue
        match = LINE.fullmatch(line)
        if not match:
            raise ValueError(f"invalid frontmatter line {number}: {line!r}")
        if match[1] in fields:
            raise ValueError(f"duplicate frontmatter key {match[1]!r}")
        fields[match[1]] = unquote(match[2].strip())
    return fields


def ordered(fields):
    known = [(key, fields[key]) for key in ORDER if key in fields]
    return known + [(key, value) for key, value in fields.items() if key not in ORDER]


def render(fields):
    return "\n".join([FENCE, *(f"{key}: {value}" for key, value in ordered(fields) if value not in (None, "")), FENCE]) + "\n"


def update(text, changes):
    """머리의 값을 바꾸거나 더한다. 머리가 없으면 새로 붙인다. 본문은 그대로다."""
    current = parse(text)
    _, body = split(text)
    merged = {**(current or {}), **changes}
    return render(merged) + (body if current is not None else text)


def strip(text):
    """머리를 뗀 본문. 템플릿의 머리를 실제 값으로 바꿔 쓸 때 쓴다."""
    _, body = split(text)
    return body.lstrip("\n")
