"""위임 결과 크기 상한 훅(설계 12 §3.8 · MR-R10). Claude SubagentStop 만 등록되고, 넘으면 exit 2 와 한 줄, 통과면 0바이트.

    python3 -m unittest discover -s scripts/tests -p "test_subagent_cap.py"
"""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/hooks/subagent-result-cap.sh"


class SubagentCapTest(unittest.TestCase):
    def hook(self, payload):
        raw = payload if isinstance(payload, str) else json.dumps(payload)
        return subprocess.run(["bash", str(SCRIPT)], input=raw, capture_output=True, text=True, timeout=30, cwd=ROOT)

    def test_long_last_message_is_blocked_once(self):
        r = self.hook({"hook_event_name": "SubagentStop", "last_assistant_message": "가" * 6001})
        self.assertEqual(2, r.returncode)
        self.assertEqual(1, len(r.stderr.strip().splitlines()))
        self.assertIn("6,001자", r.stderr)
        self.assertEqual("", r.stdout)
        again = self.hook({"hook_event_name": "SubagentStop", "stop_hook_active": True, "last_assistant_message": "가" * 9000})
        self.assertEqual((0, "", ""), (again.returncode, again.stdout, again.stderr))

    def test_short_or_unreadable_input_passes_silently(self):
        for payload in ({"last_assistant_message": "결론 한 줄"}, "not json", {"agent_transcript_path": "/nope.jsonl"}):
            r = self.hook(payload)
            self.assertEqual((0, "", ""), (r.returncode, r.stdout, r.stderr), payload)

    def test_reads_only_the_given_agent_transcript(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "agent-1.jsonl"
            rows = [{"type": "user", "message": {"content": "일"}},
                    {"type": "assistant", "message": {"content": [{"type": "text", "text": "나" * 7000}]}}]
            path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")
            r = self.hook({"hook_event_name": "SubagentStop", "agent_transcript_path": str(path)})
            self.assertEqual(2, r.returncode, r.stderr)

    def test_registered_only_for_claude_subagent_stop(self):
        settings = json.loads((ROOT / ".claude/settings.json").read_text(encoding="utf-8")) if (ROOT / ".claude/settings.json").is_file() else {}
        commands = [h["command"] for group in settings.get("hooks", {}).get("SubagentStop", []) for h in group.get("hooks", [])]
        self.assertTrue(any("subagent-result-cap.sh" in c for c in commands), commands)
        codex = (ROOT / ".codex/hooks.json")
        if codex.is_file():
            self.assertNotIn("subagent-result-cap", codex.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
