"""운영 기록 → 접수(설계 14 §3.8 · §3.9, DO-R10 · R11). `intake.py ops ops:<기록>#INC-n|NX-n` 이 부른다. 표준 라이브러리만 쓴다.

- 장애 INC-n → bug 이슈. 운영 기록의 그 장애 `- 후속 이슈:` 줄만 고친다. risk 는 medium 이상을 제안한다(low 는 제안하지 않는다).
- 후보 NX-n → Intent(`source.type: ops`). 운영 기록 NX 행의 `접수` 칸에 Intent 키를 쓴다. 같은 NX 를 다시 접수하면 새로 만들지 않고 기존 경로를 보인다.
"""

import hashlib
import json
import re
import sys
from pathlib import Path

from harness import intake as intake_mod, intent as intents, ops_records
from harness.sdd_frontmatter import update as update_frontmatter

REF = re.compile(r"^ops:(?P<record>[^#\s]+)#(?P<id>INC-\d+|NX-\d+)$")
KEY = re.compile(r"[A-Z][A-Z0-9]{1,9}-[0-9]+")
MAX_NAME = 60


class OpsIntakeError(SystemExit):
    pass


def locate(root, ref):
    match = REF.match(ref)
    if not match:
        raise OpsIntakeError("ops:<운영 기록>#INC-<n> 또는 ops:<운영 기록>#NX-<n> 형식이 아니다")
    name = match.group("record")
    for prefix in (".agents/docs/", "ops/records/", ".agents/docs/ops/records/"):
        if name.startswith(prefix):
            name = name[len(prefix):]
    try:
        path = ops_records.resolve(root, name)
    except FileNotFoundError as error:
        raise OpsIntakeError(str(error)) from error
    return path, match.group("id")


def replace_line(path, number, new_line):
    lines = path.read_text(encoding="utf-8").split("\n")
    lines[number - 1] = new_line
    path.write_text("\n".join(lines), encoding="utf-8")


def rel(root, path):
    return Path(path).resolve().relative_to(Path(root).resolve()).as_posix()


def slug(topic, ident):
    return f"{topic}-{ident.lower()}"[:MAX_NAME].rstrip("-")


def from_incident(root, record, path, incident, kind, name, user, now):
    if kind not in (None, "bug"):
        raise OpsIntakeError("장애(INC-n)는 bug 이슈로 접수한다(--kind bug)")
    fields = incident["fields"]
    followed = fields.get("후속 이슈", "").strip()
    if KEY.search(followed):
        return {"existing": True, "key": KEY.search(followed).group(0), "message": f"이미 접수했다: {followed}"}
    if "후속 이슈" not in incident.get("fieldLines", {}):
        raise OpsIntakeError(f"{path.name} 의 {incident['id']} 에 '- 후속 이슈:' 줄이 없다 — 그 줄을 먼저 둔다")
    ref = f"ops/records/{path.name}#{incident['id']}"
    cause = fields.get("원인 배포", "배포 무관")
    body = "\n".join([f"장애 {incident['id']} · 등급 {incident['grade']} · {incident['date']}", "", f"- 감지: {fields.get('감지', '')}", f"- 영향: {fields.get('영향', '')}",
                      f"- 원인 배포: {cause}", f"- 조치: {fields.get('조치', '')}", f"- 런북: {fields.get('런북', '')}", "", f"출처: {ref}"])
    title = f"장애 {incident['id']} — {fields.get('영향', '').strip()[:80] or record['fm'].get('topic')}"
    result = intake_mod.take(root, title, "bug", name or slug(str(record["fm"].get("topic") or path.stem), incident["id"]), body, [], [], user, now, "bug",
                             {"type": "ops", "ref": ref, "version": hashlib.sha256(path.read_bytes()).hexdigest()[:12]})
    folder = Path(root) / result["folder"]
    key = intents.FOLDER.match(folder.name)[1]
    requirements = folder / "requirements.md"
    if requirements.is_file():
        head = json.dumps({"type": "ops", "ref": ref, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}).replace('"', "")
        text = update_frontmatter(requirements.read_text(encoding="utf-8"), {"risk": "medium", "source": head})
        causes = cause if cause not in ("배포 무관", "") else "배포 무관"
        extra = (f"\n## 장애에서 온 접수 ({incident['id']})\n\n- 영향 · 감지: {fields.get('영향', '')} · {fields.get('감지', '')}\n- 현재 동작(장애): {fields.get('영향', '')}\n"
                 f"- 기대 동작: (requirements 승인 전에 채운다)\n- 바뀌면 안 되는 동작: (채운다)\n- 원인 배포: {causes}\n- risk: medium 이상을 제안한다. 확정은 requirements 승인 때 사람이 한다(08 §3.15)\n")
        requirements.write_text(text.rstrip("\n") + "\n" + extra, encoding="utf-8")
    replace_line(path, incident["fieldLines"]["후속 이슈"], f"- 후속 이슈: {key}")
    return {**result, "key": key, "ref": ref, "record": rel(root, path), "existing": False}


def evidence_text(record, candidate):
    """NX 행과 그 근거가 가리키는 지표 행 · 장애 절 · 배운 것 행을 원문 그대로."""
    out = [f"운영 기록 후보 {candidate['id']}", "", candidate["raw"], ""]
    for row in record["metrics"]:
        if row["id"] and row["id"] in candidate["evidence"]:
            out += [row["raw"], ""]
    for incident in record["incidents"]:
        if incident["id"] in candidate["evidence"]:
            out += [incident["head"], *incident["text"], ""]
    for row in record["learned"]:
        if row["id"] in candidate["evidence"]:
            out += [row["raw"], ""]
    return "\n".join(out).rstrip() + "\n"


def from_candidate(root, record, path, candidate, kind, name, user, now):
    held = candidate["intake"].strip()
    if KEY.search(held) and held not in ops_records.EMPTY:
        key = KEY.search(held).group(0)
        folders = sorted((Path(root) / intents.INTENTS).glob(f"{key}-*"))
        return {"existing": True, "key": key, "folder": rel(root, folders[0]) if folders else None, "message": f"이미 접수했다: {key}"}
    kind = kind or (candidate["kind"] if candidate["kind"] in intake_mod.KINDS else "change")
    if kind == "bug":
        raise OpsIntakeError("다음 요구사항 후보(NX-n)는 Intent 로 접수한다(feature · change · refactor · product)")
    ref = f"ops/records/{path.name}#{candidate['id']}"
    source = {"type": "ops", "ref": ref, "version": hashlib.sha256(path.read_bytes()).hexdigest()[:12]}
    result = intake_mod.take(root, candidate["title"], kind, name or slug(str(record["fm"].get("topic") or path.stem), candidate["id"]), evidence_text(record, candidate), [], [], user, now, "bug", source)
    key = intents.FOLDER.match(Path(result["folder"]).name)[1]
    cells = candidate["raw"].strip().strip("|").split("|")
    cells[4] = f" {key} "
    replace_line(path, candidate["line"], "|" + "|".join(cells) + "|")
    return {**result, "key": key, "ref": ref, "record": rel(root, path), "existing": False}


def main(root, args, user, now):
    path, ident = locate(root, args.ref)
    record = ops_records.parse(path)
    pool = record["incidents"] if ident.startswith("INC") else record["candidates"]
    item = next((entry for entry in pool if entry["id"] == ident), None)
    if item is None:
        print(f"✖ {path.name} 에 {ident} 가 없다", file=sys.stderr)
        return 2
    handler = from_incident if ident.startswith("INC") else from_candidate
    result = handler(root, record, path, item, args.kind, args.name, user, now)
    if args.json:
        print(json.dumps(result, ensure_ascii=False))
    elif result.get("existing"):
        print(result["message"])
    else:
        print(f"✔ 접수: {result['folder']} ← {result['ref']}")
    return 0
