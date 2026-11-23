"""킷 템플릿에 에이전트에게 전체 검증(full)을 지시 · 권고하는 문장이 없는지 센다(HK-7, 설계 01 R6.1 · R6.2).

    python3 -m unittest tests.test_template_wording
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

KIT = Path(__file__).resolve().parents[1]
TEMPLATES = KIT / "packages/templates"

# 에이전트에게 full 을 시키거나 권하는 문형.
DIRECTIVES = [
    re.compile(r"--full`?\s*(로|으로)\s*(명시|선택)"),
    re.compile(r"full[은는]\s*`?(bash scripts/verify\.sh )?--full`?\s*(로|으로)"),
    re.compile(r"opt in to full"),
    re.compile(r"full을\s*권고"),
    re.compile(r"or full\b"),
    re.compile(r"전체 검증은\s*(명시적으로\s*)?선택"),
    re.compile(r"full\s*선택\s*/\s*이유"),
    re.compile(r"--full을 명시하십시오"),
]
# 레벨 정의 · CI · 차단 안내 자체는 센다 대상이 아니다.
EXEMPT = (
    "agents-rules/verification-ladder.md",
    "scripts/hooks/block_full_verify.py",
    "scripts/hooks/block-full-verify.sh",
    "kiro-hooks/harness-block-full-verify.json",
    "/ci/",
    ".gitlab-ci",
    ".github/workflows",
)
TEXT_SUFFIXES = {".md", ".sh", ".py", ".json", ".toml", ".yml", ".yaml", ""}


def offending_lines() -> list[str]:
    hits: list[str] = []
    for path in sorted(TEMPLATES.rglob("*")):
        if not path.is_file() or path.suffix not in TEXT_SUFFIXES:
            continue
        rel = path.relative_to(TEMPLATES).as_posix()
        if any(token in rel for token in EXEMPT) or "/tests/" in f"/{rel}" or path.name.startswith("test_"):
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for number, line in enumerate(lines, 1):
            if any(p.search(line) for p in DIRECTIVES):
                hits.append(f"{rel}:{number}: {line.strip()[:120]}")
    return hits


class TemplateWordingTest(unittest.TestCase):
    def test_no_full_directives_for_agents(self):
        hits = offending_lines()
        self.assertEqual(hits, [], "에이전트에게 full을 지시하는 문장:\n" + "\n".join(hits))

    def test_spec_templates_use_affected_column(self):
        for stage in ("tasks", "design"):
            body = (TEMPLATES / f"common/agents-docs/_spec-templates/{stage}/_template.md").read_text(encoding="utf-8")
            with self.subTest(stage=stage):
                self.assertIn("affected 결과 · CI full 링크", body)


if __name__ == "__main__":
    unittest.main()
