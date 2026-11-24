"""정적 분석 실행(설계 09 §3.4 · §3.5) — 등록한 분석기를 동시 4개까지 돌리고 SARIF 를 정규화해 게이트에 넘긴다.

화면 출력은 요약 줄(15줄 이하)만 돌려주고, 자세한 결과는 `.agents/reports/` 파일에 둔다. 킷은 모델을 부르지 않는다.
"""

import json
import os
import re
import signal
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

from harness.quality_baseline import classify
from harness.quality_config import SEVERITIES, ConfigError, load_baseline, load_gate, load_registry
from harness.quality_gate import evaluate, review_checks, review_status
from harness.quality_git import changed_lines, head_info, renamed_paths
from harness.quality_outputs import write_outputs
from harness.quality_select import check_version, expand, mirror, plan, resolve, rules_value, scope_values, tool_name
from harness.sarif.normalize import normalize_document
from harness.verify_sources import is_bootstrap, judged_by, tools_dir

WORKERS = 4
DEFAULT_TIMEOUT = 300
CONVERT_TIMEOUT = 120
STDERR_TAIL = 2000
SUMMARY_ANALYZERS = 10
EXIT = {"failed": 1, "incomplete": 2}


def in_ci(environ):
    return bool(environ.get("CI")) and environ.get("CI", "").lower() not in ("0", "false")


def execute(arguments, root, timeout, stdout_path, environ):
    """(exit code, 시간 초과, stderr 끝). 시간을 넘기면 프로세스 그룹을 통째로 끝낸다."""
    output = open(stdout_path, "wb") if stdout_path else subprocess.DEVNULL
    try:
        process = subprocess.Popen(arguments, cwd=root, env=environ, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.PIPE, start_new_session=True)
        try:
            _, error = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except OSError:
                process.kill()
            process.communicate()
            return None, True, ""
    except OSError as error:
        return 127, False, str(error)
    finally:
        if stdout_path:
            output.close()
    return process.returncode, False, error.decode("utf-8", "replace")[-STDERR_TAIL:]


def read_sarif(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) and isinstance(data.get("runs"), list) else None


def collected(entry, root, started):
    documents = []
    for pattern in entry.get("collect", []):
        for path in sorted(root.glob(pattern)):
            if path.is_file() and path.stat().st_mtime >= started - 1:
                document = read_sarif(path)
                if document:
                    documents.append(document)
    if not documents:
        return None
    return {"version": "2.1.0", "runs": [run for document in documents for run in document["runs"]]}


class Job:
    """분석기 하나의 실행 환경."""

    def __init__(self, entry, level, files, root, scratch, gate, environ):
        self.entry, self.level, self.files, self.root = entry, level, files, root
        self.scratch, self.gate, self.environ = scratch, gate, environ
        self.tools = tools_dir(root, environ)

    def outcome(self, chosen, status, **extra):
        return {"id": self.entry["id"], "tool": tool_name(chosen), "required": bool(self.entry.get("required")), "category": self.entry.get("category"), "status": status, **extra}

    def run(self):
        clock = time.monotonic()
        chosen, executable = resolve(self.entry, self.root, self.environ)
        if executable is None:
            return self.outcome(chosen, "missing", reason="not-installed", seconds=0.0)
        version, too_old = check_version(chosen, executable, self.root, self.environ)
        if too_old:
            return self.outcome(chosen, "old", reason="version-too-old", version=version, seconds=0.0)
        values = scope_values(chosen, self.level, self.files, self.root)
        if values is None:
            return self.outcome(chosen, "no-targets", version=version, seconds=0.0)
        work = Path(tempfile.mkdtemp(prefix=f"{self.entry['id']}-", dir=self.scratch))
        (work / "tmp").mkdir()
        scalars = self.scalars(chosen, values, work)
        arguments = expand(chosen["cmd"], values, scalars)
        arguments[0] = executable
        stdout_path = expand([chosen["stdout"]], values, scalars)[0] if chosen.get("stdout") else None
        started = time.time()
        code, timed_out, error = execute(arguments, self.root, chosen.get("timeoutSec", DEFAULT_TIMEOUT), stdout_path, {**self.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        seconds = round(time.monotonic() - clock, 1)
        if timed_out:
            return self.outcome(chosen, "timeout", reason="timeout", version=version, seconds=seconds)
        document, reason = self.document(chosen, values, scalars, work, started)
        if document is None:
            return self.outcome(chosen, "error", reason=reason, version=version, seconds=seconds, exitCode=code, stderr=error[-400:])
        return self.outcome(chosen, "ran", version=version, seconds=seconds, exitCode=code, document=document, mirror=scalars["{targetsDir}"] if values["mirror"] else None)

    def scalars(self, chosen, values, work):
        uses_mirror = any("{targetsDir}" in argument for argument in chosen["cmd"])
        if values["mirror"] and uses_mirror:
            folder = str(mirror(values["targets"], self.root, work / "targets"))
        else:
            folder = str(self.root)
            values["mirror"] = False
        return {
            "{out}": str(work / "out.sarif"), "{tmp}": str(work / "tmp"), "{rules}": rules_value(chosen, self.root),
            "{root}": str(self.root), "{targetsCsv}": ",".join(values["targets"]), "{targetsDir}": folder,
            "{ccn}": str(self.gate["complexity"]["functionMaxCcn"]),
        }

    def document(self, chosen, values, scalars, work, started):
        kind = chosen["sarif"]
        if kind == "none":
            return {"version": "2.1.0", "runs": []}, None
        if kind.startswith("convert:"):
            raw = expand([chosen.get("raw") or chosen.get("stdout") or "{tmp}/raw"], values, scalars)[0]
            converter = self.tools / "harness/sarif" / f"{kind.split(':', 1)[1]}.py"
            command = [sys.executable, str(converter), "--in", raw, "--out", scalars["{out}"], *expand(chosen.get("convertArgs", []), values, scalars)]
            try:
                result = subprocess.run(command, cwd=self.root, capture_output=True, text=True, timeout=CONVERT_TIMEOUT, check=False)
            except (OSError, subprocess.TimeoutExpired):
                return None, "convert-failed"
            if result.returncode != 0:
                return None, "no-output" if not Path(raw).exists() else "convert-failed"
        elif chosen.get("collect"):
            document = collected(chosen, self.root, started)
            return (document, None) if document else (None, "no-output")
        document = read_sarif(scalars["{out}"])
        return (document, None) if document else (None, "no-output")


def normalized(outcomes, root):
    findings = []
    for outcome in outcomes:
        document = outcome.pop("document", None)
        folder = outcome.pop("mirror", None)
        if document is None:
            continue
        entry = {"id": outcome["id"], "category": outcome["category"], **outcome.pop("entry", {})}
        outcome["normalized"], found = normalize_document(document, entry, root, mirror=folder)
        for run in outcome["normalized"].get("runs", []):
            run.setdefault("automationDetails", {"id": f"knots-sync/{outcome['id']}/"})
        outcome["properties"] = {key: value for run in document.get("runs", []) for key, value in (run.get("properties") or {}).items()}
        findings.extend(found)
    return findings


def run_analyzers(entries, level, files, root, gate, environ):
    with tempfile.TemporaryDirectory(prefix="kns-analysis-") as scratch:
        jobs = [Job(entry, level, files, root, Path(scratch), gate, environ) for entry in entries]
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            outcomes = list(pool.map(lambda job: job.run(), jobs))
    for outcome, entry in zip(outcomes, entries):
        outcome["entry"] = {key: entry[key] for key in ("severityMap", "fingerprint") if key in entry}
    return outcomes


def counts(findings):
    table = {severity: 0 for severity in SEVERITIES}
    for finding in findings:
        table[finding["severity"]] += 1
    return table


def analyzer_line(outcome, findings):
    mine = [finding for finding in findings if finding["analyzer"] == outcome["id"]]
    status = outcome["status"]
    tool = "" if outcome["tool"] == outcome["id"] else f"({outcome['tool']})"
    if status == "ran":
        return f"- {outcome['id']}{tool}: 새 {sum(item['new'] for item in mine)} · 전체 {len(mine)} · {outcome['seconds']:.1f}초"
    if status == "missing":
        return f"- {outcome['id']}: {'미완료' if outcome['required'] else '건너뜀'} — 설치 안 됨"
    if status == "old":
        return f"- {outcome['id']}: {'미완료' if outcome['required'] else '건너뜀'} — 판 {outcome.get('version')} 이 낮다"
    if status == "timeout":
        return f"- {outcome['id']}: 미완료 — 시간 초과({outcome['seconds']:.0f}초)"
    if status == "no-targets":
        return f"- {outcome['id']}: 대상 없음"
    return f"- {outcome['id']}: {'미완료' if outcome['required'] else '오류'} — {outcome.get('reason')}(exit {outcome.get('exitCode')})"


def gate_line(gate, level):
    failed = [check for check in gate["checks"] if check["status"] in ("failed", "warned")]
    detail = ", ".join(f"{check['id']} {check['value']}>{check['limit']}" for check in failed[:4])
    if gate["status"] == "failed":
        return f"품질 게이트 failed({level}) — 위반: {detail or '미완료 분석기(CI)'}"
    if gate["status"] == "warned":
        return f"품질 게이트 warned({level}) — 경고만: {detail}"
    return f"품질 게이트 {gate['status']}({level})"


def summary_lines(level, outcomes, findings, gate, environ):
    new = [finding for finding in findings if finding["new"]]
    table = counts(new)
    ran_count = sum(outcome["status"] == "ran" for outcome in outcomes)
    lines = [f"정적 분석({level}) — 분석기 {ran_count}/{len(outcomes)}개 실행, 새 문제 {len(new)}건(" + " · ".join(f"{key} {value}" for key, value in table.items()) + ")"]
    shown = outcomes[:SUMMARY_ANALYZERS]
    lines.extend(analyzer_line(outcome, findings) for outcome in shown)
    if len(outcomes) > len(shown):
        lines.append(f"- … 분석기 {len(outcomes) - len(shown)}개 더 — .agents/reports/findings-latest.json")
    lines.append(gate_line(gate, level))
    if gate["mode"] == "warn-no-baseline":
        lines.append("기준선 없음 — 경고만 한다. 기준선은 사람이 base 브랜치 full 결과로 만든다(quality.py baseline --update)")
    if is_bootstrap(environ):
        lines.append("bootstrap: base 에 검증 코드가 없어 head 판으로 판정했다")
    lines.append("자세한 결과: .agents/reports/findings-latest.json · quality-gate-last.json")
    return lines


def skipped_result(reason):
    return {"status": "skipped", "reason": reason, "lines": [], "exitCode": 0}


def config_failure(level, error, environ):
    status = "failed" if in_ci(environ) else "incomplete"
    return {"status": status, "gate": status, "reason": "config", "lines": [f"✖ 정적 분석 설정 오류({level}): {error}"], "exitCode": EXIT[status], "incomplete": [{"analyzer": "*", "reason": "config"}]}


REVIEW_BRANCH = re.compile(r"^(?:feat|fix|refactor|perf|chore|docs)/([A-Z][A-Z0-9]{1,9}-[0-9]+)-")


def review_states(root, level, environ):
    """게이트의 review.openMax 입력(VQ-R4). full 은 로컬 보고서가 있는 이슈 전부, affected · changed 는 현재 브랜치 이슈 하나.
    CI 에서 로컬 보고서가 없으면(affected) MR 요약 코멘트 review 구간을 읽는다. changed 는 로컬 보고서만 본다."""
    from harness import review_state
    from harness.sdd_issues import find_issue

    try:
        if level == "full":
            return review_state.all_states(root)
        branch = environ.get("GITHUB_HEAD_REF") or environ.get("CI_MERGE_REQUEST_SOURCE_BRANCH_NAME") or (head_info(root).get("branch") or "")
        match = REVIEW_BRANCH.match(branch)
        if not match:
            return []
        folder = find_issue(root, match.group(1))
        state = review_state.issue_state(root, folder, environ=environ if level == "affected" else {})
    except (OSError, ValueError):
        return []
    return [state] if state else []


def review_only(root, level, environ):
    """분석기 등록이 없어도 열린 리뷰 지적은 판정한다. 리뷰 보고서도 없으면 줄 없이 skipped."""
    try:
        gate_config = load_gate(root, environ)
    except ConfigError:
        return skipped_result("no-registry")
    states = review_states(root, level, environ)
    if not states:
        return skipped_result("no-registry")
    checks = review_checks(gate_config, states)
    failed = review_status(gate_config, level, checks)
    status = "failed" if failed else ("warned" if any(check["status"] == "warned" for check in checks) else "passed")
    gate = {"status": status, "checks": checks}
    return {"status": status, "gate": status, "mode": "review-only", "exitCode": EXIT.get(status, 0), "newIssues": {}, "incomplete": [],
            "analyzers": {}, "lines": [gate_line(gate, level)]}


def analyze(root, level, files, reference=None, environ=None):
    """정적 분석 · 게이트 한 번. 등록 파일 · 리뷰 보고서가 둘 다 없으면 줄 없이 skipped."""
    environ = dict(os.environ if environ is None else environ)
    root = Path(root).resolve()
    clock = time.monotonic()
    try:
        registry = load_registry(root, environ)
        if registry is None:
            return review_only(root, level, environ)
        gate_config = load_gate(root, environ)
        baseline = load_baseline(root, environ)
    except ConfigError as error:
        return config_failure(level, error, environ)
    entries, untriggered = plan(registry, level, files)
    outcomes = run_analyzers(entries, level, files, root, gate_config, environ)
    findings = normalized(outcomes, root)
    findings = classify(findings, baseline, renamed_paths(root, (baseline or {}).get("commit")), date.today())
    changed = changed_lines(root, reference, files) if level != "full" or reference else {}
    gate = evaluate(gate_config, level, findings, outcomes, changed, baseline is not None, in_ci(environ), review_states(root, level, environ))
    head = head_info(root)
    context = {
        "level": level, "head": head, "reference": reference, "seconds": round(time.monotonic() - clock, 1),
        "judgedBy": judged_by(environ), "bootstrap": is_bootstrap(environ), "untriggered": [entry["id"] for entry in untriggered],
        "at": datetime.now(timezone.utc).astimezone(),
    }
    warnings, run_id = write_outputs(root, context, outcomes, findings, gate)
    lines = summary_lines(level, outcomes, findings, gate, environ) + warnings
    new = [finding for finding in findings if finding["new"]]
    return {
        "status": gate["status"], "gate": gate["status"], "mode": gate["mode"], "runId": run_id, "exitCode": EXIT.get(gate["status"], 0),
        "newIssues": counts(new), "incomplete": gate["incomplete"], "analyzers": {outcome["id"]: outcome["status"] for outcome in outcomes}, "lines": lines,
    }
