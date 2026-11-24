"""SARIF 2.1.0 문서 공통 — 변환기 틀 · 고정 정렬 · 원자적 쓰기 · 구조 검사(설계 09 §3.5).

구조 검사는 표준 라이브러리만 쓴다. JSON 스키마 전체가 아니라 킷이 읽고 쓰는 칸(버전 · 도구 이름 · 결과 메시지 ·
위치 · 줄 · level 값)을 본다.
"""

import json
import os
import tempfile
from pathlib import Path

SCHEMA_URI = "https://json.schemastore.org/sarif-2.1.0.json"
VERSION = "2.1.0"
LEVELS = {"none", "note", "warning", "error"}
KINDS = {"notApplicable", "pass", "fail", "review", "open", "informational"}


class InputError(Exception):
    """변환기가 원본을 읽지 못했다(exit 2)."""


def location(path, start, end=None):
    region = {"startLine": int(start), "endLine": int(end if end is not None else start)}
    return {"physicalLocation": {"artifactLocation": {"uri": str(path)}, "region": region}}


def result(rule_id, level, message, path, start, end=None, extra=(), properties=None):
    item = {"ruleId": rule_id, "level": level, "message": {"text": message}, "locations": [location(path, start, end)]}
    item["locations"].extend(location(other, first, last) for other, first, last in extra)
    if properties:
        item["properties"] = properties
    return item


def primary_uri(item):
    try:
        return item["locations"][0]["physicalLocation"]["artifactLocation"]["uri"]
    except (KeyError, IndexError, TypeError):
        return ""


def primary_line(item):
    try:
        return int(item["locations"][0]["physicalLocation"]["region"]["startLine"])
    except (KeyError, IndexError, TypeError, ValueError):
        return 0


def sort_key(item):
    return (primary_uri(item), primary_line(item), item.get("ruleId", ""))


def document(tool, results, information_uri=None, properties=None):
    """도구 하나 · 실행 하나의 문서. 규칙 목록은 결과의 ruleId 로 만든다. 결과는 경로 → 줄 → 규칙 순서다."""
    ordered = sorted(results, key=sort_key)
    driver = {"name": tool, "rules": [{"id": rule} for rule in sorted({item["ruleId"] for item in ordered})]}
    if information_uri:
        driver["informationUri"] = information_uri
    run = {"tool": {"driver": driver}, "results": ordered}
    if properties:
        run["properties"] = properties
    return {"$schema": SCHEMA_URI, "version": VERSION, "runs": [run]}


def dumps(data):
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def write_atomic(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def read_text(path):
    try:
        return Path(path).read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        raise InputError(f"원본을 읽지 못했다: {path}: {error}") from error


def run_converter(convert, arguments):
    """변환기 진입점 공통: 원본을 못 읽으면 exit 2, 발견이 있어도 exit 0."""
    import argparse
    import sys

    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="source", required=True)
    parser.add_argument("--out", dest="target", required=True)
    parser.add_argument("--threshold", type=float)
    options = parser.parse_args(arguments)
    try:
        converted = convert(read_text(options.source), options)
    except InputError as error:
        print(f"✖ {error}", file=sys.stderr)
        return 2
    write_atomic(options.target, dumps(converted))
    return 0


def structure_errors(data):
    """SARIF 2.1.0 구조 검사. 빈 목록이면 통과다."""
    errors = []
    if not isinstance(data, dict):
        return ["문서가 객체가 아니다"]
    if data.get("version") != VERSION:
        errors.append("version 이 2.1.0 이 아니다")
    runs = data.get("runs")
    if not isinstance(runs, list):
        return errors + ["runs 가 목록이 아니다"]
    for number, run in enumerate(runs):
        driver = (run.get("tool") or {}).get("driver") if isinstance(run, dict) else None
        if not isinstance(driver, dict) or not isinstance(driver.get("name"), str) or not driver["name"]:
            errors.append(f"runs[{number}].tool.driver.name 이 없다")
        for index, item in enumerate(run.get("results") or [] if isinstance(run, dict) else []):
            errors.extend(f"runs[{number}].results[{index}]: {problem}" for problem in result_errors(item))
    return errors


def positive_line(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 1


def result_errors(item):
    problems = []
    if not isinstance(item, dict):
        return ["결과가 객체가 아니다"]
    message = item.get("message")
    if not isinstance(message, dict) or not isinstance(message.get("text") or message.get("id"), str):
        problems.append("message.text 가 없다")
    if "level" in item and item["level"] not in LEVELS:
        problems.append(f"level 값이 틀렸다: {item['level']!r}")
    if "kind" in item and item["kind"] not in KINDS:
        problems.append(f"kind 값이 틀렸다: {item['kind']!r}")
    if "ruleId" in item and not isinstance(item["ruleId"], str):
        problems.append("ruleId 가 문자열이 아니다")
    for place in item.get("locations") or []:
        physical = place.get("physicalLocation") if isinstance(place, dict) else None
        if physical is None:
            continue
        artifact = physical.get("artifactLocation", {})
        if not isinstance(artifact.get("uri", ""), str):
            problems.append("artifactLocation.uri 가 문자열이 아니다")
        region = physical.get("region")
        if region is not None:
            for key in ("startLine", "endLine"):
                if key in region and not positive_line(region[key]):
                    problems.append(f"region.{key} 는 1 이상 정수다")
    return problems
