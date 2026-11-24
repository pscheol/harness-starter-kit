/** Jira ADF(Atlassian Document Format) → Markdown. 알려진 노드만 옮기고, 모르는 노드는 안의 글만 남긴다. 결정적이다(모델을 부르지 않는다). */

type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: Node[] };

const isNode = (v: unknown): v is Node => !!v && typeof v === "object" && !Array.isArray(v);

function inline(n: Node): string {
  if (n.type === "hardBreak") return "  \n";
  if (n.type === "mention") return String(n.attrs?.text ?? "@사용자");
  if (n.type === "emoji") return String(n.attrs?.text ?? n.attrs?.shortName ?? "");
  if (n.type === "inlineCard") return String(n.attrs?.url ?? "");
  if (n.type === "status") return `[${String(n.attrs?.text ?? "")}]`;
  if (n.type === "date") return new Date(Number(n.attrs?.timestamp ?? 0)).toISOString().slice(0, 10);
  let t = n.text ?? (n.content ?? []).map(inline).join("");
  for (const m of n.marks ?? []) {
    if (m.type === "code") t = `\`${t}\``;
    else if (m.type === "strong") t = `**${t}**`;
    else if (m.type === "em") t = `*${t}*`;
    else if (m.type === "strike") t = `~~${t}~~`;
    else if (m.type === "link" && typeof m.attrs?.href === "string") t = `[${t}](${m.attrs.href})`;
  }
  return t;
}

const inlines = (n: Node): string => (n.content ?? []).map(inline).join("");

function table(n: Node): string[] {
  const rows = (n.content ?? []).map((r) => (r.content ?? []).map((c) => (c.content ?? []).map((p) => inlines(p)).join(" ").replace(/\|/g, "\\|").replace(/\n/g, " ")));
  if (rows.length === 0) return [];
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]): string => `| ${[...r, ...Array(width - r.length).fill("")].join(" | ")} |`;
  return [pad(rows[0] as string[]), `|${"---|".repeat(width)}`, ...rows.slice(1).map(pad)];
}

function block(n: Node, indent: string): string[] {
  const c = n.content ?? [];
  switch (n.type) {
    case "paragraph":
      return [`${indent}${inlines(n)}`, ""];
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1))) + 2;
      return [`${"#".repeat(Math.min(6, level))} ${inlines(n)}`, ""];
    }
    case "bulletList":
    case "orderedList":
      return [...c.flatMap((item, i) => list(item, indent, n.type === "orderedList" ? `${Number(n.attrs?.order ?? 1) + i}.` : "-")), ""];
    case "codeBlock":
      return [`${indent}\`\`\`${String(n.attrs?.language ?? "")}`, ...c.map((x) => x.text ?? "").join("").split("\n").map((l) => indent + l), `${indent}\`\`\``, ""];
    case "blockquote":
      return [...c.flatMap((x) => block(x, "")).map((l) => (l ? `> ${l}` : ">")), ""];
    case "rule":
      return ["---", ""];
    case "table":
      return [...table(n), ""];
    case "panel":
      return [...c.flatMap((x) => block(x, "")).map((l) => (l ? `> ${l}` : ">")), ""];
    case "mediaSingle":
    case "mediaGroup":
      return c.flatMap((m) => (m.type === "media" ? [`${indent}(첨부: ${String(m.attrs?.alt ?? m.attrs?.id ?? "")})`, ""] : []));
    default:
      return c.length ? c.flatMap((x) => block(x, indent)) : n.text ? [n.text, ""] : [];
  }
}

function list(item: Node, indent: string, marker: string): string[] {
  const out: string[] = [];
  let first = true;
  for (const child of item.content ?? []) {
    if (child.type === "bulletList" || child.type === "orderedList") out.push(...block(child, `${indent}  `).filter((l) => l !== ""));
    else {
      const text = block(child, "").filter((l) => l !== "").join(`\n${indent}  `);
      out.push(first ? `${indent}${marker} ${text}` : `${indent}  ${text}`);
      first = false;
    }
  }
  return out;
}

export function adfToMarkdown(doc: unknown): string {
  if (typeof doc === "string") return doc;
  if (!isNode(doc)) return "";
  return (doc.content ?? [])
    .flatMap((n) => block(n, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
