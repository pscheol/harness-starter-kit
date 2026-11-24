"""운영 기록 `.agents/docs/ops/records/<날짜>-<주제>.md` 읽기 · 검사 · 새로 만들기(설계 14 §3.7, DO-R9). 표준 라이브러리만 쓴다.

    python3 scripts/harness/ops_records.py new --topic <영문-kebab> [--from YYYY-MM-DD] [--to YYYY-MM-DD]
    python3 scripts/harness/ops_records.py check

기록의 실측 값마다 출처(기간을 고정한 링크 또는 `ci:<산출물 경로>`)가 있어야 한다. 출처 없는 실측 값은 fast 실패다.
`미달` 인데 장애 · 후보가 가리키지 않는 지표 행은 경고다. 서비스 지표 값은 전달 지표 계산에 쓰지 않는다.
"""

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.dont_write_bytecode = True
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import deploy_record, intent as intents  # noqa: E402

RECORDS = ".agents/docs/ops/records"
NAME = re.compile(r"^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+){1,4})$")
INCIDENT = re.compile(r"^### (INC-\d+) · 등급 ([1-4]) · (\d{4}-\d{2}-\d{2})$")
ID_ROW = {"INC": re.compile(r"^INC-\d+$"), "NX": re.compile(r"^NX-\d+$"), "L": re.compile(r"^L-\d+$")}
VERDICTS = ("충족", "미달", "측정 못 함")
EMPTY = ("", "—", "-", "–")
FIELD = re.compile(r"^- ([^:]+):\s*(.*?)\s*$")
FROM_KEYS, TO_KEYS = ("from", "start", "since"), ("to", "end", "until")


def empty(value):
    return value.strip() in EMPTY


def valid_source(value):
    """기간을 고정한 링크(from · to 가 든 URL) 또는 ci:<경로>."""
    value = value.strip()
    if value.startswith("ci:"):
        return len(value) > 3 and not value[3:].isspace()
    if re.match(r"^https?://\S+$", value):
        query = {key.lower() for key in parse_qs(urlparse(value).query)} | {key.lower() for key in parse_qs(urlparse(value).fragment)}
        return any(key in query for key in FROM_KEYS) and any(key in query for key in TO_KEYS)
    return False


def cells(line):
    parts = [cell.strip() for cell in line.strip().strip("|").split("|")]
    return parts


def parse(path, text=None):
    """{path, fm, metrics, incidents, candidates, learned}. 줄 번호(line)는 1부터."""
    path = Path(path)
    text = path.read_text(encoding="utf-8") if text is None else text
    fm, _ = deploy_record.split_text(text)
    lines = text.replace("\r\n", "\n").split("\n")
    out = {"path": path.as_posix(), "name": path.stem, "fm": fm, "metrics": [], "incidents": [], "candidates": [], "learned": []}
    section, incident = None, None
    fenced = False
    for number, line in enumerate(lines, 1):
        if line.lstrip().startswith("```"):
            fenced = not fenced
        if fenced:
            continue
        head = re.match(r"^## (\d+)\.", line)
        if head:
            section, incident = head.group(1), None
            continue
        if section == "3":
            match = INCIDENT.match(line)
            if match:
                incident = {"id": match.group(1), "grade": int(match.group(2)), "date": match.group(3), "line": number, "fields": {}, "text": [], "head": line}
                out["incidents"].append(incident)
                continue
            if incident is not None:
                incident["text"].append(line)
                field = FIELD.match(line)
                if field:
                    incident["fields"][field.group(1).strip()] = field.group(2)
                    incident.setdefault("fieldLines", {})[field.group(1).strip()] = number
            continue
        if not line.startswith("|") or set(line) <= set("|-: "):
            continue
        row = cells(line)
        if section == "1" and len(row) >= 6 and row[0] != "ID":
            out["metrics"].append({"id": row[0], "metric": row[1], "target": row[2], "actual": row[3], "verdict": row[4], "source": "|".join(row[5:]), "line": number, "raw": line})
        elif section == "5" and len(row) >= 5 and ID_ROW["NX"].match(row[0]):
            out["candidates"].append({"id": row[0], "title": row[1], "evidence": row[2], "kind": row[3], "intake": row[4], "line": number, "raw": line})
        elif section == "6" and len(row) >= 3 and ID_ROW["L"].match(row[0]):
            out["learned"].append({"id": row[0], "text": row[1], "ruleCandidate": row[2], "line": number, "raw": line})
    return out


def problems(record):
    """(실패 문장 목록, 경고 문장 목록). 문장 앞에 `<경로>:<줄>:`."""
    errors, warnings = [], []
    where = record["path"]
    for item in record["metrics"]:
        if not empty(item["actual"]) and not valid_source(item["source"]):
            errors.append(f"{where}:{item['line']}: {item['id']} 실측 값 {item['actual']} 에 출처가 없다(기간을 고정한 링크 또는 ci:<산출물 경로>)")
        if item["verdict"] and item["verdict"] not in VERDICTS:
            errors.append(f"{where}:{item['line']}: {item['id']} 판정은 {' · '.join(VERDICTS)}")
    named = " ".join(candidate["evidence"] for candidate in record["candidates"]) + " " + " ".join(" ".join(inc["text"]) for inc in record["incidents"])
    for item in record["metrics"]:
        if item["verdict"] == "미달" and item["id"] not in named:
            warnings.append(f"{where}:{item['line']}: 미달 지표 {item['id']} 를 장애 · 다음 Intent 후보가 가리키지 않는다")
    seen = set()
    for kind, rows in (("INC", record["incidents"]), ("NX", record["candidates"]), ("L", record["learned"])):
        for row in rows:
            if row["id"] in seen:
                errors.append(f"{where}:{row['line']}: {row['id']} 가 두 번 나온다(ID 는 기록 안에서 유일하다)")
            seen.add(row["id"])
    if not NAME.match(record["name"]):
        errors.append(f"{where}: 파일 이름은 <날짜>-<영문 주제 2~5단어>.md 다")
    return errors, warnings


def all_records(root):
    base = Path(root) / RECORDS
    return [parse(path) for path in sorted(base.glob("*.md"))] if base.is_dir() else []


def check(root):
    errors, warnings = [], []
    for record in all_records(root):
        found = problems(record)
        errors += [item.replace(f"{Path(root).as_posix()}/", "") for item in found[0]]
        warnings += [item.replace(f"{Path(root).as_posix()}/", "") for item in found[1]]
    return errors, warnings


def resolve(root, name):
    root = Path(root)
    base = root / RECORDS
    for candidate in (Path(name), root / name, base / name, base / f"{name}.md"):
        if candidate.is_file():
            return candidate.resolve()
    raise FileNotFoundError(f"운영 기록이 없다: {name}")


def section_rows(path, number):
    """intent.md `## <번호>.` 표의 데이터 행(머리 · 구분선 제외)."""
    rows, active = [], False
    for line in path.read_text(encoding="utf-8").split("\n"):
        head = re.match(r"^## (\d+)\.", line)
        if head:
            active = head.group(1) == str(number)
            continue
        if active and line.startswith("|") and not set(line) <= set("|-: "):
            rows.append(cells(line))
    return rows[1:]


def intent_targets(root, intent_key):
    """Intent §3 성공 지표 · §7 NFR → [(ID, 지표, 목표)]."""
    out = []
    for folder in sorted((Path(root) / intents.INTENTS).glob(f"{intent_key}-*")):
        doc = folder / "intent.md"
        if not doc.is_file():
            continue
        out += [(f"{intent_key} SC-{n}", row[0], row[2]) for n, row in enumerate(section_rows(doc, 3), 1) if len(row) >= 3 and row[0] and not row[0].startswith("(")]
        out += [(f"{intent_key} {row[0]}", row[1], row[2]) for row in section_rows(doc, 7) if len(row) >= 3 and re.match(r"^NFR-\d+$", row[0])]
    return out


def new(root, topic, start=None, end=None, today=None):
    """운영 기록 틀을 만든다. 기간 안 배포 기록 · 그 Intent 의 성공 지표 · NFR 목표값을 채운다."""
    root = Path(root)
    if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+){1,4}$", topic):
        raise ValueError("--topic 은 영문 kebab-case 2~5단어다")
    end = end or (today or date.today()).isoformat()
    start = start or end
    records = [item for item in deploy_record.all_records(root) if start <= str(item.fm.get("created") or "") <= end]
    deploys = [f"ops/deploys/{item.path.name}" for item in records]
    intent_keys = sorted({str(item.fm.get("key")) for item in records if re.match(r"^INT-\d+$", str(item.fm.get("key") or ""))})
    rows = []
    for key in intent_keys:
        rows += [f"| {ident} | {metric} | {target} | | | |" for ident, metric, target in intent_targets(root, key)]
    name = f"{end}-{topic}"
    path = root / RECORDS / f"{name}.md"
    if path.exists():
        raise FileExistsError(f"이미 있다: {path.relative_to(root).as_posix()}")
    path.parent.mkdir(parents=True, exist_ok=True)
    template = root / ".agents/docs/_spec-templates/ops/record.md"
    body = template.read_text(encoding="utf-8") if template.is_file() else DEFAULT
    body = body.replace("{{TOPIC}}", topic).replace("{{FROM}}", start).replace("{{TO}}", end).replace("{{CREATED}}", (today or date.today()).isoformat())
    body = body.replace("{{DEPLOYS}}", ", ".join(deploys)).replace("{{INTENTS}}", ", ".join(intent_keys))
    marker = "|---|---|---|---|---|---|\n"
    body = body.replace(marker, marker + "".join(f"{row}\n" for row in rows), 1)
    path.write_text(body, encoding="utf-8")
    return path


DEFAULT = """---
kind: ops-record
topic: {{TOPIC}}
period: { from: {{FROM}}, to: {{TO}} }
deploys: [{{DEPLOYS}}]
intents: [{{INTENTS}}]
created: {{CREATED}}
---

# 운영 기록 — {{TOPIC}}

## 1. 목표 대비 실측
| ID | 지표 | 목표 | 실측 | 판정 | 출처 |
|---|---|---|---|---|---|
## 2. 전달 지표
<!-- METRICS:BEGIN — knots-sync metrics 가 쓴다. 손으로 고치지 않는다 -->
| 지표 | 기준선 | 이 기간 | 계산 방법 |
|---|---|---|---|
<!-- METRICS:END -->

## 3. 장애

## 4. 런북 · 운영 정책 확인
| 런북 · 정책 | 링크 | 이번 배포와 맞는가 | 고칠 것 |
|---|---|---|---|

## 5. 다음 Intent 후보
| ID | 후보 | 근거 | 종류 | 접수 |
|---|---|---|---|---|

## 6. 배운 것
| ID | 내용 | 규칙 후보 |
|---|---|---|
"""


def main(argv=None):
    parser = argparse.ArgumentParser(prog="ops_records.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root")
    sub = parser.add_subparsers(dest="cmd", required=True)
    made = sub.add_parser("new")
    made.add_argument("--topic", required=True)
    made.add_argument("--from", dest="start")
    made.add_argument("--to", dest="end")
    made.add_argument("--json", action="store_true")
    sub.add_parser("check")
    args = parser.parse_args(argv)
    root = intents.harness_root(Path(args.root or Path.cwd()))
    if args.cmd == "check":
        errors, warnings = check(root)
        for line in warnings:
            print(f"⚠ {line}", file=sys.stderr)
        for line in errors:
            print(f"✖ {line}", file=sys.stderr)
        return 1 if errors else 0
    try:
        path = new(root, args.topic, args.start, args.end)
    except (ValueError, FileExistsError) as error:
        print(f"✖ {error}", file=sys.stderr)
        return 1
    relative = path.relative_to(root).as_posix()
    print(json.dumps({"record": relative}, ensure_ascii=False) if args.json else f"✔ 운영 기록: {relative}\n실측 · 판정 · 출처는 사람이나 에이전트 세션이 채운다. 전달 지표 구간은 knots-sync metrics --fill 이 쓴다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
