"""DB 카탈로그 스냅숏(`_data/schema/*.json`)을 테이블 목록으로 읽는다."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

SECRET_COLUMN = re.compile(r"secret|token|password|cipher|private_key", re.IGNORECASE)
CONSTRAINT_TYPES = {"p": "PK", "u": "UNIQUE", "c": "CHECK", "f": "FK", "x": "EXCLUDE"}
POLICY_COMMANDS = {"*": "ALL", "r": "SELECT", "a": "INSERT", "w": "UPDATE", "d": "DELETE"}
FK_ACTIONS = {"a": "NO ACTION", "r": "RESTRICT", "c": "CASCADE", "n": "SET NULL", "d": "SET DEFAULT"}


@dataclass
class Table:
    database: str
    schema: str
    name: str
    kind: str
    comment: str
    rls: bool
    rls_forced: bool
    partition_key: str
    partitions: int
    columns: list[dict] = field(default_factory=list)
    indexes: list[dict] = field(default_factory=list)
    constraints: list[dict] = field(default_factory=list)
    foreign_keys: list[dict] = field(default_factory=list)
    policies: list[dict] = field(default_factory=list)
    triggers: list[str] = field(default_factory=list)

    @property
    def qualified(self) -> str:
        return f"{self.schema}.{self.name}"


def masked_default(column: dict) -> str:
    """비밀처럼 보이는 칸의 기본값은 싣지 않는다."""
    value = column.get("default") or ""
    if value and SECRET_COLUMN.search(column.get("name", "")):
        return "(가림)"
    return value


def load(path: Path) -> list[Table]:
    data = json.loads(path.read_text(encoding="utf-8"))
    database = data.get("database", path.stem)
    tables = []
    for t in data.get("tables", []):
        tables.append(
            Table(
                database=database,
                schema=t["schema"],
                name=t["name"],
                kind=t.get("kind", "table"),
                comment=t.get("comment") or "",
                rls=bool(t.get("rls")),
                rls_forced=bool(t.get("rls_forced")),
                partition_key=t.get("partition_key") or "",
                partitions=int(t.get("partitions") or 0),
                columns=t.get("columns") or [],
                indexes=t.get("indexes") or [],
                constraints=t.get("constraints") or [],
                foreign_keys=t.get("foreign_keys") or [],
                policies=t.get("policies") or [],
                triggers=t.get("triggers") or [],
            )
        )
    return tables


def normalize(raw: dict, database: str, sources: list[dict]) -> dict:
    """카탈로그 질의 출력을 이름순으로 정렬하고 원본 지문을 붙인다. 같은 스키마면 같은 바이트가 나온다."""
    tables = sorted(raw.get("tables", []), key=lambda t: (t["schema"], t["name"]))
    for t in tables:
        t["indexes"] = sorted(t.get("indexes") or [], key=lambda i: i["name"])
        t["constraints"] = sorted(t.get("constraints") or [], key=lambda c: c["name"])
        t["foreign_keys"] = sorted(t.get("foreign_keys") or [], key=lambda f: f["name"])
        t["policies"] = sorted(t.get("policies") or [], key=lambda p: p["name"])
    return {
        "database": database,
        "sources": sources,
        "schemas": raw.get("schemas", []),
        "tables": tables,
    }
