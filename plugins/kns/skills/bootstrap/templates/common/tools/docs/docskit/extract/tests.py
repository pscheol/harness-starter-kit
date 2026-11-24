"""시험 파일과 시험 수. 기능 배정은 파일 경로·패키지로 한다."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

SKIP_DIRS = {"node_modules", "build", ".gradle", ".venv", ".venv-verify", "dist", ".next", "__pycache__", ".dart_tool", "release", ".build"}
JVM_TEST = re.compile(r"@(?:Test|ParameterizedTest|RepeatedTest|TestFactory)\b")
KOTEST_SPEC = re.compile(r"\b(FunSpec|DescribeSpec|BehaviorSpec|StringSpec|ShouldSpec|WordSpec|FreeSpec|FeatureSpec|ExpectSpec)\b")
KOTEST_LEAF = re.compile(r"(?<![\w.])(?:test|it|then|Then|should|expect|scenario|xtest|xit)\s*\(\s*\"")
KOTEST_STRING = re.compile(r"^\s*\"[^\"\n]+\"\s*(?:\.config\([^)]*\))?\s*\{", re.M)
PY_TEST = re.compile(r"^\s*(?:async\s+)?def\s+test_\w+", re.M)
TS_TEST = re.compile(r"(?<![\w.])(?:it|test)(?:\.each\([^)]*\))?\s*\(\s*['\"`]")
DART_TEST = re.compile(r"(?<![\w.])(?:test|testWidgets|patrolTest)\s*\(\s*['\"]")
PACKAGE_RE = re.compile(r"^\s*package\s+([\w.]+)", re.M)


@dataclass
class TestFile:
    unit: str
    path: str
    kind: str  # unit | integration | e2e | contract
    language: str
    count: int
    package: str


def _kotlin_count(text: str) -> int:
    count = len(JVM_TEST.findall(text))
    spec = KOTEST_SPEC.search(text)
    if spec:
        count += len(KOTEST_LEAF.findall(text))
        if spec.group(1) in ("StringSpec", "FreeSpec", "WordSpec"):
            count += len(KOTEST_STRING.findall(text))
    return count


def _kind(path: str, name: str) -> str:
    lower = path.lower()
    if "/e2e/" in lower or name.endswith(".spec.ts") or "integration_test/" in lower:
        return "e2e"
    if name.endswith(("IT.kt", "IntegrationTest.kt")) or "/integration/" in lower:
        return "integration"
    if "contract" in lower:
        return "contract"
    return "unit"


def _walk(base: Path):
    """빌드 산출물·의존성 폴더는 들어가기 전에 자른다."""
    if not base.exists():
        return
    for current, dirs, names in os.walk(base):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith("."))
        for name in sorted(names):
            yield Path(current) / name


def collect(unit: str, kind: str, root: Path, repo: Path, test_dirs: list[str] | None = None) -> list[TestFile]:
    files: list[TestFile] = []
    for path in _walk(root):
        rel = path.relative_to(repo).as_posix()
        name = path.name
        text: str | None = None
        if kind == "jvm" and "/src/test/" in rel and name.endswith(".kt"):
            text = path.read_text(encoding="utf-8", errors="replace")
            count, language = _kotlin_count(text), "kotlin"
        elif kind == "python" and name.startswith("test_") and name.endswith(".py"):
            if test_dirs and not any(rel.startswith((root / d).relative_to(repo).as_posix() + "/") for d in test_dirs):
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            count, language = len(PY_TEST.findall(text)), "python"
        elif kind in ("web", "electron", "extension") and re.search(r"\.(test|spec)\.(ts|tsx|js)$", name):
            text = path.read_text(encoding="utf-8", errors="replace")
            count, language = len(TS_TEST.findall(text)), "typescript"
        elif kind == "flutter" and name.endswith("_test.dart"):
            text = path.read_text(encoding="utf-8", errors="replace")
            count, language = len(DART_TEST.findall(text)), "dart"
        else:
            continue
        if count == 0:
            continue
        pkg = PACKAGE_RE.search(text)
        files.append(TestFile(unit, rel, _kind(rel, name), language, count, pkg.group(1) if pkg and language == "kotlin" else ""))
    return files
