/**
 * 세션 · 점유 파일 · 대기함 읽기(설계 06 §3.9 · §3.10).
 * 생존: (1) pid 가 살아 있고 `ps -o lstart=` 가 같다, (2) inbox 가 있으면 200ms 안에 연결되고 바로 닫힌다(글을 보내지 않는다).
 * 응답에 소켓 경로 · pid · 토큰을 넣지 않는다. 정리(24시간 지난 gone · 7일 지난 consumed/)는 단일 프로젝트 · 쓰기 가능 모드만 한다.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileStamp, treeStamp } from "../cache";
import type { Project } from "../project";
import { isObj, python, readJson, rel } from "../util";

export type Liveness = "alive" | "alive-no-inbox" | "gone";

export interface SessionRecord {
  id: string;
  harness: string | null;
  name: string | null;
  role: string | null;
  roleSource: string | null;
  issue: string | null;
  checkout: string | null;
  branch: string | null;
  cwd: string | null;
  turn: string | null;
  startedAt: string | null;
  lastSeenAt: string | null;
  permissionMode: string | null;
  state: Liveness;
  inbox: boolean;
  files: string[];
}

export interface SessionFull extends SessionRecord {
  /** 내부: 작업 요청용(응답에 넣지 않는다) */
  socket: string | null;
  cwdAbs: string | null;
}

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const DAY = 24 * 3600 * 1000;

function pidStart(pid: number): Promise<string | null> {
  return new Promise((resolve) => {
    const c = spawn("ps", ["-o", "lstart=", "-p", String(pid)], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    c.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    c.on("error", () => resolve(null));
    c.on("close", (code) => resolve(code === 0 ? out.trim() || null : null));
  });
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** 연결만 하고 바로 닫는다. 200ms 안에 연결되면 참. */
export function probeSocket(socketPath: string, timeoutMs = 200): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const s = net.connect({ path: socketPath });
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(timeoutMs, () => finish(false));
    s.once("connect", () => finish(true));
    s.once("error", () => finish(false));
  });
}

async function liveness(data: Record<string, unknown>): Promise<Liveness> {
  const pid = typeof data.pid === "number" ? data.pid : null;
  if (!pid || !alive(pid)) return "gone";
  const started = await pidStart(pid);
  if (typeof data.pidStartedAt === "string" && data.pidStartedAt && started !== data.pidStartedAt) return "gone";
  const inbox = isObj(data.inbox) && typeof data.inbox.path === "string" ? data.inbox.path : null;
  if (!inbox) return "alive-no-inbox";
  return (await probeSocket(inbox)) ? "alive" : "alive-no-inbox";
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** session-coordination.py context --json 의 활성 · 만료 전 점유(세션 id → 파일). 등록표가 없으면 띄우지 않는다. */
export async function leases(p: Project, root: string): Promise<Map<string, { files: string[]; active: boolean }>> {
  const state = path.join(root, ".agents/coordination/state.json");
  if (!fs.existsSync(state)) return new Map();
  return p.cache.get(`leases:${root}`, fileStamp(state), async () => {
    const out = new Map<string, { files: string[]; active: boolean }>();
    const script = path.join(root, "scripts/session-coordination.py");
    if (!fs.existsSync(script)) return out;
    const r = await python(root, p.env, [script, "--root", root, "context", "--json"], 20_000);
    if (r.code !== 0) return out;
    try {
      const data = JSON.parse(r.stdout) as { sessions?: Record<string, unknown>[] };
      for (const s of data.sessions ?? []) {
        if (typeof s.id !== "string") continue;
        const files = Array.isArray(s.files) ? s.files.filter((f): f is string => typeof f === "string") : [];
        out.set(s.id, { files, active: s.status === "active" && s.expired !== true });
      }
    } catch {
      // 등록표를 읽지 못하면 점유 없음으로 본다
    }
    return out;
  });
}

export async function readSessions(p: Project): Promise<SessionFull[]> {
  const dir = path.join(p.root, ".agents/state/sessions");
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const owned = await leases(p, p.root);
  const out: SessionFull[] = [];
  await Promise.all(
    names.map(async (n) => {
      const file = path.join(dir, n);
      const data = readJson(file);
      const id = data && typeof data.id === "string" ? data.id : n.slice(0, -5);
      if (!data || !SESSION_ID.test(id)) return;
      const state = await liveness(data);
      if (state === "gone" && !p.multi && !p.readOnly) {
        try {
          if (Date.now() - fs.statSync(file).mtimeMs > DAY) {
            fs.unlinkSync(file);
            return;
          }
        } catch {
          return;
        }
      }
      const socket = isObj(data.inbox) && typeof data.inbox.path === "string" ? data.inbox.path : null;
      const cwdAbs = str(data.cwd);
      out.push({
        id, harness: str(data.harness), name: str(data.name), role: str(data.role), roleSource: str(data.roleSource), issue: str(data.issue),
        checkout: str(data.checkout), branch: str(data.branch), cwd: cwdAbs && path.isAbsolute(cwdAbs) ? rel(p.loc.top, cwdAbs) : null,
        turn: str(data.turn), startedAt: str(data.startedAt), lastSeenAt: str(data.lastSeenAt), permissionMode: str(data.permissionMode),
        state, inbox: socket !== null, files: owned.get(id)?.files ?? [], socket, cwdAbs,
      });
    }),
  );
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function publicSession(s: SessionFull): SessionRecord {
  const { socket: _s, cwdAbs: _c, ...rest } = s;
  return rest;
}

export interface QueueItem {
  id: string;
  createdAt: string | null;
  createdBy: string | null;
  target: Record<string, unknown>;
  kind: string | null;
  message: string;
  paths: string[];
  expiresAt: string | null;
  stale: boolean;
}

export function queueDir(p: Project): string {
  return path.join(p.root, ".agents/state/dispatch-queue");
}

export async function readQueue(p: Project): Promise<QueueItem[]> {
  const dir = queueDir(p);
  const stamp = treeStamp(dir, 1);
  const items = await p.cache.get(`queue`, stamp, () => {
    const out: QueueItem[] = [];
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
    } catch {
      return out;
    }
    for (const n of names) {
      const d = readJson(path.join(dir, n));
      if (!d) continue;
      out.push({
        id: str(d.id) ?? n.slice(0, -5), createdAt: str(d.createdAt), createdBy: str(d.createdBy), target: isObj(d.target) ? d.target : {}, kind: str(d.kind),
        message: str(d.message) ?? "", paths: Array.isArray(d.paths) ? d.paths.filter((x): x is string => typeof x === "string") : [], expiresAt: str(d.expiresAt), stale: false,
      });
    }
    return out;
  });
  const now = Date.now();
  if (!p.multi && !p.readOnly) cleanConsumed(dir, now);
  return items.map((i) => ({ ...i, stale: i.createdAt ? now - Date.parse(i.createdAt) > DAY : false }));
}

function cleanConsumed(dir: string, now: number): void {
  const consumed = path.join(dir, "consumed");
  let names: string[] = [];
  try {
    names = fs.readdirSync(consumed);
  } catch {
    return;
  }
  for (const n of names) {
    const f = path.join(consumed, n);
    try {
      if (now - fs.statSync(f).mtimeMs > 7 * DAY) fs.unlinkSync(f);
    } catch {
      // 다른 프로세스가 먼저 지웠다
    }
  }
}
