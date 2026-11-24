/**
 * Markdown → HTML(설계 06 §3.1 render/md.ts, DB-R21 · §3.14).
 * - 원문 HTML 은 실행하지 않는다: 모든 글자를 이스케이프하고 킷이 만든 태그만 낸다.
 * - 링크는 http(s) · 상대 경로만. 그 밖(javascript: · data: · //…)은 글자만 남긴다.
 * - 문서 안 이미지(상대 경로)는 sign(경로) 가 준 서명 URL 로 바꾼다. 바깥 이미지는 대체 글자만 남긴다.
 */
import path from "node:path";

export interface RenderOptions {
  /** 문서의 리포 상대 경로(이미지 상대 경로 기준) */
  docPath: string;
  /** 리포 상대 경로 → 서명 URL. 없으면 이미지는 대체 글자만 */
  sign?: (rel: string) => string | null;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export function safeHref(url: string): string | null {
  const u = url.trim();
  if (!u || /[\u0000-\u001f\s]/.test(u)) return null;
  if (u.startsWith("//") || u.startsWith("\\")) return null;
  if (SCHEME.test(u)) return /^https?:\/\//i.test(u) ? u : null;
  return u;
}

function imageSrc(url: string, opts: RenderOptions): string | null {
  const u = url.trim();
  if (!u || SCHEME.test(u) || u.startsWith("/") || u.startsWith("\\") || u.includes("\\")) return null;
  const clean = u.split(/[?#]/)[0] as string;
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(opts.docPath), clean));
  if (joined.startsWith("../") || joined === ".." || !joined.startsWith(".agents/docs/")) return null;
  return opts.sign ? opts.sign(joined) : null;
}

/** 줄 안 서식. 코드 조각 → 이미지 → 링크 → 굵게 · 기울임 · 취소선 순서로, 이스케이프한 글자 위에서 바꾼다. */
export function inline(text: string, opts: RenderOptions): string {
  const codes: string[] = [];
  let s = text.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return `\u0000C${codes.length - 1}\u0000`;
  });
  const parts: string[] = [];
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g, (_m, alt: string, src: string) => {
    const signed = imageSrc(src, opts);
    parts.push(signed ? `<img src="${escapeHtml(signed)}" alt="${escapeHtml(alt)}">` : escapeHtml(alt));
    return `\u0000P${parts.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g, (_m, label: string, href: string) => {
    const ok = safeHref(href);
    parts.push(ok ? `<a href="${escapeHtml(ok)}" rel="noopener noreferrer">${escapeHtml(label)}</a>` : escapeHtml(label));
    return `\u0000P${parts.length - 1}\u0000`;
  });
  s = s.replace(/<(https?:\/\/[^\s>]+)>/g, (_m, href: string) => {
    parts.push(`<a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(href)}</a>`);
    return `\u0000P${parts.length - 1}\u0000`;
  });
  s = escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return s.replace(/\u0000([CP])(\d+)\u0000/g, (_m, k: string, i: string) => (k === "C" ? (codes[Number(i)] as string) : (parts[Number(i)] as string)));
}

function stripFrontmatter(lines: string[]): string[] {
  if (lines[0] !== "---") return lines;
  for (let i = 1; i < lines.length; i += 1) if (lines[i] === "---") return lines.slice(i + 1);
  return lines;
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function renderList(lines: string[], opts: RenderOptions): string {
  const items: { indent: number; ordered: boolean; text: string }[] = lines.map((l) => {
    const m = LIST.exec(l);
    if (!m) return { indent: 99, ordered: false, text: l.trim() };
    return { indent: (m[1] as string).length, ordered: /\d/.test(m[2] as string), text: m[3] as string };
  });
  let i = 0;
  const walk = (base: number): string => {
    const ordered = items[i]?.ordered ?? false;
    let out = ordered ? "<ol>" : "<ul>";
    while (i < items.length) {
      const it = items[i] as { indent: number; ordered: boolean; text: string };
      if (it.indent < base) break;
      if (it.indent > base && it.indent !== 99) {
        out = out.replace(/<\/li>$/, "");
        out += `${walk(it.indent)}</li>`;
        continue;
      }
      if (it.indent === 99) {
        out = out.replace(/<\/li>$/, ` ${inline(it.text, opts)}</li>`);
        i += 1;
        continue;
      }
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(it.text);
      const body = task ? `${task[1] === " " ? "☐" : "☑"} ${inline(task[2] as string, opts)}` : inline(it.text, opts);
      out += `<li>${body}</li>`;
      i += 1;
    }
    return `${out}${ordered ? "</ol>" : "</ul>"}`;
  };
  const base = items[0]?.indent ?? 0;
  let html = "";
  while (i < items.length) html += walk(Math.min(base, items[i]?.indent ?? 0));
  return html;
}

function cells(row: string): string[] {
  let r = row.trim();
  if (r.startsWith("|")) r = r.slice(1);
  if (r.endsWith("|")) r = r.slice(0, -1);
  return r.split("|").map((c) => c.trim());
}

export function renderMarkdown(source: string, opts: RenderOptions): string {
  const lines = stripFrontmatter(source.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").split("\n"));
  const out: string[] = [];
  let i = 0;
  const para: string[] = [];
  const flush = (): void => {
    if (para.length) out.push(`<p>${para.map((l) => inline(l, opts)).join("<br>")}</p>`);
    para.length = 0;
  };
  while (i < lines.length) {
    const line = lines[i] as string;
    const fence = /^(\s*)(```+|~~~+)(.*)$/.exec(line);
    if (fence) {
      flush();
      const mark = fence[2] as string;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] as string).trim().startsWith(mark)) body.push(lines[i++] as string);
      i += 1;
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      flush();
      while (i < lines.length && !(lines[i] as string).includes("-->")) i += 1;
      i += 1;
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      const n = (h[1] as string).length;
      out.push(`<h${n}>${inline(h[2] as string, opts)}</h${n}>`);
      i += 1;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      out.push("<hr>");
      i += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i] as string)) body.push((lines[i++] as string).replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(body.join("\n"), opts)}</blockquote>`);
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1] as string)) {
      flush();
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] as string).includes("|") && (lines[i] as string).trim()) rows.push(cells(lines[i++] as string));
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c, opts)}</th>`).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c, opts)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
      continue;
    }
    if (LIST.test(line)) {
      flush();
      const body: string[] = [];
      while (i < lines.length && (LIST.test(lines[i] as string) || (/^\s{2,}\S/.test(lines[i] as string) && body.length))) body.push(lines[i++] as string);
      out.push(renderList(body, opts));
      continue;
    }
    if (!line.trim()) {
      flush();
      i += 1;
      continue;
    }
    para.push(line.trim());
    i += 1;
  }
  flush();
  return out.join("\n");
}
