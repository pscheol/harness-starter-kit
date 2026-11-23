"""CI 템플릿 셋(HK-16 VQ-R16)과 base 판 판정(VQ-R11, 설계 09 §3.7 · 완료 기준 9).

정적 시험: 세 템플릿의 검증 단계가 부르는 명령은 base 판 · head 판 verify.sh 와 준비 명령뿐이다.
동작 시험: GitLab 템플릿의 MR 단계 명령을 fixture 리포에서 그대로 돌려, head 가 기준을 낮추거나 검사를 지우거나
verify.sh 를 `exit 0` 으로 바꿔도 base 판이 판정해 실패하는지 본다. base 에 하네스가 없으면 bootstrap 으로 head 판이 돈다.
"""

import json
import re
import subprocess
import unittest

from quality_fixture import QualityFixture, analyzer, result
from verify_fixture import GATE_BODY, SOURCE

INSTALL = SOURCE.parent
GITHUB = INSTALL / ".github/workflows/harness-verify.yml"
GITLAB = INSTALL / "ci/harness-kit.gitlab-ci.yml"
GITLAB_ENTRY = INSTALL / ".gitlab-ci.yml"
GOCD = INSTALL / "ci/harness.gocd.yaml"
PASSING_BODY = GATE_BODY + 'echo "검증 통과"\nexit 0\n'
ALLOWED = tuple(re.compile(pattern) for pattern in (
    r"bash scripts/verify\.sh(?: --(?:fast|affected|full|bootstrap))+",
    r'bash \.agents/state/verify-base\.sh --from-base "\$HX_BASE_REF" --affected',
    r"mkdir -p \.agents/state",
    r'git show "\$HX_BASE_REF:scripts/verify(?:-entry)?\.sh" > \.agents/state/verify-(?:base|entry)\.sh',
    r"git fetch [^|;&]+",
    r"git diff --quiet [^|;&]+",
    r"\[ -s \.agents/state/verify-base\.sh \]",
    r"grep -q -- --from-base \.agents/state/verify-entry\.sh",
    r"true",
))
KEYWORDS = re.compile(r"^(?:if|then|else)\s+")


def block_values(lines, index, indent):
    values = []
    while index < len(lines) and (not lines[index].strip() or len(lines[index]) - len(lines[index].lstrip()) > indent):
        if lines[index].strip() and not lines[index].strip().startswith("#"):
            values.append(lines[index].strip())
        index += 1
    return values, index


def github_commands(text):
    lines, commands, index = text.splitlines(), [], 0
    while index < len(lines):
        match = re.match(r"^(\s*)(?:- )?run:\s*(.*)$", lines[index])
        index += 1
        if not match:
            continue
        value = match.group(2).strip()
        if value in ("|", "|-", ">", ">-"):
            values, index = block_values(lines, index, len(match.group(1)))
            commands.extend(values)
        else:
            commands.append(value)
    return commands


def gitlab_jobs(text):
    """최상위 job → script 명령 목록(블록 목록 형식만)."""
    jobs, job, lines, index = {}, None, text.splitlines(), 0
    while index < len(lines):
        line = lines[index]
        index += 1
        top = re.match(r"^([A-Za-z.][\w:.-]*):\s*$", line)
        if top:
            job = top.group(1)
            continue
        script = re.match(r"^(\s+)(script|before_script):\s*(.*)$", line)
        if script and job:
            if script.group(3).strip():
                raise AssertionError(f"{job}: script 는 블록 목록으로 쓴다(한 줄 목록은 시험이 읽지 않는다)")
            values, index = block_values(lines, index, len(script.group(1)))
            jobs.setdefault(job, []).extend(value[2:].strip() for value in values if value.startswith("- "))
    return jobs


def gocd_commands(text):
    commands = []
    for line in text.splitlines():
        match = re.search(r"exec:\s*\{\s*command:\s*bash,\s*arguments:\s*(\[.*\])\s*\}\s*$", line)
        if match:
            arguments = json.loads(match.group(1))
            assert arguments[0] == "-c", line
            commands.append(arguments[1])
        elif re.search(r"\bexec:", line):
            raise AssertionError(f"GoCD exec 는 한 줄 bash -c 형식으로 쓴다: {line.strip()}")
    return commands


def simple_commands(command):
    parts = []
    for part in re.split(r"\s*(?:&&|\|\||;)\s*", command.strip()):
        part = KEYWORDS.sub("", part.strip())
        if part and part != "fi":
            parts.append(part)
    return parts


class TemplateLintTest(unittest.TestCase):
    """완료 기준 9 앞부분: 검증 단계는 verify.sh 만 부른다(배포 단계는 아직 없다 — deploy.py 만 허용)."""

    def assert_only_verify(self, name, commands):
        self.assertTrue(commands, f"{name}: 명령을 하나도 읽지 못했다")
        for command in commands:
            for part in simple_commands(command):
                if re.search(r"deploy(?!\.json)", part):
                    self.assertRegex(part, r"^python3 scripts/harness/deploy\.py ", f"{name}: 배포 단계는 deploy.py 만 부른다")
                    continue
                self.assertTrue(any(pattern.fullmatch(part) for pattern in ALLOWED), f"{name}: 허용하지 않은 명령: {part!r} (원문 {command!r})")
        joined = "\n".join(commands)
        for level in ("--fast", "--full"):
            self.assertRegex(joined, rf"bash scripts/verify\.sh {level}", f"{name}: {level} 단계가 없다")
        self.assertIn('bash .agents/state/verify-base.sh --from-base "$HX_BASE_REF" --affected', joined, f"{name}: base 판 affected 가 없다")
        self.assertIn("bash scripts/verify.sh --affected --bootstrap", joined, f"{name}: bootstrap 경로가 없다")

    def test_github_actions_template(self):
        text = GITHUB.read_text()
        self.assert_only_verify("harness-verify.yml", github_commands(text))
        self.assertIn("fetch-depth: 0", text)
        self.assertIn("./.github/actions/harness-setup", text)
        self.assertIn("sarif_file: .agents/reports/sarif/latest", text)
        self.assertTrue((INSTALL / ".github/actions/harness-setup/action.yml").is_file())
        self.assertFalse((INSTALL / ".github/workflows/verify.yml").exists(), "PR 마다 full 을 도는 옛 트리거가 남아 있다")

    def test_gitlab_template(self):
        jobs = gitlab_jobs(GITLAB.read_text())
        self.assertTrue({"harness:fast", "harness:affected", "harness:affected-head", "harness:full"} <= set(jobs), sorted(jobs))
        self.assert_only_verify("harness-kit.gitlab-ci.yml", [command for name, commands in jobs.items() if name.startswith("harness:") for command in commands])
        self.assertIn("local: ci/harness-kit.gitlab-ci.yml", GITLAB_ENTRY.read_text())
        self.assertEqual(gitlab_jobs(GITLAB_ENTRY.read_text()), {}, ".gitlab-ci.yml 은 include 만 한다")

    def test_gocd_template(self):
        self.assert_only_verify("harness.gocd.yaml", gocd_commands(GOCD.read_text()))


class BaseJudgedTest(QualityFixture):
    """완료 기준 9 뒷부분: MR 판정은 base 판 검증 코드 · 설정으로 한다."""

    def setUp(self):
        super().setUp()
        self.gate(PASSING_BODY)
        self.write("conf/app.txt", "value = 1\n")
        self.write("docs/a.md", "# 문서\n")
        self.gate_config(newIssues={"CRITICAL": 0, "HIGH": 0, "MEDIUM": None, "LOW": None})
        self.baseline({})
        self.write(".agents/verify-checks.json", json.dumps({"checks": [{"id": "docs-rule", "paths": ["docs/**"], "command": ["false"]}]}))
        self.registry(analyzer("scan", required=True))
        self.fake_analyzer("scan")
        self.commit("base: harness")
        origin = self.base / "origin.git"
        subprocess.run(["git", "init", "-q", "--bare", str(origin)], check=True, capture_output=True)
        self.git("remote", "add", "origin", str(origin))
        self.git("push", "-q", "origin", "develop")
        self.git("checkout", "-q", "-b", "feat/HK-9-change")

    def mr_pipeline(self):
        """GitLab 템플릿 harness:affected 의 script 를 GitLab 이 하듯 줄마다 돌린다(앞 줄이 실패하면 멈춘다)."""
        script = gitlab_jobs(GITLAB.read_text())["harness:affected"]
        environment = {**self.env, "CI": "true", "CI_MERGE_REQUEST_TARGET_BRANCH_NAME": "develop", "HX_BASE_REF": "origin/develop"}
        return subprocess.run(["bash", "-e", "-c", "\n".join(script)], cwd=self.root, env=environment, capture_output=True, text=True, timeout=180, check=False)

    def head_verdict(self):
        return self.run_gate("--affected", extra={"CI": "true"})

    def assert_base_fails(self, run):
        self.assertEqual(run.returncode, 1, run.stdout[-3000:] + run.stderr[-3000:])
        self.assertTrue((self.root / ".agents/state/ci-base/scripts/verify-changed.py").is_file())

    def test_lowered_gate_in_head_is_judged_by_base(self):
        self.fake_analyzer("scan", [result("sqli", "conf/app.txt", 1, level="error")])
        self.write("conf/app.txt", "value = 'SELECT ' + name\n")
        self.gate_config(newIssues={"CRITICAL": 0, "HIGH": None, "MEDIUM": None, "LOW": None})
        self.commit("head lowers HIGH")
        self.assertEqual(self.head_verdict().returncode, 0, "head 판이면 통과해야 시험이 뜻이 있다")
        self.assert_base_fails(self.mr_pipeline())
        self.assertEqual(self.gate_result()["status"], "failed")
        self.assertEqual(self.gate_result()["judgedBy"], "base")

    def test_removed_check_in_head_is_judged_by_base(self):
        self.write("docs/a.md", "# 문서\n바뀜\n")
        (self.root / ".agents/verify-checks.json").unlink()
        self.commit("head drops the docs check")
        self.assertEqual(self.head_verdict().returncode, 0)
        self.assert_base_fails(self.mr_pipeline())

    def test_neutered_verify_script_in_head_is_judged_by_base(self):
        self.fake_analyzer("scan", [result("sqli", "conf/app.txt", 1, level="error")])
        self.write("conf/app.txt", "value = 'SELECT ' + name\n")
        self.gate("#!/usr/bin/env bash\nexit 0\n")
        self.commit("head neuters verify.sh")
        self.assertEqual(self.head_verdict().returncode, 0)
        self.assert_base_fails(self.mr_pipeline())

    def test_bootstrap_is_refused_when_base_has_harness_or_ref_is_missing(self):
        self.commit("head")
        run = self.run_gate("--affected", "--bootstrap", extra={"CI": "true", "HX_BASE_REF": "origin/develop"})
        self.assertEqual(run.returncode, 2, run.stdout + run.stderr)
        self.assertIn("base 판으로 판정한다", run.stderr)
        missing = self.run_gate("--affected", "--bootstrap", extra={"CI": "true", "HX_BASE_REF": "origin/no-such-branch"})
        self.assertEqual(missing.returncode, 2, missing.stdout + missing.stderr)
        self.assertIn("찾지 못했다", missing.stderr)

    def test_head_baseline_cannot_accept_its_own_findings(self):
        self.fake_analyzer("scan", [result("sqli", "conf/app.txt", 1, level="error")])
        self.write("conf/app.txt", "value = 'SELECT ' + name\n")
        self.quality("run", "--level", "affected", "--files", "conf/app.txt")
        fingerprint = self.findings()[0]["fingerprint"]
        self.baseline({"scan": {fingerprint: {"ruleId": "sqli", "path": "conf/app.txt", "severity": "HIGH"}}})
        self.commit("head adds its finding to the baseline")
        self.assertEqual(self.head_verdict().returncode, 0)
        self.assert_base_fails(self.mr_pipeline())


class BootstrapTest(QualityFixture):
    def test_base_with_older_entry_runs_head_with_bootstrap(self):
        """킷을 처음 올리는 MR: base 의 verify-entry.sh 가 --from-base 를 모르면 head 판으로 돈다(막히지 않는다)."""
        self.gate(PASSING_BODY)
        entry = self.root / "scripts/verify-entry.sh"
        current = entry.read_text()
        entry.write_text("# 옛 진입 블록\nexec python3 \"$(dirname \"${BASH_SOURCE[0]}\")/verify-changed.py\" \"$@\"\n")
        self.commit("base: older harness")
        origin = self.base / "origin.git"
        subprocess.run(["git", "init", "-q", "--bare", str(origin)], check=True, capture_output=True)
        self.git("remote", "add", "origin", str(origin))
        self.git("push", "-q", "origin", "develop")
        self.git("checkout", "-q", "-b", "feat/HK-16-upgrade")
        entry.write_text(current)
        self.gate_config()
        self.registry(analyzer("scan"))
        self.fake_analyzer("scan")
        self.write("conf/app.txt", "value = 1\n")
        self.commit("head: upgrade harness")
        run = BaseJudgedTest.mr_pipeline(self)
        self.assertIn(run.returncode, (0, 2), run.stdout[-3000:] + run.stderr[-3000:])
        self.assertEqual((self.gate_result()["bootstrap"], self.gate_result()["judgedBy"]), (True, "head"))

    def test_base_without_harness_runs_head_with_bootstrap(self):
        (self.root / "scripts").rename(self.base / "scripts-later")
        self.write("README.md", "# 하네스 전\n")
        self.commit("base: no harness")
        origin = self.base / "origin.git"
        subprocess.run(["git", "init", "-q", "--bare", str(origin)], check=True, capture_output=True)
        self.git("remote", "add", "origin", str(origin))
        self.git("push", "-q", "origin", "develop")
        self.git("checkout", "-q", "-b", "feat/HK-1-adopt")
        (self.base / "scripts-later").rename(self.root / "scripts")
        self.gate(PASSING_BODY)
        self.gate_config()
        self.registry(analyzer("scan"))
        self.fake_analyzer("scan")
        self.write("conf/app.txt", "value = 1\n")
        self.commit("head: add harness")
        run = BaseJudgedTest.mr_pipeline(self)
        # 도입 MR 은 킷 scripts/ 를 통째로 더해 모듈 시험이 없는 파일이 미완료(2)로 남는다. 판정 주체 · 표지만 본다.
        self.assertIn(run.returncode, (0, 2), run.stdout[-3000:] + run.stderr[-3000:])
        gate = self.gate_result()
        self.assertTrue(gate["bootstrap"])
        self.assertEqual(gate["judgedBy"], "head")
        self.assertIn("bootstrap", run.stdout)


if __name__ == "__main__":
    unittest.main()
