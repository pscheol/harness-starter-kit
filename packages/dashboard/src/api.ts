/**
 * REST 경로 표와 처리 함수(설계 06 §3.5 · §3.15). 서버와 CLI 가 같은 함수를 부른다(화면에만 있는 기능 없음, README 원칙 9).
 * 표의 cli 칸은 같은 결과를 내는 콘솔 명령이다. 이 모듈의 쓰기 처리는 세션에 아무것도 보내지 않는다(DB-R25) —
 * 세션 요청은 POST /dispatch 하나뿐이고 사람이 고를 때만 부른다.
 */
import fs from "node:fs";
import path from "node:path";
import { burnData } from "./burn";
import { checkpointExplain, checkpointsList } from "./checkpoints";
import { bad, notFound, notImplemented } from "./errors";
import { findIntent, flowData, intentFolders, intentModel } from "./flow";
import { doctorOf, load, overview, sessionInfo } from "./model";
import { GATE_FLOOR, type Project } from "./project";
import { machineSessions, type Projects, projectsList, projectsOverview } from "./projects";
import { publicIssue } from "./readers/issues";
import { publicSession, readQueue, readSessions } from "./readers/sessions";
import { readOps } from "./readers/ops";
import { readFindings, readReview, readSummary, readVerify, readWorktrees } from "./readers/state";
import { checkouts } from "./repo";
import { filterInventory, skillsInventory } from "./skills";
import { historyData, usageData, usageKit, usageNow } from "./usage";
import { isObj, python } from "./util";
import { postAnswer, getQuestions } from "./writers/answers";
import { issueFolder, postApproval, postReviewDecision, type Via } from "./writers/approvals";
import { dropQueued, postDispatch } from "./writers/dispatch";
import { getDoc, putDoc } from "./writers/docs";
import { postIntake } from "./writers/intake";
import { getGateBundle } from "./writers/intent-gates";
import { getMob, postMob } from "./writers/mob";
import { deleteProposal, postProposal } from "./writers/proposals";

export interface ApiRequest {
  method: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  via: Via;
  mode: "single" | "multi";
  /** 서버만: 문서 안 이미지 서명 URL */
  sign?: (rel: string) => string | null;
  /** 여러 프로젝트(sessions?scope=machine · projects) */
  projects?: Projects;
}

export interface ApiResult {
  status: number;
  data: unknown;
  meta?: Record<string, unknown>;
}

export interface Route {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  /** 승인 PIN 이 필요한 경로 */
  pin?: boolean;
  /** 501 이고 제공 이슈 */
  stub?: string;
  /** 여러 프로젝트 모드의 맨 위 경로(/api/v1/…, 프로젝트 접두 없음) */
  multi?: boolean;
  /** 같은 결과의 콘솔 명령(06 §3.15) */
  cli: string;
  handler: (p: Project, r: ApiRequest) => Promise<ApiResult>;
}

const ok = (data: unknown, status = 200, meta?: Record<string, unknown>): ApiResult => ({ status, data, ...(meta ? { meta } : {}) });

/** 다음 단계(08 §3.1 · DS-R2): 판정 원본은 intent.py next. 스크립트가 없거나 실패하면 null. */
async function intentNext(p: Project, abs: string): Promise<Record<string, unknown> | null> {
  const script = path.join(p.root, "scripts/harness/intent.py");
  if (!fs.existsSync(script)) return null;
  const r = await python(p.root, p.env, [script, "next", abs, "--json"], 30_000);
  try {
    return r.code === 0 ? (JSON.parse(r.stdout) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
const q = (r: ApiRequest, k: string): string | null => r.query.get(k) || null;

async function issueList(p: Project, r: ApiRequest): Promise<ApiResult> {
  const { issues, errors } = await load(p);
  const area = q(r, "area");
  const stage = q(r, "stage");
  const intent = q(r, "intent");
  const list = issues.filter((i) => (!area || i.area === area) && (!stage || i.stage === stage) && (!intent || i.intent === intent));
  return ok({ issues: list.map(publicIssue), errors });
}

async function oneIssue(p: Project, key: string) {
  const { issues } = await load(p);
  const i = issues.find((x) => x.key === key);
  if (!i) throw notFound(`이슈가 없습니다: ${key}`);
  return i;
}

export const ROUTES: Route[] = [
  { method: "GET", path: "/session", cli: "status --session", handler: async (p, r) => ok(await sessionInfo(p, r.mode)) },
  { method: "GET", path: "/overview", cli: "status", handler: async (p) => ok(await overview(p)) },
  {
    method: "GET", path: "/intents", cli: "status --intents",
    handler: async (p) => {
      const { issues } = await load(p);
      return ok({ intents: intentFolders(p.root).map((i) => intentModel(p, i, issues)) });
    },
  },
  {
    method: "GET", path: "/intents/{key}", cli: "status --intent <키>",
    handler: async (p, r) => {
      const { issues } = await load(p);
      const info = findIntent(p.root, r.params.key as string);
      return ok({ ...intentModel(p, info, issues), next: await intentNext(p, info.abs) });
    },
  },
  { method: "GET", path: "/intents/{key}/mob", cli: "mob status <INT>", handler: async (p, r) => ok(await getMob(p, r.params.key as string)) },
  { method: "POST", path: "/intents/{key}/mob", cli: "mob start <INT> --attendees a,b [--timebox 30] | mob next <INT> | mob close <INT>", handler: async (p, r) => ok(await postMob(p, r.params.key as string, r.body)) },
  { method: "GET", path: "/intents/{key}/gates", cli: "status --intent <INT> --gate codebase|plans", handler: async (p, r) => ok(await getGateBundle(p, r.params.key as string, q(r, "gate") ?? "")) },
  {
    method: "GET", path: "/intents/{key}/burn", cli: "status --flow <INT> --burn [--days n]",
    handler: async (p, r) => {
      const { issues } = await load(p);
      return ok(await burnData(p, findIntent(p.root, r.params.key as string), issues, q(r, "days")));
    },
  },
  { method: "GET", path: "/issues", cli: "status --issues [--area --stage --intent]", handler: issueList },
  { method: "GET", path: "/issues/{key}", cli: "status --issue <키>", handler: async (p, r) => ok(publicIssue(await oneIssue(p, r.params.key as string))) },
  { method: "GET", path: "/docs", cli: "status --doc <경로>", handler: async (p, r) => ok(await getDoc(p, q(r, "path"), r.sign)) },
  {
    method: "PUT", path: "/docs", cli: "편집기로 파일을 직접 고칩니다(06 §3.15 S03)",
    handler: async (p, r) => {
      const res = await putDoc(p, r.body);
      return ok(res.data, 200, res.meta);
    },
  },
  { method: "GET", path: "/questions", cli: "answer <대상> --list", handler: async (p, r) => ok(await getQuestions(p, q(r, "target"))) },
  { method: "POST", path: "/questions/{target}/{qid}/answer", pin: true, cli: "answer <대상> <Q-n> --choice <A-D|other> [--text]", handler: async (p, r) => ok(await postAnswer(p, r.params.target as string, r.params.qid as string, r.body)) },
  {
    method: "POST", path: "/approvals", pin: true, cli: "approve <키> --gate <게이트> --phrase … [--changes-requested]",
    handler: async (p, r) => {
      const res = await postApproval(p, r.body, r.via);
      return ok(res.data, res.status);
    },
  },
  {
    method: "POST", path: "/reviews/{key}/{findingId}/decision", pin: true, cli: "review decide <키> <F-n> --fix|--accept-risk --reason …",
    handler: async (p, r) => {
      const res = await postReviewDecision(p, r.params.key as string, r.params.findingId as string, r.body, r.via);
      return ok(res.data, res.status);
    },
  },
  { method: "GET", path: "/verify", cli: "status --verify [--issue]", handler: async (p, r) => ok({ checkouts: await readVerify(p, q(r, "issue")) }) },
  { method: "GET", path: "/reports/summary", cli: "quality", handler: async (p) => ok(await readSummary(p)) },
  { method: "GET", path: "/reports/findings", cli: "quality --findings [--issue --severity --new]", handler: async (p, r) => ok(await readFindings(p, { issue: q(r, "issue"), severity: q(r, "severity"), onlyNew: q(r, "new") === "1" || q(r, "new") === "true" })) },
  {
    method: "GET", path: "/reviews/{key}", cli: "review show <키>",
    handler: async (p, r) => {
      const key = r.params.key as string;
      const i = await oneIssue(p, key);
      const root = i.root ?? (await checkouts(p))[0]?.root ?? p.root;
      return ok(await readReview(p, root, issueFolder(root, key)));
    },
  },
  { method: "GET", path: "/worktrees", cli: "status --worktrees", handler: async (p) => ok(await readWorktrees(p)) },
  {
    method: "GET", path: "/sessions", cli: "sessions [--machine]",
    handler: async (p, r) => {
      if (q(r, "scope") === "machine") {
        const list = r.projects ? (await r.projects.list()).map((s) => s.project).filter((x): x is Project => x !== null) : [p];
        if (!list.some((x) => x.id === p.id) && r.mode === "single") list.unshift(p);
        return ok(await machineSessions(list));
      }
      return ok({ sessions: (await readSessions(p)).map(publicSession) });
    },
  },
  {
    method: "GET", path: "/skills", cli: "skills [--stage <단계>] [--harness <h>] [--conflicts] [--errors] [--all] [--no-user] [--refresh]",
    handler: async (p, r) => {
      const inv = await skillsInventory(p, { user: q(r, "user") !== "0", refresh: q(r, "refresh") === "1" });
      const flag = (k: string): boolean => q(r, k) === "1" || q(r, k) === "true";
      return ok(filterInventory(inv, { stage: q(r, "stage"), harness: q(r, "harness"), conflicts: flag("conflicts"), errors: flag("errors"), all: flag("all") }));
    },
  },
  {
    method: "GET", path: "/harness", cli: "status --harness",
    handler: async (p) => {
      const meta = p.meta();
      const kit = isObj(meta.kit) ? meta.kit : {};
      const doctor = await doctorOf(p);
      return ok({ doctor, kit: { version: kit.version ?? null }, agents: Array.isArray(meta.agents) ? meta.agents : [], modules: p.modules(), roles: isObj(meta.roles) ? meta.roles : {}, gates: p.gates(), floor: GATE_FLOOR });
    },
  },
  {
    method: "POST", path: "/harness/outdated", cli: "outdated",
    handler: async (p) => {
      if (!p.deps.outdated) throw notImplemented("CLI", "최신 버전 조회");
      return ok(await p.deps.outdated(p.root, p.env));
    },
  },
  {
    method: "POST", path: "/dispatch", cli: "dispatch --to <세션|키:역할|이름> --kind … --path … [--text] [--via]",
    handler: async (p, r) => {
      const res = await postDispatch(p, r.body, (await p.user()).email);
      return ok(res.data, res.status);
    },
  },
  { method: "GET", path: "/dispatch/queue", cli: "dispatch list", handler: async (p) => ok({ items: await readQueue(p) }) },
  { method: "DELETE", path: "/dispatch/queue/{id}", cli: "dispatch drop <id>", handler: async (p, r) => ok(dropQueued(p, r.params.id as string)) },
  { method: "GET", path: "/checkpoints", cli: "checkpoints [--issue <키>]", handler: async (p, r) => ok(await checkpointsList(p, q(r, "issue"))) },
  { method: "GET", path: "/checkpoints/{id}", cli: "checkpoints <id>", handler: async (p, r) => ok(await checkpointExplain(p, r.params.id as string)) },
  { method: "GET", path: "/ops", cli: "status --ops", handler: async (p) => ok(await readOps(p)) },
  {
    method: "GET", path: "/flow", cli: "status --flow <INT>",
    handler: async (p, r) => {
      const key = q(r, "intent");
      if (!key) throw bad("intent 가 필요합니다");
      const { issues, sessions } = await load(p);
      return ok(flowData(p, findIntent(p.root, key), issues, sessions));
    },
  },
  { method: "GET", path: "/flow/gates", cli: "flow gates", handler: async (p) => ok({ gates: p.gates(), floor: GATE_FLOOR, command: "npx harness-kit flow gates --add <게이트> --after <게이트>" }) },
  { method: "POST", path: "/intake", cli: "intake --title … --kind … --name … [--text-file | --text] [--attach]… [--link]…", handler: async (p, r) => ok(await postIntake(p, r.body, r.via), 201) },
  { method: "POST", path: "/units/proposals", cli: "units propose <INT> --add-dep U-a:U-b | --remove-dep … | --split … | --merge … | --order …", handler: async (p, r) => ok(await postProposal(p, r.body)) },
  { method: "DELETE", path: "/units/proposals/{intent}", cli: "units discard <INT>", handler: async (p, r) => ok(await deleteProposal(p, r.params.intent as string)) },
  {
    method: "GET", path: "/projects", multi: true, cli: "projects list",
    handler: async (_p, r) => {
      if (!r.projects) throw notFound("전체 프로젝트 모드가 아닙니다(dashboard --all · --root · --workspace)");
      return ok(await projectsList(r.projects));
    },
  },
  {
    method: "GET", path: "/projects/overview", multi: true, cli: "status --all",
    handler: async (_p, r) => {
      if (!r.projects) throw notFound("전체 프로젝트 모드가 아닙니다");
      return ok(await projectsOverview(r.projects));
    },
  },
  { method: "GET", path: "/usage", cli: "usage [--days n] [--harness h] [--sources]", handler: async (p, r) => ok(await usageData(p, { days: q(r, "days"), harness: q(r, "harness") })) },
  { method: "GET", path: "/usage/now", cli: "usage --now", handler: async (p) => ok(await usageNow(p)) },
  { method: "GET", path: "/usage/kit", cli: "usage --kit", handler: async (p) => ok(await usageKit(p)) },
  {
    method: "GET", path: "/history", cli: "history [--q …] [--session id] [--role r] (꺼짐이면 history_off)",
    handler: async (p, r) => ok(await historyData(p, { q: q(r, "q"), session: q(r, "session"), role: q(r, "role") })),
  },
  { method: "GET", path: "/raw/{path}", cli: "— (브라우저 이미지 · 와이어프레임, 서명 URL)", handler: async () => { throw notFound("서명 URL 로만 엽니다"); } },
];

interface Compiled {
  route: Route;
  re: RegExp;
  names: string[];
}

const COMPILED: Compiled[] = ROUTES.map((route) => {
  const names: string[] = [];
  const re = new RegExp(`^${route.path.replace(/\{([a-zA-Z]+)\}/g, (_m, n: string) => {
    names.push(n);
    return "([^/]+)";
  })}$`);
  return { route, re, names };
});

export function match(method: string, path: string): { route: Route; params: Record<string, string> } | { methods: string[] } | null {
  const methods: string[] = [];
  for (const c of COMPILED) {
    const m = c.re.exec(path);
    if (!m) continue;
    if (c.route.method !== method) {
      methods.push(c.route.method);
      continue;
    }
    const params: Record<string, string> = {};
    c.names.forEach((n, i) => {
      params[n] = decodeURIComponent(m[i + 1] as string);
    });
    return { route: c.route, params };
  }
  return methods.length ? { methods } : null;
}

/** CLI 가 부르는 입구: HTTP 없이 같은 처리 함수. 실패는 ApiError 로 던진다. */
export async function callApi(p: Project, method: Route["method"], path: string, opts: { query?: Record<string, string>; body?: unknown; via?: Via; mode?: "single" | "multi"; projects?: Projects } = {}): Promise<ApiResult> {
  const m = match(method, path);
  if (!m || !("route" in m)) throw notFound(`경로 없음: ${method} ${path}`);
  return m.route.handler(p, { method, params: m.params, query: new URLSearchParams(opts.query ?? {}), body: opts.body, via: opts.via ?? "terminal", mode: opts.mode ?? "single", ...(opts.projects ? { projects: opts.projects } : {}) });
}
