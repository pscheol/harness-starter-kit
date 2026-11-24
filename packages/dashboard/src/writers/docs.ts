/**
 * 문서 읽기 · 저장(설계 06 §3.5 · §3.6, DB-R7~R10 · R15). 저장은 세션에 아무것도 보내지 않는다(DB-R25).
 */
import fs from "node:fs";
import path from "node:path";
import { ApiError, bad, forbiddenPath, notFound, readOnly } from "../errors";
import { FrontmatterError, parse as parseFm, parseLoose, setField } from "../frontmatter";
import { renderMarkdown } from "../md";
import { type DocTarget, docTarget, readTarget } from "../paths";
import type { Project } from "../project";
import { leases, readSessions } from "../readers/sessions";
import { branches, type Checkout, checkouts, ISSUE_BRANCH, lstatChain, resolveIntentCheckout, resolveIssueCheckout } from "../repo";
import { atomicWrite, git, rel, sha256 } from "../util";

const LIMIT = 1024 * 1024;

export async function writeCheckout(p: Project, t: DocTarget): Promise<Checkout> {
  if (t.kind === "issue" && t.key) return resolveIssueCheckout(p, t.key, t.rel);
  if (t.kind === "intent" && t.key) return resolveIntentCheckout(p, t.key);
  return (await checkouts(p))[0] as Checkout;
}

interface Located {
  co: Checkout | null;
  /** git 객체로만 읽을 때 브랜치 */
  ref: string | null;
  bytes: Buffer;
}

/** 읽을 위치: 쓸 체크아웃 → 체크아웃 안 된 이슈 브랜치의 git 객체 → 메인 폴더. */
async function locateForRead(p: Project, t: DocTarget): Promise<Located> {
  if (t.kind === "issue" && t.key) {
    const cos = await checkouts(p);
    const co = cos.find((c) => c.key === t.key);
    if (co && lstatChain(co.root, t.rel) === "file") return { co, ref: null, bytes: fs.readFileSync(path.join(co.root, t.rel)) };
    const branch = (await branches(p)).find((b) => ISSUE_BRANCH.exec(b)?.[2] === t.key && !cos.some((c) => c.branch === b));
    if (branch) {
      const prefix = p.loc.prefix ? `${p.loc.prefix}/` : "";
      const shown = await git(p.loc.top, p.env, "show", `${branch}:${prefix}${t.rel}`);
      if (shown.code === 0) return { co: null, ref: branch, bytes: Buffer.from(shown.stdout, "utf8") };
    }
  }
  const main = (await checkouts(p))[0] as Checkout;
  let co = main;
  if (t.kind === "intent" && t.key) {
    try {
      co = await resolveIntentCheckout(p, t.key);
    } catch {
      co = main;
    }
  }
  if (lstatChain(co.root, t.rel) !== "file") throw notFound(`문서가 없다: ${t.rel}`);
  return { co, ref: null, bytes: fs.readFileSync(path.join(co.root, t.rel)) };
}

/** /raw 의 파일 바이트(문서와 같은 위치 규칙). 경로 검사는 부른 쪽이 rawTarget 으로 했다. */
export async function readRaw(p: Project, relPath: string): Promise<Buffer> {
  const issue = /^\.agents\/docs\/issues\/([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-[^/]+\//.exec(relPath);
  const intent = /^\.agents\/docs\/intents\/([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-[^/]+\//.exec(relPath);
  const t: DocTarget = issue ? { rel: relPath, kind: "issue", key: issue[1] as string, creatable: false } : intent ? { rel: relPath, kind: "intent", key: intent[1] as string, creatable: false } : { rel: relPath, kind: "main", key: null, creatable: false };
  const found = await locateForRead(p, t);
  if (found.bytes.length > 20 * LIMIT) throw bad("파일이 너무 크다");
  return found.bytes;
}

export async function getDoc(p: Project, relInput: unknown, sign: ((rel: string) => string | null) | undefined): Promise<Record<string, unknown>> {
  const t = readTarget(relInput);
  const found = await locateForRead(p, t);
  if (found.bytes.length > LIMIT) throw bad("1 MiB 를 넘는 문서다");
  const text = found.bytes.toString("utf8");
  let writable = t.writable && found.co !== null;
  if (writable) {
    try {
      const co = await writeCheckout(p, t);
      writable = co.root === found.co?.root;
    } catch {
      writable = false;
    }
  }
  return {
    path: t.rel,
    sha256: sha256(found.bytes),
    frontmatter: parseLoose(text) ?? {},
    html: renderMarkdown(text, { docPath: t.rel, ...(sign ? { sign } : {}) }),
    markdown: text,
    writable: writable && !p.readOnly,
    checkout: found.co ? { kind: found.co.main ? "main" : "worktree", path: rel(p.loc.top, found.co.path), branch: found.co.branch } : { kind: "branch", path: null, branch: found.ref },
  };
}

const IDS = /\b(R\d+(?:\.\d+)*|SC-\d+|S-\d+|U-\d+)\b/g;

/** 줄 단위 차이: 바뀐 줄이 속한 # 제목, 바뀐 줄의 ID, 더한 · 뺀 줄 수(06 §3.6 6단계). */
export function changeSummary(before: string, after: string): { headings: string[]; ids: string[]; added: number; removed: number } {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s += 1;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea -= 1;
    eb -= 1;
  }
  const midA = a.slice(s, ea);
  const midB = b.slice(s, eb);
  const removedIdx: number[] = [];
  const addedIdx: number[] = [];
  if (midA.length * midB.length <= 4_000_000) {
    const n = midA.length;
    const m = midB.length;
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) (dp[i] as Uint32Array)[j] = midA[i] === midB[j] ? ((dp[i + 1] as Uint32Array)[j + 1] as number) + 1 : Math.max((dp[i + 1] as Uint32Array)[j] as number, (dp[i] as Uint32Array)[j + 1] as number);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        i += 1;
        j += 1;
      } else if (((dp[i + 1] as Uint32Array)[j] as number) >= ((dp[i] as Uint32Array)[j + 1] as number)) removedIdx.push(s + i++);
      else addedIdx.push(s + j++);
    }
    while (i < n) removedIdx.push(s + i++);
    while (j < m) addedIdx.push(s + j++);
  } else {
    for (let i = s; i < ea; i += 1) removedIdx.push(i);
    for (let j = s; j < eb; j += 1) addedIdx.push(j);
  }
  const headingAt = (lines: string[], idx: number): string | null => {
    for (let k = idx; k >= 0; k -= 1) if (/^#{1,6}\s/.test(lines[k] as string)) return lines[k] as string;
    return null;
  };
  const headings = new Set<string>();
  const ids = new Set<string>();
  for (const i of removedIdx) {
    const h = headingAt(a, i);
    if (h) headings.add(h);
    for (const m of (a[i] as string).matchAll(IDS)) ids.add(m[1] as string);
  }
  for (const j of addedIdx) {
    const h = headingAt(b, j);
    if (h) headings.add(h);
    for (const m of (b[j] as string).matchAll(IDS)) ids.add(m[1] as string);
  }
  return { headings: [...headings], ids: [...ids], added: addedIdx.length, removed: removedIdx.length };
}

export async function putDoc(p: Project, body: unknown): Promise<{ data: Record<string, unknown>; meta: Record<string, unknown> }> {
  if (p.readOnly) throw readOnly();
  if (!body || typeof body !== "object") throw bad("본문이 객체가 아니다");
  const b = body as Record<string, unknown>;
  const t = docTarget(b.path);
  if (typeof b.baseSha256 !== "string" || typeof b.markdown !== "string") throw bad("path · baseSha256 · markdown 이 필요하다");
  if (Buffer.byteLength(b.markdown) > LIMIT) throw bad("1 MiB 를 넘는다");
  const force = b.force === true;
  const co = await writeCheckout(p, t);
  const kind = lstatChain(co.root, t.rel);
  if (kind !== "file" && !(kind === "missing" && t.creatable)) throw kind === "missing" ? notFound(`문서가 없다: ${t.rel}`) : forbiddenPath(t.rel);
  const abs = path.join(co.root, t.rel);
  return p.withLock(abs, async () => {
    const current = kind === "file" ? fs.readFileSync(abs) : Buffer.alloc(0);
    if (current.length > LIMIT) throw bad("1 MiB 를 넘는 문서다");
    const currentText = current.toString("utf8");
    if (sha256(current) !== b.baseSha256) throw new ApiError(409, "conflict", "다른 곳에서 먼저 저장했다", { currentSha256: sha256(current), currentMarkdown: currentText });
    let next = (b.markdown as string).replace(/\r\n/g, "\n");
    let after: Record<string, string> | null;
    try {
      after = parseFm(next);
    } catch (err) {
      throw bad(`문서 머리를 읽지 못한다: ${(err as FrontmatterError).message}`);
    }
    const before = parseLoose(currentText);
    let statusChanged: string | null = null;
    if (after?.status === "approved" && before?.status !== "approved") throw new ApiError(422, "status_change_forbidden", "머리 status 를 approved 로 바꾸는 것은 승인 처리만 한다(승인 화면 · approve)");
    if (before?.status === "approved" && after?.status === "approved" && next !== currentText.replace(/\r\n/g, "\n")) {
      next = setField(next, "status", "in-review");
      statusChanged = "approved→in-review";
    }
    const held = await leaseHolder(p, co, t.rel);
    if (held && !force) throw new ApiError(409, "lease_held", `다른 세션(${held})이 이 파일을 점유 중이다. force 로 저장할 수 있다`, { leaseHeldBy: held });
    if (currentText.includes("\r\n")) next = next.replace(/\n/g, "\r\n");
    atomicWrite(abs, next, kind === "file" ? undefined : 0o644);
    const summary = changeSummary(currentText, next);
    return {
      data: { sha256: sha256(Buffer.from(next, "utf8")), savedTo: rel(p.loc.top, co.path), branch: co.branch, statusChanged, changeSummary: summary, leaseHeldBy: held },
      meta: { commit: "커밋은 그 이슈의 세션이 한다" },
    };
  });
}

/** 점유 중인 살아 있는 세션 id(활성 · 만료 전 점유가 경로와 겹치고, 등록된 세션이면 gone 이 아님). */
async function leaseHolder(p: Project, co: Checkout, relPath: string): Promise<string | null> {
  const owned = await leases(p, co.root);
  if (owned.size === 0) return null;
  const sessions = await readSessions(p);
  for (const [id, l] of owned) {
    if (!l.active) continue;
    if (!l.files.some((f) => f === relPath || relPath.startsWith(`${f}/`) || f.startsWith(`${relPath}/`))) continue;
    const reg = sessions.find((s) => s.id === id);
    if (reg && reg.state === "gone") continue;
    return id;
  }
  return null;
}
