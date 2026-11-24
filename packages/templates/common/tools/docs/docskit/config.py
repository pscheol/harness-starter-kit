"""문서 설정(`_src/docs.config.json`) 읽기. 단위·원본 경로·DB·중계 규칙을 담는다."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class OpenApiSource:
    name: str
    source: str


@dataclass(frozen=True)
class Relay:
    prefix: str
    to_unit: str
    to_prefix: str


@dataclass(frozen=True)
class Unit:
    id: str
    title: str
    kind: str  # jvm | python | web | flutter | electron | extension | other
    root: str
    openapi: tuple[OpenApiSource, ...] = ()
    relays: tuple[Relay, ...] = ()
    api_unit: str = ""
    sources: tuple[str, ...] = ()
    tests: tuple[str, ...] = ()
    idempotency: str = ""  # Idempotency-Key 를 받는 operation 목록(enum 파일). 단위 root 기준
    api_calls: tuple[dict, ...] = ()  # 화면 코드의 API 호출 형태(web 단위). docskit/extract/web_routes.py


@dataclass(frozen=True)
class Database:
    id: str
    target: str
    migrations: tuple[str, ...]


@dataclass
class Config:
    repo: Path
    site: Path
    title: str
    units: list[Unit] = field(default_factory=list)
    databases: list[Database] = field(default_factory=list)
    fingerprint_script: str = "scripts/schema-fingerprint.sh"
    catalog_sql: str = "tools/docs/sql/catalog.sql"
    vendor_lock: str = "tools/docs/vendor.lock.json"  # 리포 기준. 외부 스크립트 판·integrity·파일 sha256
    sdd_roots: list[str] = field(default_factory=list)

    @property
    def src(self) -> Path:
        return self.site / "_src"

    @property
    def data(self) -> Path:
        return self.site / "_data"

    def unit(self, unit_id: str) -> Unit:
        return next(u for u in self.units if u.id == unit_id)


def load(repo: Path, site: Path) -> Config:
    raw = json.loads((site / "_src" / "docs.config.json").read_text(encoding="utf-8"))
    units = [
        Unit(
            id=u["id"],
            title=u.get("title", u["id"]),
            kind=u["kind"],
            root=u["root"],
            openapi=tuple(OpenApiSource(o["name"], o["source"]) for o in u.get("openapi", [])),
            relays=tuple(Relay(r["prefix"], r["to_unit"], r["to_prefix"]) for r in u.get("relays", [])),
            api_unit=u.get("api_unit", ""),
            sources=tuple(u.get("sources", [])),
            tests=tuple(u.get("tests", [])),
            idempotency=u.get("idempotency", ""),
            api_calls=tuple(u.get("api_calls", [])),
        )
        for u in raw["units"]
    ]
    databases = [Database(d["id"], d["target"], tuple(d["migrations"])) for d in raw.get("databases", [])]
    return Config(
        repo=repo,
        site=site,
        title=raw.get("title", "기능 명세"),
        units=units,
        databases=databases,
        fingerprint_script=raw.get("fingerprint_script", "scripts/schema-fingerprint.sh"),
        catalog_sql=raw.get("catalog_sql", "tools/docs/sql/catalog.sql"),
        vendor_lock=raw.get("vendor_lock", "tools/docs/vendor.lock.json"),
        sdd_roots=raw.get("sdd_roots", []),
    )
