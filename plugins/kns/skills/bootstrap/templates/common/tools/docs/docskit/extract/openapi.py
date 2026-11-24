"""OpenAPI 사본(`_data/openapi/*.json`)에서 operation 목록을 만든다."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

HTTP_METHODS = ("get", "post", "put", "patch", "delete")


@dataclass
class Operation:
    unit: str
    spec: str
    method: str
    path: str
    operation_id: str
    summary: str
    description: str
    tags: list[str]
    parameters: list[dict] = field(default_factory=list)
    request_body: dict | None = None
    responses: dict = field(default_factory=dict)
    security: list | None = None
    deprecated: bool = False

    @property
    def key(self) -> str:
        suffix = f" [{self.spec[1:]}]" if self.spec.startswith("#") else ""
        return f"{self.unit} {self.method} {self.path}{suffix}"


def load_spec(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def operations(unit: str, spec_name: str, spec: dict) -> list[Operation]:
    found: list[Operation] = []
    for path, item in sorted(spec.get("paths", {}).items()):
        shared = item.get("parameters", [])
        for method in HTTP_METHODS:
            op = item.get(method)
            if not op:
                continue
            found.append(
                Operation(
                    unit=unit,
                    spec=spec_name,
                    method=method.upper(),
                    path=path,
                    operation_id=op.get("operationId", ""),
                    summary=op.get("summary", ""),
                    description=op.get("description", ""),
                    tags=list(op.get("tags", [])),
                    parameters=shared + op.get("parameters", []),
                    request_body=op.get("requestBody"),
                    responses=op.get("responses", {}),
                    security=op.get("security", spec.get("security")),
                    deprecated=bool(op.get("deprecated")),
                )
            )
    return found


def schema_name(ref: str) -> str:
    return ref.rsplit("/", 1)[-1]


def body_schema(op: Operation) -> str:
    """요청 본문 스키마 이름. 없으면 빈 문자열."""
    content = (op.request_body or {}).get("content", {})
    for media in content.values():
        schema = media.get("schema", {})
        if "$ref" in schema:
            return schema_name(schema["$ref"])
        if schema.get("type"):
            return schema["type"]
    return ""


def response_schema(op: Operation) -> str:
    for code in ("200", "201", "202", "204"):
        resp = op.responses.get(code)
        if not resp:
            continue
        if code == "204":
            return "(본문 없음)"
        for media in resp.get("content", {}).values():
            schema = media.get("schema", {})
            if "$ref" in schema:
                return schema_name(schema["$ref"])
            if schema.get("type") == "array" and "$ref" in schema.get("items", {}):
                return schema_name(schema["items"]["$ref"]) + "[]"
            if schema.get("type"):
                return schema["type"]
    return ""
