/**
 * 정적 내보내기(설계 06 §3.12, DB-R20). 서버를 열지 않고 같은 읽기 함수로 HTML 과 data/*.json 을 만든다. 스크립트 · 버튼은 없다.
 * 빼는 것: 스킬 · 세션 · 대기함 · 승인 로그 · 토큰 · 체크포인트 · 사용량 · 기록 · 전체 프로젝트 · 제안 작성자 · git 사용자 이메일.
 * 끝 검사: 홈 절대경로 · /tmp/cc-socks- · uds: · 토큰 값 · ~/.claude · ~/.agents 가 하나라도 있으면 출력 폴더를 지우고 실패한다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { flowData, intentFolders, intentModel } from "./flow";
import { escapeHtml, renderMarkdown } from "./md";
import { load, overview, sessionInfo } from "./model";
import { Project } from "./project";
import { type IssueModel, publicIssue } from "./readers/issues";
import { readSummary, readVerify, readWorktrees } from "./readers/state";
import { checkouts } from "./repo";
import type { Env } from "./util";

export class ExportLeakError extends Error {
  readonly hits: string[];
  constructor(hits: string[]) {
    super(`내보낸 파일에 남으면 안 되는 문자열이 있다: ${hits.slice(0, 5).join(", ")}`);
    this.name = "ExportLeakError";
    this.hits = hits;
  }
}

export class ExportError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ExportError";
    this.code = code;
  }
}

export interface ExportOptions {
  cwd: string;
  env: Env;
  out: string;
}

type Json = unknown;

/** 절대경로를 리포 상대로, worktree 를 <worktrees>/<이름> 으로 바꾼다. 이메일 · 작성자 칸은 뺀다. */
function scrub(value: Json, map: [string, string][]): Json {
  if (typeof value === "string") {
    let s = value;
    for (const [from, to] of map) s = s.split(from).join(to);
    return s;
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, map));
  if (value && typeof value === "object") {
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(value as Record<string, Json>)) {
      if (["email", "createdBy", "approver", "user", "sessions", "main", "approvers", "by"].includes(k)) continue;
      out[k] = scrub(v, map);
    }
    return out;
  }
  return value;
}

function page(title: string, body: string): string {
  return `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${escapeHtml(title)}</title><style>body{font:15px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.2rem .5rem}</style></head><body>${body}</body></html>\n`;
}

function issueRow(i: Omit<IssueModel, "root">): string {
  return `<tr><td><a href="issues/${encodeURIComponent(i.key)}.html">${escapeHtml(i.key)}</a></td><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.area ?? "")}</td><td>${escapeHtml(i.stage)}</td><td>${escapeHtml(i.source)}</td><td>${escapeHtml(i.checkout?.path ?? "")}</td></tr>`;
}

export async function exportStatic(opts: ExportOptions): Promise<{ out: string; files: string[] }> {
  const out = path.resolve(opts.out);
  if (fs.existsSync(out) && fs.readdirSync(out).length > 0) throw new ExportError("out_not_empty", `출력 폴더가 비어 있지 않다: ${out}`);
  const home = opts.env.HOME ?? os.homedir();
  const p = await Project.open(opts.cwd, { env: opts.env, home, readOnly: true, multi: true, deps: {} });
  const cos = await checkouts(p);
  const map: [string, string][] = [];
  for (const co of cos.slice(1)) map.push([co.path, `<worktrees>/${path.basename(co.path)}`]);
  map.push([p.loc.top, "."]);
  const loaded = await load(p);
  const issues = loaded.issues.map(publicIssue).map((i) => ({ ...i, sessions: [], checkout: i.checkout ? { ...i.checkout, path: i.checkout.path.replace(/^\.\.\/[^/]+\.worktrees\//, "<worktrees>/") } : null }));
  const data: Record<string, Json> = {
    session: { ...(await sessionInfo(p, "single")), readOnly: true, mode: "export" },
    overview: await overview(p).then((o) => ({ ...o, sessions: undefined, todo: (o.todo as Record<string, unknown>[]).filter((t) => t.kind !== "dispatch-stale") })),
    issues: { issues },
    intents: { intents: intentFolders(p.root).map((i) => intentModel(p, i, loaded.issues)) },
    verify: { checkouts: await readVerify(p, null) },
    "reports-summary": await readSummary(p),
    worktrees: await readWorktrees(p),
  };
  for (const info of intentFolders(p.root)) {
    const f = flowData(p, info, loaded.issues, []);
    const proposal = f.proposal as Record<string, unknown> | null;
    data[`flow-${info.key}`] = { ...f, nodes: (f.nodes as Record<string, unknown>[]).map((n) => ({ ...n, data: { ...(n.data as Record<string, unknown>), session: null } })), proposal: proposal ? { ...proposal, createdBy: undefined } : null };
  }
  const written: string[] = [];
  const write = (rel: string, text: string): void => {
    const f = path.join(out, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
    written.push(rel);
  };
  try {
    for (const [name, value] of Object.entries(data)) write(`data/${name}.json`, `${JSON.stringify(scrub(value, map), null, 2)}\n`);
    const o = scrub(data.overview, map) as { todo: { rank: number; title: string; reason: string }[]; stages: Record<string, number> };
    const rows = issues.map((i) => scrub(i, map) as Omit<IssueModel, "root">);
    write(
      "index.html",
      page(
        `${p.name()} — 관리 페이지(내보내기)`,
        `<h1>${escapeHtml(p.name())}</h1><p>정적 내보내기다. 저장 · 승인 · 답 · 요청은 리포의 관리 페이지 · 콘솔에서 한다.</p><h2>처리할 일</h2><ol>${o.todo.map((t) => `<li>[${t.rank}] ${escapeHtml(t.title)} — ${escapeHtml(t.reason)}</li>`).join("")}</ol><h2>단계별</h2><ul>${Object.entries(o.stages).map(([k, v]) => `<li>${escapeHtml(k)} ${v}</li>`).join("")}</ul><h2>이슈</h2><table><thead><tr><th>키</th><th>이름</th><th>영역</th><th>단계</th><th>출처</th><th>체크아웃</th></tr></thead><tbody>${rows.map(issueRow).join("")}</tbody></table>`,
      ),
    );
    for (const issue of loaded.issues) {
      const parts: string[] = [`<p><a href="../index.html">← 목록</a></p><h1>${escapeHtml(issue.key)} ${escapeHtml(issue.name)}</h1><p>단계: ${escapeHtml(issue.stage)}</p>`];
      for (const doc of ["requirements", "design", "tasks"]) {
        const root = issue.root;
        if (!root) continue;
        const f = path.join(root, issue.dir, `${doc}.md`);
        if (!fs.existsSync(f)) continue;
        parts.push(`<section><h2>${doc}.md</h2>${renderMarkdown(fs.readFileSync(f, "utf8"), { docPath: `${issue.dir}/${doc}.md` })}</section>`);
      }
      write(`issues/${issue.key}.html`, page(`${issue.key} — ${p.name()}`, scrub(parts.join("\n"), map) as string));
    }
    check(out, p, home);
  } catch (err) {
    fs.rmSync(out, { recursive: true, force: true });
    throw err;
  }
  return { out, files: written.sort() };
}

function check(out: string, p: Project, home: string): void {
  const needles = new Set<string>(["/tmp/cc-socks-", "uds:", "~/.claude", "~/.agents"]);
  for (const h of [home, os.homedir()]) if (h && h.length > 1) needles.add(h);
  const token = (() => {
    try {
      return fs.readFileSync(path.join(p.root, ".agents/state/dashboard.token"), "utf8").trim();
    } catch {
      return "";
    }
  })();
  if (token) needles.add(token);
  const hits: string[] = [];
  const walk = (d: string): void => {
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n);
      if (fs.statSync(f).isDirectory()) walk(f);
      else {
        const text = fs.readFileSync(f, "utf8");
        for (const needle of needles) if (text.includes(needle)) hits.push(`${path.relative(out, f)}: ${needle === token ? "<토큰>" : needle}`);
      }
    }
  };
  walk(out);
  if (hits.length) throw new ExportLeakError(hits);
}
