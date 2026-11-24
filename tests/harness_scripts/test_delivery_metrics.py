"""전달 지표 · 기준선(설계 14 §3.10, DO-R12 · R13, 완료 기준 9).

git fixture(병합 20건 · 태그 5개 · revert 1건 · hotfix 1건)로 `metrics --baseline` 값이 기대값과 같고 `--verify-baseline` 이 통과한다.
기준선 숫자를 하나 바꾸면 exit 1 이다. 같은 입력이면 같은 출력이다(시계 · 난수 없음).

    python3 -m unittest discover -s scripts/tests -p "test_delivery_metrics.py"
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ops_fixture import OpsCase

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import delivery_metrics  # noqa: E402

HERE = Path(__file__).resolve().parent
EXPECTED = json.loads((HERE / "delivery_expected.json").read_text(encoding="utf-8"))
SCRIPT = Path(__file__).resolve().parents[1] / "harness/delivery_metrics.py"
START = datetime(2026, 3, 5, 12, tzinfo=timezone.utc)
ADOPTED = datetime(2026, 6, 1, tzinfo=timezone.utc)


def stamp(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%S +0000")


class GitFixture:
    def __init__(self, root):
        self.root = Path(root)
        self.env = {"PATH": os.environ["PATH"], "HOME": str(root), "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null"}

    def git(self, *arguments, when=None):
        env = dict(self.env)
        if when:
            env.update({"GIT_AUTHOR_DATE": stamp(when), "GIT_COMMITTER_DATE": stamp(when)})
        r = subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "init.defaultBranch=develop", "-c", "commit.gpgsign=false", *arguments], cwd=self.root, env=env, capture_output=True, text=True, check=False)
        if r.returncode:
            raise AssertionError(f"git {' '.join(arguments)}: {r.stderr}")
        return r.stdout

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def commit(self, message, when):
        self.git("add", "-A", when=when)
        self.git("commit", "-q", "--allow-empty", "-m", message, when=when)

    def merge(self, branch, files, merged, lead_hours):
        first = merged - timedelta(hours=lead_hours)
        self.git("checkout", "-q", "-b", branch, "develop", when=first)
        for name in files:
            self.write(name, f"{branch}\n")
        self.commit(f"work on {branch}", first)
        self.write(f"notes/{branch.replace('/', '-')}.txt", "more\n")
        self.commit(f"more on {branch}", first + timedelta(hours=1))
        self.git("checkout", "-q", "develop", when=merged)
        self.git("merge", "--no-ff", "-q", "-m", f"Merge branch '{branch}'", branch, when=merged)


def build(root):
    fx = GitFixture(root)
    fx.git("init", "-q")
    fx.write(".agents/knots-sync.json", json.dumps({"git": {"base": "develop"}}))
    fx.write("README.md", "# demo\n")
    fx.commit("init", datetime(2026, 3, 1, tzinfo=timezone.utc))
    tags = {datetime(2026, 3, 20, 9, tzinfo=timezone.utc): "v1.0.0", datetime(2026, 4, 5, 9, tzinfo=timezone.utc): "v1.1.0", datetime(2026, 4, 20, 9, tzinfo=timezone.utc): "v1.2.0",
            datetime(2026, 5, 5, 9, tzinfo=timezone.utc): "v1.3.0", datetime(2026, 5, 20, 9, tzinfo=timezone.utc): "v1.4.0"}
    events = [(START + timedelta(days=4 * (i - 1)), "merge", i) for i in range(1, 21)] + [(when, "tag", name) for when, name in tags.items()] + [(datetime(2026, 4, 7, 12, tzinfo=timezone.utc), "revert", 0)]
    for when, kind, item in sorted(events, key=lambda event: (event[0], event[1])):
        if kind == "tag":
            fx.write("RELEASE", f"{item}\n")
            fx.commit(f"release {item}", when)
            fx.git("tag", item, when=when)
        elif kind == "revert":
            fx.write("src/m1.txt", "reverted\n")
            fx.commit('Revert "feature x"', when)
        else:
            branch = "hotfix/h1" if item == 17 else "fix/f1" if item == 12 else f"feat/x{item}"
            files = [f"src/m{item}.txt"] + (["src/m11.txt"] if item == 12 else [])
            fx.merge(branch, files, when, 24 + (item % 5) * 12)
    fx.write(".agents/knots-sync.lock", "{}\n")
    fx.commit("adopt knots-sync", ADOPTED)
    return fx


class BaselineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="hk-metrics ")
        cls.fx = build(cls.tmp.name)
        cls.root = Path(cls.tmp.name)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def run_script(self, *arguments):
        return subprocess.run([sys.executable, "-B", str(SCRIPT), "--root", str(self.root), *arguments], capture_output=True, text=True, timeout=120)

    def test_baseline_matches_expected_and_verifies(self):
        baseline = self.root / delivery_metrics.BASELINE
        baseline.unlink(missing_ok=True)
        r = self.run_script("--baseline", "--json")
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)
        data = json.loads(r.stdout)
        self.assertEqual(EXPECTED["metrics"], data["metrics"])
        self.assertEqual(EXPECTED["range"], {key: data["range"][key] for key in EXPECTED["range"]})
        self.assertTrue(data["inputDigest"].startswith("sha256:"))
        self.assertEqual(0, self.run_script("--verify-baseline").returncode)
        self.assertNotEqual(0, self.run_script("--baseline").returncode, "--force 없이는 거부한다")
        self.assertEqual(0, self.run_script("--baseline", "--force").returncode)
        again = json.loads(baseline.read_text(encoding="utf-8"))
        self.assertEqual((data["metrics"], data["inputDigest"]), (again["metrics"], again["inputDigest"]), "같은 입력이면 같은 값")

    def test_changed_baseline_number_fails_verify(self):
        self.assertEqual(0, self.run_script("--baseline", "--force").returncode)
        path = self.root / delivery_metrics.BASELINE
        saved = json.loads(path.read_text(encoding="utf-8"))
        saved["metrics"]["leadTimeHours"]["median"] += 1
        path.write_text(json.dumps(saved), encoding="utf-8")
        r = self.run_script("--verify-baseline")
        self.assertEqual(1, r.returncode)
        self.assertIn("leadTimeHours", r.stdout)
        self.assertEqual(0, self.run_script("--baseline", "--force").returncode)
        self.assertEqual(0, self.run_script("--verify-baseline").returncode)

    def test_later_commits_do_not_change_baseline(self):
        self.assertEqual(0, self.run_script("--baseline", "--force").returncode)
        self.fx.write("late.txt", "x\n")
        self.fx.commit("later work", datetime(2026, 7, 1, tzinfo=timezone.utc))
        self.assertEqual(0, self.run_script("--verify-baseline").returncode)

    def test_hotfix_is_not_a_fix_branch_for_rework(self):
        self.assertIsNone(delivery_metrics.FIX_BRANCH.search("Merge branch 'hotfix/h1'"))
        self.assertIsNotNone(delivery_metrics.FIX_BRANCH.search("Merge branch 'fix/f1'"))

    def test_without_adoption_commit_needs_option(self):
        with tempfile.TemporaryDirectory(prefix="hk-metrics ") as other:
            fx = GitFixture(other)
            fx.git("init", "-q")
            fx.write("README.md", "x\n")
            fx.commit("init", datetime(2026, 3, 1, tzinfo=timezone.utc))
            r = subprocess.run([sys.executable, "-B", str(SCRIPT), "--root", other, "--baseline"], capture_output=True, text=True, timeout=60)
            self.assertEqual(1, r.returncode)
            self.assertIn("--adopted-at", r.stderr)


class KitMetricsTest(OpsCase):
    """도입 뒤(method kit): 배포 기록 · 장애 · 승인 기록에서 계산한다."""

    def commit_at(self, message, when):
        self.env["GIT_AUTHOR_DATE"] = self.env["GIT_COMMITTER_DATE"] = stamp(when)
        self.commit(message)

    def deploy(self, name, state, issues, finished, key=None):
        path = self.root / ".agents/docs/ops/deploys" / f"{name}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        done = finished.astimezone().isoformat(timespec="seconds")
        path.write_text(f"---\nkind: deploy\nkey: {key or issues[0]}\nenv: production\nstate: {state}\nissues: [{', '.join(issues)}]\ncommit: {{ base: develop, sha: abc1234 }}\nrisk: low\ncreated: 2026-12-01\n---\n\n# 배포\n\n"
                        f"## 7. 결과\n<!-- RESULT:BEGIN -->\n| 단계 | 시작 | 끝 | 결과 | 근거 |\n|---|---|---|---|---|\n| deploy | {done} | {done} | ok | x |\n\n상태: {state}\n<!-- RESULT:END -->\n", encoding="utf-8")
        return path

    def test_lead_time_failure_rate_and_recovery_come_from_records_and_git(self):
        t0 = datetime(2026, 12, 1, tzinfo=timezone.utc)
        self.init_git()
        for number, name in ((1, "pay-api"), (2, "pay-method"), (3, "pay-hotfix")):
            self.make_issue(f"DEMO-{number}", name, done=False)
            self.commit_at(f"add DEMO-{number}", t0 + timedelta(days=number * 2))
        self.deploy("2026-12-03-DEMO-1", "succeeded", ["DEMO-1"], t0 + timedelta(days=2, hours=48))
        self.deploy("2026-12-05-DEMO-2", "rolled-back", ["DEMO-2"], t0 + timedelta(days=4, hours=96))
        self.deploy("2026-12-09-DEMO-3", "succeeded", ["DEMO-3"], t0 + timedelta(days=6, hours=10))
        record = self.root / ".agents/docs/ops/records/2026-12-10-payment-v2-week1.md"
        record.parent.mkdir(parents=True, exist_ok=True)
        record.write_text("---\nkind: ops-record\ntopic: payment-v2-week1\nperiod: { from: 2026-12-01, to: 2026-12-10 }\n---\n\n## 3. 장애\n### INC-1 · 등급 2 · 2026-12-06\n- 영향: 일부 실패\n- 원인 배포: ops/deploys/2026-12-03-DEMO-1.md\n- 조치: 롤백\n- 후속 이슈: DEMO-3\n", encoding="utf-8")
        self.commit_at("records", t0 + timedelta(days=9))
        r = self.run_py("delivery_metrics.py", "--from", "2026-12-01", "--to", "2026-12-31", "--json")
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)
        metrics = json.loads(r.stdout)["metrics"]
        self.assertEqual({"median": 29.0, "p85": 48.0, "n": 2, "method": "kit"}, metrics["leadTimeHours"], "롤백된 배포는 리드 타임에 넣지 않는다")
        self.assertEqual({"value": 0.67, "n": 3, "method": "kit"}, metrics["changeFailureRate"])
        self.assertEqual(10.0, metrics["mttrHours"]["median"])
        self.assertEqual(r.stdout, self.run_py("delivery_metrics.py", "--from", "2026-12-01", "--to", "2026-12-31", "--json").stdout, "같은 입력이면 같은 출력")
        self.assertEqual("unavailable", metrics["approvalWaitHours"]["method"])

    def test_library_without_deploy_records_measures_to_merge(self):
        t0 = datetime(2026, 12, 1, tzinfo=timezone.utc)
        self.init_git()
        self.make_issue("DEMO-1", "pay-api", done=False)
        self.commit_at("add DEMO-1", t0)
        (self.root / "extra.txt").write_text("x", encoding="utf-8")
        self.commit_at("merge DEMO-1", t0 + timedelta(hours=30))
        r = self.run_py("delivery_metrics.py", "--from", "2026-12-01", "--to", "2026-12-31", "--json")
        metrics = json.loads(r.stdout)["metrics"]
        self.assertEqual("merge", metrics["leadTimeHours"]["method"])
        self.assertIsNone(metrics["changeFailureRate"]["value"])
        self.assertIsNone(metrics["mttrHours"]["median"])

    def test_method_mismatch_and_fill(self):
        self.init_git()
        record = self.root / ".agents/docs/ops/records/2026-12-10-payment-v2-week1.md"
        record.parent.mkdir(parents=True, exist_ok=True)
        record.write_text((self.root / ".agents/docs/_spec-templates/ops/record.md").read_text(encoding="utf-8").replace("{{TOPIC}}", "payment-v2-week1").replace("{{FROM}}", "2026-12-01").replace("{{TO}}", "2026-12-10").replace("{{CREATED}}", "2026-12-10").replace("{{DEPLOYS}}", "").replace("{{INTENTS}}", ""), encoding="utf-8")
        base = {"leadTimeHours": {"median": 96.5, "p85": 210.0, "n": 41, "method": "git"}}
        current = {"leadTimeHours": {"median": 70.1, "p85": 100.0, "n": 3, "method": "kit"}, "approvalWaitHours": {"median": 3.0, "p85": 5.0, "n": 2, "method": "kit"}}
        self.assertEqual(["leadTimeHours"], delivery_metrics.method_mismatch(current, base))
        delivery_metrics.fill_record(record, current, base)
        text = record.read_text(encoding="utf-8")
        self.assertIn("계산 방법 다름", text)
        self.assertIn("| 리드 타임(시간, 중앙값) | 96.5 | 70.1 |", text)


if __name__ == "__main__":
    unittest.main()
