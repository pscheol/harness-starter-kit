"""문서 사이트의 Scalar 페이지. OpenAPI 사본에 기능·호출 테이블·인덱스·캐시·시퀀스를 덧붙인다.

원본 OpenAPI 는 각 단위가 소유한다. 여기서는 사본만 고친다(태그를 기능 이름으로, 영역별 x-tagGroups, 설명 덧붙임).
"""

from __future__ import annotations

import copy
import json

from . import model as model_module
from . import render
from .extract import kotlin
from .extract import openapi as openapi_extract

LOCK_LABEL = {"pessimistic": "비관적 잠금", "optimistic": "낙관적 잠금", "advisory": "advisory 잠금", "skip-locked": "SKIP LOCKED"}


def feature_tag(model: model_module.Model, feature_id: str | None) -> str:
    if not feature_id:
        return "미배정"
    f = model.catalog.feature(feature_id)
    return f"{f.id} {f.name}"


def index_names(model: model_module.Model, table: str) -> str:
    info = model.table(table)
    if info is None:
        return ""
    names = [i["name"] for i in info.table.indexes]
    return ", ".join(f"`{n}`" for n in names[:6]) + (f" 외 {len(names) - 6}" if len(names) > 6 else "")


def appendix(model: model_module.Model, info: model_module.OperationInfo, depth: int = 1) -> str:
    """operation 설명 끝에 붙일 Markdown."""
    up = "../" * depth
    lines = ["", "", "---", ""]  # 앞 줄과 붙으면 `---` 가 setext 제목이 된다
    if info.feature:
        f = model.catalog.feature(info.feature)
        lines.append(f"**기능** [{f.id} {f.name}]({up}features/{f.id}.html#api)")
        lines.append("")
    if info.relay_to:
        lines.append(f"**중계** 이 요청은 `{info.relay_to}` 로 그대로 넘어간다. 테이블·캐시는 상류 operation 의 것이다.")
        lines.append("")
        upstream = model.operation(info.relay_to)
        trace = upstream.trace if upstream else None
    else:
        trace = info.trace
    if info.idempotency:
        lines.append(f"**멱등** `Idempotency-Key` 헤더를 받는다 — 저장 키 이름 `{info.idempotency}`. 같은 키로 다시 보내면 첫 응답을 돌려준다.")
        lines.append("")
    if isinstance(info.endpoint, kotlin.Endpoint):
        lines.append(f"**구현** `{info.endpoint.cls.rsplit('.', 1)[-1]}.{info.endpoint.function}` — `{info.endpoint.file}:{info.endpoint.line}`")
        lines.append("")
    if trace is not None:
        path = [v for v in trace.visited if not model_module.NOISE_CLASSES.match(v.split(".")[0])][:8]
        if path:
            lines.append("**호출 경로**(정적 분석 근사) " + " → ".join(f"`{p}`" for p in path))
            lines.append("")
        if trace.tables:
            lines += ["| 테이블 | 접근 | 인덱스 |", "|---|---|---|"]
            for table in sorted(trace.tables):
                modes = trace.tables[table]
                access = "·".join(x for x, k in (("읽기", "R"), ("쓰기", "W")) if k in modes)
                lines.append(f"| `{table}` | {access} | {index_names(model, table)} |")
            lines.append("")
        if trace.caches:
            seen = set()
            for use in trace.caches:
                key = (use.name, use.operation, use.key)
                if key in seen:
                    continue
                seen.add(key)
                detail = f" — 키 `{use.key}`" if use.key else ""
                lines.append(f"- 캐시 `{use.name}` {use.operation}{detail} (`{use.where}`)")
            lines.append("")
        if trace.locks:
            for lock in trace.locks[:6]:
                lines.append(f"- {LOCK_LABEL.get(lock.kind, lock.kind)} `{lock.detail}` (`{lock.where}`)")
            lines.append("")
        if trace.clients:
            lines.append("**외부 호출** " + ", ".join(f"`{c}`" for c in trace.clients[:8]))
            lines.append("")
        if trace.workflows:
            lines.append("**워크플로 시작** " + ", ".join(f"`{w}`" for w in trace.workflows))
            lines.append("")
    seq = model_module.sequence(info if not info.relay_to else (model.operation(info.relay_to) or info))
    if seq:
        lines += ["```mermaid", seq, "```", ""]
    if info.tests:
        lines.append("**시험** " + ", ".join(f"`{t.rsplit('/', 1)[-1]}`" for t in info.tests[:8]))
    return "\n".join(lines).rstrip() + "\n"


def enrich(model: model_module.Model, unit_id: str, spec: dict, spec_name: str) -> dict:
    out = copy.deepcopy(spec)
    out.pop("x-docs-source", None)
    infos = {(i.op.method.lower(), i.op.path): i for i in model.operations if i.op.unit == unit_id and i.op.spec == spec_name}
    used_tags: dict[str, str] = {}
    for path, item in out.get("paths", {}).items():
        for method_name in openapi_extract.HTTP_METHODS:
            op = item.get(method_name)
            if not op:
                continue
            info = infos.get((method_name, path))
            original = ", ".join(op.get("tags", []))
            tag = feature_tag(model, info.feature if info else None)
            op["tags"] = [tag]
            used_tags[tag] = info.feature if info and info.feature else ""
            description = op.get("description", "")
            if original:
                description += f"\n\n원래 태그: `{original}`"
            if info is not None:
                description += appendix(model, info)
                op["x-feature-docs"] = {
                    "feature": info.feature,
                    "relayTo": info.relay_to or None,
                    "tables": {t: sorted(m) for t, m in (info.trace.tables.items() if info.trace else [])},
                    "caches": sorted({c.name for c in info.trace.caches}) if info.trace else [],
                }
            op["description"] = description.strip()
    _tag_groups(model, out, used_tags)
    return out


def _tag_groups(model: model_module.Model, spec: dict, used: dict[str, str]) -> None:
    spec["tags"] = []
    groups: dict[str, list[str]] = {}
    for f in model.catalog.ordered():
        tag = f"{f.id} {f.name}"
        if tag in used:
            spec["tags"].append({"name": tag, "description": f"{f.summary}\n\n[기능 문서](../features/{f.id}.html)"})
            groups.setdefault(model.catalog.area(f.area).name, []).append(tag)
    if "미배정" in used:
        spec["tags"].append({"name": "미배정"})
        groups.setdefault("미배정", []).append("미배정")
    spec["x-tagGroups"] = [{"name": name, "tags": tags} for name, tags in groups.items()]


def endpoint_spec(model: model_module.Model, unit_id: str, title: str) -> dict:
    """OpenAPI 스냅숏이 없는 단위(FastAPI·골격 JVM)는 정적 추출한 경로로 최소 문서를 만든다."""
    paths: dict[str, dict] = {}
    for info in model.operations:
        if info.op.unit != unit_id or info.op.method == "WS":
            continue
        e = info.endpoint
        owner = getattr(e, "module", "") or getattr(e, "cls", "")
        entry = {
            "summary": getattr(e, "summary", "") or getattr(e, "function", ""),
            "operationId": f"{owner}.{getattr(e, 'function', '')}".strip("."),
            "description": f"구현 `{owner}.{getattr(e, 'function', '')}` — `{getattr(e, 'file', '')}:{getattr(e, 'line', '')}`",
            "responses": {"200": {"description": "OK"}},
        }
        if info.op.spec.startswith("#"):
            entry["description"] += f"\n\n같은 경로를 여는 다른 앱: `{info.op.spec[1:]}`"
            if info.op.path in paths and info.op.method.lower() in paths[info.op.path]:
                continue
        paths.setdefault(info.op.path, {})[info.op.method.lower()] = entry
    ws = [i for i in model.operations if i.op.unit == unit_id and i.op.method == "WS"]
    description = "정적 추출(컨트롤러·라우터)로 만든 경로 목록이다. 요청·응답 스키마는 단위 코드를 본다."
    if ws:
        description += "\n\nWebSocket: " + ", ".join(f"`{i.op.path}`" for i in ws)
    return {"openapi": "3.1.0", "info": {"title": title, "version": "정적 추출", "description": description}, "paths": paths}


def page(model: model_module.Model, unit_id: str, title: str, sources: list[tuple[str, dict]], units: list[tuple[str, str]], site_title: str, footer: str) -> str:
    """API 명세 페이지. Scalar 가 자기 목차를 그리므로 사이트 목차 없이 전체 폭을 쓴다."""
    payload = sources[0][1] if len(sources) == 1 else {"sources": [{"title": name, "slug": name, "content": spec} for name, spec in sources]}
    data = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    # 페이지 안 JSON 은 HTML 파서가 먼저 본다. `<` 를 모두 \u003c 로 두어 `</script>`·`<!--` 가 스크립트 블록을 끝내거나 바꾸지 못하게 한다.
    data = data.replace("<", "\\u003c")
    switcher = '<ul class="apis">' + "".join(
        f'<li><a href="{render.esc(uid)}.html"{" aria-current=page" if uid == unit_id else ""}>{render.esc(label)}</a></li>' for uid, label in units
    ) + '<li><a href="../10-API-명세.html">operation 색인</a></li><li><a href="../index.html">기능 지도</a></li></ul>'
    body = (
        f'<p class="note">원본 OpenAPI 는 {render.esc(unit_id)} 단위가 소유한다. 이 페이지는 사본의 태그를 기능 이름으로 바꾸고 operation 마다 기능·호출 경로·테이블과 인덱스·캐시·잠금·시퀀스를 덧붙였다. '
        "실행 중 서버의 화면은 그 서버의 <code>/scalar</code> 다.</p>"
        f'<div id="app"></div><script type="application/json" id="spec">{data}</script>'
    )
    return render.page(
        title=title,
        site_title=site_title,
        depth=1,
        nav_html="",
        eyebrow=f"<b>API 명세</b> · {render.esc(unit_id)}",
        heading=title,
        lead=switcher,
        body=body,
        footer=footer,
        scripts=["assets/vendor/scalar/standalone.js", "assets/scalar-page.js"],
    )
