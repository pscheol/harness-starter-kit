"""배포 실행 · 자동 검증 배포 · 결과 기록(설계 14 §3.3 · §3.5, DO-R6 ~ DO-R8). 표준 라이브러리만 쓴다.

킷은 운영 배포를 직접 하지 않는다: `deploy.json` 의 명령을 부를 뿐이다. 자리표 `{env} {sha} {toSha} {url}` 를 채운 문자열 목록이고 셸을 거치지 않는다.
이 모듈은 모델을 부르지 않는다. 테스트는 가짜 CI 환경 변수와 가짜 명령으로 한다.
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from harness import deploy_config, deploy_gate, deploy_record

REPORTS = deploy_gate.REPORTS
HISTORY_FILE = ".agents/state/deploy-history.json"


def now_text():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def git_head(root):
    r = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True, check=False)
    return r.stdout.strip() if r.returncode == 0 else ""


def execute(cmd, root, timeout):
    """명령 하나 실행 → (성공 여부, 걸린 초, 출력 끝 줄). 셸을 거치지 않는다."""
    start = time.monotonic()
    try:
        r = subprocess.run(cmd, cwd=str(root), capture_output=True, text=True, timeout=max(1, timeout), check=False)
        ok, tail = r.returncode == 0, (r.stdout + r.stderr).strip().splitlines()[-1:] or [""]
    except subprocess.TimeoutExpired:
        ok, tail = False, ["시간 초과"]
    except OSError as error:
        ok, tail = False, [f"실행하지 못했다: {error}"]
    return ok, round(time.monotonic() - start), tail[0][:200]


class Runner:
    """단계 실행 기록을 모은다. 명령이 없는 단계는 skipped, 한 단계가 실패하면 failed 로 멈춘다."""

    def __init__(self, root, config, env, sha, deadline, url=None):
        self.root, self.config, self.env, self.sha, self.url, self.deadline = root, config, env, sha, url, deadline
        self.steps = []
        self.failed = False

    def step(self, step_id, kind, to_sha=None):
        command = deploy_config.command(self.config, kind, env=self.env, sha=self.sha, toSha=to_sha or "", url=self.url or "")
        started = now_text()
        if command is None:
            self.steps.append({"id": step_id, "start": started, "end": started, "status": "skipped", "seconds": 0, "evidence": "deploy.json 에 명령이 없다"})
            return True
        ok, seconds, tail = execute(command, self.root, int(self.deadline - time.monotonic()))
        self.steps.append({"id": step_id, "start": started, "end": now_text(), "status": "ok" if ok else "failed", "seconds": seconds, "evidence": tail})
        self.failed = self.failed or not ok
        return ok


def env_url(config, env):
    item = (config.get("envs") or {}).get(env)
    return item.get("url") if isinstance(item, dict) else None


def write_json(root, name, data):
    path = Path(root) / REPORTS / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


# ── 결과 기록 ────────────────────────────────────────────────────────────────
def write_result(record_path, data):
    """머리 `state` 와 §7 구간만 쓴다. 계획 구간은 건드리지 않는다(승인 유지)."""
    state = data.get("state")
    if state not in deploy_record.RESULT_STATES:
        raise ValueError(f"state 는 {' · '.join(deploy_record.RESULT_STATES)}")
    text = Path(record_path).read_text(encoding="utf-8")
    rows = ["| 단계 | 시작 | 끝 | 결과 | 근거 |", "|---|---|---|---|---|"]
    for item in data.get("steps") or []:
        rows.append(f"| {item.get('id', '')} | {item.get('start', '')} | {item.get('end', '')} | {item.get('status', '')} | {str(item.get('evidence') or '').replace('|', '/')} |")
    rolled = "있음" if data.get("rolledBack") else "없음"
    block = [*rows, "", f"상태: {state} · 롤백: {rolled}"]
    text = deploy_record.replace_between(text, deploy_record.RESULT_BEGIN, deploy_record.RESULT_END, block,
                                         ["<!-- RESULT:BEGIN — deploy.py result 가 쓴다. 손으로 고치지 않는다 -->", "<!-- RESULT:END -->"])
    text = deploy_record.set_fm(text, {"state": state})
    Path(record_path).write_text(text if text.endswith("\n") else text + "\n", encoding="utf-8")


# ── run ─────────────────────────────────────────────────────────────────────
def last_passed_sha(root):
    best = None
    for path in sorted((Path(root) / REPORTS).glob("auto-verify-*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(data, dict) and data.get("status") == "passed" and data.get("sha"):
            if best is None or str(data.get("finishedAt")) >= str(best.get("finishedAt")):
                best = data
    return best.get("sha") if best else None


def run(root, env, record_path=None, rollback_test=False, to_sha=None):
    """(종료 코드, 결과 사전). production 은 먼저 deploy.py check --require-approved 와 같은 검사를 한다."""
    root = Path(root)
    config, error = deploy_config.read(root)
    if config is None:
        return 2, {"error": error or f"{deploy_config.CONFIG} 가 없다"}
    if env not in (config.get("envs") or {}):
        return 2, {"error": f"deploy.json envs 에 {env} 가 없다"}
    if deploy_config.command(config, "deploy") is None:
        return 2, {"error": "deploy.json commands.deploy 가 없다"}
    record = None
    if deploy_config.env_kind(config, env) == "production":
        if not record_path:
            return 1, {"error": "production 배포는 --record <배포 기록> 이 필요하다"}
        record = deploy_record.load(record_path)
        result = deploy_gate.check(root, record, require_approved=True)
        if not result["ok"]:
            return 1, {"error": "배포 승인 검사를 통과하지 못했다", "reasons": deploy_gate.lines(result)}
        if not deploy_gate.same_sha(git_head(root), record.commit.get("sha")):
            return 1, {"error": f"작업 트리 HEAD({git_head(root)[:12]})가 기록 commit.sha({record.commit.get('sha')})와 다르다"}
        write_result(record.path, {"state": "deploying", "steps": []})
    sha = git_head(root)
    runner = Runner(root, config, env, sha, time.monotonic() + deploy_config.auto_verify(config)["timeoutSec"], env_url(config, env))
    for step_id, kind in (("deploy", "deploy"), ("smoke", "smoke"), ("health", "health")):
        if not runner.step(step_id, kind):
            break
    tested = None
    if rollback_test and not runner.failed:
        back = to_sha or last_passed_sha(root) or ""
        if not back:
            tested = {"status": "skipped", "reason": "되돌아갈 sha 가 없다(--to-sha 또는 이전 자동 검증 통과 기록)"}
        else:
            ok = runner.step("rollback", "rollback", back) and runner.step("rollback-health", "health") and runner.step("redeploy", "deploy") and runner.step("redeploy-health", "health")
            tested = {"status": "passed" if ok else "failed", "toSha": back}
    state = "failed" if runner.failed else "succeeded"
    rolled = False
    if runner.failed and deploy_config.command(config, "rollback") and record is not None:
        back = to_sha or last_passed_sha(root) or ""
        if back:
            rolled = runner.step("rollback", "rollback", back)
            state = "rolled-back" if rolled else "failed"
    payload = {"state": state, "steps": runner.steps, "rolledBack": rolled, "env": env, "sha": sha, "finishedAt": now_text(), **({"rollbackTest": tested} if tested else {})}
    if record is not None:
        write_result(record.path, payload)
    if rollback_test:
        write_json(root, f"rollback-test-{sha[:7]}.json", {"schema": "harness-kit.rollback-test/v1", "sha": sha, "env": env, "status": (tested or {}).get("status", "skipped"),
                                                          "toSha": (tested or {}).get("toSha"), "pipeline": os.environ.get("CI_PIPELINE_URL") or os.environ.get("GITHUB_RUN_ID"), "finishedAt": payload["finishedAt"]})
    return (0 if state == "succeeded" and (tested or {}).get("status", "passed") != "failed" else 1), payload


# ── 자동 검증 배포 ───────────────────────────────────────────────────────────
def history_from_file(path):
    """HX_DEPLOY_HISTORY 가 가리키는 JSON 목록(최신 먼저) → 목록. 못 읽으면 None."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return [item for item in data if isinstance(item, dict)] if isinstance(data, list) else None


def history_from_artifacts(root):
    """이전 단계 산출물 auto-verify-*.json 에서 만든 목록(최신 먼저). 하나도 없으면 None(첫 실행과 읽기 실패를 가를 수 없다)."""
    items = []
    for path in (Path(root) / REPORTS).glob("auto-verify-*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(data, dict) and data.get("status"):
            items.append(data)
    items.sort(key=lambda item: (int(item.get("seq") or 0), str(item.get("finishedAt") or "")), reverse=True)
    return items or None


def read_history(root, environ):
    """(목록 또는 None, 출처 이름). 목록 항목: {status: passed|failed|stopped, sha}."""
    named = environ.get("HX_DEPLOY_HISTORY")
    if named:
        return history_from_file(named), "HX_DEPLOY_HISTORY"
    written = Path(root) / HISTORY_FILE
    if written.is_file():
        return history_from_file(written), HISTORY_FILE
    return history_from_artifacts(root), "산출물"


def consecutive_failures(history):
    count = 0
    for item in history:
        if item.get("status") in ("failed", "stopped"):
            count += 1
        else:
            break
    return count


def history_last_passed(history):
    for item in history:
        if item.get("status") == "passed" and item.get("sha"):
            return item["sha"]
    return None


def next_seq(root):
    """산출물 순번(같은 초에 끝난 실행의 앞뒤를 가른다)."""
    seqs = []
    for path in (Path(root) / REPORTS).glob("auto-verify-*.json"):
        try:
            seqs.append(int(json.loads(path.read_text(encoding="utf-8")).get("seq") or 0))
        except (OSError, ValueError, AttributeError):
            continue
    return max(seqs, default=0) + 1


def auto_verify(root, environ=None):
    """(종료 코드, 산출물 사전). 설계 14 §3.5 의 1~6."""
    environ = os.environ if environ is None else environ
    root = Path(root)
    config, error = deploy_config.read(root)
    if config is None:
        return 2, {"status": "error", "error": error or f"{deploy_config.CONFIG} 가 없다"}
    auto = deploy_config.auto_verify(config)
    if not auto["enabled"]:
        return 0, {"status": "off", "message": "자동 검증 배포는 꺼져 있다(deploy.json autoVerify.enabled)"}
    sha = git_head(root)
    resume = environ.get("HX_DEPLOY_RESUME") == "true"
    started = now_text()
    base = {"schema": "harness-kit.auto-verify/v1", "sha": sha[:12], "env": auto["env"], "pipeline": environ.get("CI_PIPELINE_URL") or environ.get("HX_PIPELINE_URL"), "startedAt": started}
    history, source = read_history(root, environ)
    if history is None:
        out = {**base, "status": "stopped", "reason": f"직전 실행 결과를 읽지 못했다(실패 수 모름, {source}) — 첫 실행이면 HX_DEPLOY_RESUME=true 로 파이프라인을 수동 실행한다",
               "steps": [], "consecutiveFailures": auto["maxConsecutiveFailures"], "lastPassedSha": None, "finishedAt": now_text(), "seq": next_seq(root)}
        if not resume:
            write_json(root, f"auto-verify-{sha[:7]}.json", out)
            return 1, out
        history = []
    failures = consecutive_failures(history)
    last_passed = history_last_passed(history)
    if failures >= auto["maxConsecutiveFailures"] and not resume:
        out = {**base, "status": "stopped", "reason": f"연속 {failures}회 실패 — 사람이 HX_DEPLOY_RESUME=true 로 파이프라인을 수동 실행해야 다시 배포한다",
               "steps": [], "consecutiveFailures": failures, "lastPassedSha": last_passed, "finishedAt": now_text(), "seq": next_seq(root)}
        write_json(root, f"auto-verify-{sha[:7]}.json", out)
        return 1, out
    env = auto["env"]
    runner = Runner(root, config, env, sha, time.monotonic() + auto["timeoutSec"], env_url(config, env))
    for step_id, kind in (("deploy", "deploy"), ("smoke", "smoke"), ("health", "health"), ("e2e", "e2e")):
        if not runner.step(step_id, kind):
            break
    tested = {"status": "skipped", "reason": "되돌아갈 sha 가 없다"}
    if not runner.failed and last_passed and deploy_config.command(config, "rollback"):
        ok = runner.step("rollback", "rollback", last_passed) and runner.step("rollback-health", "health") and runner.step("redeploy", "deploy") and runner.step("redeploy-health", "health")
        tested = {"status": "passed" if ok else "failed", "toSha": last_passed}
    failed = runner.failed
    if failed and last_passed and deploy_config.command(config, "rollback"):
        runner.step("recover", "rollback", last_passed)
    status = "failed" if failed else "passed"
    out = {**base, "seq": next_seq(root), "status": status, "steps": [{"id": s["id"], "status": s["status"], "seconds": s["seconds"]} for s in runner.steps], "rollbackTest": tested,
           "consecutiveFailures": 0 if status == "passed" else failures + 1, "lastPassedSha": sha[:12] if status == "passed" else last_passed, "finishedAt": now_text()}
    write_json(root, f"auto-verify-{sha[:7]}.json", out)
    return (0 if status == "passed" else 1), out


# ── 플랫폼에서 직전 실행 읽기 ─────────────────────────────────────────────────
def platform_history(platform, base, job="deploy-verify", limit=6):
    """glab · gh 로 base 브랜치의 직전 완료 실행 결과(최신 먼저). 읽지 못하면 None."""
    def call(*cmd):
        try:
            r = subprocess.run(list(cmd), capture_output=True, text=True, timeout=60, check=False)
        except (OSError, subprocess.TimeoutExpired):
            return None
        try:
            return json.loads(r.stdout) if r.returncode == 0 else None
        except ValueError:
            return None

    items = []
    if platform == "gitlab":
        pipelines = call("glab", "api", f"projects/:id/pipelines?ref={base}&scope=finished&per_page={limit}")
        if not isinstance(pipelines, list):
            return None
        for pipeline in pipelines:
            jobs = call("glab", "api", f"projects/:id/pipelines/{pipeline.get('id')}/jobs")
            if not isinstance(jobs, list):
                return None
            for item in jobs:
                if str(item.get("name", "")).endswith(job):
                    items.append({"status": "passed" if item.get("status") == "success" else "failed", "sha": (pipeline.get("sha") or "")[:12]})
    elif platform == "github":
        runs = call("gh", "run", "list", "--branch", base, "--workflow", "harness-verify.yml", "--json", "conclusion,databaseId,headSha", "--limit", str(limit))
        if not isinstance(runs, list):
            return None
        for item in runs:
            detail = call("gh", "run", "view", str(item.get("databaseId")), "--json", "jobs")
            if not isinstance(detail, dict):
                return None
            for entry in detail.get("jobs") or []:
                if str(entry.get("name", "")).endswith(job) and entry.get("conclusion") in ("success", "failure", "cancelled", "timed_out"):
                    items.append({"status": "passed" if entry.get("conclusion") == "success" else "failed", "sha": (item.get("headSha") or "")[:12]})
    else:
        return None
    return items


def write_history(root, platform, base):
    items = platform_history(platform, base)
    if items is None:
        print("✖ 직전 실행 결과를 읽지 못했다(glab · gh · 토큰 · 권한을 확인한다)", file=sys.stderr)
        return 1
    path = Path(root) / HISTORY_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(items, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"직전 실행 {len(items)}건 → {path.relative_to(root).as_posix()}")
    return 0
