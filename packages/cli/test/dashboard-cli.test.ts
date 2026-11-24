/**
 * 화면 없이 쓰기(06 §3.15): REST 경로마다 CLI 명령이 있고 `--json` 이 API 응답 data 와 같다.
 * 승인 · 답 · 리뷰 판단은 사람 터미널(TTY · 에이전트 아님)에서만 된다. 등록부 · 내보내기 · 기존 서버(DB-R23).
 */
import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { ROUTES } from "../../dashboard/src/api";
import { call, cleanEnv, commitAll, makeRepo, readFile, serve, writeFile, writeIssue, type Repo } from "../../dashboard/test/helpers";
import { dashboardDeps } from "../src/commands/dashboard";
import { main, type Io } from "../src/main";
import { CLI_DIR } from "./helpers";

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
  json: any;
}

async function cli(argv: string[], repo: Repo, opts: { tty?: boolean; answers?: string[]; agent?: string | null; env?: Record<string, string> } = {}): Promise<CliRun> {
  let stdout = "";
  let stderr = "";
  const stdin = new PassThrough();
  for (const a of opts.answers ?? []) stdin.write(`${a}\n`);
  const io: Io = {
    stdout: (s) => {
      stdout += s;
    },
    stderr: (s) => {
      stderr += s;
    },
    env: opts.env ?? cleanEnv(repo.home),
    cwd: repo.root,
    cliFile: path.join(CLI_DIR, "dist", "cli.js"),
    isTTY: opts.tty ?? false,
    nodeVersion: process.versions.node,
    stdin,
    today: "2026-11-24",
    agentSession: () => (opts.agent === undefined ? null : opts.agent),
  };
  const code = await main(argv, io);
  stdin.end();
  let json: any = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = null;
  }
  return { code, stdout, stderr, json };
}

const VOLATILE = new Set(["readAt", "computedAt", "lastSeenAt", "checkedAt", "scannedAt", "to"]);
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !VOLATILE.has(k)).map(([k, x]) => [k, stable(x)]));
  return v;
}

const INT = ".agents/docs/intents/INT-7-pay-reform";

function fixture(): Repo {
  const repo = makeRepo();
  writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "in-review", design: "draft" });
  writeFile(repo.root, `${INT}/intent.md`, "---\nkey: INT-7\ntitle: 결제 개편\nstatus: in-review\n---\n\n# Intent\n");
  writeFile(repo.root, `${INT}/units.json`, `${JSON.stringify({ schema: "harness-kit.units/v1", intent: { key: "INT-7", title: "결제 개편", doc: "intent.md" }, source: { kind: "kit" },
    units: [{ id: "U-1", title: "계약", kind: "contract", area: "pay", dependsOn: [], order: 1, issue: null, planned: true },
      { id: "U-2", title: "등록", kind: "feature", area: "pay", dependsOn: ["U-1"], order: 2, issue: "DEMO-1", planned: true },
      { id: "U-3", title: "알림", kind: "feature", area: "pay", dependsOn: ["U-2"], order: 3, issue: null, planned: true }] }, null, 2)}\n`);
  writeFile(repo.root, `${INT}/questions.md`, "---\ntarget: INT-7\nstatus: open\nround: 1\n---\n\n# 질문\n\n## Q-1 · 범위 · 답할 직무: po · 막는 게이트: intent\n넣는가?\n\n- A. 넣는다 — 영향: 하나\n- B. 뺀다 — 영향: 둘\n- 권장: B — 근거: 없다\n- 답:\n");
  commitAll(repo.root);
  writeFile(repo.home, ".config/harness-kit/config.json", JSON.stringify({ history: "on" }));
  const data = { issue: "DEMO-1", mr: "#1", head: "abc1234", findings: [{ id: "F-1", severity: "HIGH", check: "RV-EDGE", path: "README.md", line: 1, fp: "cd".repeat(32), title: "빈 입력" }] };
  writeFile(repo.root, ".agents/reports/review/DEMO-1.md", `---\nissue: DEMO-1\n---\n\n<!-- harness-kit:review-data ${JSON.stringify(data)} -->\n`);
  return repo;
}

const PAIRS: [string, string[]][] = [
  ["/api/v1/session", ["status", "--session"]],
  ["/api/v1/overview", ["status"]],
  ["/api/v1/issues", ["status", "--issues"]],
  ["/api/v1/issues?area=upload", ["status", "--issues", "--area", "upload"]],
  ["/api/v1/issues/DEMO-1", ["status", "--issue", "DEMO-1"]],
  ["/api/v1/intents", ["status", "--intents"]],
  ["/api/v1/intents/INT-7", ["status", "--intent", "INT-7"]],
  ["/api/v1/intents/INT-7/gates?gate=plans", ["status", "--intent", "INT-7", "--gate", "plans"]],
  [`/api/v1/docs?path=${encodeURIComponent(".agents/docs/issues/DEMO-1-upload-cleanup/requirements.md")}`, ["status", "--doc", ".agents/docs/issues/DEMO-1-upload-cleanup/requirements.md"]],
  ["/api/v1/verify", ["status", "--verify"]],
  ["/api/v1/worktrees", ["status", "--worktrees"]],
  ["/api/v1/harness", ["status", "--harness"]],
  ["/api/v1/flow?intent=INT-7", ["status", "--flow", "INT-7"]],
  ["/api/v1/flow/gates", ["flow", "gates"]],
  ["/api/v1/intents/INT-7/burn", ["status", "--flow", "INT-7", "--burn"]],
  ["/api/v1/intents/INT-7/burn?days=3", ["status", "--flow", "INT-7", "--burn", "--days", "3"]],
  ["/api/v1/skills", ["skills"]],
  ["/api/v1/skills?stage=design&harness=claude", ["skills", "--stage", "design", "--harness", "claude"]],
  ["/api/v1/skills?conflicts=1&errors=1&all=1&user=0", ["skills", "--conflicts", "--errors", "--all", "--no-user"]],
  ["/api/v1/usage", ["usage"]],
  ["/api/v1/usage?days=3&harness=claude", ["usage", "--days", "3", "--harness", "claude"]],
  ["/api/v1/usage/now", ["usage", "--now"]],
  ["/api/v1/usage/kit", ["usage", "--kit"]],
  ["/api/v1/history", ["history"]],
  ["/api/v1/history?q=zzz", ["history", "--q", "zzz"]],
  ["/api/v1/reports/summary", ["quality"]],
  ["/api/v1/reports/findings", ["quality", "--findings"]],
  ["/api/v1/reviews/DEMO-1", ["review", "show", "DEMO-1"]],
  ["/api/v1/sessions", ["sessions"]],
  ["/api/v1/dispatch/queue", ["dispatch", "list"]],
  ["/api/v1/questions?target=INT-7", ["answer", "INT-7", "--list"]],
];

describe("REST 경로마다 CLI 명령(06 §3.15)", () => {
  it("경로 표의 모든 항목에 CLI 대응이 적혀 있다", () => {
    expect(ROUTES.length).toBeGreaterThan(30);
    for (const r of ROUTES) expect([r.method, r.path, typeof r.cli === "string" && r.cli.length > 0]).toEqual([r.method, r.path, true]);
    const covered = new Set(PAIRS.map(([p]) => p.split("?")[0]?.replace(/DEMO-1|INT-7/g, "{key}")));
    const reads = ROUTES.filter((r) => r.method === "GET" && !r.stub && !r.multi && !r.path.startsWith("/raw") && r.path !== "/healthz").map((r) => `/api/v1${r.path}`.replace(/\{[a-zA-Z]+\}/g, "{key}"));
    for (const p of reads) expect([p, covered.has(p)]).toEqual([p, true]);
  });

  it("읽기 명령의 --json = API data", async () => {
    const repo = fixture();
    const srv = await serve(repo, { deps: dashboardDeps() });
    for (const [url, argv] of PAIRS) {
      const api = await call(srv, "GET", url);
      expect([url, api.status]).toEqual([url, 200]);
      const out = await cli([...argv, "--json"], repo);
      expect([argv.join(" "), out.code, out.stderr]).toEqual([argv.join(" "), 0, ""]);
      expect([argv.join(" "), stable(out.json)]).toEqual([argv.join(" "), stable(api.json.data)]);
    }
  });
});

describe("쓰기 명령", () => {
  it("approve: TTY · 키 확인 뒤 경로 terminal 로 기록하고 --json 은 API 와 같은 칸", async () => {
    const repo = fixture();
    const out = await cli(["approve", "DEMO-1", "--gate", "requirements", "--phrase", "요구사항 확정", "--json"], repo, { tty: true, answers: ["DEMO-1"] });
    expect(out.code, out.stdout + out.stderr).toBe(0);
    expect(Object.keys(out.json).sort()).toEqual(["approvals", "approver", "entryId", "group", "sessions", "statusChanged"]);
    const text = readFile(repo.root, ".agents/docs/issues/DEMO-1-upload-cleanup/approvals.md");
    expect(text).toContain("- 경로: terminal");
    expect(text).toContain('- 문구: "요구사항 확정"');
  });

  it("approve · answer · review decide 는 에이전트 세션 · TTY 아님이면 exit 3 read_only, 키가 다르면 exit 1", async () => {
    const repo = fixture();
    const agent = await cli(["approve", "DEMO-1", "--gate", "requirements", "--phrase", "x", "--json"], repo, { tty: true, answers: ["DEMO-1"], agent: "CLAUDECODE=1" });
    expect([agent.code, agent.json.error.code]).toEqual([3, "read_only"]);
    const noTty = await cli(["answer", "INT-7", "Q-1", "--choice", "B", "--json"], repo, { tty: false });
    expect([noTty.code, noTty.json.error.code]).toEqual([3, "read_only"]);
    const rd = await cli(["review", "decide", "DEMO-1", "F-1", "--accept-risk", "--reason", "x", "--json"], repo, { tty: true, answers: ["DEMO-1"], agent: "부모 프로세스 claude" });
    expect(rd.code).toBe(3);
    const wrong = await cli(["approve", "DEMO-1", "--gate", "requirements", "--phrase", "x"], repo, { tty: true, answers: ["DEMO-9"] });
    expect(wrong.code).toBe(1);
    expect(fs.existsSync(path.join(repo.root, ".agents/docs/issues/DEMO-1-upload-cleanup/approvals.md"))).toBe(false);
  });

  it("answer · review decide · units propose/discard · dispatch queue/list/drop", async () => {
    const repo = fixture();
    const ans = await cli(["answer", "INT-7", "Q-1", "--choice", "B", "--text", "다음 Intent", "--json"], repo, { tty: true });
    expect(ans.code, ans.stdout + ans.stderr).toBe(0);
    expect(readFile(repo.root, `${INT}/questions.md`)).toMatch(/- 답: B · kim@example\.com · /);
    const rd = await cli(["review", "decide", "DEMO-1", "F-1", "--accept-risk", "--reason", "레거시 경로", "--json"], repo, { tty: true, answers: ["DEMO-1"] });
    expect(rd.code, rd.stdout + rd.stderr).toBe(0);
    expect(readFile(repo.root, ".agents/docs/issues/DEMO-1-upload-cleanup/approvals.md")).toContain("review/F-1 · risk-accepted");
    const units = readFile(repo.root, `${INT}/units.json`);
    const p = await cli(["units", "propose", "INT-7", "--add-dep", "U-3:U-1", "--reason", "실패 코드", "--json"], repo);
    expect(p.code, p.stdout + p.stderr).toBe(0);
    expect(readFile(repo.root, `${INT}/units.json`)).toBe(units);
    expect(JSON.parse(readFile(repo.root, `${INT}/units.proposed.json`)).changes).toEqual([{ op: "add-dep", unit: "U-3", dependsOn: "U-1", reason: "실패 코드" }]);
    const cyc = await cli(["units", "propose", "INT-7", "--add-dep", "U-2:U-3", "--json"], repo);
    expect([cyc.code, cyc.json.error.code]).toEqual([1, "cycle"]);
    expect((await cli(["units", "discard", "INT-7"], repo)).code).toBe(0);
    expect(fs.existsSync(path.join(repo.root, INT, "units.proposed.json"))).toBe(false);
    const d = await cli(["dispatch", "--to", "DEMO-1:implement", "--kind", "custom", "--text", "다시 읽는다", "--path", "README.md", "--via", "queue", "--json"], repo);
    expect(d.code, d.stdout + d.stderr).toBe(0);
    expect(d.json.method).toBe("queue");
    const list = await cli(["dispatch", "list", "--json"], repo);
    expect(list.json.items.map((i: any) => i.id)).toEqual([d.json.id]);
    expect((await cli(["dispatch", "drop", d.json.id], repo)).code).toBe(0);
    expect((await cli(["dispatch", "list", "--json"], repo)).json.items).toEqual([]);
  });

  it("에이전트 세션은 dispatch 로 다른 세션에 작업 요청을 보내지 못한다(사용자 결정 2026-11-24) — list · drop 은 된다", async () => {
    const repo = fixture();
    const send = await cli(["dispatch", "--to", "DEMO-1:implement", "--kind", "custom", "--text", "x", "--via", "queue", "--json"], repo, { agent: "CLAUDECODE=1" });
    expect(send.code).toBe(3);
    expect(send.json.error.message).toContain("에이전트 세션에서는 다른 세션에 작업 요청을 보내지 않는다");
    expect(fs.existsSync(path.join(repo.root, ".agents/state/dispatch-queue"))).toBe(false);
    expect((await cli(["dispatch", "list", "--json"], repo, { agent: "CLAUDECODE=1" })).code).toBe(0);
  });

  it("projects add · list · remove 는 등록부만 쓴다(0600 · 폴더 0700)", async () => {
    const repo = fixture();
    const add = await cli(["projects", "add", repo.root, "--json"], repo);
    expect(add.code, add.stdout + add.stderr).toBe(0);
    const reg = path.join(repo.home, ".config/harness-kit/projects.json");
    expect(fs.statSync(reg).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(reg)).mode & 0o777).toBe(0o700);
    const list = await cli(["projects", "list", "--json"], repo);
    expect(list.json.projects.map((p: any) => [p.name, p.path])).toEqual([["demo", repo.root]]);
    expect((await cli(["projects", "add", repo.root], repo)).code).toBe(0);
    expect(JSON.parse(fs.readFileSync(reg, "utf8")).projects).toHaveLength(1);
    expect((await cli(["projects", "remove", "demo"], repo)).code).toBe(0);
    expect(JSON.parse(fs.readFileSync(reg, "utf8")).projects).toEqual([]);
    expect((await cli(["projects", "add", path.join(repo.base, "nope")], repo)).code).not.toBe(0);
  });

  it("projects list · status --all 의 --json = --all 서버의 API data", async () => {
    const repo = fixture();
    await cli(["projects", "add", repo.root], repo);
    const srv = await serve(repo, { mode: { kind: "all" }, deps: dashboardDeps() });
    const pl = await cli(["projects", "list", "--json"], repo);
    expect(stable(pl.json)).toEqual(stable((await call(srv, "GET", "/api/v1/projects")).json.data));
    const all = await cli(["status", "--all", "--json"], repo);
    expect(stable(all.json)).toEqual(stable((await call(srv, "GET", "/api/v1/projects/overview")).json.data));
  });

  it("dashboard: 같은 리포에 서버가 있으면 그 주소를 내고 exit 0(DB-R23), --export 는 폴더를 만든다", async () => {
    const repo = fixture();
    const srv = await serve(repo);
    const r = await cli(["dashboard"], repo);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe(`http://127.0.0.1:${srv.port}/#t=${srv.token}`);
    const a = await cli(["dashboard"], repo, { agent: "CLAUDECODE=1" });
    expect(a.stdout).not.toContain(srv.token);
    await srv.close();
    const out = path.join(repo.base, "site");
    const e = await cli(["dashboard", "--export", out], repo);
    expect(e.code, e.stdout + e.stderr).toBe(0);
    expect(fs.existsSync(path.join(out, "index.html"))).toBe(true);
  });

  it("intake 는 POST /intake 와 같은 처리 — 로컬 첨부 경로 · --text-file · 비밀값은 exit 1", async () => {
    const repo = fixture();
    fs.cpSync(path.resolve(CLI_DIR, "../templates/common/agents-docs/_spec-templates"), path.join(repo.root, ".agents/docs/_spec-templates"), { recursive: true });
    const note = path.join(repo.base, "note.txt");
    fs.writeFileSync(note, "현장 메모\n");
    const body = path.join(repo.base, "body.md");
    fs.writeFileSync(body, "본문 한 줄\n");
    const r = await cli(["intake", "--title", "알림 개편", "--kind", "change", "--name", "notice-change", "--text-file", body, "--attach", note, "--json"], repo);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.json.folder).toBe(".agents/docs/intents/INT-8-notice-change");
    expect(readFile(repo.root, `${r.json.folder}/intake.md`)).toContain("본문 한 줄");
    expect(readFile(repo.root, `${r.json.folder}/attachments/01-note.txt`)).toBe("현장 메모\n");
    const bad = await cli(["intake", "--title", "x", "--kind", "change", "--name", "leak", "--text", `${"AK"}${"IA"}${"Q".repeat(16)}`], repo);
    expect([bad.code, bad.stderr.includes("비밀값")]).toEqual([1, true]);
    const usage = await cli(["intake", "--kind", "change"], repo);
    expect(usage.code).toBe(2);
  });

  it("범위 밖 명령은 exit 2 와 제공 이슈", async () => {
    const repo = fixture();
    for (const [cmd, stage] of [["deploy", "P24"]] as const) {
      const r = await cli([cmd], repo);
      expect([cmd, r.code, r.stderr.includes(stage)]).toEqual([cmd, 2, true]);
    }
    fs.rmSync(path.join(repo.home, ".config/harness-kit/config.json"));
    const off = await cli(["history", "--json"], repo);
    expect([off.code, off.json.error.code]).toEqual([1, "history_off"]);
    writeFile(repo.home, ".config/harness-kit/config.json", JSON.stringify({ history: "on" }));
    const on = await cli(["history", "--json"], repo);
    expect([on.code, on.json.enabled, on.json.prompts]).toEqual([0, true, []]);
  });
});
