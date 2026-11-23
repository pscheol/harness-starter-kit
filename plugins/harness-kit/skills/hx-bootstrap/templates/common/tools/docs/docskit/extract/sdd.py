"""하네스마다 SDD 이슈를 읽는다. 백로그 추적에 쓴다.

- 새 구조: `.agents/docs/issues/<키>-<이름>/{requirements,design,tasks}.md`, 상태는 문서 머리(`status` · tasks 는 `state`).
- 옛 구조(읽기 전용): `<slug>-specs/issues/<번호-종류-이름>/` 이슈 폴더와 `<slug>-specs/{requirements,design,tasks/<상태>}/` 단계 폴더.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

KEY_RE = re.compile(r"^(\d+)-(feat|fix|refactor|perf|chore|docs)-(.+)$")
FOLDER_RE = re.compile(r"^([A-Z][A-Z0-9]{1,9})-([1-9][0-9]{0,5})-(.+)$")
HEAD_LINE_RE = re.compile(r"^([a-z][a-zA-Z0-9]*):\s*(.*?)(\s+#.*)?$")
STATES = ("completed", "check", "active", "superseded")
TITLE_RE = re.compile(r"^#\s+(?:Requirements|Design|Tasks)\s*[—-]\s*(.+)$", re.M)
STAGE_DOCS = ("requirements.md", "design.md", "tasks.md")


@dataclass
class Issue:
    harness: str
    slug: str  # 옛 구조는 제품 slug, 새 구조는 영역(area)
    key: str
    number: int
    type: str
    name: str
    title: str
    status: str  # requirements | design | active | check | completed | superseded
    path: str
    legacy: bool = True

    @property
    def ref(self) -> str:
        """catalog `sdd` 패턴이 보는 값."""
        if self.legacy:
            return f"{self.harness}:{self.slug}-specs/{self.key}"
        return f"{self.harness}:issues/{self.slug}/{self.key}"


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _title(text: str, fallback: str) -> str:
    m = TITLE_RE.search(text[:2000])
    return m.group(1).strip() if m else fallback


def _head(text: str) -> dict[str, str]:
    """문서 머리의 `이름: 값` 줄. 머리가 없거나 닫히지 않았으면 빈 사전이다. 형식 검사는 fast 검사가 맡는다."""
    lines = text.split("\n")
    if not lines or lines[0].rstrip("\r") != "---":
        return {}
    fields: dict[str, str] = {}
    for raw in lines[1:]:
        line = raw.rstrip("\r")
        if line == "---":
            return fields
        m = HEAD_LINE_RE.match(line)
        if m:
            value = m.group(2).strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            fields.setdefault(m.group(1), value)
    return {}


def _issue(harness: str, slug: str, key: str, status: str, doc: Path, repo: Path) -> Issue | None:
    m = KEY_RE.match(key)
    if not m:
        return None
    return Issue(harness, slug, key, int(m.group(1)), m.group(2), m.group(3), _title(_read(doc), m.group(3)), status, doc.relative_to(repo).as_posix())


def _new_issue(harness: str, folder: Path, repo: Path) -> Issue | None:
    m = FOLDER_RE.match(folder.name)
    docs = [folder / name for name in STAGE_DOCS if (folder / name).is_file()]
    if not m or not docs:
        return None
    text = _read(docs[0])
    head = _head(text)
    state = _head(_read(folder / "tasks.md")).get("state", "") if (folder / "tasks.md").is_file() else ""
    if state in STATES:
        status = state
    else:
        status = "design" if (folder / "design.md").is_file() else "requirements"
    name = m.group(3)
    return Issue(
        harness,
        head.get("area") or "-",
        folder.name,
        int(m.group(2)),
        head.get("type") or "feat",
        name,
        head.get("title") or _title(text, name),
        status,
        docs[0].relative_to(repo).as_posix(),
        legacy=False,
    )


def _legacy(harness: str, docs: Path, repo: Path, issues: dict[tuple[str, str, str], Issue]) -> None:
    for spec in sorted(docs.glob("*-specs")):
        slug = spec.name[: -len("-specs")]
        for folder in sorted((spec / "issues").glob("*")) if (spec / "issues").is_dir() else []:
            if not folder.is_dir():
                continue
            tasks = folder / "tasks"
            status = next((s for s in STATES if (tasks / f"{s}.md").is_file()), "")
            if not status:
                status = "design" if (folder / "design.md").is_file() else "requirements"
            doc = folder / "requirements.md" if (folder / "requirements.md").is_file() else next(folder.glob("*.md"), folder)
            issue = _issue(harness, slug, folder.name, status, doc, repo)
            if issue:
                issues[(harness, slug, folder.name)] = issue
        found: dict[str, tuple[str, Path]] = {}
        for state in STATES:
            for path in sorted((spec / "tasks" / state).glob("*.md")) if (spec / "tasks" / state).is_dir() else []:
                found.setdefault(path.stem, (state, path))
        for stage, folder in (("design", "design"), ("requirements", "requirements")):
            for path in sorted((spec / folder).glob("*.md")) if (spec / folder).is_dir() else []:
                found.setdefault(path.stem, (stage, path))
        for key, (status, path) in found.items():
            if (harness, slug, key) in issues:
                continue
            req = spec / "requirements" / f"{key}.md"
            issue = _issue(harness, slug, key, status, req if req.is_file() else path, repo)
            if issue:
                issues[(harness, slug, key)] = issue


def collect(repo: Path, harness_paths: list[str]) -> list[Issue]:
    issues: dict[tuple[str, str, str], Issue] = {}
    for harness in harness_paths:
        docs = repo / harness / ".agents" / "docs"
        if not docs.is_dir():
            continue
        for folder in sorted((docs / "issues").iterdir()) if (docs / "issues").is_dir() else []:
            issue = _new_issue(harness, folder, repo) if folder.is_dir() else None
            if issue:
                issues[(harness, issue.slug, issue.key)] = issue
        _legacy(harness, docs, repo, issues)
    return sorted(issues.values(), key=lambda i: (i.harness, i.slug, i.number, i.key))
