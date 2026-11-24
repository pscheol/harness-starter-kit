#!/usr/bin/env python3
"""분석기 SARIF 정규화 — 경로 · 심각도 · 지문(설계 09 §3.5 · VQ-R10).

1. 경로: 결과 위치를 리포 상대 POSIX 경로로 바꾸고 `uriBaseId: "%SRCROOT%"` 를 붙인다. 리포 밖 결과는 버린다.
2. 심각도: security-severity(CVSS) → level → 규칙 기본 level → warning. category secret 은 CRITICAL. severityMap 이 마지막에 덮는다.
3. 지문: sha256(ruleId \\0 경로 \\0 sha256(바탕) \\0 순번). 바탕은 도구 partialFingerprints 의 빈 값 아닌 항목 또는
   정규화한 시작 줄 내용이다. 줄 번호는 넣지 않는다 — 위에 줄을 더해도 같은 문제는 같은 지문이다.

    python3 scripts/harness/sarif/normalize.py --in <sarif> --out <sarif> --root <리포> --analyzer <id> [--category secret]
"""

import argparse
import copy
import fnmatch
import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.sarif.sarif_io import LEVELS, dumps, write_atomic  # noqa: E402

SEVERITIES = ("CRITICAL", "HIGH", "MEDIUM", "LOW")
LEVEL_SEVERITY = {"error": "HIGH", "warning": "MEDIUM", "note": "LOW", "none": "LOW"}
FINGERPRINT_NAME = "knotsSync/v1"
SRCROOT = "%SRCROOT%"
DROPPED_KINDS = {"pass", "notApplicable"}
MESSAGE_LIMIT = 200
PROPERTY_LIMIT = 12


def sha256(text):
    return hashlib.sha256(text.encode("utf-8", "surrogateescape")).hexdigest()


def fingerprint(rule_id, path, basis_hash, ordinal):
    return sha256(f"{rule_id}\0{path}\0{basis_hash}\0{ordinal}")


def collapse(text):
    return " ".join(str(text).split())


def score_severity(score):
    if score >= 9.0:
        return "CRITICAL"
    if score >= 7.0:
        return "HIGH"
    if score >= 4.0:
        return "MEDIUM"
    return "LOW"


def security_score(properties):
    if not isinstance(properties, dict) or properties.get("security-severity") in (None, ""):
        return None
    try:
        return float(properties["security-severity"])
    except (TypeError, ValueError):
        return None


def severity_of(item, rule, category, severity_map, rule_id):
    score = security_score(item.get("properties"))
    if score is None:
        score = security_score(rule.get("properties"))
    if score is not None:
        severity = score_severity(score)
    else:
        level = item.get("level") or (rule.get("defaultConfiguration") or {}).get("level") or "warning"
        severity = LEVEL_SEVERITY.get(level, "MEDIUM")
    if category == "secret":
        severity = "CRITICAL"
    for pattern, mapped in (severity_map or {}).items():
        if fnmatch.fnmatchcase(rule_id, pattern) and mapped in SEVERITIES:
            return mapped
    return severity


class Resolver:
    """SARIF 위치 → 리포 상대 경로. 리포 밖이면 None."""

    def __init__(self, root, mirror=None):
        self.root = Path(os.path.realpath(root))
        self.mirror = Path(os.path.realpath(mirror)) if mirror else None
        self.prefixes = sorted({str(folder) + os.sep for folder in (root, self.root, mirror, self.mirror) if folder}, key=len, reverse=True)

    def clean(self, text):
        """메시지에 든 임시 복사 폴더 · 리포 절대 경로를 뺀다."""
        for prefix in self.prefixes:
            text = text.replace(prefix, "")
        return text

    def relative(self, uri, base_id=None, base_ids=None):
        if not isinstance(uri, str) or not uri:
            return None
        parsed = urlparse(uri)
        if parsed.scheme == "file":
            candidate = Path(unquote(parsed.path))
        elif parsed.scheme and len(parsed.scheme) > 1:
            return None
        else:
            candidate = Path(unquote(uri))
            if not candidate.is_absolute():
                base = (base_ids or {}).get(base_id or "", {}).get("uri") if base_id and base_id != SRCROOT else None
                prefix = Path(unquote(urlparse(base).path)) if isinstance(base, str) and base.startswith("file:") else self.root
                candidate = prefix / candidate
        resolved = Path(os.path.realpath(candidate))
        for folder in (self.mirror, self.root):
            if folder is not None and resolved.is_relative_to(folder) and resolved != folder:
                return resolved.relative_to(folder).as_posix()
        return None


class Lines:
    def __init__(self, root):
        self.root, self.cache = Path(root), {}

    def get(self, path, number):
        if path not in self.cache:
            try:
                self.cache[path] = (self.root / path).read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                self.cache[path] = []
        lines = self.cache[path]
        return collapse(lines[number - 1]) if 0 < number <= len(lines) else ""


def rule_table(run):
    tool = run.get("tool") or {}
    components = [tool.get("driver") or {}, *(tool.get("extensions") or [])]
    rules = [rule for component in components for rule in (component.get("rules") or []) if isinstance(rule, dict)]
    driver_rules = (tool.get("driver") or {}).get("rules") or []
    return {rule.get("id"): rule for rule in rules if rule.get("id")}, driver_rules


def physical(place):
    return place.get("physicalLocation") if isinstance(place, dict) else None


def artifact_uri(place, run):
    artifact = (physical(place) or {}).get("artifactLocation") or {}
    uri, base_id = artifact.get("uri"), artifact.get("uriBaseId")
    index = artifact.get("index")
    if uri is None and isinstance(index, int) and 0 <= index < len(run.get("artifacts") or []):
        location = run["artifacts"][index].get("location") or {}
        uri, base_id = location.get("uri"), location.get("uriBaseId", base_id)
    return uri, base_id


def region_of(place):
    region = (physical(place) or {}).get("region")
    if not isinstance(region, dict) or not region.get("startLine"):
        return None
    start = max(int(region.get("startLine") or 1), 1)
    return start, max(int(region.get("endLine") or start), start), int(region.get("startColumn") or 0)


def basis_of(item, mode, content, message):
    if mode != "content":
        partial = {key: value for key, value in (item.get("partialFingerprints") or {}).items() if key != FINGERPRINT_NAME and isinstance(value, str) and value.strip()}
        if partial:
            return "pf:" + json.dumps(partial, sort_keys=True)
    if content is None:
        return "message:" + collapse(message)
    return "line:" + content


def scalar_properties(properties):
    kept = {}
    for key, value in (properties or {}).items():
        if key.startswith("knotsSync/") or key == "security-severity":
            continue
        short_text = isinstance(value, str) and len(value) <= 100
        if isinstance(value, (bool, int, float)) or short_text:
            kept[key] = value
        if len(kept) >= PROPERTY_LIMIT:
            break
    return kept


def rewrite_location(place, run, resolver):
    """위치 하나를 리포 상대 경로로 고친 사본. 리포 밖이면 None."""
    uri, base_id = artifact_uri(place, run)
    path = resolver.relative(uri, base_id, run.get("originalUriBaseIds"))
    if path is None:
        return None, None
    rewritten = copy.deepcopy(place)
    rewritten["physicalLocation"]["artifactLocation"] = {"uri": path, "uriBaseId": SRCROOT}
    return rewritten, path


def normalize_run(run, entry, resolver, lines):
    rules, driver_rules = rule_table(run)
    kept, findings, seen = [], [], set()
    for item in run.get("results") or []:
        if not isinstance(item, dict) or item.get("kind") in DROPPED_KINDS:
            continue
        places = [place for place in (item.get("locations") or []) if physical(place)]
        if not places:
            continue
        primary, path = rewrite_location(places[0], run, resolver)
        if primary is None:
            continue
        others = [pair for pair in (rewrite_location(place, run, resolver) for place in places[1:]) if pair[0] is not None]
        rule_index = item.get("ruleIndex")
        rule = rules.get(item.get("ruleId")) or (driver_rules[rule_index] if isinstance(rule_index, int) and 0 <= rule_index < len(driver_rules) else {}) or {}
        rule_id = item.get("ruleId") or rule.get("id") or (item.get("rule") or {}).get("id") or "unknown"
        message = resolver.clean(((item.get("message") or {}).get("text")) or rule.get("shortDescription", {}).get("text") or rule_id)
        region = region_of(places[0])
        content = lines.get(path, region[0]) if region else None
        start, end, column = region or (1, 1, 0)
        basis = basis_of(item, entry.get("fingerprint", "auto"), content, message)
        if basis.startswith("pf:"):
            # 도구 지문 · 위치가 같은 결과는 도구가 같은 문제로 본 것이다(osv-scanner 는 같은 취약점을 두 번 낸다).
            key = (rule_id, path, basis, start)
            if key in seen:
                continue
            seen.add(key)
        severity = severity_of(item, rule, entry.get("category"), entry.get("severityMap"), rule_id)
        normalized = copy.deepcopy(item)
        normalized["ruleId"] = rule_id
        normalized["locations"] = [primary, *(place for place, _ in others)]
        if normalized.get("level") not in LEVELS:
            normalized.pop("level", None)
        if isinstance(normalized.get("message"), dict) and "text" in normalized["message"]:
            normalized["message"]["text"] = resolver.clean(normalized["message"]["text"])
        finding = {
            "analyzer": entry["id"], "category": entry.get("category"), "ruleId": rule_id, "path": path,
            "startLine": start, "endLine": end, "severity": severity, "level": item.get("level") if item.get("level") in LEVELS else None,
            "message": collapse(message)[:MESSAGE_LIMIT], "basis": basis,
            "properties": scalar_properties(item.get("properties")), "_order": (start, column, len(findings)),
        }
        if others:
            finding["locations"] = [{"path": other_path, **dict(zip(("startLine", "endLine"), (region_of(place) or (1, 1, 0))[:2]))} for place, other_path in others]
        kept.append(normalized)
        findings.append(finding)
    assign_fingerprints(findings)
    for normalized, finding in zip(kept, findings):
        normalized.setdefault("partialFingerprints", {})[FINGERPRINT_NAME] = finding["fingerprint"]
        normalized.setdefault("properties", {})["knotsSync/severity"] = finding["severity"]
    order = sorted(range(len(kept)), key=lambda index: (findings[index]["path"], findings[index]["startLine"], findings[index]["ruleId"]))
    return [kept[index] for index in order], [findings[index] for index in order]


def assign_fingerprints(findings):
    """같은 (규칙 · 경로 · 바탕) 안에서 줄 · 열 순서로 순번을 매긴다."""
    groups = {}
    for finding in findings:
        finding["basisHash"] = sha256(finding.pop("basis"))
        groups.setdefault((finding["ruleId"], finding["path"], finding["basisHash"]), []).append(finding)
    for members in groups.values():
        for ordinal, finding in enumerate(sorted(members, key=lambda item: item["_order"])):
            finding["ordinal"] = ordinal
            finding["fingerprint"] = fingerprint(finding["ruleId"], finding["path"], finding["basisHash"], ordinal)
    for finding in findings:
        finding.pop("_order", None)


def normalize_document(document, entry, root, mirror=None):
    """(정규화한 SARIF 문서, 발견 목록). entry 는 analyzers.json 항목(id · category · severityMap · fingerprint)."""
    resolver, lines = Resolver(root, mirror), Lines(root)
    normalized = copy.deepcopy(document) if isinstance(document, dict) else {}
    normalized.setdefault("version", "2.1.0")
    findings = []
    for run in normalized.get("runs") or []:
        if not isinstance(run, dict):
            continue
        run["results"], found = normalize_run(run, entry, resolver, lines)
        findings.extend(found)
    return normalized, findings


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--in", dest="source", required=True)
    parser.add_argument("--out", dest="target", required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--analyzer", required=True)
    parser.add_argument("--category")
    options = parser.parse_args()
    try:
        document = json.loads(Path(options.source).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        print(f"✖ SARIF 를 읽지 못했다: {error}", file=sys.stderr)
        return 2
    normalized, findings = normalize_document(document, {"id": options.analyzer, "category": options.category}, options.root)
    write_atomic(options.target, dumps(normalized))
    print(f"정규화: 결과 {len(findings)}개 → {options.target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
