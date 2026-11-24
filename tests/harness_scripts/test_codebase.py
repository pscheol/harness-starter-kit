"""역공학 codebase 모델 — 정적 행 · 출처 칸(DS-R22) · 오래됨(DS-R23) · codebase 게이트 앞 조건(설계 08 §3.13, HK-19 design §5).

    python3 -m unittest discover -s scripts/tests -p "test_codebase.py"
"""

import json
import shutil
import subprocess
import sys
import unittest

from sdd_fixture import SddCase

INTENT = """---
id: INT-1
title: 결제수단 추가
status: draft
flow: kit
kind: change
profile: product
risk: medium
areas: [payment]
jira: null
answersSha256: null
created: 2026-11-24
---

# Intent INT-1 — 결제수단 추가
"""

QUESTIONS = """---
target: INT-1
status: open
round: 1
---

# 질문

## Q-1 · 기술 · 답할 직무: dev · 막는 게이트: codebase
환불 기한을 180일로 읽었다. 맞는가?

- A. 맞다 — 영향: 그대로
- B. 다르다 — 영향: 모델 고침
- 권장: A — 근거: RefundPolicy.py:12
- 답:{answer}
"""


class CodebaseTest(SddCase):
    def setUp(self):
        super().setUp()
        meta = self.root / ".agents/harness-kit.json"
        data = json.loads(meta.read_text())
        meta.write_text(json.dumps({**data, "stack": "python"}))
        shutil.rmtree(self.root / ".agents/docs/intents", ignore_errors=True)
        shutil.rmtree(self.root / ".agents/docs/codebase", ignore_errors=True)
        for pkg in ("pay", "billing"):
            (self.root / pkg).mkdir()
            (self.root / pkg / "__init__.py").write_text("")
        (self.root / "billing/notify.py").write_text("import pay\n")
        (self.root / "pay/models.py").write_text('class Payment:\n    __tablename__ = "payments"\n')
        self.git("init", "-q")
        self.commit("init")

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, env=self.env, check=True, capture_output=True, text=True).stdout

    def commit(self, message):
        self.git("add", "-A")
        self.git("commit", "-q", "-m", message)

    def py(self, script, *args):
        return subprocess.run([sys.executable, "-B", f"scripts/harness/{script}", *args], cwd=self.root, env=self.env, capture_output=True, text=True, timeout=120)

    def model(self):
        return (self.root / ".agents/docs/codebase/payment.md").read_text(encoding="utf-8")

    def test_scan_rewrites_only_static_rows_and_keeps_ids(self):
        r = self.py("codebase_scan.py", "payment", "--paths", "pay/**", "billing/**", "--json")
        self.assertEqual(0, r.returncode, r.stderr)
        out = json.loads(r.stdout)
        self.assertEqual((2, 1, 1), (out["modules"], out["deps"], out["tables"]))
        text = self.model()
        self.assertIn("| M-1 | billing | billing/ |  | static:python-packages |", text)
        self.assertIn("| M-1 | M-2 | import | static:ast |", text)
        self.assertIn("| payments |  | M-2 | static:sqlalchemy |", text)
        self.assertIn('paths: ["pay/**", "billing/**"]', text)
        self.assertIn(f"baseSha: {self.git('rev-parse', 'HEAD').strip()}", text)
        text = text.replace("| M-1 | M-2 | import | static:ast |", "| M-1 | M-2 | import | static:ast |\n| M-2 | billing | 이벤트 payment.completed | inferred · pay/models.py:2 |")
        (self.root / ".agents/docs/codebase/payment.md").write_text(text, encoding="utf-8")
        (self.root / "audit").mkdir()
        (self.root / "audit/__init__.py").write_text("")
        r = self.py("codebase_scan.py", "payment", "--paths", "pay/**", "billing/**", "audit/**")
        self.assertEqual(0, r.returncode, r.stderr)
        text = self.model()
        self.assertIn("| M-2 | billing | 이벤트 payment.completed | inferred · pay/models.py:2 |", text)
        self.assertIn("| M-1 | billing |", text)
        self.assertIn("| M-3 | audit | audit/ |", text)
        self.assertEqual(1, text.count("static:ast"))

    def test_source_cells_must_be_known_and_inferred_needs_a_location(self):
        self.assertEqual(0, self.py("codebase_scan.py", "payment", "--paths", "pay/**").returncode)
        text = self.model().replace("## 5. 알려진 제약 · 관행\n\n| ID | 내용 | 종류(유지 규칙 · 관행 · 기술 부채) | 출처 |\n|---|---|---|---|",
                                    "## 5. 알려진 제약 · 관행\n\n| ID | 내용 | 종류(유지 규칙 · 관행 · 기술 부채) | 출처 |\n|---|---|---|---|\n| C-1 | 환불 180일 | 유지 규칙 | confirmed:Q-3 |\n| C-2 | 오류는 PayError | 관행 | inferred |\n| C-3 | 로그 형식 | 관행 | 대충 |")
        text = text.replace("(### F-<n> <이름> · 출처: … · 근거: <파일:줄>)", "### F-1 결제 승인 · 출처: inferred · 근거: 없음")
        (self.root / ".agents/docs/codebase/payment.md").write_text(text, encoding="utf-8")
        r = self.py("codebase_check.py", "check", "--json")
        self.assertEqual(1, r.returncode)
        problems = json.loads(r.stdout)["problems"]
        self.assertEqual(3, len(problems), problems)
        self.assertTrue(any("F-1 inferred 흐름에 근거 위치" in p for p in problems))
        self.assertTrue(any("C-2 — inferred 행에 근거 위치" in p for p in problems))
        self.assertTrue(any("C-3 — 출처가 static:" in p for p in problems))
        self.assertFalse(any("C-1" in p for p in problems))

    def test_model_goes_stale_by_lines_files_or_lost_base(self):
        self.assertEqual(0, self.py("codebase_scan.py", "payment", "--paths", "pay/**").returncode)
        self.commit("model")
        warnings = lambda: json.loads(self.py("codebase_check.py", "check", "--json").stdout)["warnings"]  # noqa: E731
        self.assertEqual([], warnings())
        (self.root / "pay/big.py").write_text("x = 1\n" * 201)
        self.commit("big")
        found = warnings()
        self.assertEqual(1, len(found))
        self.assertIn("역공학 문서 오래됨 — baseSha 뒤 바뀐 줄 201(기준 200)", found[0])
        self.assertEqual(0, self.py("codebase_scan.py", "payment").returncode)
        self.commit("rescan")
        for n in range(3):
            (self.root / f"pay/new{n}.py").write_text("y = 2\n")
        self.commit("three files")
        self.assertIn("파일 3(기준 3)", warnings()[0])
        text = self.model()
        head = self.git("rev-parse", "HEAD").strip()
        (self.root / ".agents/docs/codebase/payment.md").write_text(text.replace(text.split("baseSha: ")[1].split("\n")[0], "0" * 40), encoding="utf-8")
        self.assertIn("조상이 아니다", warnings()[0])
        self.assertTrue(head)

    def test_codebase_gate_preconditions(self):
        self.assertEqual(0, self.py("codebase_scan.py", "payment", "--paths", "pay/**").returncode)
        folder = self.root / ".agents/docs/intents/INT-1-payment-method"
        folder.mkdir(parents=True)
        (folder / "intent.md").write_text(INTENT, encoding="utf-8")
        (folder / "questions.md").write_text(QUESTIONS.format(answer=""), encoding="utf-8")
        cs = folder / "current-state.md"
        cs.write_text("---\nintent: INT-1\nkind: current-state\nstatus: in-review\nheadSha: null\nmodels:\n  - { path: .agents/docs/codebase/payment.md, baseSha: x }\n---\n\n# 현재 상태\n", encoding="utf-8")
        self.commit("intent")
        r = self.py("codebase_check.py", "gate", "INT-1", "--json")
        self.assertEqual(1, r.returncode)
        reasons = json.loads(r.stdout)["reasons"]
        self.assertTrue(any("열린 질문 1건(Q-1)" in x for x in reasons), reasons)
        self.assertTrue(any("headSha" in x for x in reasons), reasons)
        (folder / "questions.md").write_text(QUESTIONS.format(answer=" A"), encoding="utf-8")
        cs.write_text(cs.read_text(encoding="utf-8").replace("headSha: null", "headSha: abc1234"), encoding="utf-8")
        r = self.py("codebase_check.py", "gate", "INT-1", "--json")
        self.assertEqual(0, r.returncode, r.stdout)
        self.assertEqual([("current-state.md", ".agents/docs/intents/INT-1-payment-method/current-state.md"), (".agents/docs/codebase/payment.md",) * 2],
                         [(f["name"], f["path"]) for f in json.loads(r.stdout)["files"]])
        (self.root / "pay/big.py").write_text("x = 1\n" * 300)
        self.commit("big")
        r = self.py("codebase_check.py", "gate", "INT-1", "--json")
        self.assertEqual(1, r.returncode)
        out = json.loads(r.stdout)
        self.assertEqual(([], ".agents/docs/codebase/payment.md"), (out["reasons"], out["stale"][0]["path"]))
        (folder / "intent.md").write_text(INTENT.replace("kind: change", "kind: product"), encoding="utf-8")
        self.assertTrue(any("feature · change · refactor" in x for x in json.loads(self.py("codebase_check.py", "gate", "INT-1", "--json").stdout)["reasons"]))


if __name__ == "__main__":
    unittest.main()
