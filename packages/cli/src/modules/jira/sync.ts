/**
 * `knots-sync sync jira`(설계 10 §3.4, HK-20b).
 *   (기본)        리포 → Jira: 에이전트 몫 상태 전이와 원격 링크만. 설명은 고치지 않는다. 승인 전이는 하지 않는다(MD-R14).
 *   --approvals   Jira → 리포: 사람이 한 승인 전이를 REST changelog 로만 approvals.md 에 가져온다.
 *   --verify      경로 jira 기록을 changelog 로 다시 대조한다(CI, 쓰지 않는다).
 *   --issue <키> --to <상태>  한 이슈를 그 상태로 옮기라고 요청한다. 승인 전이면 거부한다.
 * 모듈이 꺼져 있으면 "꺼져 있다"를 알리고 exit 0(MD-R15). 모델 · MCP 를 부르지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { allowed, appendedText, parse as parseApprovals, type Entry, type NewEntry } from "../../../../dashboard/src/approvals";
import { BOARD_STATES, stateIndex } from "../../../../dashboard/src/board-status";
import { parseLoose, setField } from "../../../../dashboard/src/frontmatter";
import { load } from "../../../../dashboard/src/model";
import type { IssueModel } from "../../../../dashboard/src/readers/issues";
import { appendLog, writeAll, type Write } from "../../../../dashboard/src/writers/approvals";
import { gitOut, ulid } from "../../../../dashboard/src/util";
import type { Project } from "../../../../dashboard/src/project";
import { bool, str } from "../../cli/args";
import type { CommandResult, Ctx } from "../../cli/context";
import { targetOf } from "../../cli/context";
import { openProject } from "../../commands/api-call";
import { CliError, EXIT, usageError } from "../../core/errors";
import { HttpError } from "../http";
import { keyMatcher, moduleEnabled, readTracker, type TrackerConfig } from "./config";
import { jiraCredentials, makeJiraClient, type JiraClient } from "./rest";

/** 에이전트가 직접 올리지 않는 상태: 승인 전이로만 닿는다(설계 §3.4 표). */
const HUMAN_STATES = new Set(["design", "implementing", "done", "deployed"]);
const GATE_DOC: Record<string, string> = { requirements: "requirements.md", design: "design.md", done: "tasks.md", deploy: "deploy" };

export interface Action {
  key: string;
  action: "moved" | "would-move" | "same" | "waiting-human" | "jira-ahead" | "no-transition" | "refused" | "link-added" | "link-exists" | "error";
  from?: string;
  to?: string;
  detail?: string;
}

/** 에이전트(CLI)가 이 전이를 해도 되는가. 승인 전이 · 사람 상태 · maxStatus 위는 안 된다(MD-R14). */
export function transitionRefusal(cfg: TrackerConfig, fromStatusId: string, toStatusId: string, toState: string): string | null {
  const gate = cfg.approvalTransitions[`${fromStatusId}>${toStatusId}`];
  if (gate) return `${fromStatusId}>${toStatusId} 는 ${gate} 승인 전이다 — 사람이 Jira 에서 한다(MD-R14)`;
  if (HUMAN_STATES.has(toState) || humanTargets(cfg).has(toStatusId)) return `${toState} 는 사람이 승인 전이로 옮기는 상태다`;
  if (stateIndex(toState) > stateIndex(cfg.maxStatus)) return `${toState} 는 agentBoundary.maxStatus(${cfg.maxStatus}) 위다`;
  return null;
}

function humanTargets(cfg: TrackerConfig): Set<string> {
  return new Set(Object.keys(cfg.approvalTransitions).map((k) => k.split(">")[1] ?? ""));
}

function stateOfStatus(cfg: TrackerConfig, statusId: string): string | null {
  return Object.entries(cfg.statusMap).find(([, id]) => id === statusId)?.[0] ?? null;
}

const labelOf = (id: string): string => BOARD_STATES.find((s) => s.id === id)?.label ?? id;

function off(why: string, json: Record<string, unknown>): CommandResult {
  return { code: EXIT.OK, data: { module: "jira-workflow", enabled: false, ...json }, lines: [why] };
}

export async function runSyncJira(ctx: Ctx): Promise<CommandResult> {
  const root = targetOf(ctx);
  if (!moduleEnabled(root, "jira-workflow")) {
    return off("jira-workflow 모듈이 꺼져 있다 — 보드는 킷 단계에서 계산한 같은 여덟 상태로 돈다(켜려면 knots-sync add jira-workflow)", {});
  }
  const cfg = readTracker(root);
  if (!cfg || cfg.sync.method === "none") {
    return off("jira-workflow 모듈은 켜져 있지만 sync.method 가 none 이다 — 연동하지 않는다. 보드는 킷 단계의 여덟 상태로 돈다", { method: "none" });
  }
  if (!cfg.baseUrl) throw new CliError(EXIT.STATE, "연결 설정이 비었다: .agents/issue-tracker.yml 의 baseUrl 이 TBD 다", "kns:jira-setup 스킬로 채운다");
  const wantApprovals = bool(ctx.values, "approvals");
  const wantVerify = bool(ctx.values, "verify");
  const issueArg = str(ctx.values, "issue");
  const to = str(ctx.values, "to");
  if ((to && !issueArg) || (issueArg && !to && !str(ctx.values, "mr-url"))) throw usageError("--issue 는 --to <상태> 또는 --mr-url 과 함께 쓴다");
  if (cfg.sync.method === "mcp" && !wantApprovals && !wantVerify) {
    return off("sync.method 가 mcp 다 — 상태 전이 · 링크는 세션의 /kns-issue 가 서버 도구로 한다. 승인 가져오기(--approvals)만 REST 로 이 명령이 한다", { method: "mcp" });
  }
  const client = makeJiraClient(cfg.baseUrl, jiraCredentials(cfg, ctx.io.env));
  const p = await openProject(ctx);
  const { issues } = await load(p);
  const match = keyMatcher(cfg);
  const mine = issues.filter((i) => !i.legacy && match.test(i.key) && (!issueArg || i.key === issueArg));
  if (issueArg && mine.length === 0) throw new CliError(EXIT.STATE, `이슈 폴더가 없거나 Jira 키 꼴이 아니다: ${issueArg}`);
  if (wantVerify) return verifyApprovals(ctx, p, cfg, client, mine);
  if (wantApprovals) return importApprovals(ctx, p, cfg, client, mine);
  return pushToJira(ctx, p, cfg, client, mine, to ?? null);
}

// ── 리포 → Jira ──────────────────────────────────────────────────────────────
async function pushToJira(ctx: Ctx, p: Project, cfg: TrackerConfig, client: JiraClient, issues: IssueModel[], explicit: string | null): Promise<CommandResult> {
  const dry = bool(ctx.values, "dry-run");
  const actions: Action[] = [];
  const webBase = await webBaseOf(p);
  for (const issue of issues) {
    try {
      const desired = explicit ?? issue.boardStatus.id;
      const targetId = cfg.statusMap[desired];
      const current = await client.issue(issue.key);
      if (!targetId) {
        actions.push({ key: issue.key, action: "no-transition", to: desired, detail: `statusMap.${desired} 가 TBD 다` });
      } else if (current.statusId === targetId) {
        actions.push({ key: issue.key, action: "same", from: stateOfStatus(cfg, current.statusId) ?? current.statusName, to: desired });
      } else {
        const from = stateOfStatus(cfg, current.statusId);
        const behind = from === null || stateIndex(from) < stateIndex(desired);
        const refusal = transitionRefusal(cfg, current.statusId, targetId, desired);
        if (explicit && refusal) {
          actions.push({ key: issue.key, action: "refused", from: from ?? current.statusName, to: desired, detail: refusal });
        } else if (!behind) {
          actions.push({ key: issue.key, action: "jira-ahead", from: from ?? current.statusName, to: desired, detail: "Jira 가 킷 단계보다 앞서 있다(사람이 옮겼다) — 되돌리지 않는다" });
        } else if (refusal) {
          actions.push({ key: issue.key, action: "waiting-human", from: from ?? current.statusName, to: desired, detail: refusal });
        } else {
          const t = (await client.transitions(issue.key)).find((x) => x.toId === targetId);
          if (!t) actions.push({ key: issue.key, action: "no-transition", from: from ?? current.statusName, to: desired, detail: "현재 상태에서 그 상태로 가는 전이가 없다" });
          else if (dry) actions.push({ key: issue.key, action: "would-move", from: from ?? current.statusName, to: desired });
          else {
            await client.transition(issue.key, t.id);
            actions.push({ key: issue.key, action: "moved", from: from ?? current.statusName, to: desired });
          }
        }
      }
      if (!explicit || str(ctx.values, "mr-url")) actions.push(...(await linkActions(p, client, issue, webBase, dry, str(ctx.values, "mr-url"))));
    } catch (err) {
      actions.push({ key: issue.key, action: "error", detail: err instanceof Error ? err.message : String(err) });
    }
  }
  const refused = actions.some((a) => a.action === "refused");
  const failed = actions.some((a) => a.action === "error");
  const lines = actions.map((a) => `${a.key}  ${label(a)}${a.detail ? `  — ${a.detail}` : ""}`);
  if (actions.length === 0) lines.push("Jira 키가 있는 이슈가 없다");
  const code = refused ? EXIT.HUMAN : failed ? EXIT.CHECK : EXIT.OK;
  return { code, data: { module: "jira-workflow", enabled: true, dryRun: dry, actions }, lines };
}

function label(a: Action): string {
  const move = a.from || a.to ? `${a.from ? labelOf(a.from) : "?"} → ${a.to ? labelOf(a.to) : "?"}` : "";
  const names: Record<Action["action"], string> = {
    moved: "전이함", "would-move": "전이 예정", same: "같음", "waiting-human": "사람 승인 전이를 기다림", "jira-ahead": "Jira 가 앞섬",
    "no-transition": "전이 없음", refused: "거부(승인 전이는 사람이 한다)", "link-added": "링크 더함", "link-exists": "링크 있음", error: "오류",
  };
  return `${names[a.action]}${move ? `  ${move}` : ""}`;
}

/** origin 원격 → 웹 주소. 못 만들면 null. */
async function webBaseOf(p: Project): Promise<string | null> {
  const raw = await gitOut(p.root, p.env, "remote", "get-url", "origin");
  if (!raw) return null;
  const m = /^(?:https?:\/\/(?:[^@/]+@)?|ssh:\/\/(?:[^@/]+@)?|git@)([^/:]+)(?::\d+)?[/:](.+?)(?:\.git)?\/?$/.exec(raw.trim());
  return m ? `https://${m[1]}/${m[2]}` : null;
}

async function linkActions(p: Project, client: JiraClient, issue: IssueModel, webBase: string | null, dry: boolean, mrUrl: string | undefined): Promise<Action[]> {
  const wanted: { globalId: string; url: string; title: string }[] = [];
  if (webBase && !mrUrl) {
    const branch = issue.branch ?? p.base();
    const sep = /github\.com$/.test(new URL(webBase).hostname) ? "tree" : "-/tree";
    wanted.push({ globalId: `knots-sync:sdd:${issue.key}`, url: `${webBase}/${sep}/${branch}/${issue.dir}`, title: `SDD ${issue.dir.split("/").pop() ?? issue.key}` });
  }
  if (mrUrl) wanted.push({ globalId: `knots-sync:mr:${issue.key}`, url: mrUrl, title: `MR ${issue.key}` });
  if (wanted.length === 0) return [];
  const existing = await client.remoteLinks(issue.key);
  const out: Action[] = [];
  for (const w of wanted) {
    if (existing.some((e) => e.globalId === w.globalId || e.url === w.url)) {
      out.push({ key: issue.key, action: "link-exists", detail: w.url });
    } else if (dry) {
      out.push({ key: issue.key, action: "link-added", detail: `(예정) ${w.url}` });
    } else {
      await client.addRemoteLink(issue.key, w);
      out.push({ key: issue.key, action: "link-added", detail: w.url });
    }
  }
  return out;
}

// ── Jira → 리포(승인 가져오기) ───────────────────────────────────────────────
export function isoOf(jira: string): string {
  return jira.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
}

function evidenceIds(entries: Entry[]): Set<string> {
  const ids = new Set<string>();
  for (const e of entries) {
    const m = /^changelog (\S+)$/.exec(e.evidence ?? "");
    if (e.path === "jira" && m) ids.add(m[1] as string);
  }
  return ids;
}

interface Resolved {
  email: string | null;
  name: string | null;
}

function accountResolver(client: JiraClient): (id: string | null) => Promise<Resolved> {
  const cache = new Map<string, Resolved>();
  return async (id) => {
    if (!id) return { email: null, name: null };
    const hit = cache.get(id);
    if (hit) return hit;
    const email = await client.userEmail(id);
    const r = { email: email ? email.toLowerCase() : null, name: null };
    cache.set(id, r);
    return r;
  };
}

async function importApprovals(ctx: Ctx, p: Project, cfg: TrackerConfig, client: JiraClient, issues: IssueModel[]): Promise<CommandResult> {
  const dry = bool(ctx.values, "dry-run");
  const resolve = accountResolver(client);
  const policy = p.policy();
  const flow = new Set(p.gates());
  const added: { key: string; gate: string; approver: string; changelog: string }[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  let failed = false;
  for (const issue of issues) {
    try {
      const checkout = issue.root ?? p.root;
      const approvalsFile = path.join(checkout, issue.dir, "approvals.md");
      const current = fs.existsSync(approvalsFile) ? fs.readFileSync(approvalsFile, "utf8") : null;
      const seen = evidenceIds(current ? parseApprovals(current).entries : []);
      const changes = (await client.changelog(issue.key)).sort((a, b) => a.created.localeCompare(b.created));
      const made: NewEntry[] = [];
      const writes: Write[] = [];
      for (const ch of changes) {
        const gate = cfg.approvalTransitions[`${ch.from}>${ch.to}`];
        if (!gate) continue;
        if (seen.has(ch.id)) {
          skipped += 1;
          continue;
        }
        seen.add(ch.id);
        if (!flow.has(gate)) {
          warnings.push(`${issue.key} changelog ${ch.id}: ${gate} 는 flow.gates 에 없어 기록하지 않았다`);
          continue;
        }
        const who = await resolve(ch.authorAccountId);
        if (!who.email) {
          warnings.push(`${issue.key} changelog ${ch.id}: 작성자 이메일을 읽지 못했다(Jira 공개 설정) — 기록하지 않았다`);
          continue;
        }
        if (!allowed(who.email, gate, policy)) {
          warnings.push(`${issue.key} changelog ${ch.id}: ${who.email} 는 approvers.${gate} 에 없다 — 기록하지 않았다`);
          continue;
        }
        const docName = GATE_DOC[gate];
        const docFile = docName && docName.endsWith(".md") && gate !== "done" ? path.join(checkout, issue.dir, docName) : null;
        if (docFile && !fs.existsSync(docFile)) {
          warnings.push(`${issue.key} changelog ${ch.id}: ${docName} 가 없어 기록하지 않았다`);
          continue;
        }
        made.push({
          at: isoOf(ch.created), gate, decision: "approved", approver: { email: who.email, name: who.name }, target: { name: docName ?? gate, sha256: "(jira)" },
          path: "jira", evidence: `changelog ${ch.id}`, entryId: ulid(),
        });
        if (docFile) {
          const text = fs.readFileSync(docFile, "utf8");
          const status = parseLoose(text)?.status ?? null;
          if (status === "draft" || status === "in-review") writes.push({ file: docFile, data: Buffer.from(setField(text, "status", "approved"), "utf8") });
        }
        added.push({ key: issue.key, gate, approver: who.email, changelog: ch.id });
      }
      if (made.length && !dry) {
        writeAll([{ file: approvalsFile, data: Buffer.from(appendedText(current, issue.key, made), "utf8") }, ...writes]);
        for (const e of made) appendLog(checkout, { entryId: e.entryId, target: issue.dir, gate: e.gate, sha256: "(jira)", at: e.at, path: "jira" });
      }
    } catch (err) {
      failed = true;
      warnings.push(`${issue.key}: ${err instanceof HttpError || err instanceof Error ? err.message : String(err)}`);
    }
  }
  const lines = [
    ...added.map((a) => `${dry ? "(예정) " : ""}${a.key}  ${a.gate} · ${a.approver} · changelog ${a.changelog}`),
    ...warnings.map((w) => `⚠ ${w}`),
    `승인 ${added.length}건 ${dry ? "가져올 예정" : "가져옴"} · 이미 있어 건너뜀 ${skipped}건 · 경고 ${warnings.length}건`,
  ];
  return { code: failed ? EXIT.CHECK : EXIT.OK, data: { module: "jira-workflow", enabled: true, dryRun: dry, added, skipped, warnings }, lines };
}

// ── 경로 jira 기록 다시 대조(CI) ─────────────────────────────────────────────
async function verifyApprovals(_ctx: Ctx, p: Project, cfg: TrackerConfig, client: JiraClient, issues: IssueModel[]): Promise<CommandResult> {
  const resolve = accountResolver(client);
  const problems: string[] = [];
  let checked = 0;
  for (const issue of issues) {
    const file = path.join(issue.root ?? p.root, issue.dir, "approvals.md");
    if (!fs.existsSync(file)) continue;
    const entries = parseApprovals(fs.readFileSync(file, "utf8")).entries.filter((e) => e.path === "jira" && e.valid);
    if (entries.length === 0) continue;
    const changes = await client.changelog(issue.key);
    for (const e of entries) {
      checked += 1;
      const id = /^changelog (\S+)$/.exec(e.evidence ?? "")?.[1];
      const ch = id ? changes.find((c) => c.id === id) : undefined;
      if (!ch) {
        problems.push(`${issue.key} ${e.gate}: changelog ${id ?? "?"} 가 Jira 에 없다`);
        continue;
      }
      if (cfg.approvalTransitions[`${ch.from}>${ch.to}`] !== e.gate) problems.push(`${issue.key} ${e.gate}: changelog ${ch.id} 는 그 게이트의 승인 전이가 아니다`);
      const who = await resolve(ch.authorAccountId);
      if (!who.email || who.email !== (e.approver?.email ?? "").toLowerCase()) problems.push(`${issue.key} ${e.gate}: changelog ${ch.id} 의 작성자가 기록의 승인자와 다르다`);
    }
  }
  return {
    code: problems.length ? EXIT.CHECK : EXIT.OK,
    data: { module: "jira-workflow", enabled: true, checked, problems },
    lines: [...problems.map((x) => `✖ ${x}`), `jira 경로 기록 ${checked}건 대조 · 문제 ${problems.length}건`],
  };
}
