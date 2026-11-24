"""Intent 폴더 — 키 · 새로 만들기 · 다음 단계 판정 · 검사 · backlog(설계 08 §3.1~§3.5 · §3.8, DS-R1~R8 · R17, HK-19 design §3).

    python3 -m unittest discover -s scripts/tests -p "test_intent.py"
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = "scripts/harness/intent.py"

QUESTIONS_OPEN = """---
target: INT-1
status: open
round: 1
---

# 질문 — INT-1 결제

## Q-1 · 범위 · 답할 직무: po · 막는 게이트: intent
환불을 넣는가?

- A. 넣는다 — 영향: Unit 1개 추가
- B. 넣지 않는다 — 영향: 범위 밖
- 권장: B — 근거: 원문에 없다
- 답:
"""

INTENT = """---
id: INT-1
title: 결제
status: draft
flow: kit
kind: product
profile: product
risk: medium
areas: [payment]
jira: null
answersSha256: {answers}
created: 2026-11-24
---

# Intent INT-1 — 결제

## 1. 목표

## 5. 사용자 유형

| 유형 | 설명 | 스토리 |
|---|---|---|
| 구매자 | 결제한다 | S-1 |

## 6. 스토리와 수용 기준

{stories}

## 9. 외부 통합

| 대상 | 방식 | 소유 팀 | 계약 Unit |
|---|---|---|---|

## 10. 분해 판정

| 기준 | 값 | 기준값 | 해당 |
|---|---|---|---|
| 스토리 | {n} | ≥ 5 | 아니오 |
"""


def story(n, domain="payment"):
    return f"### S-{n} 결제 {n}\n- 스토리: 구매자로서 결제한다.\n- 도메인: {domain}\n- S-{n}.AC-1: 요청하면 시스템은 결제한다.\n"


def git(cwd, *args):
    subprocess.run(["git", "-c", "maintenance.auto=false", "-c", "gc.auto=0", "-c", "user.email=t@e", "-c", "user.name=t", *args], cwd=cwd, check=True, capture_output=True, text=True)


class IntentCase(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="intent ")
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name).resolve() / "repo"
        (self.root / "scripts").mkdir(parents=True)
        shutil.copytree(ROOT / "scripts/harness", self.root / "scripts/harness", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(ROOT / ".agents/docs/_spec-templates", self.root / ".agents/docs/_spec-templates")
        (self.root / ".agents/harness-kit.json").write_text(json.dumps({"schema": "harness-kit/v2", "git": {"base": "develop"}, "flow": {"gates": ["intent", "plans", "requirements", "design", "mr", "done"]}}), encoding="utf-8")
        git(self.root, "init", "-q", "-b", "develop")
        git(self.root, "add", "-A")
        git(self.root, "commit", "-q", "-m", "init")

    def run_intent(self, *args):
        return subprocess.run([sys.executable, "-B", SCRIPT, *args], cwd=self.root, capture_output=True, text=True, timeout=60, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})

    def make(self, stories=1, answers="null", questions=QUESTIONS_OPEN, domain=lambda n: "payment", units=None):
        folder = self.root / ".agents/docs/intents/INT-1-payment-revamp"
        folder.mkdir(parents=True, exist_ok=True)
        body = "\n".join(story(n, domain(n)) for n in range(1, stories + 1))
        (folder / "intent.md").write_text(INTENT.format(answers=answers, stories=body, n=stories), encoding="utf-8")
        if questions is not None:
            (folder / "questions.md").write_text(questions, encoding="utf-8")
        if units is not None:
            (folder / "units.json").write_text(json.dumps(units, ensure_ascii=False), encoding="utf-8")
        return folder

    def next(self):
        r = self.run_intent("next", "INT-1", "--json")
        self.assertEqual(0, r.returncode, r.stderr)
        return json.loads(r.stdout)

    def check(self):
        r = self.run_intent("check", "INT-1", "--json")
        return r.returncode, json.loads(r.stdout)

    @staticmethod
    def units(stories, **extra):
        u = {"id": "U-1", "name": "payment", "title": "결제", "kind": "feature", "area": "payment", "stories": stories, "dependsOn": [], "provides": [], "consumes": [], "order": 1, "issue": None, "planned": True}
        u.update(extra)
        return {"schema": "harness-kit.units/v1", "intent": {"key": "INT-1", "title": "결제", "doc": "intent.md"}, "source": {"kind": "kit"},
                "decomposition": {"stories": len(stories), "domains": 1, "userTypes": 1, "integrations": 0, "split": False, "reasons": []}, "units": [u], "unassigned": []}


class KeyAndNewTest(IntentCase):
    def test_key_counts_work_tree_and_base_branch(self):
        self.assertEqual("INT-1", self.run_intent("key").stdout.strip())
        (self.root / ".agents/docs/intents/INT-4-old-thing").mkdir(parents=True)
        (self.root / ".agents/docs/intents/INT-4-old-thing/intent.md").write_text("x", encoding="utf-8")
        git(self.root, "add", "-A")
        git(self.root, "commit", "-q", "-m", "int4")
        git(self.root, "switch", "-q", "-c", "feat/x")
        shutil.rmtree(self.root / ".agents/docs/intents/INT-4-old-thing")
        self.assertEqual("INT-5", self.run_intent("key").stdout.strip())

    def test_new_creates_draft_intent_and_open_questions(self):
        r = self.run_intent("new", "결제 개편", "--name", "payment-revamp", "--kind", "feature")
        self.assertEqual(0, r.returncode, r.stderr)
        folder = self.root / r.stdout.strip()
        self.assertEqual("INT-1-payment-revamp", folder.name)
        text = (folder / "intent.md").read_text(encoding="utf-8")
        self.assertIn("id: INT-1\n", text)
        self.assertIn("kind: feature\n", text)
        self.assertIn("status: draft\n", text)
        self.assertNotIn("{{", text)
        self.assertIn("status: open\n", (folder / "questions.md").read_text(encoding="utf-8"))
        self.assertNotEqual(0, self.run_intent("new", "x", "--name", "Bad_Name").returncode)
        self.assertNotEqual(0, self.run_intent("new", "x", "--name", "bug-fix-thing", "--kind", "bug").returncode)

    def test_new_with_jira_module_needs_an_epic_key(self):
        meta = json.loads((self.root / ".agents/harness-kit.json").read_text(encoding="utf-8"))
        (self.root / ".agents/harness-kit.json").write_text(json.dumps({**meta, "modules": ["jira-workflow"]}), encoding="utf-8")
        r = self.run_intent("new", "결제", "--name", "payment-revamp")
        self.assertNotEqual(0, r.returncode)
        self.assertIn("에픽 키", r.stdout + r.stderr)
        self.assertEqual(0, self.run_intent("new", "결제", "--name", "payment-revamp", "--key", "HDRV3D-40").returncode)


class NextStepTest(IntentCase):
    def test_draft_then_answers_wait(self):
        self.make(stories=0, questions="---\ntarget: INT-1\nstatus: open\nround: 1\n---\n")
        self.assertEqual("draft", self.next()["step"])
        self.make(stories=1)
        r = self.next()
        self.assertEqual(("answers-wait", ["Q-1"]), (r["step"], r["blocking"]))

    def test_answers_then_apply_then_decompose(self):
        answered = QUESTIONS_OPEN.replace("- 답:\n", "- 답: B · po@example.com · 2026-11-24T10:00:00+09:00\n")
        self.make(stories=1, questions=answered)
        r = self.next()
        self.assertEqual("apply-answers", r["step"])
        qsha = hashlib.sha256(answered.encode("utf-8")).hexdigest()
        self.assertEqual(qsha, r["answersSha256"])
        self.make(stories=1, questions=answered, answers=qsha)
        self.assertEqual("decompose", self.next()["step"])

    def test_units_then_intent_approval_then_plans(self):
        self.make(stories=1, questions=None, units=self.units(["S-1"]))
        self.assertEqual("intent-approval-wait", self.next()["step"])
        meta = json.loads((self.root / ".agents/harness-kit.json").read_text(encoding="utf-8"))
        (self.root / ".agents/harness-kit.json").write_text(json.dumps({**meta, "flow": {"gates": ["requirements", "design", "mr", "done"]}}), encoding="utf-8")
        self.assertEqual("plans", self.next()["step"])
        plans = self.root / ".agents/docs/intents/INT-1-payment-revamp/plans"
        plans.mkdir()
        (plans / "backlog.md").write_text("x", encoding="utf-8")
        r = self.next()
        self.assertEqual(("specify", ["U-1"]), (r["step"], r["units"]))

    def test_existing_code_needs_reverse_engineering_and_codebase_gate(self):
        folder = self.make(stories=1, questions=None)
        (folder / "intent.md").write_text((folder / "intent.md").read_text(encoding="utf-8").replace("kind: product", "kind: change"), encoding="utf-8")
        self.assertEqual("reverse-engineer", self.next()["step"])
        (folder / "current-state.md").write_text("---\nintent: INT-1\nkind: current-state\nstatus: draft\n---\n", encoding="utf-8")
        meta = json.loads((self.root / ".agents/harness-kit.json").read_text(encoding="utf-8"))
        (self.root / ".agents/harness-kit.json").write_text(json.dumps({**meta, "flow": {"gates": ["codebase", "intent", "requirements", "design", "mr", "done"]}}), encoding="utf-8")
        self.assertEqual("codebase-approval-wait", self.next()["step"])

    def test_aidlc_flow_only_points_to_aidlc(self):
        self.make(stories=1)
        meta = json.loads((self.root / ".agents/harness-kit.json").read_text(encoding="utf-8"))
        (self.root / ".agents/harness-kit.json").write_text(json.dumps({**meta, "flow": {"design": "aidlc"}}), encoding="utf-8")
        r = self.next()
        self.assertEqual("aidlc", r["step"])
        self.assertIn("sync aidlc", r["reason"])


class CheckTest(IntentCase):
    def test_valid_single_unit_passes(self):
        self.make(stories=1, questions=QUESTIONS_OPEN, units=self.units(["S-1"]))
        code, r = self.check()
        self.assertEqual((0, []), (code, r["problems"]))

    def test_question_format_rules(self):
        bad = QUESTIONS_OPEN.replace("- B. 넣지 않는다 — 영향: 범위 밖\n", "").replace("- 권장: B", "- 권장: C")
        bad += "\n## Q-2 · 운영 · 답할 직무: ops · 막는 게이트: intent\nx\n- A. a — 영향: 1\n- B. b — 영향: 2\n- 권장: A — 근거: x\n- 권장: B — 근거: y\n- 답:\n"
        bad += "\n## Q-3 · 범위 · 답할 직무: po\nx\n- A. a — 영향: 1\n- B. b — 영향: 2\n- 권장: A — 근거: x\n- 답:\n"
        bad += "\n## Q4 엉터리 제목\n"
        self.make(stories=1, questions=bad)
        code, r = self.check()
        text = "\n".join(r["problems"])
        self.assertEqual(1, code)
        for needle in ("선택지는 2~4개", "권장 C 가 선택지에 없다", "권장 줄은 정확히 1개", "순서로 놓는다", "질문 제목 형식"):
            self.assertIn(needle, text)

    def test_more_than_five_open_questions_fail(self):
        q = "---\ntarget: INT-1\nstatus: open\nround: 1\n---\n" + "".join(
            f"\n## Q-{n} · 범위 · 답할 직무: po · 막는 게이트: intent\nx\n- A. a — 영향: 1\n- B. b — 영향: 2\n- 권장: A — 근거: x\n- 답:\n" for n in range(1, 7))
        self.make(stories=1, questions=q)
        self.assertIn("5개까지", "\n".join(self.check()[1]["problems"]))

    def test_cycle_missing_unit_and_contract_rules(self):
        u = self.units(["S-1", "S-2"])
        u["units"][0]["dependsOn"] = ["U-2"]
        u["units"].append({**u["units"][0], "id": "U-2", "stories": [], "dependsOn": ["U-1"]})
        u["units"].append({**u["units"][0], "id": "U-3", "stories": [], "dependsOn": ["U-9"]})
        u["units"].append({**u["units"][0], "id": "U-4", "kind": "contract", "stories": [], "dependsOn": ["U-1"]})
        self.make(stories=2, questions=None, units=u)
        text = "\n".join(self.check()[1]["problems"])
        self.assertIn("의존 고리 U-1 → U-2 → U-1", text)
        self.assertIn("없는 Unit U-9", text)
        self.assertIn("계약 Unit U-4 는 기능 Unit U-1 에 의존하지 않는다", text)

    def test_cross_domain_contract_must_be_a_contract_unit_dependency(self):
        u = self.units(["S-1"], consumes=["event:payment.completed"])
        u["units"].append({**u["units"][0], "id": "U-2", "kind": "feature", "area": "billing", "stories": [], "provides": ["event:payment.completed"], "consumes": []})
        self.make(stories=1, questions=None, units=u)
        self.assertIn("kind: contract Unit 이 준다", "\n".join(self.check()[1]["problems"]))
        u["units"][1]["kind"] = "contract"
        self.make(stories=1, questions=None, units=u)
        self.assertIn("dependsOn 에 넣는다", "\n".join(self.check()[1]["problems"]))

    def test_story_assignment(self):
        u = self.units(["S-1"])
        self.make(stories=2, questions=None, units=u)
        self.assertIn("스토리 S-2 가 어느 Unit 에도 없다", "\n".join(self.check()[1]["problems"]))
        u["unassigned"] = [{"story": "S-2", "reason": "범위 밖 Q-1 답 B"}]
        self.make(stories=2, questions=None, units=u)
        self.assertEqual([], self.check()[1]["problems"])

    def test_decomposition_counts_must_match(self):
        u = self.units([f"S-{n}" for n in range(1, 6)])
        self.make(stories=5, questions=None, units=u)
        text = "\n".join(self.check()[1]["problems"])
        self.assertIn("decomposition.split 이 True 여야 한다", text)
        folder = self.root / ".agents/docs/intents/INT-1-payment-revamp"
        (folder / "intent.md").write_text((folder / "intent.md").read_text(encoding="utf-8").replace("| 스토리 | 5 |", "| 스토리 | 4 |"), encoding="utf-8")
        self.assertIn("§10: 스토리 값 4 이 실제 5", "\n".join(self.check()[1]["problems"]))


class BacklogTest(IntentCase):
    def test_backlog_section_is_generated_from_units_and_board(self):
        u = self.units(["S-1"], issue="DEMO-3")
        u["units"].append({**u["units"][0], "id": "U-2", "title": "정산", "issue": None, "order": 2, "dependsOn": ["U-1"], "stories": []})
        folder = self.make(stories=1, questions=None, units=u)
        r = self.run_intent("backlog", "INT-1")
        self.assertEqual(0, r.returncode, r.stderr)
        text = (folder / "plans/backlog.md").read_text(encoding="utf-8")
        self.assertIn("| 1 | U-1 결제 | feature | DEMO-3 | 이슈 폴더 없음 | — |", text)
        self.assertIn("| 2 | U-2 정산 | feature | — | 백로그 | U-1 | — |", text)
        before = text
        self.assertEqual(0, self.run_intent("backlog", "INT-1").returncode)
        self.assertEqual(before, (folder / "plans/backlog.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
