/**
 * 체크포인트 목록 · 설명(설계 10 §3.3, 06 `GET /checkpoints`). entire 모듈을 켠 리포에서만 값이 있다.
 *
 *   list(issue): 커밋 = git log <base 또는 origin/base>..<이슈 브랜치> 의 `Entire-Checkpoint` 트레일러,
 *                ref = refs/entire/checkpoints/ 아래. 각 체크포인트 id 가 ref 에 있으면 local, 없으면 "원격에만 또는 없음".
 *   explain(id): `entire checkpoint explain <id>`, 10초 제한, 출력은 글자 그대로(신뢰하지 않는 내용 — 제어 문자를 지우고 상한을 둔다).
 *
 * 모델을 부르지 않는다. 읽기만 한다(체크포인트 ref 를 만들거나 push 하지 않는다).
 */
import { ApiError, bad } from "./errors";
import type { Project } from "./project";
import { branches } from "./repo";
import { cutBytes, git, gitOut, run } from "./util";

const EXPLAIN_LIMIT = 20_000;
const EXPLAIN_TIMEOUT = 10_000;
const LOG_LIMIT = 200;
const ID = /^[0-9A-Za-z][0-9A-Za-z-]{5,63}$/;
const KEY = /^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5}$/;
const RS = "\u001e";
const NUL = "\u0000";

export interface CheckpointRow {
  id: string;
  commit: string;
  subject: string;
  local: boolean;
  state: "local" | "remote-or-missing";
}

function enabled(p: Project): boolean {
  const m = p.meta().modules;
  return Array.isArray(m) && m.includes("entire");
}

/** ref 이름에서 슬래시를 뺀 꼬리 → id 맞춤(저장소가 id 를 폴더로 나눠 두어도 맞는다) */
async function localIds(p: Project): Promise<Set<string>> {
  const out = (await gitOut(p.loc.top, p.env, "for-each-ref", "refs/entire/checkpoints/", "--format=%(refname)")) ?? "";
  return new Set(out.split("\n").filter(Boolean).map((r) => r.replace(/^refs\/entire\/checkpoints\//, "").replace(/\//g, "")));
}

async function revExists(p: Project, ref: string): Promise<boolean> {
  return (await git(p.loc.top, p.env, "rev-parse", "--verify", "--quiet", ref)).code === 0;
}

export async function checkpointsList(p: Project, issue: string | null): Promise<Record<string, unknown>> {
  if (issue !== null && !KEY.test(issue)) throw bad(`이슈 키 형식이 아니다: ${issue}`);
  if (!enabled(p)) return { enabled: false, issue, branch: null, checkpoints: [], note: "entire 모듈이 꺼져 있다(harness-kit add entire)" };
  let branch: string | null = null;
  if (issue) {
    const all = await branches(p);
    branch = all.find((b) => /^[a-z]+\//.test(b) && b.slice(b.indexOf("/") + 1).startsWith(`${issue}-`)) ?? null;
    if (!branch) return { enabled: true, issue, branch: null, base: p.base(), checkpoints: [], note: "이슈 브랜치가 없다" };
  } else branch = (await gitOut(p.loc.top, p.env, "rev-parse", "--abbrev-ref", "HEAD")) ?? "HEAD";
  const base = p.base();
  const range = (await revExists(p, `origin/${base}`)) ? `origin/${base}..${branch}` : (await revExists(p, base)) ? `${base}..${branch}` : `-n${LOG_LIMIT} ${branch}`;
  const fmt = "--format=%H%x00%h%x00%s%x00%(trailers:key=Entire-Checkpoint,valueonly,separator=%x2C)%x1e";
  const r = await git(p.loc.top, p.env, "log", fmt, ...range.split(" "));
  if (r.code !== 0) throw new ApiError(500, "git_failed", `git log 실패: ${r.stderr.trim().split("\n").pop() ?? ""}`);
  const local = await localIds(p);
  const rows: CheckpointRow[] = [];
  let commits = 0;
  for (const rec of r.stdout.split(RS)) {
    const [sha, short, subject, trailers] = rec.replace(/^\n/, "").split(NUL);
    if (!sha) continue;
    commits += 1;
    for (const id of (trailers ?? "").split(",").map((x) => x.trim().replace(/\s+/g, "")).filter(Boolean)) {
      const has = local.has(id);
      rows.push({ id, commit: short ?? sha.slice(0, 7), subject: subject ?? "", local: has, state: has ? "local" : "remote-or-missing" });
    }
  }
  return { enabled: true, issue, branch, base, range, commits, checkpoints: rows };
}

/** 제어 문자(줄바꿈 · 탭 제외)를 지운다 — 터미널 · 화면에 그대로 내도 안전하게 */
function cleanText(s: string): string {
  return s.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

export async function checkpointExplain(p: Project, id: string): Promise<Record<string, unknown>> {
  if (!ID.test(id)) throw bad(`체크포인트 id 형식이 아니다: ${id}`);
  if (!enabled(p)) return { enabled: false, id, available: false, reason: "entire 모듈이 꺼져 있다" };
  const r = await run("entire", ["checkpoint", "explain", id], { cwd: p.loc.top, env: p.env, timeout: EXPLAIN_TIMEOUT });
  const missing = r.code !== 0 && /ENOENT|not found|command not found/i.test(r.stderr + String(r.code));
  if (missing || (r.code === 1 && r.stdout === "" && r.stderr === "")) return { enabled: true, id, available: false, reason: "entire 를 실행하지 못했다(없거나 10초 안에 끝나지 않았다)" };
  const text = cutBytes(cleanText(r.stdout || r.stderr), EXPLAIN_LIMIT);
  return { enabled: true, id, available: true, ok: r.code === 0, truncated: Buffer.byteLength(r.stdout) > EXPLAIN_LIMIT, text, untrusted: true };
}
