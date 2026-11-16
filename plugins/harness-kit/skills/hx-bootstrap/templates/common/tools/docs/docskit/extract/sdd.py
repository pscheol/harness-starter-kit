"""하네스마다 SDD 이슈(새 이슈 폴더 · legacy 단계 폴더)를 읽는다. 백로그 추적에 쓴다."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

KEY_RE = re.compile(r"^(\d+)-(feat|fix|refactor|perf|chore|docs)-(.+)$")
STATES = ("completed", "check", "active", "superseded")
TITLE_RE = re.compile(r"^#\s+(?:Requirements|Design|Tasks)\s*[—-]\s*(.+)$", re.M)


@dataclass
class Issue:
    harness: str
    slug: str
    key: str
    number: int
    type: str
    name: str
    title: str
    status: str  # requirements | design | active | check | completed | superseded
    path: str

    @property
    def ref(self) -> str:
        return f"{self.harness}:{self.slug}-specs/{self.key}"


def _title(path: Path, fallback: str) -> str:
    try:
        m = TITLE_RE.search(path.read_text(encoding="utf-8", errors="replace")[:2000])
    except OSError:
        return fallback
    return m.group(1).strip() if m else fallback


def _issue(harness: str, slug: str, key: str, status: str, doc: Path, repo: Path) -> Issue | None:
    m = KEY_RE.match(key)
    if not m:
        return None
    return Issue(harness, slug, key, int(m.group(1)), m.group(2), m.group(3), _title(doc, m.group(3)), status, doc.relative_to(repo).as_posix())


def collect(repo: Path, harness_paths: list[str]) -> list[Issue]:
    issues: dict[tuple[str, str, str], Issue] = {}
    for harness in harness_paths:
        docs = repo / harness / ".agents" / "docs"
        if not docs.is_dir():
            continue
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
    return sorted(issues.values(), key=lambda i: (i.harness, i.slug, i.number, i.key))
