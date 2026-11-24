"""기능 목록(`_src/catalog.json`)과 배정 규칙.

배정 우선순위: 명시 목록(operations·tables·caches) > 패턴(packages·modules·routes·paths) 가운데 가장 구체적인 것.
구체성이 같은 두 기능이 한 항목에 맞으면 중복 배정으로 본다.
"""

from __future__ import annotations

import fnmatch
import json
import re
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Area:
    id: str
    name: str
    order: int
    summary: str = ""


@dataclass
class Feature:
    id: str
    name: str
    area: str
    summary: str
    units: dict[str, dict] = field(default_factory=dict)  # 단위 id → {packages, modules, routes, paths}
    operations: list[str] = field(default_factory=list)
    tables: list[str] = field(default_factory=list)
    caches: list[str] = field(default_factory=list)
    sdd: list[str] = field(default_factory=list)
    links: list[str] = field(default_factory=list)

    @property
    def number(self) -> str:
        return self.id.split("-", 1)[1] if "-" in self.id else self.id


@dataclass
class Catalog:
    areas: list[Area]
    features: list[Feature]

    def feature(self, feature_id: str) -> Feature:
        return next(f for f in self.features if f.id == feature_id)

    def area(self, area_id: str) -> Area:
        return next(a for a in self.areas if a.id == area_id)

    def ordered(self) -> list[Feature]:
        order = {a.id: a.order for a in self.areas}
        return sorted(self.features, key=lambda f: (order.get(f.area, 999), f.id))


RESERVED = {"operations", "tables", "caches", "sdd", "links"}


def load(path: Path) -> Catalog:
    raw = json.loads(path.read_text(encoding="utf-8"))
    areas = [Area(a["id"], a["name"], a.get("order", 0), a.get("summary", "")) for a in raw.get("areas", [])]
    features = []
    for f in raw.get("features", []):
        match = f.get("match", {})
        features.append(
            Feature(
                id=f["id"],
                name=f["name"],
                area=f["area"],
                summary=f.get("summary", ""),
                units={k: v for k, v in match.items() if k not in RESERVED},
                operations=list(match.get("operations", [])),
                tables=list(match.get("tables", [])),
                caches=list(match.get("caches", [])),
                sdd=list(match.get("sdd", [])),
                links=list(match.get("links", [])),
            )
        )
    return Catalog(areas, features)


def package_score(pattern: str, package: str) -> int:
    """패키지 패턴(`*` 한 마디, `**` 여러 마디)이 패키지의 앞부분에 맞으면 구체성 점수, 아니면 0."""
    parts = pattern.split(".")
    target = package.split(".")

    def match(i: int, j: int) -> bool:
        if i == len(parts):
            return True
        if parts[i] == "**":
            return any(match(i + 1, k) for k in range(j, len(target) + 1))
        if j >= len(target):
            return False
        return fnmatch.fnmatchcase(target[j], parts[i]) and match(i + 1, j + 1)

    if not match(0, 0):
        return 0
    return sum(2 if p not in ("*", "**") else 1 for p in parts if p != "**")


def glob_score(pattern: str, value: str) -> int:
    """경로·라우트 glob(`**` 여러 마디). 맞으면 고정 마디 수로 구체성을 매긴다."""
    regex = re.escape(pattern).replace(r"\*\*", ".*").replace(r"\*", "[^/]*")
    if re.fullmatch(regex, value) is None:
        return 0
    return 1 + len([p for p in pattern.split("/") if p and "*" not in p])


@dataclass
class Assignment:
    feature: str | None
    reason: str
    conflicts: list[str] = field(default_factory=list)


def choose(candidates: list[tuple[int, str, str]]) -> Assignment:
    """(점수, 기능, 근거) 목록에서 가장 구체적인 하나. 같은 점수의 다른 기능이 있으면 충돌."""
    hits = [c for c in candidates if c[0] > 0]
    if not hits:
        return Assignment(None, "")
    best = max(h[0] for h in hits)
    top = sorted({(h[1], h[2]) for h in hits if h[0] == best})
    features = sorted({f for f, _ in top})
    if len(features) > 1:
        return Assignment(None, "", features)
    return Assignment(features[0], top[0][1])


def assign_package(catalog: Catalog, unit: str, package: str, key: str = "packages") -> Assignment:
    candidates = []
    for f in catalog.features:
        for pattern in f.units.get(unit, {}).get(key, []):
            candidates.append((package_score(pattern, package), f.id, pattern))
    return choose(candidates)


def assign_glob(catalog: Catalog, unit: str, value: str, key: str) -> Assignment:
    candidates = []
    for f in catalog.features:
        for pattern in f.units.get(unit, {}).get(key, []):
            candidates.append((glob_score(pattern, value), f.id, pattern))
    return choose(candidates)


def assign_explicit(catalog: Catalog, attribute: str, value: str) -> Assignment:
    owners = [f.id for f in catalog.features if value in getattr(f, attribute)]
    if len(owners) > 1:
        return Assignment(None, "", owners)
    return Assignment(owners[0], "명시") if owners else Assignment(None, "")
