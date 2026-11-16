"""HTML 조각과 페이지 틀. 같은 입력이면 같은 문자열을 낸다(시각·난수 없음)."""

from __future__ import annotations

import html
from dataclasses import dataclass

from . import markdown

STAGES = [
    ("01", "01-요구사항-정의", "요구사항 정의", "S1 분석", "기능별 요구 ID·출처"),
    ("02", "02-정책-정의", "정책 정의", "S2 기획", "업무 규칙과 강제 위치"),
    ("03", "03-IA-화면-목록", "IA·화면 목록", "S2 기획", "화면 경로와 화면이 부르는 API"),
    ("04", "04-백로그-추적", "백로그 추적", "S4 계획", "SDD 이슈 → 기능"),
    ("05", "05-시스템-설계", "시스템 설계", "S3 설계", "단위 구성·계약·비동기·보안"),
    ("06", "06-기능-흐름", "기능 흐름", "S3 설계", "기능별 순서도"),
    ("07", "07-시퀀스", "시퀀스·상태", "S3 설계", "기능별 시퀀스·상태 전이"),
    ("08", "08-DB-설계", "DB 설계", "S3 설계", "ERD·칸·인덱스·제약·RLS"),
    ("09", "09-캐시-동시성", "캐시·동시성", "S3 설계", "캐시 이름·키·무효화, 잠금"),
    ("10", "10-API-명세", "API 명세", "S3 설계", "operation 색인과 Scalar 명세"),
    ("11", "11-테스트-명세", "테스트 명세", "S6 테스트", "기능별 시험 파일·시나리오"),
    ("12", "12-목업", "목업", "S2 기획", "화면별 목업"),
]
FEATURE_SECTIONS = [
    "개요",
    "요구사항",
    "정책",
    "화면",
    "흐름",
    "시퀀스",
    "상태 전이",
    "데이터",
    "캐시·동시성",
    "API",
    "테스트",
    "변경 영향",
]
METHOD_ORDER = {"GET": 0, "POST": 1, "PUT": 2, "PATCH": 3, "DELETE": 4, "WS": 5}

e = html.escape
ASSET_VERSIONS: dict[str, str] = {}  # "assets/site.css" → 내용 sha256 앞 8자. 브라우저 캐시를 내용이 바뀔 때만 버린다.


def asset(path: str) -> str:
    version = ASSET_VERSIONS.get(path)
    return f"{path}?v={version}" if version else path


def esc(value: object) -> str:
    return html.escape("" if value is None else str(value))


def method(m: str) -> str:
    return f'<span class="m m-{esc(m)}">{esc(m)}</span>'


def rw(modes: set[str] | str) -> str:
    modes = set(modes)
    return " ".join(f'<span class="rw rw-{m}">{"쓰기" if m == "W" else "읽기"}</span>' for m in ("R", "W") if m in modes)


def code(text: object) -> str:
    return f"<code>{esc(text)}</code>"


def table(head: list[str], rows: list[list[str]], cls: str = "") -> str:
    """셀은 이미 HTML 이다. 호출부가 esc 를 책임진다."""
    if not rows:
        return '<p class="muted">없음</p>'
    out = [f'<div class="table{(" " + cls) if cls else ""}"><table><thead><tr>']
    out += [f"<th>{h}</th>" for h in head]
    out.append("</tr></thead><tbody>")
    for row in rows:
        out.append("<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>")
    out.append("</tbody></table></div>")
    return "".join(out)


def anchor(text: str) -> str:
    return markdown.slug(text)


@dataclass
class NavItem:
    href: str
    label: str
    num: str = ""
    current: bool = False
    search: str = ""


@dataclass
class NavGroup:
    title: str
    items: list[NavItem]
    collapsible: bool = False
    open: bool = False


def nav(groups: list[NavGroup]) -> str:
    out = ['<nav class="side" aria-label="문서 목차">']
    for g in groups:
        items = "".join(
            f'<li data-search="{esc(i.search or i.label)}"><a href="{esc(i.href)}"'
            + (' aria-current="page"' if i.current else "")
            + f'>{f"<span class=num>{esc(i.num)}</span>" if i.num else ""}<span>{esc(i.label)}</span></a></li>'
            for i in g.items
        )
        if g.collapsible:
            out.append(f'<details{" open" if g.open else ""}><summary>{esc(g.title)}</summary><ul>{items}</ul></details>')
        else:
            out.append(f"<h2>{esc(g.title)}</h2><ol>{items}</ol>")
    out.append("</nav>")
    return "".join(out)


def page(
    *,
    title: str,
    site_title: str,
    depth: int,
    nav_html: str,
    eyebrow: str,
    heading: str,
    lead: str,
    body: str,
    toc: list[tuple[str, str]] | None = None,
    footer: str = "",
    scripts: list[str] | None = None,
) -> str:
    up = "../" * depth
    toc_html = ""
    if toc:
        toc_html = '<aside class="toc" aria-label="이 페이지"><b>이 페이지</b>' + "".join(
            f'<a href="#{esc(a)}">{esc(t)}</a>' for t, a in toc
        ) + "</aside>"
    extra = "".join(f'<script src="{up}{esc(asset(s))}"></script>' for s in (scripts or []))
    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)} — {esc(site_title)}</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="{up}{asset('assets/site.css')}">
</head>
<body>
<a class="skip" href="#main">본문으로</a>
<header class="top"><a class="brand" href="{up}index.html">{esc(site_title)}<span>개발자용</span></a>
<label class="search"><span class="skip">찾기</span><input type="search" placeholder="기능·경로·테이블 찾기" data-search-input></label></header>
<div class="frame{' with-toc' if toc else ''}{' wide' if not nav_html else ''}">
{nav_html}
<main id="main">
<header><p class="eyebrow">{eyebrow}</p><h1>{esc(heading)}</h1>{f'<div class="lead">{lead}</div>' if lead else ''}</header>
{body}
<footer class="page">{footer}</footer>
</main>
{toc_html}
</div>
<script src="{up}{asset('assets/vendor/mermaid/mermaid.min.js')}"></script>
<script src="{up}{asset('assets/site.js')}"></script>
{extra}
</body>
</html>
"""
