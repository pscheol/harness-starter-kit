"""추출 결과를 한데 모으고 기능에 배정한다. 렌더러와 검사기가 같은 모델을 읽는다."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from . import catalog as catalog_module
from .config import Config, Unit
from .extract import kotlin, python_routes, sdd, tests, web_routes
from .extract import openapi as openapi_extract
from .extract import schema as schema_extract

NOISE_CLASSES = re.compile(
    r"^(ApiResponses|AccessGuard|PrincipalProvider|SecurityPrincipalProvider|DevPrincipalProvider|DevPrincipalHolder|"
    r"PlatformResponseParser|RequestIdClientInterceptor|Clock|.*Mapper|.*Mappers|.*Views?|.*Parser|.*Validator)$"
)


@dataclass
class OperationInfo:
    op: openapi_extract.Operation
    endpoint: kotlin.Endpoint | python_routes.PyEndpoint | None = None
    trace: kotlin.Trace | None = None
    relay_to: str = ""  # 중계 상류 operation 키
    feature: str | None = None
    reason: str = ""
    tests: list[str] = field(default_factory=list)
    idempotency: str = ""  # Idempotency-Key 를 받으면 저장 키 이름

    @property
    def key(self) -> str:
        return self.op.key


@dataclass
class TableInfo:
    table: schema_extract.Table
    entities: list[str] = field(default_factory=list)
    feature: str | None = None
    reason: str = ""


@dataclass
class CacheInfo:
    name: str
    unit: str
    uses: list[tuple[str, kotlin.CacheUse]] = field(default_factory=list)  # (operation 키, 사용)
    feature: str | None = None
    reason: str = ""


@dataclass
class ScreenInfo:
    screen: web_routes.Screen
    feature: str | None = None
    reason: str = ""

    @property
    def key(self) -> str:
        return f"{self.screen.unit}:{self.screen.route}"


@dataclass
class ScheduledJob:
    unit: str
    cls: str
    method: str
    schedule: str
    lock_name: str
    lock_at_most: str
    file: str
    line: int
    feature: str | None = None


@dataclass
class TestInfo:
    test: tests.TestFile
    feature: str | None = None


@dataclass
class Model:
    config: Config
    catalog: catalog_module.Catalog
    operations: list[OperationInfo] = field(default_factory=list)
    tables: list[TableInfo] = field(default_factory=list)
    caches: list[CacheInfo] = field(default_factory=list)
    screens: list[ScreenInfo] = field(default_factory=list)
    tests: list[TestInfo] = field(default_factory=list)
    jobs: list[ScheduledJob] = field(default_factory=list)
    issues: list[tuple[sdd.Issue, str | None]] = field(default_factory=list)
    indexes: dict[str, kotlin.KotlinIndex] = field(default_factory=dict)
    conflicts: list[str] = field(default_factory=list)
    sources: dict[str, dict] = field(default_factory=dict)  # 생성에 쓴 스냅숏 지문

    def by_feature(self, items: list, feature_id: str) -> list:
        return [i for i in items if i.feature == feature_id]

    def operation(self, key: str) -> OperationInfo | None:
        return next((o for o in self.operations if o.key == key), None)

    def table(self, qualified: str) -> TableInfo | None:
        return next((t for t in self.tables if t.table.qualified == qualified), None)


def _openapi_files(config: Config, unit: Unit) -> list[tuple[str, Path]]:
    return [(s.name, config.data / "openapi" / f"{unit.id}--{s.name}.json") for s in unit.openapi]


def _endpoint_operation(unit: str, e) -> openapi_extract.Operation:
    return openapi_extract.Operation(unit, "", e.method, e.path, getattr(e, "function", ""), getattr(e, "summary", ""), "", [])


def build(config: Config) -> Model:
    cat = catalog_module.load(config.src / "catalog.json")
    model = Model(config=config, catalog=cat)
    repo = config.repo

    for db in config.databases:
        path = config.data / "schema" / f"{db.id}.json"
        if path.is_file():
            model.tables.extend(TableInfo(t) for t in schema_extract.load(path))
            model.sources[f"schema:{db.id}"] = json.loads(path.read_text(encoding="utf-8")).get("sources", [])
    known_tables = {t.table.qualified for t in model.tables}

    for unit in config.units:
        root = repo / unit.root
        if unit.kind == "jvm" and root.is_dir():
            index = kotlin.index_sources(root)
            model.indexes[unit.id] = index
            eps = kotlin.endpoints(index)
            by_key: dict[tuple[str, str], kotlin.Endpoint] = {}
            wildcards: list[kotlin.Endpoint] = []
            for e in eps:
                if e.path.endswith("/**"):
                    wildcards.append(e)
                by_key.setdefault((e.method, kotlin.normalize_path(e.path)), e)
            ops: list[openapi_extract.Operation] = []
            for name, path in _openapi_files(config, unit):
                if path.is_file():
                    spec = openapi_extract.load_spec(path)
                    model.sources[f"openapi:{unit.id}:{name}"] = spec.get("x-docs-source", {})
                    ops.extend(openapi_extract.operations(unit.id, name, spec))
            if not unit.openapi:
                ops = [_endpoint_operation(unit.id, e) for e in eps if not e.path.endswith("/**")]
            for op in ops:
                info = OperationInfo(op)
                endpoint = by_key.get((op.method, kotlin.normalize_path(op.path)))
                if endpoint is None:
                    endpoint = next((w for w in wildcards if w.method == op.method and op.path.startswith(w.path[:-3])), None)
                info.endpoint = endpoint
                if endpoint is not None:
                    info.trace = kotlin.trace(index, endpoint.cls, endpoint.function, known_tables)
                relay_classes = {w.cls for w in wildcards}
                for relay in unit.relays:
                    if op.path.startswith(relay.prefix) and endpoint is not None and endpoint.cls in relay_classes:
                        info.relay_to = f"{relay.to_unit} {op.method} {relay.to_prefix}{op.path[len(relay.prefix):]}"
                model.operations.append(info)
            for t in model.tables:
                for fq, table in index.entities.items():
                    if table == t.table.qualified:
                        t.entities.append(f"{unit.id}:{fq}")
            model.jobs.extend(_scheduled_jobs(unit.id, index))
            if unit.idempotency:
                _mark_idempotent(model, unit.id, root / unit.idempotency)
        elif unit.kind == "python" and root.is_dir():
            seen_keys: set[str] = set()
            for e in python_routes.endpoints(unit.id, root, list(unit.sources) or ["src"], repo):
                op = _endpoint_operation(unit.id, e)
                if op.key in seen_keys:
                    op.spec = "#" + e.module.rsplit(".", 1)[-1]
                seen_keys.add(op.key)
                model.operations.append(OperationInfo(op, endpoint=e))
        elif unit.kind == "web" and root.is_dir():
            for screen in web_routes.screens(unit.id, root, list(unit.api_calls), repo):
                model.screens.append(ScreenInfo(screen))
        if root.is_dir():
            model.tests.extend(TestInfo(t) for t in tests.collect(unit.id, unit.kind, root, repo, list(unit.tests) or None))

    _collect_caches(model)
    _assign(model)
    _link_tests(model)
    units_file = repo / "tools/harness/units.json"
    harnesses = [u["path"] for u in json.loads(units_file.read_text(encoding="utf-8"))["units"]] if units_file.is_file() else ["."]
    for issue in sdd.collect(repo, harnesses):
        model.issues.append((issue, _assign_issue(cat, issue)))
    return model


IDEMPOTENT_ENTRY_RE = re.compile(r"\b([A-Z][A-Z0-9_]+)\(\s*HttpMethod\.(\w+)\s*,\s*Regex\(\"([^\"]+)\"\)\s*\)")


def _mark_idempotent(model: Model, unit_id: str, source: Path) -> None:
    """enum 항목 `NAME(HttpMethod.POST, Regex("/api/v1/x"))` 을 읽어 맞는 operation 에 저장 키 이름을 붙인다."""
    if not source.is_file():
        return
    for name, verb, pattern in IDEMPOTENT_ENTRY_RE.findall(source.read_text(encoding="utf-8")):
        regex = re.compile(pattern)
        for info in model.operations:
            sample = re.sub(r"\{[^}]+\}", "abc123", info.op.path)
            if info.op.unit == unit_id and info.op.method == verb and regex.fullmatch(sample):
                info.idempotency = name.lower().replace("_", "-")


def _scheduled_jobs(unit_id: str, index: kotlin.KotlinIndex) -> list[ScheduledJob]:
    jobs = []
    for cls in index.classes.values():
        for name, methods in cls.methods.items():
            for m in methods:
                scheduled = next((a for a in m.annotations if a.name == "Scheduled"), None)
                lock = next((a for a in m.annotations if a.name == "SchedulerLock"), None)
                if not scheduled and not lock:
                    continue
                schedule = ""
                if scheduled:
                    schedule = ", ".join(f"{k}={v}" for k, v in re.findall(r'(cron|fixedDelayString|fixedRateString|fixedDelay|fixedRate|initialDelayString)\s*=\s*"?([^",)]+)"?', scheduled.args))
                lock_name = re.search(r'name\s*=\s*"([^"]+)"', lock.args).group(1) if lock and re.search(r'name\s*=\s*"([^"]+)"', lock.args) else ""
                at_most = re.search(r'lockAtMostFor\s*=\s*"([^"]+)"', lock.args).group(1) if lock and re.search(r'lockAtMostFor\s*=\s*"([^"]+)"', lock.args) else ""
                jobs.append(ScheduledJob(unit_id, cls.fqcn, name, schedule.replace("\\$", "$"), lock_name, at_most, cls.file, m.line))
    return sorted(jobs, key=lambda j: (j.unit, j.cls, j.method))


def _collect_caches(model: Model) -> None:
    caches: dict[tuple[str, str], CacheInfo] = {}
    for unit_id, index in model.indexes.items():
        for key, value in index.consts.items():
            if key.startswith("CacheNames."):
                caches.setdefault((unit_id, value), CacheInfo(value, unit_id))
    for info in model.operations:
        if info.trace is None:
            continue
        for use in info.trace.caches:
            cache = caches.setdefault((info.op.unit, use.name), CacheInfo(use.name, info.op.unit))
            cache.uses.append((info.key, use))
    model.caches = sorted(caches.values(), key=lambda c: (c.unit, c.name))


def _operation_package(info: OperationInfo) -> str:
    e = info.endpoint
    if isinstance(e, kotlin.Endpoint):
        return e.cls.rsplit(".", 1)[0]
    if isinstance(e, python_routes.PyEndpoint):
        return e.module
    return ""


def _assign(model: Model) -> None:
    cat = model.catalog
    upstream: list[OperationInfo] = []
    for info in model.operations:
        result = catalog_module.assign_explicit(cat, "operations", info.key)
        if result.feature is None and not result.conflicts:
            result = catalog_module.assign_glob(cat, info.op.unit, info.op.path, "routes")
        if result.feature is None and not result.conflicts:
            package = _operation_package(info)
            key = "modules" if isinstance(info.endpoint, python_routes.PyEndpoint) else "packages"
            if package:
                result = catalog_module.assign_package(cat, info.op.unit, package, key)
        if result.conflicts:
            model.conflicts.append(f"operation {info.key}: {', '.join(result.conflicts)}")
        info.feature, info.reason = result.feature, result.reason
        if info.relay_to:
            upstream.append(info)
    for info in upstream:
        if info.feature is None or info.reason != "명시":
            target = model.operation(info.relay_to)
            if target is not None and target.feature:
                info.feature, info.reason = target.feature, f"중계 → {info.relay_to}"
    for t in model.tables:
        result = catalog_module.assign_explicit(cat, "tables", t.table.qualified)
        if result.feature is None and not result.conflicts:
            for entity in t.entities:
                unit, fq = entity.split(":", 1)
                candidate = catalog_module.assign_package(cat, unit, fq.rsplit(".", 1)[0])
                if candidate.feature or candidate.conflicts:
                    result = candidate
                    break
        if result.conflicts:
            model.conflicts.append(f"table {t.table.qualified}: {', '.join(result.conflicts)}")
        t.feature, t.reason = result.feature, result.reason
    for c in model.caches:
        result = catalog_module.assign_explicit(cat, "caches", f"{c.unit}:{c.name}")
        if result.conflicts:
            model.conflicts.append(f"cache {c.unit}:{c.name}: {', '.join(result.conflicts)}")
        c.feature, c.reason = result.feature, result.reason
    for s in model.screens:
        result = catalog_module.assign_glob(cat, s.screen.unit, s.screen.route, "routes")
        if result.conflicts:
            model.conflicts.append(f"screen {s.key}: {', '.join(result.conflicts)}")
        s.feature, s.reason = result.feature, result.reason
    for job in model.jobs:
        job.feature = catalog_module.assign_package(cat, job.unit, job.cls.rsplit(".", 1)[0]).feature
    for t in model.tests:
        if t.test.package:
            result = catalog_module.assign_package(cat, t.test.unit, t.test.package)
        else:
            unit_root = model.config.unit(t.test.unit).root
            rel = t.test.path[len(unit_root) + 1 :] if t.test.path.startswith(unit_root + "/") else t.test.path
            result = catalog_module.assign_glob(cat, t.test.unit, rel, "paths")
        t.feature = result.feature


def _link_tests(model: Model) -> None:
    """operation 마다 컨트롤러 이름이나 경로를 직접 언급하는 시험 파일을 잇는다."""
    texts: dict[str, str] = {}
    for t in model.tests:
        try:
            texts[t.test.path] = (model.config.repo / t.test.path).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
    by_class: dict[str, list[str]] = {}
    for info in model.operations:
        if isinstance(info.endpoint, kotlin.Endpoint):
            by_class.setdefault(info.endpoint.cls.rsplit(".", 1)[-1], []).append(info.key)
    for path, text in texts.items():
        for name in set(re.findall(r"\b[A-Z]\w*(?:RestController|Controller)\b", text)) & by_class.keys():
            for key in by_class[name]:
                op = model.operation(key)
                if op is not None and path not in op.tests:
                    op.tests.append(path)
    for info in model.operations:
        info.tests.sort()


def _assign_issue(cat: catalog_module.Catalog, issue: sdd.Issue) -> str | None:
    for f in cat.features:
        for pattern in f.sdd:
            if catalog_module.glob_score(pattern, issue.ref):
                return f.id
    return None


def sequence(info: OperationInfo, limit: int = 18) -> str:
    """추출한 호출 경로로 Mermaid 시퀀스를 만든다. 방문 순서를 따르고, 인증·변환 같은 잡음 클래스는 뺀다."""
    if info.trace is None or info.endpoint is None:
        return ""
    start = info.endpoint.cls.rsplit(".", 1)[-1] if isinstance(info.endpoint, kotlin.Endpoint) else info.endpoint.function
    participants: list[str] = [start]
    body: list[str] = []
    uses_db = uses_cache = False
    for kind, actor, target, detail in info.trace.events:
        if actor not in participants:
            continue
        if kind == "call":
            if NOISE_CLASSES.match(target) or actor == target:
                continue
            if target not in participants:
                participants.append(target)
            body.append(f"  {_alias(actor)}->>{_alias(target)}: {detail}")
        elif kind == "table":
            uses_db = True
            body.append(f"  {_alias(actor)}->>DB: {'쓰기' if detail == 'W' else '읽기'} {target}")
        elif kind == "cache":
            uses_cache = True
            body.append(f"  {_alias(actor)}->>Cache: {detail} {target}")
        if len(body) >= limit:
            body.append(f"  Note over {_alias(start)}: 이하 생략(전체 경로는 아래 표)")
            break
    out = ["sequenceDiagram", "  autonumber", "  actor Client as 호출자"]
    out += [f"  participant {_alias(p)} as {p}" for p in participants]
    if uses_cache:
        out.append("  participant Cache as 캐시")
    if uses_db:
        out.append("  participant DB as PostgreSQL")
    out.append(f"  Client->>{_alias(start)}: {info.op.method} {info.op.path}")
    out += body
    out.append(f"  {_alias(start)}-->>Client: 응답")
    return "\n".join(out)


def _alias(name: str) -> str:
    return "p_" + re.sub(r"\W", "_", name)
