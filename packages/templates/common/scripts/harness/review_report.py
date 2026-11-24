"""리뷰 보고서 `.agents/reports/review/<키>.md` — 발견 검사 · 지문 · ID 이어 쓰기 · 쓰기 · 읽기(설계 09 §3.1).

지문 = sha256(점검 \\0 경로 \\0 정규화한 해당 줄 ±1줄). 같은 (점검 · 경로 · 내용)이 두 번이면 뒤 것에 \\0<순번>을 붙인다.
ID 는 이전 보고서의 ID 표에서 같은 지문의 ID 를 이어 쓰고, 새 지문은 지금까지 쓴 가장 큰 번호 + 1 이다.
"""

import hashlib
import json
import re

SEVERITIES = ("CRITICAL", "HIGH", "MEDIUM", "LOW")
CHECKS = ("RV-COV", "RV-ADR", "RV-RULE", "RV-EDGE", "RV-TEST", "RV-SCAN", "RV-DOC")
BODY_LIMIT = 7
TEXT_LIMIT = 400
IDS_MARK = "knots-sync:review-ids"
DATA_MARK = "knots-sync:review-data"
IDS = re.compile(r"<!-- knots-sync:review-ids (\{.*?\}) -->")
DATA = re.compile(r"<!-- knots-sync:review-data (\{.*?\}) -->")
ID_NUMBER = re.compile(r"^F-(\d+)$")


def finding_errors(findings, exists):
    """findings.json 의 발견 목록 검사. exists(경로) → head · base 에 그 파일이 있는가."""
    if not isinstance(findings, list):
        return ["findings 는 목록이다"]
    errors = []
    for index, item in enumerate(findings, 1):
        where = f"findings[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{where}: 객체가 아니다")
            continue
        if item.get("severity") not in SEVERITIES:
            errors.append(f"{where}: severity 는 {' · '.join(SEVERITIES)} 중 하나다: {item.get('severity')!r}")
        if item.get("check") not in CHECKS:
            errors.append(f"{where}: check 는 {' · '.join(CHECKS)} 중 하나다: {item.get('check')!r}")
        path, line = item.get("path"), item.get("line")
        if not isinstance(path, str) or not path or path.startswith("/") or ".." in path.split("/"):
            errors.append(f"{where}: path 는 리포 루트 기준 상대 경로다: {path!r}")
        elif not exists(path):
            errors.append(f"{where}: path 가 MR head · base 에 없다: {path}")
        if not isinstance(line, int) or isinstance(line, bool) or line < 1:
            errors.append(f"{where}: line 은 1 이상 정수다: {line!r}")
        for field in ("title", "evidence", "recommendation"):
            if not isinstance(item.get(field), str) or not item[field].strip():
                errors.append(f"{where}: {field} 가 없다")
    return errors


def normalized_context(lines, line):
    """해당 줄 ±1줄을 공백 묶기 · 앞뒤 공백 제거 뒤 \\n 으로 잇는다."""
    picked = lines[max(line - 2, 0): line + 1]
    return "\n".join(" ".join(text.split()) for text in picked)


def fingerprint(check, path, context, sequence=0):
    seed = f"{check}\0{path}\0{context}" + (f"\0{sequence}" if sequence else "")
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


def with_fingerprints(findings, content_of):
    """content_of(경로) → 파일 줄 목록. 발견마다 fp 를 붙인 새 목록."""
    seen, result = {}, []
    for item in findings:
        context = normalized_context(content_of(item["path"]), item["line"])
        base = (item["check"], item["path"], context)
        sequence = seen.get(base, 0)
        seen[base] = sequence + 1
        result.append({**item, "fp": fingerprint(item["check"], item["path"], context, sequence)})
    return result


def previous_ids(text):
    """이전 보고서의 지문 → ID 표."""
    match = IDS.search(text or "")
    if not match:
        return {}
    try:
        table = json.loads(match.group(1))
    except ValueError:
        return {}
    return {fp: fid for fid, fp in table.items() if isinstance(fp, str) and ID_NUMBER.match(str(fid))}


def assign_ids(findings, known):
    """known(지문 → ID)를 이어 쓰고 새 지문에 다음 번호를 준다. (발견 목록, 새 ID 표)."""
    table = dict(known)
    used = [int(ID_NUMBER.match(fid).group(1)) for fid in table.values()]
    next_number = max(used, default=0) + 1
    result = []
    for item in findings:
        fid = table.get(item["fp"])
        if fid is None:
            fid = f"F-{next_number}"
            next_number += 1
            table[item["fp"]] = fid
        result.append({**item, "id": fid})
    return result, {fid: fp for fp, fid in sorted(table.items(), key=lambda pair: int(pair[1][2:]))}


def ordered(findings):
    return sorted(findings, key=lambda item: (SEVERITIES.index(item["severity"]), int(item["id"][2:])))


def counts(findings):
    table = {severity: 0 for severity in SEVERITIES}
    for item in findings:
        table[item["severity"]] += 1
    return table


def verdict(findings):
    return "changes-required" if any(item["severity"] in ("CRITICAL", "HIGH") for item in findings) else "approve"


def one_line(text, limit=TEXT_LIMIT):
    flat = " ".join(str(text or "").split())
    return flat if len(flat) <= limit else flat[: limit - 1] + "…"


def render(meta, findings, id_table):
    """보고서 Markdown. meta: issue · mr · head · base · harness · reviewedAt."""
    table = counts(findings)
    lines = [
        "---",
        f"issue: {meta['issue']}",
        f'mr: "{meta["mr"]}"',
        f"head: {meta['head']}",
        f"base: {meta['base']}",
        f"reviewer: {{ harness: {meta['harness']}, role: reviewer }}",
        f"reviewedAt: {meta['reviewedAt']}",
        f"verdict: {verdict(findings)}",
        "counts: { " + ", ".join(f"{key}: {value}" for key, value in table.items()) + " }",
        "---",
        "",
        f"# 리뷰 — {meta['issue']} ({meta['mr']})",
        "",
        "리뷰 세션이 쓴 보고서다(커밋하지 않는다). 처리 결과는 구현 세션이 이슈 폴더 review.md 에 쓴다.",
        "",
    ]
    shown = ordered(findings)
    for item in shown[:BODY_LIMIT]:
        lines += [
            f"## {item['id']} · {item['severity']} · {item['check']}",
            f"- 문제: {one_line(item['title'])}",
            f"- 위치: {item['path']}:{item['line']}",
            f"- 근거: {one_line(item['evidence'])}",
            f"- 실패 시나리오: {one_line(item.get('scenario') or '—')}",
            f"- 권고: {one_line(item['recommendation'])}",
            f"- 지문: {item['fp']}",
            "",
        ]
    if len(shown) > BODY_LIMIT:
        lines.append("## 나머지")
        for item in shown[BODY_LIMIT:]:
            lines.append(f"- {item['id']} · {item['severity']} · {item['check']} · {item['path']}:{item['line']} — {one_line(item['title'], 160)}")
        lines.append("")
    if not shown:
        lines += ["발견 없음.", ""]
    data = {"issue": meta["issue"], "mr": meta["mr"], "head": meta["head"],
            "findings": [{key: item[key] for key in ("id", "severity", "check", "path", "line", "fp")} | {"title": one_line(item["title"], 160)} for item in shown]}
    lines.append(f"<!-- {IDS_MARK} {comment_json(id_table)} -->")
    lines.append(f"<!-- {DATA_MARK} {comment_json(data)} -->")
    return "\n".join(lines) + "\n"


def comment_json(value):
    """HTML 주석 안에 넣을 한 줄 JSON. 문자열 안의 < > 는 \\u 이스케이프로 바꿔 주석이 일찍 닫히지 않게 한다."""
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return text.replace("<", "\\u003c").replace(">", "\\u003e")


def read_data(text):
    """보고서(또는 코멘트 review 구간)의 데이터 주석. 없거나 깨졌으면 None."""
    match = DATA.search(text or "")
    if not match:
        return None
    try:
        data = json.loads(match.group(1))
    except ValueError:
        return None
    if not isinstance(data, dict) or not isinstance(data.get("findings"), list):
        return None
    return data
