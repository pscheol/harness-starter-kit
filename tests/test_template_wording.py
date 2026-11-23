"""킷 템플릿 문구 시험.

- 에이전트에게 전체 검증(full)을 지시 · 권고하는 문장이 없다(HK-7, 설계 01 R6.1 · R6.2).
- 옛 SDD 경로(`<영역>-specs/…`) · 옛 명령 형식이 읽기 전용 설명 밖에 남지 않는다. manifest 파일 수가 템플릿과 같다(HK-9 R9.1).

    python3 -m unittest tests.test_template_wording
"""

from __future__ import annotations

import fnmatch
import json
import re
import unittest
from collections import Counter
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


PACKAGES = KIT / "packages"
# 옛 SDD 경로 · 명령 형식(HK-9 R9.1, 설계 01 §3.7). 새 형식은 `.agents/docs/issues/<키>-<이름>/` · `new-feature.sh <키|--next> <이름> --area <영역>`.
LEGACY_FORMS = [
    re.compile(r"[\w<>{}.-]*-specs\b"),
    re.compile(r"<product-slug>"),
    re.compile(r"\btasks/(active|check|completed|superseded)/"),
    re.compile(r"`(active|check|completed|superseded)/`"),
    re.compile(r"new-feature\.sh\s+<(slug|product-slug|영역|area|제품)>"),
    re.compile(r"new-feature\.sh\s+[a-z][a-z0-9_-]*\s+[a-z<]"),
]
# 옛 구조는 읽기만 한다는 설명 문장. (경로 glob, 줄에 든 문구) — 바꾸거나 더하면 여기도 고친다.
READ_ONLY_EXPLANATIONS = (
    ("templates/common/agents-skills/hx-*/SKILL.md", "옛 `<영역>-specs/` 이슈는 읽기만 한다"),
    ("templates/common/agents-skills/hx-harness/SKILL.md", "옛 `<영역>-specs/` 명세는 읽기만 한다"),
    ("templates/common/agents-rules/sdd-workflow.md", "tasks/<상태>/<키>.md`)는 읽기만 한다"),
    ("templates/common/agents-root/roles/planner.md", "옛 `<영역>-specs/` 명세는 읽기만 한다"),
    ("templates/common/agents-docs/specs-index.md", "옛 구조(`<영역>-specs/`)는 읽기만 한다"),
    ("templates/common/agents-docs/_spec-templates/README.md", "이슈 폴더 · 단계 폴더)는 읽기만 한다"),
    ("templates/common/agents-docs/_spec-templates/tasks/README.md", "tasks/<상태>/`)는 읽기만 한다"),
    ("templates/common/agents-docs/_spec-templates/tasks/_template.md", "옛 구조(`<영역>-specs/`)는 읽기만 한다"),
    ("templates/common/agents-docs/guides/sdd-pattern.md", "tasks/<상태>}/` 는 읽기만 한다"),
    ("templates/common/agents-docs/README.md", "옛 구조(읽기 전용)"),
    ("templates/common/kiro-steering/sdd-workflow.md", "옛 `<영역>-specs/` 는 읽기 전용"),
    ("templates/common/tools/docs/README.md", "옛 구조(읽기 전용)"),
)
DOC_SUFFIXES = {".md", ".json", ".toml", ".yml", ".yaml", ""}


def legacy_scope() -> list[Path]:
    """세는 파일: 템플릿 · 플러그인의 문서(코드는 옛 구조를 읽는 구현이라 뺀다)와 설치 스크립트 전체."""
    paths = [p for p in sorted((PACKAGES / "templates").rglob("*")) if p.is_file() and p.suffix in DOC_SUFFIXES]
    paths += [p for p in sorted((PACKAGES / "plugin").rglob("*")) if p.is_file() and p.suffix in {".md", ".json"}]
    paths += sorted((PACKAGES / "legacy-setup").rglob("*.sh"))
    out = []
    for path in paths:
        rel = path.relative_to(PACKAGES).as_posix()
        if "/tests/" in rel or "/fixtures/" in rel or path.name.startswith("test_"):
            continue
        out.append(path)
    return out


def legacy_lines() -> list[str]:
    hits: list[str] = []
    for path in legacy_scope():
        rel = path.relative_to(PACKAGES).as_posix()
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for number, line in enumerate(lines, 1):
            if not any(p.search(line) for p in LEGACY_FORMS):
                continue
            if any(fnmatch.fnmatch(rel, glob) and phrase in line for glob, phrase in READ_ONLY_EXPLANATIONS):
                continue
            hits.append(f"{rel}:{number}: {line.strip()[:140]}")
    return hits


def install_counts() -> dict[str, Counter]:
    """layout.json 세그먼트로 레이어마다 하네스별 파일 수를 센다(`ignore` 제외)."""
    layout = json.loads((TEMPLATES / "layout.json").read_text(encoding="utf-8"))

    def harness_of(rel: str) -> str:
        for seg in layout["segments"]:
            src = seg["from"]
            if rel == src or ((src == "" or src.endswith("/")) and rel.startswith(src)):
                return seg["harness"] or "core"
        return "core"

    def count(folder: str, skip_arch: bool = False) -> Counter:
        root = TEMPLATES / folder
        found = Counter()
        for path in root.rglob("*"):
            rel = path.relative_to(root).as_posix()
            if not path.is_file() or path.name in layout["ignore"] or (skip_arch and rel.startswith("arch/")):
                continue
            found[harness_of(rel)] += 1
        return found

    stack = count("stacks/jvm", skip_arch=True) + count("stacks/jvm/arch/hexagonal")
    return {
        "common": count("common"),
        "backend": count("common") + stack,
        "frontend": count("common") + count("domains/frontend") + stack,
        **{m: count(f"optional/{m}") for m in ("jira-workflow", "platform-guards", "multi-harness")},
    }


class LegacySddFormTest(unittest.TestCase):
    def test_no_legacy_sdd_forms(self):
        hits = legacy_lines()
        self.assertEqual(hits, [], f"옛 SDD 경로 · 명령 형식 {len(hits)}건:\n" + "\n".join(hits))

    def test_manifest_counts_match_templates(self):
        manifest = (PACKAGES / "plugin/skills/hx-bootstrap/manifest.md").read_text(encoding="utf-8")
        counts = install_counts()
        cols = ("core", "claude", "codex", "cursor", "kiro")
        for group, label in (("backend", "| `jvm` · `python` · `go` |"), ("frontend", "| `web` · `electron` (")):
            c = counts[group]
            row = next((line for line in manifest.splitlines() if line.startswith(label)), "")
            want = " | ".join(str(c[k]) for k in cols) + f" | **{sum(c.values())}** |"
            with self.subTest(group=group):
                self.assertTrue(row.endswith(want), f"manifest 행 {row!r} 이 지금 수 {want!r} 와 다르다")
        for module in ("jira-workflow", "platform-guards", "multi-harness"):
            c = counts[module]
            parts = " · ".join(f"{k} {c[k]}" for k in cols if c[k])
            with self.subTest(module=module):
                self.assertIn(f"| `{module}` | {sum(c.values())} ({parts}) |", manifest)
        self.assertIn(f"`templates/common/` ({sum(counts['common'].values())}개)", manifest)


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
