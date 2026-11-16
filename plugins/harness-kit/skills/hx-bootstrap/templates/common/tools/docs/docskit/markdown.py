"""원고 md → HTML. 표준 라이브러리만 쓴다.

지원: 제목(#~####) · 문단 · 목록(중첩) · 표 · 코드 블록(mermaid 는 그림) · 인용 · 가로줄 · 인라인 코드·굵게·기울임·링크.
모든 글자는 먼저 escape 하고 허용한 태그만 만든다. `.md` 링크는 `.html` 로 바꾼다.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field

FLAG_RE = re.compile(r"\[(NEEDS CLARIFICATION:[^\]]*|확인 필요[^\]]*|가정|미확인)\]")
LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
CODE_RE = re.compile(r"`([^`]+)`")
BOLD_RE = re.compile(r"\*\*([^*]+)\*\*")
EM_RE = re.compile(r"(?<![*\w])\*([^*\s][^*]*)\*(?![*\w])")
HEADING_RE = re.compile(r"^(#{1,4})\s+(.*?)\s*#*\s*$")
LIST_RE = re.compile(r"^(\s*)([-*]|\d+\.)\s+(.*)$")
TABLE_SEP_RE = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$")


def slug(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"[^\w\s가-힣-]", "", text).strip().lower()
    return re.sub(r"\s+", "-", text)


SAFE_SCHEMES = ("http:", "https:", "mailto:")


def _link_target(url: str) -> str | None:
    """링크 주소. 원고는 신뢰하지 않는 입력으로 본다 — http·https·mailto·상대 경로·`#` 만 링크로 두고 나머지 스킴은 None."""
    if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", url):
        return url if url.lower().startswith(SAFE_SCHEMES) else None
    if url.startswith("#"):
        return url
    base, _, frag = url.partition("#")
    if base.endswith(".md") and "/" not in base:  # 사이트 안 원고끼리의 링크만 생성된 HTML 로 바꾼다
        base = base[:-3] + ".html"
    return base + ("#" + frag if frag else "")


def inline(text: str) -> str:
    codes: list[str] = []

    def keep_code(m: re.Match) -> str:
        codes.append(f"<code>{html.escape(m.group(1))}</code>")
        return f"\x00{len(codes) - 1}\x00"

    text = CODE_RE.sub(keep_code, text)
    links: list[str] = []

    def keep_link(m: re.Match) -> str:
        label = html.escape(m.group(1))
        safe = _link_target(m.group(2))
        if safe is None:
            links.append(label)
            return f"\x01{len(links) - 1}\x01"
        target = html.escape(safe, quote=True)
        external = ' rel="noopener"' if re.match(r"^https?:", m.group(2)) else ""
        links.append(f'<a href="{target}"{external}>{label}</a>')
        return f"\x01{len(links) - 1}\x01"

    text = LINK_RE.sub(keep_link, text)
    text = html.escape(text, quote=False)
    text = BOLD_RE.sub(r"<strong>\1</strong>", text)
    text = EM_RE.sub(r"<em>\1</em>", text)
    text = FLAG_RE.sub(lambda m: f'<span class="flag">{m.group(1)}</span>', text)
    text = re.sub("\x01(\\d+)\x01", lambda m: links[int(m.group(1))], text)
    text = re.sub("\x00(\\d+)\x00", lambda m: codes[int(m.group(1))], text)
    return text


def _cells(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|") and not line.endswith("\\|"):
        line = line[:-1]
    cells, cur, in_code = [], [], False
    for i, c in enumerate(line):
        if c == "`":
            in_code = not in_code
        if c == "|" and not in_code and (i == 0 or line[i - 1] != "\\"):
            cells.append("".join(cur).strip())
            cur = []
        else:
            cur.append(c)
    cells.append("".join(cur).strip())
    return [c.replace("\\|", "|") for c in cells]


@dataclass
class Heading:
    level: int
    text: str
    anchor: str


@dataclass
class Rendered:
    html: str
    headings: list[Heading] = field(default_factory=list)


def render(text: str, heading_offset: int = 0, anchor_prefix: str = "") -> Rendered:
    lines = text.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    headings: list[Heading] = []
    i = 0
    paragraph: list[str] = []

    def flush() -> None:
        if paragraph:
            out.append(f"<p>{inline(' '.join(s.strip() for s in paragraph))}</p>")
            paragraph.clear()

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if stripped.startswith("```"):
            flush()
            lang = stripped[3:].strip()
            block = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                block.append(lines[i])
                i += 1
            i += 1
            code = "\n".join(block)
            if lang == "mermaid":
                out.append(f'<pre class="mermaid">{html.escape(code)}</pre>')
            else:
                cls = f' class="language-{html.escape(lang, quote=True)}"' if lang else ""
                out.append(f"<pre><code{cls}>{html.escape(code)}</code></pre>")
            continue
        if not stripped:
            flush()
            i += 1
            continue
        m = HEADING_RE.match(line)
        if m:
            flush()
            level = min(6, len(m.group(1)) + heading_offset)
            anchor = anchor_prefix + slug(m.group(2))
            headings.append(Heading(level, m.group(2), anchor))
            out.append(f'<h{level} id="{html.escape(anchor, quote=True)}">{inline(m.group(2))}</h{level}>')
            i += 1
            continue
        if stripped in ("---", "***"):
            flush()
            out.append("<hr>")
            i += 1
            continue
        if stripped.startswith("|") and i + 1 < len(lines) and TABLE_SEP_RE.match(lines[i + 1]):
            flush()
            head = _cells(line)
            i += 2
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(_cells(lines[i]))
                i += 1
            out.append('<div class="table md"><table><thead><tr>' + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>")
            for row in rows:
                row = row + [""] * (len(head) - len(row))
                out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in row[: len(head)]) + "</tr>")
            out.append("</tbody></table></div>")
            continue
        if stripped.startswith(">"):
            flush()
            quote = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote.append(lines[i].strip()[1:].lstrip())
                i += 1
            out.append(f"<blockquote>{render(chr(10).join(quote)).html}</blockquote>")
            continue
        if LIST_RE.match(line):
            flush()
            block = []
            while i < len(lines) and (LIST_RE.match(lines[i]) or (lines[i].startswith("  ") and lines[i].strip())):
                block.append(lines[i])
                i += 1
            out.append(_list(block))
            continue
        paragraph.append(line)
        i += 1
    flush()
    return Rendered("\n".join(out), headings)


def _list(block: list[str]) -> str:
    items: list[tuple[int, str, str]] = []
    for line in block:
        m = LIST_RE.match(line)
        if m:
            items.append((len(m.group(1).replace("\t", "    ")), "ol" if m.group(2)[0].isdigit() else "ul", m.group(3)))
        elif items:
            indent, kind, text = items[-1]
            items[-1] = (indent, kind, text + " " + line.strip())
    out: list[str] = []
    stack: list[tuple[int, str]] = []
    for indent, kind, text in items:
        while stack and indent < stack[-1][0]:
            out.append(f"</li></{stack.pop()[1]}>")
        if not stack or indent > stack[-1][0]:
            stack.append((indent, kind))
            out.append(f"<{kind}><li>")
        else:
            out.append("</li><li>")
        checkbox = re.match(r"^\[( |x|X)\]\s+", text)
        if checkbox:
            mark = "☑" if checkbox.group(1).lower() == "x" else "☐"
            text = text[checkbox.end() :]
            out.append(f'<span class="check">{mark}</span> ')
        out.append(inline(text))
    while stack:
        out.append(f"</li></{stack.pop()[1]}>")
    return "".join(out)


def sections(text: str) -> dict[str, str]:
    """`## 제목` 단위로 원고를 나눈다. 첫 `#` 제목과 그 앞은 `_title`·`_lead` 로 둔다."""
    result: dict[str, str] = {}
    current = "_lead"
    buf: list[str] = []
    in_code = False
    for line in text.split("\n"):
        if line.strip().startswith("```"):
            in_code = not in_code
        if not in_code and line.startswith("# ") and "_title" not in result:
            result["_title"] = line[2:].strip()
            continue
        if not in_code and line.startswith("## "):
            result[current] = "\n".join(buf).strip()
            current = line[3:].strip()
            buf = []
            continue
        buf.append(line)
    result[current] = "\n".join(buf).strip()
    return result


def tables_in(text: str) -> list[tuple[list[str], list[list[str]]]]:
    """원고 속 표를 (머리, 행) 목록으로 돌려준다. 단계 문서가 기능별 표를 모을 때 쓴다."""
    lines = text.split("\n")
    found = []
    i = 0
    while i < len(lines):
        if lines[i].strip().startswith("|") and i + 1 < len(lines) and TABLE_SEP_RE.match(lines[i + 1]):
            head = _cells(lines[i])
            i += 2
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(_cells(lines[i]))
                i += 1
            found.append((head, rows))
            continue
        i += 1
    return found


def mermaid_blocks(text: str, kind: str = "") -> list[str]:
    blocks = re.findall(r"```mermaid\n(.*?)```", text, re.S)
    return [b.strip() for b in blocks if not kind or b.strip().startswith(kind)]
