"""사이트 생성(build)·검사(check)·통계(stats).

build 는 모든 결과를 메모리에서 만든 뒤 쓴다. check 는 같은 결과를 만들어 디스크와 바이트 비교만 한다.
"""

from __future__ import annotations

import fnmatch
import hashlib
import json
import os
import re
from collections import Counter
from pathlib import Path

from . import fingerprint, markdown, render
from . import model as model_module
from . import scalar
from .config import Config
from .extract import kotlin, python_routes

ASSETS = Path(__file__).resolve().parent.parent / "assets"
GENERATED_DIRS = ("features", "api")
TODO = "TODO-DOC"
REQUIREMENT_HEAD = ["ID", "요구", "출처"]
POLICY_HEAD = ["ID", "규칙", "강제 위치"]
FK_ACTION = {"a": "NO ACTION", "r": "RESTRICT", "c": "CASCADE", "n": "SET NULL", "d": "SET DEFAULT"}
POLICY_COMMAND = {"*": "ALL", "r": "SELECT", "a": "INSERT", "w": "UPDATE", "d": "DELETE"}
CONSTRAINT_TYPE = {"p": "PK", "u": "UNIQUE", "c": "CHECK", "f": "FK", "x": "EXCLUDE"}
KIND_LABEL = {"unit": "단위", "integration": "통합", "e2e": "E2E", "contract": "계약"}
STATUS_LABEL = {
    "requirements": "요구",
    "design": "설계",
    "active": "구현",
    "check": "검수",
    "completed": "완료",
    "superseded": "폐기",
}


# ───────────────────────────── 원고 ─────────────────────────────


def feature_doc(config: Config, feature_id: str) -> Path:
    return config.src / "features" / f"{feature_id}.md"


def stage_doc(config: Config, name: str) -> Path:
    return config.src / "stages" / f"{name}.md"


def read_sections(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    return markdown.sections(path.read_text(encoding="utf-8"))


INCLUDE_RE = re.compile(r"^<!--\s*include:\s*(\S+?)(?:#(.+?))?\s*-->\s*$", re.M)
MD_LINK_RE = re.compile(r"\]\(([^)\s]+)\)")
_CONFIG: Config | None = None  # md() 가 포함 지시를 풀 때 쓰는 현재 설정(render_all 이 정한다)


def section_of(text: str, heading: str) -> str:
    """`heading` 제목(어느 수준이든) 부터 같거나 높은 수준의 다음 제목 전까지."""
    lines = text.split("\n")
    start = level = None
    in_code = False
    for i, line in enumerate(lines):
        if line.strip().startswith("```"):
            in_code = not in_code
        m = re.match(r"^(#{1,6})\s+(.*?)\s*$", line) if not in_code else None
        if m and start is None and m.group(2) == heading:
            start, level = i, len(m.group(1))
        elif m and start is not None and len(m.group(1)) <= level:
            return "\n".join(lines[start:i]).strip()
    if start is None:
        raise ValueError(f"포함할 절이 없다: {heading}")
    return "\n".join(lines[start:]).strip()


def expand_includes(text: str, config: Config, page_dir: Path) -> str:
    """`<!-- include: 경로#제목 -->` 줄을 원본 절로 바꾼다. 원본이 하나로 남게 베끼지 않고 생성할 때 끌어온다."""

    def include(m: re.Match) -> str:
        source = config.repo / m.group(1)
        body = source.read_text(encoding="utf-8")
        if m.group(2):
            body = section_of(body, m.group(2))

        def relink(link: re.Match) -> str:
            target = link.group(1)
            if re.match(r"^[a-z]+:", target) or target.startswith("#"):
                return link.group(0)
            path, _, frag = target.partition("#")
            moved = os.path.relpath((source.parent / path).resolve(), page_dir.resolve()) if path else ""
            return "](" + moved + ("#" + frag if frag else "") + ")"

        note = f"\n\n<!-- 원본: {m.group(1)} -->\n\n> 이 절은 `{m.group(1)}`" + (f" 「{m.group(2)}」" if m.group(2) else "") + " 를 생성할 때 그대로 가져왔다. 고칠 곳은 원본이다.\n\n"
        return note + MD_LINK_RE.sub(relink, body) + "\n"

    return INCLUDE_RE.sub(include, text)


def md(text: str, prefix: str = "", page_dir: Path | None = None) -> str:
    if _CONFIG is not None and "<!-- include:" in text:
        text = expand_includes(text, _CONFIG, page_dir or _CONFIG.site)
    return markdown.render(text, heading_offset=1, anchor_prefix=prefix).html if text.strip() else ""


# ───────────────────────────── 공통 ─────────────────────────────


class Site:
    def __init__(self, model: model_module.Model):
        self.model = model
        self.config = model.config
        self.cat = model.catalog
        self.docs = {f.id: read_sections(feature_doc(self.config, f.id)) for f in self.cat.features}
        self.files: dict[str, bytes] = {}

    def footer(self) -> str:
        parts = []
        for key, value in sorted(self.model.sources.items()):
            if key.startswith("openapi:") and value:
                parts.append(f"{render.esc(value.get('path', key))} <code>{render.esc(value.get('sha256', '')[:12])}</code>")
            elif key.startswith("schema:"):
                files = sum(len(s.get("files", [])) for s in value)
                parts.append(f"{render.esc(key[7:])} 마이그레이션 {files}개")
        return "생성 원본: " + " · ".join(parts) + " — <code>python3 tools/docs/feature_docs.py build</code> 가 만든다. 손으로 고치지 않는다."

    def nav(self, current: str, depth: int) -> str:
        up = "../" * depth
        stages = render.NavGroup(
            "단계 문서",
            [render.NavItem(f"{up}index.html", "개요", "00", current == "index")]
            + [render.NavItem(f"{up}{slug}.html", label, num, current == slug) for num, slug, label, _, _ in render.STAGES],
        )
        groups = [stages]
        for area in sorted(self.cat.areas, key=lambda a: a.order):
            features = [f for f in self.cat.ordered() if f.area == area.id]
            items = [
                render.NavItem(f"{up}features/{f.id}.html", f.name, f.id.split("-", 1)[1], current == f.id, f"{f.id} {f.name} {f.summary}")
                for f in features
            ]
            groups.append(render.NavGroup(area.name, items, collapsible=True, open=any(i.current for i in items)))
        apis = [u for u in self.config.units if u.openapi or any(o.op.unit == u.id for o in self.model.operations)]
        groups.append(
            render.NavGroup("API 명세(Scalar)", [render.NavItem(f"{up}api/{u.id}.html", u.title, "", current == f"api:{u.id}") for u in apis])
        )
        return render.nav(groups)

    def emit(self, rel: str, text: str) -> None:
        self.files[rel] = text.encode("utf-8")

    def feature_link(self, feature_id: str | None, depth: int, anchor: str = "") -> str:
        if not feature_id:
            return '<span class="flag">미배정</span>'
        f = self.cat.feature(feature_id)
        up = "../" * depth
        return f'<a href="{up}features/{f.id}.html{("#" + anchor) if anchor else ""}">{render.esc(f.id)}</a> {render.esc(f.name)}'

    def page(self, rel: str, current: str, depth: int, eyebrow: str, heading: str, lead: str, body: str, toc=None, scripts=None) -> None:
        self.emit(
            rel,
            render.page(
                title=heading,
                site_title=self.config.title,
                depth=depth,
                nav_html=self.nav(current, depth),
                eyebrow=eyebrow,
                heading=heading,
                lead=lead,
                body=body,
                toc=toc,
                footer=self.footer(),
                scripts=scripts,
            ),
        )

    # ───── 집계 도우미 ─────

    def ops_of(self, feature_id: str) -> list[model_module.OperationInfo]:
        ops = self.model.by_feature(self.model.operations, feature_id)
        return sorted(ops, key=lambda o: (o.op.unit, o.op.path, render.METHOD_ORDER.get(o.op.method, 9)))

    def trace_of(self, info: model_module.OperationInfo) -> kotlin.Trace | None:
        if info.relay_to:
            upstream = self.model.operation(info.relay_to)
            return upstream.trace if upstream else None
        return info.trace

    def tables_used_by(self, feature_id: str) -> dict[str, set[str]]:
        used: dict[str, set[str]] = {}
        for info in self.ops_of(feature_id):
            trace = self.trace_of(info)
            for table, modes in (trace.tables.items() if trace else []):
                used.setdefault(table, set()).update(modes)
        return used

    def ops_using_table(self, table: str) -> list[model_module.OperationInfo]:
        return [o for o in self.model.operations if (t := self.trace_of(o)) is not None and table in t.tables]


# ───────────────────────────── 기능 페이지 ─────────────────────────────


def _op_row_anchor(info: model_module.OperationInfo) -> str:
    return "op-" + re.sub(r"[^a-z0-9]+", "-", f"{info.op.unit}-{info.op.method}-{info.op.path}".lower()).strip("-")


def table_detail(site: Site, info: model_module.TableInfo, depth: int, with_users: bool = True) -> str:
    t = info.table
    out = [f'<h3 id="t-{render.esc(t.qualified)}">{render.code(t.qualified)}</h3>']
    meta = [render.esc(t.comment) if t.comment else '<span class="muted">COMMENT 없음</span>']
    if t.kind == "partitioned":
        meta.append(f"파티션 <code>{render.esc(t.partition_key)}</code> · 자식 {t.partitions}")
    if t.rls:
        meta.append("RLS 켜짐" + (" (FORCE)" if t.rls_forced else ""))
    out.append("<p>" + " · ".join(meta) + "</p>")
    from .extract.schema import masked_default

    rows = [
        [
            render.code(c["name"]),
            render.code(c["type"]),
            "" if c.get("nullable") else "NOT NULL",
            render.code(masked_default(c)) if c.get("default") else ("identity" if c.get("identity") else ""),
            render.esc(c.get("comment") or ""),
        ]
        for c in t.columns
    ]
    out.append("<details><summary>칸 " + str(len(t.columns)) + "개</summary>" + render.table(["칸", "타입", "NULL", "기본값", "설명"], rows) + "</details>")
    idx = [
        [render.code(i["name"]), "PK" if i.get("primary") else ("UNIQUE" if i.get("unique") else ""), render.code(", ".join(i.get("columns") or [])), render.esc(i.get("predicate") or "")]
        for i in t.indexes
    ]
    out.append("<h4>인덱스</h4>" + render.table(["이름", "종류", "칸", "부분 조건"], idx))
    cons = [[render.code(c["name"]), CONSTRAINT_TYPE.get(c["type"], c["type"]), f'<span class="wrap">{render.code(c["definition"])}</span>'] for c in t.constraints if c["type"] in ("c", "x", "u")]
    if cons:
        out.append("<h4>제약</h4>" + render.table(["이름", "종류", "정의"], cons, "wrap"))
    fks = [
        [render.code(", ".join(f.get("columns") or [])), render.code(f.get("ref_table")), render.code(", ".join(f.get("ref_columns") or [])), FK_ACTION.get(f.get("on_delete"), "")]
        for f in t.foreign_keys
    ]
    if fks:
        out.append("<h4>외래 키</h4>" + render.table(["칸", "참조 테이블", "참조 칸", "삭제 시"], fks))
    pols = [
        [render.code(p["name"]), POLICY_COMMAND.get(p.get("command"), p.get("command")), render.esc(", ".join(p.get("roles") or [])), render.code(p.get("using") or ""), render.code(p.get("check") or "")]
        for p in t.policies
    ]
    if pols:
        out.append("<h4>RLS 정책</h4>" + render.table(["이름", "명령", "롤", "USING", "WITH CHECK"], pols, "wrap"))
    if with_users:
        users = site.ops_using_table(t.qualified)
        if users:
            rows = [
                [render.method(o.op.method), render.code(o.op.path), rw(site.trace_of(o).tables[t.qualified]), site.feature_link(o.feature, depth)]
                for o in users[:40]
            ]
            out.append(f"<h4>이 테이블을 쓰는 operation ({len(users)})</h4>" + render.table(["메서드", "경로", "접근", "기능"], rows))
    return "".join(out)


def job_row(j: model_module.ScheduledJob) -> list[str]:
    return [render.code(f"{j.cls.rsplit('.', 1)[-1]}.{j.method}"), render.code(j.schedule) if j.schedule else "", render.code(j.lock_name) if j.lock_name else '<span class="muted">없음(인스턴스마다 돈다)</span>', render.code(j.lock_at_most) if j.lock_at_most else ""]


def rw(modes: set[str]) -> str:
    return render.rw(modes)


def operation_detail(site: Site, info: model_module.OperationInfo, depth: int) -> str:
    op = info.op
    trace = site.trace_of(info)
    body = []
    if op.summary:
        body.append(f"<p>{render.esc(op.summary)}</p>")
    facts = []
    if isinstance(info.endpoint, kotlin.Endpoint):
        facts.append(f"구현 {render.code(info.endpoint.cls.rsplit('.', 1)[-1] + '.' + info.endpoint.function)} — {render.code(info.endpoint.file + ':' + str(info.endpoint.line))}")
    elif info.endpoint is not None:
        facts.append(f"구현 {render.code(getattr(info.endpoint, 'module', '') + '.' + getattr(info.endpoint, 'function', ''))} — {render.code(getattr(info.endpoint, 'file', ''))}")
    if info.relay_to:
        facts.append(f"중계 → {render.code(info.relay_to)}")
    if info.idempotency:
        facts.append(f"<code>Idempotency-Key</code> 를 받는다 — 저장 키 이름 {render.code(info.idempotency)}")
    from .extract import openapi as oa

    if oa.body_schema(op):
        facts.append(f"요청 {render.code(oa.body_schema(op))}")
    if oa.response_schema(op):
        facts.append(f"응답 {render.code(oa.response_schema(op))}")
    if facts:
        body.append("<ul>" + "".join(f"<li>{f}</li>" for f in facts) + "</ul>")
    if trace is not None:
        path = [v for v in trace.visited if not model_module.NOISE_CLASSES.match(v.split(".")[0])][:10]
        if path:
            body.append('<p class="note">호출 경로(정적 분석 근사)</p><p>' + " → ".join(render.code(p) for p in path) + "</p>")
        if trace.tables:
            rows = [[render.code(t), rw(m), scalar.index_names(site.model, t).replace("`", "")] for t, m in sorted(trace.tables.items())]
            body.append(render.table(["테이블", "접근", "인덱스"], rows))
        extras = []
        for use in {(c.name, c.operation, c.key): c for c in trace.caches}.values():
            extras.append(f"캐시 {render.code(use.name)} {render.esc(use.operation)}" + (f" — 키 {render.code(use.key)}" if use.key else ""))
        for lock in trace.locks[:6]:
            extras.append(f"{scalar.LOCK_LABEL.get(lock.kind, lock.kind)} {render.code(lock.detail)} ({render.code(lock.where)})")
        if trace.clients:
            extras.append("외부 호출 " + ", ".join(render.code(c) for c in trace.clients[:8]))
        if trace.workflows:
            extras.append("워크플로 시작 " + ", ".join(render.code(w) for w in trace.workflows))
        if extras:
            body.append("<ul>" + "".join(f"<li>{x}</li>" for x in extras) + "</ul>")
        seq = model_module.sequence(info if not info.relay_to else (site.model.operation(info.relay_to) or info))
        if seq:
            body.append(f'<details><summary>시퀀스</summary><pre class="mermaid">{render.esc(seq)}</pre></details>')
    elif info.endpoint is None:
        body.append('<p class="flag">호출 경로 미확인 — 컨트롤러 매핑을 찾지 못했다</p>')
    if info.tests:
        body.append('<p class="note">이 operation 을 직접 언급하는 시험</p><ul>' + "".join(f"<li>{render.code(t)}</li>" for t in info.tests[:10]) + "</ul>")
    up = "../" * depth
    body.append(f'<p><a href="{up}api/{render.esc(op.unit)}.html">{render.esc(op.unit)} Scalar 명세에서 보기</a></p>')
    return (
        f'<details class="op" id="{_op_row_anchor(info)}" data-search="{render.esc(op.method + " " + op.path + " " + op.summary)}"><summary>{render.method(op.method)} {render.code(op.path)}'
        f' <span class="muted">{render.esc(op.unit)}</span> <span>{render.esc(op.summary)}</span></summary><div class="body">{"".join(body)}</div></details>'
    )


def feature_page(site: Site, feature_id: str) -> None:
    f = site.cat.feature(feature_id)
    area = site.cat.area(f.area)
    doc = site.docs.get(f.id, {})
    model = site.model
    ops = site.ops_of(f.id)
    tables = [t for t in model.tables if t.feature == f.id]
    caches = [c for c in model.caches if c.feature == f.id]
    screens = [s for s in model.screens if s.feature == f.id]
    tests = [t for t in model.tests if t.feature == f.id]
    issues = [i for i, fid in model.issues if fid == f.id]
    units = sorted({o.op.unit for o in ops} | {s.screen.unit for s in screens} | {t.test.unit for t in tests} | set(f.units))
    prefix = f.id.lower() + "-"
    sections: list[str] = []
    toc: list[tuple[str, str]] = []

    def section(name: str, generated: str = "") -> None:
        anchor = render.anchor(name) if name != "API" else "api"
        toc.append((name, anchor))
        text = doc.get(name, "")
        sections.append(f'<section><h2 id="{anchor}">{render.esc(name)}</h2>{md(text, prefix)}{generated}</section>')

    stats = (
        f'<div class="stats"><div><b>{len(ops)}</b><span>operation</span></div><div><b>{len(tables)}</b><span>테이블</span></div>'
        f'<div><b>{len(caches)}</b><span>캐시</span></div><div><b>{len(screens)}</b><span>화면</span></div>'
        f'<div><b>{sum(t.test.count for t in tests)}</b><span>시험({len(tests)} 파일)</span></div><div><b>{len(issues)}</b><span>SDD 이슈</span></div></div>'
    )
    unit_rows = []
    for u in units:
        match = f.units.get(u, {})
        patterns = [render.code(p) for k in ("packages", "modules", "routes", "paths") for p in match.get(k, [])]
        unit_rows.append([render.code(u), str(sum(1 for o in ops if o.op.unit == u)), " ".join(patterns) or '<span class="muted">명시 배정</span>'])
    section("개요", stats + render.table(["단위", "operation", "배정 규칙"], unit_rows))
    issue_rows = [[STATUS_LABEL.get(i.status, i.status), render.code(f"{i.slug}/{i.key}"), render.esc(i.title), render.code(i.path)] for i in issues]
    section("요구사항", ("<h3>관련 SDD 이슈</h3>" + render.table(["상태", "이슈", "제목", "문서"], issue_rows)) if issue_rows else "")
    section("정책")
    screen_rows = []
    for s in screens:
        calls = ", ".join(f"{render.method(c.method)} {render.code(c.path)}" for c in s.screen.calls[:12])
        more = f" 외 {len(s.screen.calls) - 12}" if len(s.screen.calls) > 12 else ""
        screen_rows.append([render.code(s.screen.unit), render.code(s.screen.route), calls + more or '<span class="muted">화면 고유 호출 없음</span>'])
    section("화면", render.table(["단위", "경로", "화면이 부르는 API(셸 제외)"], screen_rows) if screen_rows else "")
    section("흐름")
    section("시퀀스")
    section("상태 전이")
    used = site.tables_used_by(f.id)
    data = ""
    if tables:
        data += "".join(table_detail(site, t, 1) for t in tables)
    other = sorted(set(used) - {t.table.qualified for t in tables})
    if other:
        rows = [[render.code(t), rw(used[t]), site.feature_link(model.table(t).feature if model.table(t) else None, 1, "t-" + t)] for t in other]
        data += f"<h3>다른 기능의 테이블을 쓰는 곳 ({len(other)})</h3>" + render.table(["테이블", "접근", "소유 기능"], rows)
    section("데이터", data)
    cache_rows = []
    for c in caches:
        keys = sorted({u.key for _, u in c.uses if u.key})
        ops_using = sorted({k for k, _ in c.uses})
        cache_rows.append([render.code(c.name), render.code(c.unit), "<br>".join(render.code(k) for k in keys[:4]), str(len(ops_using))])
    locks = []
    for info in ops:
        trace = site.trace_of(info)
        for lock in trace.locks if trace else []:
            locks.append((lock.kind, lock.detail, lock.where))
    lock_rows = [[scalar.LOCK_LABEL.get(k, k), render.code(d), render.code(w), str(n)] for (k, d, w), n in sorted(Counter(locks).items())]
    gen = ""
    if cache_rows:
        gen += "<h3>캐시</h3>" + render.table(["이름", "단위", "키 식", "쓰는 operation"], cache_rows)
    if lock_rows:
        gen += "<h3>잠금(정적 분석)</h3>" + render.table(["종류", "표시", "위치", "operation 수"], lock_rows)
    idem = [o for o in ops if o.idempotency]
    if idem:
        gen += "<h3>멱등 키를 받는 operation</h3>" + render.table(["메서드", "경로", "저장 키 이름"], [[render.method(o.op.method), render.code(o.op.path), render.code(o.idempotency)] for o in idem])
    jobs = [j for j in model.jobs if j.feature == f.id]
    if jobs:
        gen += "<h3>예약 작업</h3>" + render.table(["작업", "일정", "분산 잠금(ShedLock)", "최대 잠금"], [job_row(j) for j in jobs])
    section("캐시·동시성", gen)
    section("API", "".join(operation_detail(site, o, 1) for o in ops))
    test_rows = [[render.code(t.test.path), KIND_LABEL.get(t.test.kind, t.test.kind), str(t.test.count)] for t in sorted(tests, key=lambda t: t.test.path)]
    section("테스트", render.table(["파일", "종류", "시험 수"], test_rows) if test_rows else "")
    section("변경 영향")
    site.page(
        f"features/{f.id}.html",
        f.id,
        1,
        f"<b>{render.esc(f.id)}</b> · {render.esc(area.name)} · " + " ".join(f'<span class="tag">{render.esc(u)}</span>' for u in units),
        f.name,
        render.esc(f.summary),
        "".join(sections),
        toc,
    )


# ───────────────────────────── 단계 문서 ─────────────────────────────


def stage_body(site: Site, section_name: str, intro_file: str) -> str:
    intro = md(read_sections_raw(stage_doc(site.config, intro_file)))
    out = [intro]
    for area in sorted(site.cat.areas, key=lambda a: a.order):
        features = [f for f in site.cat.ordered() if f.area == area.id]
        parts = []
        for f in features:
            text = site.docs.get(f.id, {}).get(section_name, "")
            if text.strip():
                parts.append(f'<h3 id="{render.esc(f.id)}"><a href="features/{f.id}.html#{render.anchor(section_name)}">{render.esc(f.id)}</a> {render.esc(f.name)}</h3>{md(text, f.id.lower() + "-")}')
        if parts:
            out.append(f'<h2 id="{render.esc(area.id)}">{render.esc(area.name)}</h2>' + "".join(parts))
    return "".join(out)


def read_sections_raw(path: Path) -> str:
    if not path.is_file():
        return ""
    text = path.read_text(encoding="utf-8")
    return re.sub(r"^#\s.*\n", "", text, count=1)


def stage_page(site: Site, num: str, slug: str, label: str, phase: str, body: str, lead: str) -> None:
    site.page(f"{slug}.html", slug, 0, f"<b>{render.esc(phase)}</b> · 단계 문서 {num}", label, lead, body)


def index_page(site: Site) -> None:
    m = site.model
    intro = md(read_sections_raw(stage_doc(site.config, "00-개요")))
    assigned_tests = sum(t.test.count for t in m.tests if t.feature)
    stats = (
        f'<div class="stats"><div><b>{len(site.cat.features)}</b><span>기능</span></div><div><b>{len(m.operations)}</b><span>operation</span></div>'
        f'<div><b>{len(m.tables)}</b><span>테이블</span></div><div><b>{len(m.caches)}</b><span>캐시</span></div><div><b>{len(m.screens)}</b><span>화면</span></div>'
        f'<div><b>{sum(t.test.count for t in m.tests)}</b><span>시험(기능 배정 {assigned_tests})</span></div><div><b>{len(m.issues)}</b><span>SDD 이슈</span></div></div>'
    )
    steps = '<ol class="steps">' + "".join(
        f'<li data-search="{render.esc(label)} {render.esc(desc)}"><span class="s">{render.esc(num)} · {render.esc(phase)}</span><a href="{slug}.html">{render.esc(label)}</a><p>{render.esc(desc)}</p></li>'
        for num, slug, label, phase, desc in render.STAGES
    ) + "</ol>"
    areas = ['<div class="areas">']
    for area in sorted(site.cat.areas, key=lambda a: a.order):
        items = []
        for f in [x for x in site.cat.ordered() if x.area == area.id]:
            n_ops = sum(1 for o in m.operations if o.feature == f.id)
            n_tab = sum(1 for t in m.tables if t.feature == f.id)
            items.append(f'<li data-search="{render.esc(f.id + " " + f.name + " " + f.summary)}"><a href="features/{f.id}.html">{render.esc(f.name)}</a><span class="counts">API {n_ops} · 표 {n_tab}</span></li>')
        areas.append(f'<section class="area"><h3>{render.esc(area.name)} <span class="code">{render.esc(area.id)}</span></h3><p>{render.esc(area.summary)}</p><ul>{"".join(items)}</ul></section>')
    areas.append("</div>")
    body = intro + stats + "<h2 id='단계'>단계 문서</h2>" + steps + "<h2 id='기능-지도'>기능 지도</h2>" + "".join(areas)
    site.page("index.html", "index", 0, "<b>개요</b>", site.config.title, "구현된 기능을 SDLC 단계별로 정리했다. 코드에서 뽑은 사실과 사람이 쓴 서술을 합쳐 만든다.", body)


def ia_page(site: Site) -> str:
    out = [md(read_sections_raw(stage_doc(site.config, "03-IA-화면-목록")))]
    for unit in sorted({s.screen.unit for s in site.model.screens}):
        screens = [s for s in site.model.screens if s.screen.unit == unit]
        rows = [
            [render.code(s.screen.route), site.feature_link(s.feature, 0, "화면"), str(len(s.screen.calls)), render.code(s.screen.page.split(unit_root(site, unit) + "/", 1)[-1])]
            for s in screens
        ]
        out.append(f'<h2 id="{render.esc(unit)}">{render.esc(unit)} ({len(screens)})</h2>' + render.table(["경로", "기능", "고유 API", "page"], rows))
        shell = {}
        for s in screens:
            for c in s.screen.shell_calls:
                shell[(c.unit, c.method, c.path)] = c
        if shell:
            rows = [[render.code(u), render.method(mth), render.code(p)] for (u, mth, p) in sorted(shell)]
            out.append(f"<details><summary>공통 셸(layout)이 부르는 API {len(shell)}</summary>" + render.table(["단위", "메서드", "경로"], rows) + "</details>")
    return "".join(out)


def unit_root(site: Site, unit_id: str) -> str:
    return site.config.unit(unit_id).root


def backlog_page(site: Site) -> str:
    issues = site.model.issues
    by_status = Counter(i.status for i, _ in issues)
    out = [md(read_sections_raw(stage_doc(site.config, "04-백로그-추적")))]
    out.append('<div class="stats">' + "".join(f"<div><b>{n}</b><span>{STATUS_LABEL.get(s, s)}</span></div>" for s, n in sorted(by_status.items())) + "</div>")
    for area in sorted(site.cat.areas, key=lambda a: a.order):
        rows = []
        for f in [x for x in site.cat.ordered() if x.area == area.id]:
            for i, fid in issues:
                if fid == f.id:
                    rows.append([site.feature_link(f.id, 0, "요구사항"), STATUS_LABEL.get(i.status, i.status), render.code(f"{i.harness}:{i.slug}/{i.key}"), render.esc(i.title)])
        if rows:
            out.append(f'<h2 id="{render.esc(area.id)}">{render.esc(area.name)}</h2>' + render.table(["기능", "상태", "이슈", "제목"], rows))
    rest = [[STATUS_LABEL.get(i.status, i.status), render.code(f"{i.harness}:{i.slug}/{i.key}"), render.esc(i.title)] for i, fid in issues if not fid]
    out.append(f'<h2 id="미배정">기능에 잇지 않은 이슈 ({len(rest)})</h2><p class="note">하네스·구조·배포처럼 한 기능에 속하지 않는 이슈다. 기능에 속하면 catalog 의 <code>sdd</code> 패턴에 더한다.</p>' + render.table(["상태", "이슈", "제목"], rest))
    return "".join(out)


def system_page(site: Site) -> str:
    m = site.model
    out = [md(read_sections_raw(stage_doc(site.config, "05-시스템-설계")))]
    rows = []
    for u in site.config.units:
        ops = [o for o in m.operations if o.op.unit == u.id]
        tests = [t for t in m.tests if t.test.unit == u.id]
        entities = sum(1 for t in m.tables for e in t.entities if e.startswith(u.id + ":"))
        rows.append([render.code(u.id), render.esc(u.kind), render.code(u.root), str(len(ops)), str(entities), str(sum(1 for s in m.screens if s.screen.unit == u.id)), f"{sum(t.count for t in [x.test for x in tests])} ({len(tests)})"])
    out.append("<h2 id='단위-목록'>단위 목록(생성)</h2>" + render.table(["단위", "종류", "경로", "operation", "엔티티 테이블", "화면", "시험(파일)"], rows))
    return "".join(out)


def stage_section_page(site: Site, section_names: list[str], intro: str) -> str:
    out = [md(read_sections_raw(stage_doc(site.config, intro)))]
    for area in sorted(site.cat.areas, key=lambda a: a.order):
        parts = []
        for f in [x for x in site.cat.ordered() if x.area == area.id]:
            doc = site.docs.get(f.id, {})
            texts = [(n, doc.get(n, "")) for n in section_names if doc.get(n, "").strip()]
            if texts:
                inner = "".join((f"<h4>{render.esc(n)}</h4>" if len(section_names) > 1 else "") + md(t, f.id.lower() + "-") for n, t in texts)
                parts.append(f'<h3 id="{render.esc(f.id)}"><a href="features/{f.id}.html#{render.anchor(section_names[0])}">{render.esc(f.id)}</a> {render.esc(f.name)}</h3>{inner}')
        if parts:
            out.append(f'<h2 id="{render.esc(area.id)}">{render.esc(area.name)}</h2>' + "".join(parts))
    return "".join(out)


def erd(site: Site, schema: str, database: str) -> str:
    tables = [t for t in site.model.tables if t.table.schema == schema and t.table.database == database]
    names = {t.table.qualified for t in tables}
    lines = ["erDiagram"]
    for t in tables:
        cols = [c for c in t.table.columns if c["name"].endswith(("_no", "_id")) or any(c["name"] in (i.get("columns") or []) for i in t.table.indexes if i.get("primary"))][:6]
        body = "".join(f"\n    {re.sub(r'[^A-Za-z0-9_]', '_', c['type'].split('(')[0].replace(' ', '_'))} {c['name']}" for c in cols)
        lines.append(f"  {t.table.name} {{{body}\n  }}")
    for t in tables:
        for fk in t.table.foreign_keys:
            if fk.get("ref_table") in names:
                lines.append(f'  {fk["ref_table"].split(".", 1)[1]} ||--o{{ {t.table.name} : "{",".join(fk.get("columns") or [])}"')
    return "\n".join(lines)


def db_page(site: Site) -> str:
    out = [md(read_sections_raw(stage_doc(site.config, "08-DB-설계")))]
    schemas = sorted({(t.table.database, t.table.schema) for t in site.model.tables})
    for database, schema in schemas:
        tables = [t for t in site.model.tables if t.table.schema == schema and t.table.database == database]
        out.append(f'<h2 id="s-{render.esc(schema)}">{render.code(database)} · {render.code(schema)} ({len(tables)})</h2>')
        out.append(f'<details><summary>ERD(외래 키)</summary><pre class="mermaid">{render.esc(erd(site, schema, database))}</pre></details>')
        rows = [
            [f'<a href="#t-{render.esc(t.table.qualified)}">{render.code(t.table.name)}</a>', site.feature_link(t.feature, 0, "데이터"), render.esc(t.table.comment), str(len(t.table.columns)), str(len(t.table.indexes)), "RLS" if t.table.rls else "", "파티션" if t.table.kind == "partitioned" else ""]
            for t in tables
        ]
        out.append(render.table(["테이블", "기능", "설명", "칸", "인덱스", "RLS", "파티션"], rows))
        out.extend(table_detail(site, t, 0, with_users=False) for t in tables)
    return "".join(out)


def cache_page(site: Site) -> str:
    out = [md(read_sections_raw(stage_doc(site.config, "09-캐시-동시성")))]
    rows = []
    for c in site.model.caches:
        keys = sorted({u.key for _, u in c.uses if u.key})
        ops_ = sorted({o for o, _ in c.uses})
        rows.append([render.code(c.name), site.feature_link(c.feature, 0, "캐시동시성"), render.code(c.unit), "<br>".join(render.code(k) for k in keys[:5]), str(len(ops_)), ", ".join(sorted({u.operation for _, u in c.uses}))])
    out.append("<h2 id='캐시-목록'>캐시 목록(생성)</h2>" + render.table(["이름", "기능", "단위", "키 식", "operation", "사용"], rows))
    locks: Counter = Counter()
    owners: dict = {}
    for info in site.model.operations:
        trace = site.trace_of(info)
        for lock in trace.locks if trace else []:
            key = (lock.kind, lock.detail, lock.where)
            locks[key] += 1
            owners.setdefault(key, set()).add(info.feature)
    rows = [[scalar.LOCK_LABEL.get(k, k), render.code(d), render.code(w), str(n), ", ".join(site.feature_link(fid, 0) for fid in sorted(f for f in owners[(k, d, w)] if f))] for (k, d, w), n in sorted(locks.items())]
    idem = [o for o in site.model.operations if o.idempotency]
    out.append("<h2 id='멱등'>멱등 키를 받는 operation(생성)</h2><p class='note'>요청 헤더 <code>Idempotency-Key</code> 로 같은 요청의 두 번째 실행을 막는다. 저장은 Valkey 멱등 영역이다.</p>" + render.table(["메서드", "경로", "저장 키 이름", "기능"], [[render.method(o.op.method), render.code(o.op.path), render.code(o.idempotency), site.feature_link(o.feature, 0)] for o in idem]))
    out.append("<h2 id='예약-작업'>예약 작업과 분산 잠금(생성)</h2><p class='note'><code>@SchedulerLock</code> 이 있는 작업은 여러 인스턴스 가운데 하나만 돈다(ShedLock · Redisson). 없는 작업은 인스턴스마다 돈다.</p>" + render.table(["단위", "작업", "일정", "분산 잠금", "최대 잠금", "기능"], [[render.code(j.unit)] + job_row(j) + [site.feature_link(j.feature, 0) if j.feature else '<span class="muted">공통</span>'] for j in site.model.jobs]))
    out.append("<h2 id='잠금-목록'>잠금 목록(정적 분석)</h2><p class='note'>operation 호출 경로에서 찾은 잠금 표시다. 같은 위치를 여러 operation 이 지나면 operation 수가 크다.</p>" + render.table(["종류", "표시", "위치", "operation 수", "기능"], rows))
    return "".join(out)


def api_index_page(site: Site) -> str:
    out = [md(read_sections_raw(stage_doc(site.config, "10-API-명세")))]
    units = [u for u in site.config.units if any(o.op.unit == u.id for o in site.model.operations)]
    out.append("<ul>" + "".join(f'<li><a href="api/{u.id}.html">{render.esc(u.title)}</a> — operation {sum(1 for o in site.model.operations if o.op.unit == u.id)}</li>' for u in units) + "</ul>")
    for area in sorted(site.cat.areas, key=lambda a: a.order):
        rows = []
        for f in [x for x in site.cat.ordered() if x.area == area.id]:
            for o in site.ops_of(f.id):
                trace = site.trace_of(o)
                rows.append(
                    [render.method(o.op.method), f'<a href="features/{f.id}.html#{_op_row_anchor(o)}">{render.code(o.op.path)}</a>', render.code(o.op.unit), render.esc(o.op.summary), render.esc(f.id), str(len(trace.tables)) if trace else "-"]
                )
        if rows:
            out.append(f'<h2 id="{render.esc(area.id)}">{render.esc(area.name)} ({len(rows)})</h2>' + render.table(["메서드", "경로", "단위", "요약", "기능", "테이블"], rows))
    return "".join(out)


def test_page(site: Site) -> str:
    out = [md(read_sections_raw(stage_doc(site.config, "11-테스트-명세")))]
    rows = []
    for f in site.cat.ordered():
        tests = [t.test for t in site.model.tests if t.feature == f.id]
        kinds = Counter()
        for t in tests:
            kinds[t.kind] += t.count
        rows.append([site.feature_link(f.id, 0, "테스트"), str(len(tests)), str(sum(t.count for t in tests))] + [str(kinds.get(k, 0)) for k in ("unit", "integration", "contract", "e2e")])
    out.append("<h2 id='기능별'>기능별 시험(생성)</h2>" + render.table(["기능", "파일", "시험", "단위", "통합", "계약", "E2E"], rows))
    rest = Counter()
    for t in site.model.tests:
        if not t.feature:
            rest[t.test.unit] += t.test.count
    out.append("<h2 id='공통'>기능에 배정되지 않은 시험</h2><p class='note'>공통 코드·하네스·구조 시험이다. 기능 시험이면 catalog 의 패키지·경로 패턴에 더한다.</p>" + render.table(["단위", "시험 수"], [[render.code(u), str(n)] for u, n in sorted(rest.items())]))
    out.append(stage_section_page(site, ["테스트"], "_none"))
    return "".join(out)


def mockup_page(site: Site) -> str:
    out = [md(read_sections_raw(stage_doc(site.config, "12-목업")))]
    missing = 0
    for unit in sorted({s.screen.unit for s in site.model.screens}):
        rows = []
        for s in [x for x in site.model.screens if x.screen.unit == unit]:
            file = mockup_file(site, s)
            if file:
                cell = f'<a href="_src/mockups/{render.esc(file)}"><img src="_src/mockups/{render.esc(file)}" alt="{render.esc(s.screen.route)} 목업" width="320" loading="lazy"></a>'
            else:
                missing += 1
                cell = '<span class="muted">목업 없음</span>'
            rows.append([render.code(s.screen.route), site.feature_link(s.feature, 0, "화면"), cell])
        out.append(f'<h2 id="{render.esc(unit)}">{render.esc(unit)}</h2>' + render.table(["경로", "기능", "목업"], rows))
    out.insert(1, f'<p class="note">목업 있는 화면 {len(site.model.screens) - missing} · 없는 화면 {missing}. 파일은 <code>_src/mockups/&lt;단위&gt;/&lt;경로&gt;.png</code> 다(경로의 <code>/</code> 는 <code>__</code>).</p>')
    return "".join(out)


def mockup_file(site: Site, s: model_module.ScreenInfo) -> str:
    name = s.screen.route.strip("/").replace("/", "__").replace("{", "").replace("}", "") or "index"
    for ext in ("png", "jpg", "webp", "html"):
        rel = f"{s.screen.unit}/{name}.{ext}"
        if (site.config.src / "mockups" / rel).is_file():
            return rel
    return ""


def api_pages(site: Site) -> None:
    for unit in site.config.units:
        sources: list[tuple[str, dict]] = []
        for src in unit.openapi:
            path = site.config.data / "openapi" / f"{unit.id}--{src.name}.json"
            if path.is_file():
                spec = json.loads(path.read_text(encoding="utf-8"))
                sources.append((src.name, scalar.enrich(site.model, unit.id, spec, src.name)))
        if not unit.openapi and any(o.op.unit == unit.id for o in site.model.operations):
            spec = scalar.endpoint_spec(site.model, unit.id, unit.title)
            sources.append((unit.id, scalar.enrich(site.model, unit.id, spec, "")))
        if not sources:
            continue
        site.emit(
            f"api/{unit.id}.html",
            scalar.page(site.model, unit.id, f"{unit.title} API", sources, api_units(site), site.config.title, site.footer()),
        )


def api_units(site: Site) -> list[tuple[str, str]]:
    return [(u.id, u.title) for u in site.config.units if u.openapi or any(o.op.unit == u.id for o in site.model.operations)]


# ───────────────────────────── 실행 ─────────────────────────────


def asset_versions(config: Config) -> dict[str, str]:
    versions = {f"assets/{a.name}": hashlib.sha256(a.read_bytes()).hexdigest()[:8] for a in sorted(ASSETS.glob("*")) if a.is_file()}
    # 외부 스크립트는 잠금 파일의 integrity 로 판을 표시한다 — 파일이 있든 없든 같은 HTML 이 나온다.
    lock = ASSETS.parent / "vendor.lock.json"
    if lock.is_file():
        for package in json.loads(lock.read_text(encoding="utf-8")).get("packages", []):
            digest = hashlib.sha256(package["integrity"].encode()).hexdigest()[:8]
            for target in package.get("files", {}).values():
                versions[f"assets/vendor/{target}"] = digest
    return versions


def render_all(config: Config) -> tuple[model_module.Model, dict[str, bytes]]:
    global _CONFIG
    _CONFIG = config
    model = model_module.build(config)
    render.ASSET_VERSIONS.clear()
    render.ASSET_VERSIONS.update(asset_versions(config))
    site = Site(model)
    index_page(site)
    for f in site.cat.features:
        feature_page(site, f.id)
    stage = {s[1]: s for s in render.STAGES}

    def put(slug: str, body: str, lead: str) -> None:
        num, _, label, phase, _ = stage[slug]
        stage_page(site, num, slug, label, phase, body, lead)

    put("01-요구사항-정의", stage_body(site, "요구사항", "01-요구사항-정의"), "기능마다 구현된 요구를 ID·출처와 함께 모았다.")
    put("02-정책-정의", stage_body(site, "정책", "02-정책-정의"), "업무 규칙과 그 규칙을 강제하는 코드 위치.")
    put("03-IA-화면-목록", ia_page(site), "화면 경로와 화면이 부르는 API. 공통 셸 호출은 따로 접었다.")
    put("04-백로그-추적", backlog_page(site), "하네스마다 SDD 이슈를 읽어 기능에 이었다.")
    put("05-시스템-설계", system_page(site), "단위 구성과 계약, 비동기 처리, 보안 경계.")
    put("06-기능-흐름", stage_section_page(site, ["흐름"], "06-기능-흐름"), "기능별 순서도.")
    put("07-시퀀스", stage_section_page(site, ["시퀀스", "상태 전이"], "07-시퀀스"), "기능별 시퀀스와 상태 전이.")
    put("08-DB-설계", db_page(site), "마이그레이션만 적용한 빈 Postgres 카탈로그에서 생성한다.")
    put("09-캐시-동시성", cache_page(site), "캐시 이름·키 식·사용 operation, 호출 경로에서 찾은 잠금.")
    put("10-API-명세", api_index_page(site), "기능별 operation 색인. 상세는 단위별 Scalar 명세.")
    put("11-테스트-명세", test_page(site), "기능별 시험 파일·수와 핵심 시나리오.")
    put("12-목업", mockup_page(site), "화면별 목업 이미지.")
    api_pages(site)
    for asset in sorted(ASSETS.glob("*")):
        if asset.is_file():
            site.files[f"assets/{asset.name}"] = asset.read_bytes()
    return model, site.files


def _generated_on_disk(config: Config) -> set[str]:
    found = set()
    for path in config.site.glob("*.html"):
        found.add(path.name)
    for d in GENERATED_DIRS:
        for path in (config.site / d).glob("*.html") if (config.site / d).is_dir() else []:
            found.add(f"{d}/{path.name}")
    for path in (config.site / "assets").glob("*") if (config.site / "assets").is_dir() else []:
        if path.is_file():
            found.add(f"assets/{path.name}")
    return found


def build(config: Config) -> list[Path]:
    _, files = render_all(config)
    written = []
    for rel, data in sorted(files.items()):
        path = config.site / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.is_file() or path.read_bytes() != data:
            path.write_bytes(data)
        written.append(path)
    for stale in sorted(_generated_on_disk(config) - set(files)):
        (config.site / stale).unlink()
    return written


def check(config: Config) -> list[str]:
    problems: list[str] = []
    model, files = render_all(config)
    problems += [f"중복 배정 {c}" for c in model.conflicts]
    problems += [f"미배정 operation {o.key} — 패키지 {model_module._operation_package(o) or '?'} 를 catalog 기능의 packages·modules·routes 에 더한다" for o in model.operations if not o.feature]
    problems += [f"미배정 테이블 {t.table.qualified} — catalog 기능의 tables 또는 엔티티 패키지 패턴" for t in model.tables if not t.feature]
    problems += [f"미배정 캐시 {c.unit}:{c.name} — catalog 기능의 caches" for c in model.caches if not c.feature]
    problems += [f"미배정 화면 {s.key} — catalog 기능의 {s.screen.unit}.routes" for s in model.screens if not s.feature]
    for f in model.catalog.features:
        path = feature_doc(config, f.id)
        rel = path.relative_to(config.repo)
        if not path.is_file():
            problems.append(f"원고 없음 {rel}")
            continue
        text = path.read_text(encoding="utf-8")
        parts = markdown.sections(text)
        if not parts.get("_title", "").startswith(f.id):
            problems.append(f"{rel}: 첫 제목은 '# {f.id} {f.name}'")
        missing = [s for s in render.FEATURE_SECTIONS if s not in parts]
        if missing:
            problems.append(f"{rel}: 빠진 절 {', '.join(missing)}")
        empty = [s for s in render.FEATURE_SECTIONS if s in parts and not parts[s].strip()]
        if empty:
            problems.append(f"{rel}: 빈 절 {', '.join(empty)}")
        if TODO in text:
            problems.append(f"{rel}: 작성 전 표시 {TODO} {text.count(TODO)}곳")
        for name, head in (("요구사항", REQUIREMENT_HEAD), ("정책", POLICY_HEAD)):
            tables = markdown.tables_in(parts.get(name, ""))
            if parts.get(name, "").strip() and TODO not in parts.get(name, "") and not any(h[: len(head)] == head for h, _ in tables):
                problems.append(f"{rel}: {name} 표 머리는 | {' | '.join(head)} |")
    for unit in config.units:
        for src in unit.openapi:
            data = config.data / "openapi" / f"{unit.id}--{src.name}.json"
            if not data.is_file():
                problems.append(f"OpenAPI 사본 없음 {data.relative_to(config.repo)} — uv run --no-project --with pyyaml python3 tools/docs/feature_docs.py refresh openapi")
                continue
            recorded = json.loads(data.read_text(encoding="utf-8")).get("x-docs-source", {}).get("sha256")
            current = fingerprint.file_sha256(config.repo / src.source) if (config.repo / src.source).is_file() else None
            if recorded != current:
                problems.append(f"OpenAPI 원본이 바뀌었다 {src.source} — uv run --no-project --with pyyaml python3 tools/docs/feature_docs.py refresh openapi")
    for db in config.databases:
        data = config.data / "schema" / f"{db.id}.json"
        if not data.is_file():
            problems.append(f"스키마 스냅숏 없음 {db.id} — python3 tools/docs/feature_docs.py refresh schema")
            continue
        recorded = json.loads(data.read_text(encoding="utf-8")).get("sources")
        if recorded != fingerprint.migration_sources(config.repo, db.migrations):
            problems.append(f"마이그레이션이 바뀌었다 {db.id} — python3 tools/docs/feature_docs.py refresh schema")
    differ = [rel for rel, data in sorted(files.items()) if not (config.site / rel).is_file() or (config.site / rel).read_bytes() != data]
    stale = sorted(_generated_on_disk(config) - set(files))
    if differ:
        problems.append(f"생성 결과가 커밋본과 다르다 {len(differ)}개(예: {', '.join(differ[:3])}) — python3 tools/docs/feature_docs.py build")
    if stale:
        problems.append(f"지워야 할 생성물 {', '.join(stale[:5])} — python3 tools/docs/feature_docs.py build")
    problems += [p for p in _broken_links(config, files) if "assets/vendor/" not in p]
    problems += vendor_problems(config)
    problems += changed_rule_problems(config, model)
    return problems


VENDOR_FILES = ("assets/vendor/scalar/standalone.js", "assets/vendor/mermaid/mermaid.min.js")
VENDOR_FIX = "python3 tools/docs/feature_docs.py refresh vendor"


RULES_FILE = ".agents/verify-checks.json"


def generator_inputs(config: Config, model: model_module.Model | None = None) -> set[str]:
    """생성기가 읽는 파일(리포 기준 경로). changed 게이트의 문서 검사 규칙이 이것을 모두 덮어야 한다."""
    model = model or model_module.build(config)
    repo = config.repo

    def under(folder: Path) -> set[str]:
        return {path.relative_to(repo).as_posix() for path in folder.rglob("*") if path.is_file()} if folder.is_dir() else set()

    found = under(config.src) | under(config.data)
    for unit in config.units:
        found |= {source.source for source in unit.openapi}
        index = model.indexes.get(unit.id)
        if index is not None:
            found |= {f"{unit.root}/{cls.file}" for cls in index.classes.values()}
        if unit.idempotency:
            found.add(f"{unit.root}/{unit.idempotency}")
    for database in config.databases:
        for folder in database.migrations:
            found |= under(repo / folder)
    found |= {o.endpoint.file for o in model.operations if isinstance(o.endpoint, python_routes.PyEndpoint)}
    found |= {path for s in model.screens for path in s.screen.files}
    found |= {t.test.path for t in model.tests}
    found |= {issue.path for issue, _ in model.issues}
    if (repo / "tools/harness/units.json").is_file():
        found.add("tools/harness/units.json")
    for page in config.src.rglob("*.md") if config.src.is_dir() else []:
        found |= {m.group(1) for m in INCLUDE_RE.finditer(page.read_text(encoding="utf-8"))}
    return found


def _is_docs_rule(check: dict) -> bool:
    command = check.get("command", [])
    return any(part.endswith("feature_docs.py") for part in command) and "check" in command and "--assets" not in command


def changed_rule_problems(config: Config, model: model_module.Model) -> list[str]:
    """`.agents/verify-checks.json` 의 문서 검사 규칙이 생성기 입력을 모두 덮는가.

    덮지 않은 입력만 바꾼 커밋은 changed 를 통과하고, 다음 전체 검사에서 "생성 결과가 커밋본과 다르다"로 실패한다.
    규칙 파일이 없는 리포(시험 fixture 등)는 보지 않는다.
    """
    rules = config.repo / RULES_FILE
    if not rules.is_file():
        return []
    docs_rules = [check for check in json.loads(rules.read_text(encoding="utf-8")).get("checks", []) if _is_docs_rule(check)]
    if not docs_rules:
        return [f"changed 규칙에 기능 문서 검사가 없다 — {RULES_FILE} 에 feature_docs.py check 규칙을 둔다"]
    patterns = [pattern for check in docs_rules for pattern in check.get("paths", [])]
    missed = sorted(path for path in generator_inputs(config, model) if not any(fnmatch.fnmatchcase(path, p) for p in patterns))
    if not missed:
        return []
    folders = sorted({"/".join(path.split("/")[:2]) for path in missed})
    return [f"changed 문서 검사 규칙이 생성기 입력 {len(missed)}개를 덮지 않는다(예: {', '.join(missed[:3])} · 폴더 {', '.join(folders[:8])}) — {RULES_FILE} 의 paths 에 더한다"]


def check_assets(config: Config) -> list[str]:
    """사이트 자산만 본다 — 복사본은 `tools/docs/assets` 원본과 같고, 리포에 둔 외부 스크립트는 잠금 파일의 sha256 과 같다.

    생성물·외부 라이브러리는 파일마다 시험이 없어 이 검사가 책임진다(`.agents/verify-checks.json` covers). 파일을 쓰지 않는다.
    """
    problems = []
    for source in sorted(path for path in ASSETS.glob("*") if path.is_file()):
        copy = config.site / "assets" / source.name
        if not copy.is_file() or copy.read_bytes() != source.read_bytes():
            problems.append(f"자산 복사본이 원본과 다르다 assets/{source.name} — python3 tools/docs/feature_docs.py build")
    return problems + vendor_problems(config)


def vendor_problems(config: Config) -> list[str]:
    """`assets/vendor` 의 파일이 잠금 파일에 있고 sha256 이 같은가. 잠금 파일이나 vendor 폴더가 없으면 볼 것이 없다(없는 것은 vendor_warning)."""
    lock = config.repo / config.vendor_lock
    vendor = config.site / "assets" / "vendor"
    if not lock.is_file() or not vendor.is_dir():
        return []
    problems, expected = [], {}
    for package in json.loads(lock.read_text(encoding="utf-8")).get("packages", []):
        digests = package.get("sha256")
        if not isinstance(digests, dict):
            problems.append(f"잠금 파일에 파일 sha256 이 없다 {package.get('name')} — {VENDOR_FIX}")
            digests = {}
        for target in package.get("files", {}).values():
            expected[target] = digests.get(target)
    for path in sorted(item for item in vendor.rglob("*") if item.is_file()):
        relative = path.relative_to(vendor).as_posix()
        if relative == "README.md":
            continue
        if relative not in expected:
            problems.append(f"잠금 파일에 없는 외부 파일 assets/vendor/{relative}")
        elif not expected[relative]:
            problems.append(f"잠금 파일에 이 파일의 sha256 이 없다 assets/vendor/{relative} — {VENDOR_FIX}")
        elif hashlib.sha256(path.read_bytes()).hexdigest() != expected[relative]:
            problems.append(f"외부 파일이 잠금과 다르다 assets/vendor/{relative} — {VENDOR_FIX}")
    return problems


def vendor_warning(config: Config) -> str:
    """외부 스크립트는 문서를 볼 때만 필요하다. 없으면 실패가 아니라 경고로 알린다."""
    missing = [path for path in VENDOR_FILES if not (config.site / path).is_file()]
    if not missing:
        return ""
    return f"외부 스크립트 없음 {', '.join(missing)} — 그림·API 화면을 보려면 python3 tools/docs/feature_docs.py refresh vendor"


LINK_RE = re.compile(r'(?:href|src)="([^"#?]+)(?:[#?][^"]*)?"')


def _broken_links(config: Config, files: dict[str, bytes]) -> list[str]:
    broken = []
    for rel, data in files.items():
        if not rel.endswith(".html"):
            continue
        base = Path(rel).parent
        for target in set(LINK_RE.findall(data.decode("utf-8"))):
            if re.match(r"^[a-z]+:", target) or target.startswith("//"):
                continue
            key = os.path.normpath((base / target).as_posix())
            if key in files or (config.site / key).exists():
                continue
            broken.append(f"끊긴 링크 {rel} → {target}")
    return sorted(set(broken))[:50]


def stats(config: Config) -> str:
    model = model_module.build(config)
    lines = [
        f"기능 {len(model.catalog.features)} · operation {len(model.operations)} · 테이블 {len(model.tables)} · 캐시 {len(model.caches)} · 화면 {len(model.screens)}",
        f"미배정 operation {sum(1 for o in model.operations if not o.feature)} · 테이블 {sum(1 for t in model.tables if not t.feature)} · 캐시 {sum(1 for c in model.caches if not c.feature)} · 화면 {sum(1 for s in model.screens if not s.feature)} · 중복 {len(model.conflicts)}",
        f"시험 파일 {len(model.tests)}(기능 배정 {sum(1 for t in model.tests if t.feature)}) · SDD 이슈 {len(model.issues)}(기능 배정 {sum(1 for _, f in model.issues if f)})",
    ]
    todo = 0
    for f in model.catalog.features:
        path = feature_doc(config, f.id)
        todo += path.read_text(encoding="utf-8").count(TODO) if path.is_file() else len(render.FEATURE_SECTIONS)
    lines.append(f"원고 작성 전 표시 {todo}")
    return "\n".join(lines)


def brief(config: Config, feature_id: str) -> str:
    """원고를 쓰는 사람에게 줄 기능 요약(Markdown). 생성기가 아는 사실만 싣는다."""
    model = model_module.build(config)
    site = Site(model)
    f = model.catalog.feature(feature_id)
    out = [f"# {f.id} {f.name}", "", f.summary, "", "## 배정 규칙", "```json", json.dumps({"units": f.units, "tables": f.tables, "caches": f.caches, "sdd": f.sdd}, ensure_ascii=False, indent=1), "```", ""]
    out.append("## operation")
    for info in site.ops_of(f.id):
        trace = site.trace_of(info)
        impl = ""
        if isinstance(info.endpoint, kotlin.Endpoint):
            impl = f"{info.endpoint.cls}.{info.endpoint.function} ({info.endpoint.file}:{info.endpoint.line})"
        elif info.endpoint is not None:
            impl = f"{getattr(info.endpoint, 'module', '')}.{getattr(info.endpoint, 'function', '')} ({getattr(info.endpoint, 'file', '')})"
        out.append(f"- {info.op.method} {info.op.path} — {info.op.summary} — {impl}" + (f" — 중계 → {info.relay_to}" if info.relay_to else ""))
        if trace:
            path = [v for v in trace.visited if not model_module.NOISE_CLASSES.match(v.split('.')[0])][:10]
            out.append(f"  - 경로: {' → '.join(path)}")
            if trace.tables:
                out.append("  - 테이블: " + ", ".join(f"{t}({''.join(sorted(m))})" for t, m in sorted(trace.tables.items())))
            if trace.caches:
                out.append("  - 캐시: " + ", ".join(sorted({f'{c.name}:{c.operation}' for c in trace.caches})))
            if trace.locks:
                out.append("  - 잠금: " + ", ".join(sorted({f'{l.kind}:{l.detail}@{l.where}' for l in trace.locks}))[:400])
            if trace.clients:
                out.append("  - 외부: " + ", ".join(trace.clients[:6]))
            if trace.workflows:
                out.append("  - 워크플로: " + ", ".join(trace.workflows))
    out.append("")
    out.append("## 소유 테이블")
    for t in [x for x in model.tables if x.feature == f.id]:
        out.append(f"- {t.table.qualified} — {t.table.comment} — 칸 {len(t.table.columns)} · 인덱스 {len(t.table.indexes)} · RLS {t.table.rls} · 엔티티 {', '.join(t.entities)}")
    out.append("")
    out.append("## 캐시")
    for c in [x for x in model.caches if x.feature == f.id]:
        out.append(f"- {c.unit}:{c.name} — 키 식 {sorted({u.key for _, u in c.uses if u.key})[:4]}")
    out.append("")
    out.append("## 화면")
    for s in [x for x in model.screens if x.feature == f.id]:
        out.append(f"- {s.screen.unit} {s.screen.route} ({s.screen.page}) — " + ", ".join(f"{c.method} {c.path}" for c in s.screen.calls[:15]))
    out.append("")
    out.append("## 시험 파일")
    for t in sorted([x.test for x in model.tests if x.feature == f.id], key=lambda t: t.path)[:60]:
        out.append(f"- {t.path} ({t.kind}, {t.count})")
    out.append("")
    out.append("## SDD 이슈")
    for i, fid in model.issues:
        if fid == f.id:
            out.append(f"- [{i.status}] {i.path} — {i.title}")
    return "\n".join(out) + "\n"
