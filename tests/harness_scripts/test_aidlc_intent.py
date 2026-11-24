"""AI-DLC 를 켠 Intent(intent.json + units.json, 설계 08 §3.10 · 10 §3.2)의 검사와 `/kns-specify --from-unit`(HK-20, 완료 기준 3).

    python3 -m unittest discover -s scripts/tests -p "test_aidlc_intent.py"

킷 설계(intent.md)와 AI-DLC 설계(intent.json)에서 같은 Unit 목록으로 from_unit 을 돌려 requirements 의 절 구성이 같은지 본다.
"""

import json
import re
import shutil
import subprocess
import sys
import unittest

from sdd_fixture import SddCase

KIT_INTENT = """---
id: INT-1
title: 할 일 동기화
status: approved
flow: kit
kind: product
profile: product
risk: low
areas: [ledger, cli]
jira: null
answersSha256: null
created: 2026-11-24
---

# Intent INT-1 — 할 일 동기화

## 1. 목표

(이 Intent가 끝나면 사용자가 얻는 결과)

## 2. 범위 밖

(하지 않는 것)

## 6. 스토리와 수용 기준

### S-1 할 일 추가
- 스토리: 사용자로서 할 일을 추가한다.
- 도메인: cli

### S-2 동기화
- 스토리: 사용자로서 동기화한다.
- 도메인: cli
"""

BASE = {"dependsOn": [], "provides": [], "consumes": [], "nfr": [], "risks": [], "issue": None, "planned": True, "repo": None}


def units(doc, source, stories, extra=None):
    row = lambda i, **kw: {**BASE, "id": f"U-{i}", "name": f"u{i}-x", "title": f"유닛 {i}", "kind": "feature", "area": "cli", "order": i, **kw, **(extra or {})}
    return {"schema": "knots-sync.units/v1", "intent": {"key": "INT-1", "title": "할 일 동기화", "doc": doc}, "source": source,
            "decomposition": {"stories": 2, "domains": 0, "userTypes": 0, "integrations": 0, "split": True, "reasons": ["aidlc"]} if doc == "intent.json" else {"stories": 2, "domains": 1, "userTypes": 1, "integrations": 0, "split": False, "reasons": []},
            "units": [row(1, stories=stories[0]), row(2, stories=stories[1], dependsOn=["U-1"])] if doc == "intent.json" else [row(1, stories=stories[0] + stories[1])],
            "unassigned": []}


class AidlcIntentTest(SddCase):
    def setUp(self):
        super().setUp()
        meta = self.root / ".agents/knots-sync.json"
        data = json.loads(meta.read_text())
        data["flow"] = {"gates": ["requirements", "design", "tasks", "mr", "done"]}
        meta.write_text(json.dumps(data))
        shutil.rmtree(self.root / ".agents/docs/intents", ignore_errors=True)
        for args in (("init", "-q"), ("add", "-A"), ("commit", "-q", "-m", "init")):
            subprocess.run(["git", *args], cwd=self.root, env=self.env, check=True, capture_output=True)

    def make(self, name, files):
        folder = self.root / ".agents/docs/intents" / name
        folder.mkdir(parents=True)
        for rel, body in files.items():
            (folder / rel).write_text(body if isinstance(body, str) else json.dumps(body, ensure_ascii=False), encoding="utf-8")
        return folder

    def run_py(self, script, *args):
        r = subprocess.run([sys.executable, "-B", f"scripts/harness/{script}", *args], cwd=self.root, env=self.env, capture_output=True, text=True, timeout=120)
        return r.returncode, r.stdout, r.stderr

    def aidlc_folder(self):
        link = {"schema": "knots-sync.intent-link/v1", "key": "INT-1", "title": "할 일 동기화", "source": "aidlc",
                "aidlc": {"space": "default", "intent": "261124-todo-sync", "path": "aidlc/spaces/default/intents/261124-todo-sync/", "version": "2.11.4"},
                "adapter": {"name": "knots-sync/aidlc", "version": "2.0.0", "inputSha256": "x", "adaptedAt": "2026-11-24T00:00:00Z"},
                "stories": [{"id": "US1.1", "title": "할 일 추가"}, {"id": "US1.2", "title": "동기화"}]}
        return self.make("INT-1-todo-sync", {"intent.json": link, "units.json": units("intent.json", {"kind": "aidlc", "path": "x/", "inputSha256": "x"}, [["US1.1"], ["US1.2"]])})

    def test_check_reads_aidlc_stories_and_skips_decomposition(self):
        folder = self.aidlc_folder()
        code, out, err = self.run_py("intent.py", "check", str(folder), "--json")
        self.assertEqual(0, code, out + err)
        body = json.loads(out)
        self.assertEqual([], body["problems"])
        # 스토리가 intent.json 에 없으면 DS-R8 이 잡는다
        link = json.loads((folder / "intent.json").read_text())
        link["stories"] = [{"id": "US1.1", "title": "할 일 추가"}]
        (folder / "intent.json").write_text(json.dumps(link), encoding="utf-8")
        code, out, err = self.run_py("intent.py", "check", str(folder), "--json")
        self.assertEqual(1, code, out + err)
        self.assertTrue(any("US1.2" in p for p in json.loads(out)["problems"]))

    def test_next_step_points_to_aidlc(self):
        meta = self.root / ".agents/knots-sync.json"
        data = json.loads(meta.read_text())
        data["flow"] = {**data["flow"], "design": "aidlc"}
        meta.write_text(json.dumps(data))
        folder = self.aidlc_folder()
        code, out, err = self.run_py("intent.py", "next", str(folder), "--json")
        self.assertEqual(0, code, err)
        self.assertEqual("aidlc", json.loads(out)["step"])

    def from_unit(self, target):
        code, out, err = self.run_py("from_unit.py", target, "--json")
        return code, json.loads(out or "{}") if out.strip() else {"error": err}

    def headings(self, issue_path):
        text = (self.root / issue_path).read_text(encoding="utf-8")
        block = text[text.index("<!-- FROM-UNIT:BEGIN"):text.index("<!-- FROM-UNIT:END -->")]
        return [line for line in block.splitlines() if re.match(r"^#{2,3} ", line)]

    def test_from_unit_requirements_sections_match_the_kit_flow(self):
        kit = self.make("INT-1-todo-sync", {"intent.md": KIT_INTENT, "units.json": units("intent.md", {"kind": "kit"}, [["S-1"], ["S-2"]])})
        code, out = self.from_unit("INT-1/U-1")
        self.assertEqual(0, code, out)
        kit_headings = self.headings(out["path"])
        shutil.rmtree(kit)
        shutil.rmtree(self.root / ".agents/docs/issues", ignore_errors=True)
        self.aidlc_folder()
        code, out = self.from_unit("INT-1/U-1")
        self.assertEqual(0, code, out)
        aidlc_headings = self.headings(out["path"])
        self.assertEqual(["## Intent 에서 옮긴 것", "### 스토리(US-n 은 이 이슈 번호, 괄호는 Intent ID)", "### 범위 밖"][:2], aidlc_headings[:2])
        self.assertEqual(kit_headings[:2], aidlc_headings[:2])
        text = (self.root / out["path"]).read_text(encoding="utf-8")
        self.assertIn("#### US-1 (US1.1) 할 일 추가", text)
        self.assertIn("- US1.2 → U-2 에서 다룬다", text)
        data = json.loads((self.root / ".agents/docs/intents/INT-1-todo-sync/units.json").read_text())
        self.assertEqual("DEMO-1", data["units"][0]["issue"])


if __name__ == "__main__":
    unittest.main()
