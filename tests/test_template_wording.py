"""킷 템플릿 문구 시험.

- 에이전트에게 전체 검증(full)을 지시 · 권고하는 문장이 없다(HK-7, 설계 01 R6.1 · R6.2).
- 옛 SDD 경로(`<영역>-specs/…`) · 옛 명령 형식이 읽기 전용 설명 밖에 남지 않는다. manifest 파일 수가 템플릿과 같다(HK-9 R9.1).
- "커밋 · 푸시 전에 full" 문형이 없고 진입 파일이 커지지 않는다. README 에 낡을 수 있는 파일 수 표가 없다.
  스킬 절차가 kit.sh(CLI · v1 스크립트 갈래)를 부르고, 세션에 실리는 description 이 늘지 않는다(HK-12 R12.4 · R12.5 · R12.7 · R12.8).

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
    ("templates/UPGRADE.md", "옛 `<영역>-specs/` 는 읽기 전용이다"),
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


# 선택 모듈(layout.json modules). platform-guards 는 HK-25 에서 없앴다 — 파일이 공통 층과 같다.
MODULES = ("jira-workflow", "multi-harness")


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
            if not path.is_file() or path.name in layout["ignore"] or "__pycache__" in path.parts or path.suffix == ".pyc" or (skip_arch and rel.startswith("arch/")):
                continue
            found[harness_of(rel)] += 1
        return found

    stack = count("stacks/jvm", skip_arch=True) + count("stacks/jvm/arch/hexagonal")
    return {
        "common": count("common"),
        "backend": count("common") + stack,
        "frontend": count("common") + count("domains/frontend") + stack,
        **{m: count(f"optional/{m}") for m in MODULES},
    }


class RetiredModuleTest(unittest.TestCase):
    """platform-guards 모듈을 없앴다(HK-25 R2). 모듈 목록 · 템플릿 · 설치 문서에 이름이 남지 않는다."""

    def test_layout_and_templates_have_no_platform_guards(self):
        layout = json.loads((TEMPLATES / "layout.json").read_text(encoding="utf-8"))
        self.assertEqual(tuple(layout["modules"]), MODULES)
        self.assertFalse((TEMPLATES / "optional/platform-guards").exists())

    def test_docs_do_not_list_platform_guards(self):
        roots = [KIT / "packages/plugin", TEMPLATES, KIT / "README.md", KIT / "docs/guides", KIT / "docs/design/02-cli-engine.md"]
        hits = []
        for root in roots:
            for path in [root] if root.is_file() else sorted(root.rglob("*")):
                if path.is_file() and path.suffix in (".md", ".sh", ".json"):
                    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                        if "platform-guards" in line and "공통 층" not in line and "없앴" not in line and "없앤" not in line:
                            hits.append(f"{path.relative_to(KIT)}:{number}: {line.strip()[:120]}")
        self.assertEqual(hits, [], "\n".join(hits))


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
        for module in MODULES:
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


# "커밋 · 푸시 전에 full(전체)을 돌린다" 문형(HK-12 R12.7). MR 전에는 --affected, full 은 CI 가 돈다.
_SAME_SENTENCE = r"(?:(?![.。] )[^\n])"  # 문장 끝(". ")을 넘지 않는 한 글자
BEFORE_COMMIT = [
    re.compile(rf"(커밋|푸시){_SAME_SENTENCE}{{0,12}}전{_SAME_SENTENCE}{{0,40}}(full|전체)"),
    re.compile(rf"(full|전체){_SAME_SENTENCE}{{0,40}}(커밋|푸시){_SAME_SENTENCE}{{0,8}}전"),
]
# 이 판 전(d385454) 스택마다 AGENTS.md + CLAUDE.md 바이트. 진입 파일은 세션마다 읽힌다(README 원칙 10).
ENTRY_BYTES = {"jvm": 7802, "python": 8046, "go": 8470, "web": 9504, "electron": 9910}


def before_commit_lines() -> list[str]:
    paths = [p for p in sorted(TEMPLATES.rglob("*")) if p.is_file() and p.suffix in TEXT_SUFFIXES]
    paths += sorted((PACKAGES / "legacy-setup").rglob("*.sh")) + sorted((PACKAGES / "plugin").rglob("*.md"))
    hits: list[str] = []
    for path in paths:
        rel = path.relative_to(PACKAGES).as_posix()
        if any(token in rel for token in EXEMPT) or "/tests/" in f"/{rel}" or path.name.startswith("test_"):
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for number, line in enumerate(lines, 1):
            if any(p.search(line) for p in BEFORE_COMMIT):
                hits.append(f"{rel}:{number}: {line.strip()[:120]}")
    return hits


class FullBeforeCommitTest(unittest.TestCase):
    def test_no_full_before_commit_or_push(self):
        hits = before_commit_lines()
        self.assertEqual(hits, [], f"커밋 · 푸시 전에 full 을 시키는 문장 {len(hits)}건:\n" + "\n".join(hits))

    def test_pattern_catches_old_wording(self):
        old = "빌드·테스트를 포함한 `full`은 커밋·푸시 전에 직접 `bash scripts/verify.sh`를 실행해 통과시킨다"
        self.assertTrue(any(p.search(old) for p in BEFORE_COMMIT))
        self.assertTrue(any(p.search("커밋 전에는 반드시 `scripts/verify.sh` 전체를 돌린다") for p in BEFORE_COMMIT))
        self.assertFalse(any(p.search("MR 전에는 `bash scripts/verify.sh --affected`, `full`은 CI가 돈다") for p in BEFORE_COMMIT))

    def test_entry_files_do_not_grow(self):
        # CLAUDE.md 는 템플릿이 아니라 배치가 만든다: @AGENTS.md + 킷 블록(HK-13 R4, design §5.1).
        spec = json.loads((TEMPLATES / "common/scripts/harness/projection.json").read_text(encoding="utf-8"))
        claude_md = ("@AGENTS.md\n\n" + "\n".join(spec["claudeBlock"]) + "\n").encode("utf-8")
        self.assertLessEqual(len(claude_md) - len("@AGENTS.md\n\n"), 1536)
        for stack, limit in ENTRY_BYTES.items():
            root = TEMPLATES / "stacks" / stack / "root"
            self.assertFalse((root / "CLAUDE.md").exists(), f"{stack}: CLAUDE.md 템플릿이 남았다")
            size = len((root / "AGENTS.md").read_bytes()) + len(claude_md)
            with self.subTest(stack=stack):
                self.assertLessEqual(size, limit)
                self.assertIn("--affected", (root / "AGENTS.md").read_text(encoding="utf-8"))


class ReadmeCountTest(unittest.TestCase):
    """파일 수의 원본은 manifest 하나다(시험이 템플릿과 맞춘다). README 는 그곳을 가리킨다(HK-12 R12.8)."""

    def test_readme_points_to_manifest_instead_of_own_counts(self):
        readme = (KIT / "README.md").read_text(encoding="utf-8")
        self.assertIsNone(re.search(r"^\| `jvm` · `python` · `go` \| \d+", readme, re.M), "README 에 파일 수 표가 남았다")
        self.assertIsNone(re.search(r"`multi-harness` \d+", readme), "README 에 모듈 파일 수가 남았다")
        self.assertIn("plugins/harness-kit/skills/hx-bootstrap/manifest.md", readme)
        self.assertIn("harness-kit plan --json", readme)
        manifest = (PACKAGES / "plugin/skills/hx-bootstrap/manifest.md").read_text(encoding="utf-8")
        self.assertIn("## 에이전트 선택", manifest)


# 스킬 · 커맨드 → (description 바이트 상한 = 이 판 전 값, 내려가는 v1 스크립트)
SKILL_DOCS = {
    "skills/hx-bootstrap/SKILL.md": (1661, "setup.sh"),
    "skills/hx-update/SKILL.md": (548, "update.sh"),
    "skills/hx-agent-add/SKILL.md": (547, "add-agent.sh"),
    "commands/bootstrap.md": (210, "setup.sh"),
    "commands/update.md": (141, "update.sh"),
    "commands/agent-add.md": (180, "add-agent.sh"),
}
KIT_CALL = re.compile(r'bash "\$SKILL_DIR/(\.\./hx-bootstrap/)?kit\.sh" (init|plan|update|add|remove)\b')


class SkillProcedureTest(unittest.TestCase):
    """스킬 절차가 kit.sh 로 CLI 를 부르고 Node 가 없을 때 갈래를 적는다. description 은 늘지 않는다(HK-12 R12.4 · R12.5)."""

    def test_procedures_call_kit_sh_and_document_fallback(self):
        for rel, (_limit, legacy) in SKILL_DOCS.items():
            body = (PACKAGES / "plugin" / rel).read_text(encoding="utf-8")
            with self.subTest(doc=rel):
                self.assertRegex(body, KIT_CALL)
                self.assertIn("bin/harness-kit.js", body)
                self.assertIn("Node 18.3", body)
                self.assertIn(legacy, body)
                self.assertIn("--json", body)
                self.assertIn("exit 4", body)

    def test_descriptions_do_not_grow(self):
        for rel, (limit, _legacy) in SKILL_DOCS.items():
            text = (PACKAGES / "plugin" / rel).read_text(encoding="utf-8")
            desc = re.search(r"^description:\s*(.*)$", text, re.M)
            with self.subTest(doc=rel):
                self.assertIsNotNone(desc)
                self.assertLessEqual(len(desc[1].encode("utf-8")), limit)

    def test_kit_skill_descriptions_stay_within_300_chars(self):
        for skill in sorted((TEMPLATES / "common/agents-skills").glob("*/SKILL.md")):
            desc = re.search(r"^description:\s*(.*)$", skill.read_text(encoding="utf-8"), re.M)
            with self.subTest(skill=skill.parent.name):
                self.assertIsNotNone(desc)
                self.assertLessEqual(len(desc[1]), 300)


if __name__ == "__main__":
    unittest.main()
