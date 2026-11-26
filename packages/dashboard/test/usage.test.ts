/** 기록 · 사용량(설계 06 §3.18, DB-R26 · R28). 임시 HOME 의 가짜 대화 기록만 읽는다. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { call, cleanEnv, git, makeRepo, serve, snapshotTree, writeFile, writeIssue } from "./helpers";

const enc = (d: string): string => d.replace(/[^A-Za-z0-9]/g, "-");
const noon = (daysAgo: number): number => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.getTime() - daysAgo * 86_400_000;
};

function claudeLine(o: { id: string; ts: number; cwd: string; session: string; branch?: string; model?: string; input?: number; output?: number; read?: number; write?: number }): string {
  return JSON.stringify({
    type: "assistant", sessionId: o.session, cwd: o.cwd, gitBranch: o.branch ?? "develop", timestamp: new Date(o.ts).toISOString(),
    message: { id: o.id, model: o.model ?? "claude-sonnet-4-5", usage: { input_tokens: o.input ?? 10, output_tokens: o.output ?? 20, cache_read_input_tokens: o.read ?? 100, cache_creation_input_tokens: o.write ?? 5 } },
  });
}

function on(home: string, extra: Record<string, unknown> = {}): void {
  writeFile(home, ".config/knots-sync/config.json", JSON.stringify({ history: "on", ...extra }));
}

describe("GET /usage · /usage/now · /history", () => {
  it("설정이 없으면(기본) 켜져 있다 — 사용자 결정 2026-11-26", async () => {
    const repo = makeRepo();
    const srv = await serve(repo);
    const u = await call(srv, "GET", "/api/v1/usage");
    expect(u.status).toBe(200);
    expect(u.json.data).toMatchObject({ enabled: true, config: "~/.config/knots-sync/config.json", disable: '{ "history": "off" }' });
    expect((await call(srv, "GET", "/api/v1/usage/now")).json.data.enabled).toBe(true);
    expect((await call(srv, "GET", "/api/v1/history")).status).toBe(200);
  });

  it("\"history\": \"off\" 면 enabled:false 와 다시 켜는 법만 낸다(~/.claude 를 열지 않는다)", async () => {
    const repo = makeRepo();
    writeFile(repo.home, ".config/knots-sync/config.json", JSON.stringify({ history: "off" }));
    const srv = await serve(repo);
    const u = await call(srv, "GET", "/api/v1/usage");
    expect(u.status).toBe(200);
    expect(u.json.data).toMatchObject({ enabled: false, config: "~/.config/knots-sync/config.json", totals: null });
    expect(u.json.data.sources.every((s: { state: string }) => s.state === "off" || s.state === "none")).toBe(true);
    expect((await call(srv, "GET", "/api/v1/usage/now")).json.data).toMatchObject({ enabled: false, session: null });
    expect((await call(srv, "GET", "/api/v1/history")).status).toBe(404);
  });

  it("켜면 이 리포(와 worktree)의 기록만 하루 · 이슈 · 역할 · 캐시 비율로 센다", async () => {
    const repo = makeRepo();
    on(repo.home);
    const wt = path.join(repo.base, "demo.worktrees", "DEMO-2-x");
    const dir = path.join(repo.home, ".claude/projects", enc(repo.root));
    const wtDir = path.join(repo.home, ".claude/projects", enc(wt));
    const other = path.join(repo.home, ".claude/projects", enc(`${repo.root}-other`));
    writeFile(dir, "a.jsonl", [
      claudeLine({ id: "m1", ts: noon(0), cwd: repo.root, session: "s-design", branch: "docs/INT-1-x" }),
      claudeLine({ id: "m2", ts: noon(1), cwd: repo.root, session: "s-impl", branch: "feat/DEMO-1-upload", input: 50, output: 50, read: 400, write: 0 }),
      // 같은 응답이 두 번 적힌 줄은 마지막 하나만 센다
      claudeLine({ id: "m3", ts: noon(1), cwd: repo.root, session: "s-impl", branch: "feat/DEMO-1-upload", output: 5 }),
      claudeLine({ id: "m3", ts: noon(1), cwd: repo.root, session: "s-impl", branch: "feat/DEMO-1-upload", output: 7 }),
      "{ 깨진 줄",
      claudeLine({ id: "m9", ts: noon(20), cwd: repo.root, session: "s-old" }),
    ].join("\n") + "\n");
    writeFile(wtDir, "b.jsonl", `${claudeLine({ id: "w1", ts: noon(0), cwd: wt, session: "s-wt", branch: "feat/DEMO-2-x" })}\n`);
    writeFile(other, "c.jsonl", `${claudeLine({ id: "o1", ts: noon(0), cwd: `${repo.root}-other`, session: "s-other" })}\n`);
    writeFile(repo.root, ".agents/state/sessions/s-design.json", JSON.stringify({ id: "s-design", role: "design", issue: null, harness: "claude", pid: 1, inbox: null }));
    const srv = await serve(repo);
    const r = await call(srv, "GET", "/api/v1/usage?days=7");
    expect(r.status, r.text).toBe(200);
    const d = r.json.data;
    expect(d.enabled).toBe(true);
    expect(d.daily).toHaveLength(7);
    // m1(135) + w1(135) + m2(500) + m3(마지막 줄 10+7+100+5 = 122)
    expect(d.totals.requests).toBe(4);
    expect(d.totals.sum).toBe(135 + 135 + 500 + 122);
    const today = d.daily[6];
    expect(today.sum).toBe(270);
    expect(today.byRole.design).toBe(135);
    expect(today.byRole["역할 없음"]).toBe(135);
    expect(d.byIssue.map((x: { issue: string }) => x.issue).sort()).toEqual(["DEMO-1", "DEMO-2", "INT-1"]);
    expect(d.byIssue[0]).toEqual({ issue: "DEMO-1", sum: 622 });
    expect(d.cache.average).toBeCloseTo((100 + 100 + 400 + 100) / (10 + 100 + 5 + 10 + 100 + 5 + 50 + 400 + 10 + 100 + 5 + 0), 5);
    expect(JSON.stringify(d)).not.toContain("s-other");
    expect(d.cost).toBeNull();
    const src = d.sources.find((s: { id: string }) => s.id === "claude-projects");
    expect(src.state).toBe("read");
    expect(src.sessions).toBe(3);
  });

  it("지금 세션: 마지막 응답 ÷ 창, usage.contextWindows 가 덮고 알림 기준(warnAt)을 넘으면 warn", async () => {
    const repo = makeRepo();
    on(repo.home, { usage: { contextWindows: { "claude-x": 1000 }, warnAt: 0.5, pricing: { "claude-x": { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 1 } } } });
    const dir = path.join(repo.home, ".claude/projects", enc(repo.root));
    writeFile(dir, "a.jsonl", [
      claudeLine({ id: "m1", ts: noon(0) - 5000, cwd: repo.root, session: "s1", model: "claude-x", input: 10, read: 100, write: 0 }),
      claudeLine({ id: "m2", ts: noon(0), cwd: repo.root, session: "s1", branch: "feat/DEMO-1-x", model: "claude-x", input: 100, read: 500, write: 20 }),
    ].join("\n") + "\n");
    const srv = await serve(repo);
    const s = (await call(srv, "GET", "/api/v1/usage/now")).json.data.session;
    expect(s).toMatchObject({ id: "s1", model: "claude-x", used: 620, window: 1000, issue: "DEMO-1", requests: 2, warn: true, warnAt: 0.5 });
    expect(s.ratio).toBeCloseTo(0.62);
    const u = (await call(srv, "GET", "/api/v1/usage?days=1")).json.data;
    expect(u.cost.estimate).toBeGreaterThanOrEqual(0);
    expect(u.cost.note).toContain("청구");
    writeFile(repo.home, ".config/knots-sync/config.json", JSON.stringify({ history: "on" }));
    writeFile(dir, "a.jsonl", `${claudeLine({ id: "m2", ts: noon(0), cwd: repo.root, session: "s1", model: "unknown-model" })}\n`);
    const unk = (await call(srv, "GET", "/api/v1/usage/now")).json.data.session;
    expect([unk.window, unk.ratio, unk.windowNote]).toEqual([null, null, "기록에 없습니다"]);
  });

  it("덧붙은 줄만 더 읽는다: 파일이 자라도 앞 줄을 다시 세지 않고, 잘린 마지막 줄은 다음에 읽는다", async () => {
    const repo = makeRepo();
    on(repo.home);
    const file = path.join(repo.home, ".claude/projects", enc(repo.root), "a.jsonl");
    writeFile(path.dirname(file), "a.jsonl", `${claudeLine({ id: "m1", ts: noon(0), cwd: repo.root, session: "s1" })}\n`);
    const srv = await serve(repo);
    expect((await call(srv, "GET", "/api/v1/usage?days=1")).json.data.totals.requests).toBe(1);
    const second = claudeLine({ id: "m2", ts: noon(0), cwd: repo.root, session: "s1" });
    fs.appendFileSync(file, second.slice(0, 40));
    expect((await call(srv, "GET", "/api/v1/usage?days=1")).json.data.totals.requests).toBe(1);
    fs.appendFileSync(file, `${second.slice(40)}\n`);
    expect((await call(srv, "GET", "/api/v1/usage?days=1")).json.data.totals.requests).toBe(2);
  });

  it("Codex 세션 기록: session_meta 의 cwd 로 거르고 token_count 의 last_token_usage 를 센다", async () => {
    const repo = makeRepo();
    on(repo.home);
    const lines = (cwd: string, id: string): string => [
      JSON.stringify({ timestamp: new Date(noon(0)).toISOString(), type: "session_meta", payload: { id, cwd } }),
      JSON.stringify({ timestamp: new Date(noon(0)).toISOString(), type: "turn_context", payload: { model: "gpt-5" } }),
      JSON.stringify({ timestamp: new Date(noon(0)).toISOString(), type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 300, cached_input_tokens: 200, output_tokens: 40 } } } }),
      JSON.stringify({ timestamp: new Date(noon(0)).toISOString(), type: "event_msg", payload: { type: "token_count", info: null } }),
    ].join("\n") + "\n";
    writeFile(repo.home, ".codex/sessions/2026/11/24/rollout-a.jsonl", lines(repo.root, "cx-1"));
    writeFile(repo.home, ".codex/sessions/2026/11/24/rollout-b.jsonl", lines("/somewhere/else", "cx-2"));
    const srv = await serve(repo);
    const d = (await call(srv, "GET", "/api/v1/usage?days=1&harness=codex")).json.data;
    expect(d.totals).toMatchObject({ input: 100, cacheRead: 200, output: 40, sum: 340, requests: 1 });
    const kiro = d.sources.find((s: { id: string }) => s.id === "kiro");
    expect(kiro.state).toBe("none");
  });

  it("프롬프트 기록: 이 리포의 글만 q · session · role 로 거르고 복사본을 남기지 않는다(DB-R28)", async () => {
    const repo = makeRepo();
    on(repo.home);
    const h = (text: string, ts: number, project: string, session: string): string => JSON.stringify({ display: text, timestamp: ts, project, sessionId: session });
    writeFile(repo.home, ".claude/history.jsonl", [
      h("결제 개편 설계를 시작한다", noon(1), repo.root, "s-design"),
      h("업로드 정리 구현", noon(0), repo.root, "s-impl"),
      h("남의 리포 글", noon(0), "/elsewhere/other", "s-x"),
      "깨진 줄",
    ].join("\n") + "\n");
    writeFile(repo.root, ".agents/state/sessions/s-design.json", JSON.stringify({ id: "s-design", role: "design", issue: null, harness: "claude", pid: 1 }));
    const srv = await serve(repo);
    const before = snapshotTree(repo.root);
    const homeBefore = snapshotTree(repo.home, (rel) => rel.startsWith(".claude/"));
    const all = (await call(srv, "GET", "/api/v1/history")).json.data;
    expect(all.prompts.map((p: { text: string }) => p.text)).toEqual(["업로드 정리 구현", "결제 개편 설계를 시작한다"]);
    expect(all.unreadable).toBe(1);
    expect((await call(srv, "GET", "/api/v1/history?q=%EA%B2%B0%EC%A0%9C")).json.data.prompts).toHaveLength(1);
    expect((await call(srv, "GET", "/api/v1/history?role=design")).json.data.prompts[0].session).toBe("s-design");
    expect((await call(srv, "GET", "/api/v1/history?session=s-impl")).json.data.prompts).toHaveLength(1);
    expect(snapshotTree(repo.root)).toEqual(before);
    expect(snapshotTree(repo.home, (rel) => rel.startsWith(".claude/"))).toEqual(homeBefore);
    expect(snapshotTree(repo.home).has(".config/knots-sync/usage.json")).toBe(false);
  });

  it("days 가 범위 밖이면 400", async () => {
    const repo = makeRepo();
    const srv = await serve(repo);
    for (const d of ["0", "91", "x", "1.5"]) expect((await call(srv, "GET", `/api/v1/usage?days=${d}`)).status).toBe(400);
    expect((await call(srv, "GET", "/api/v1/usage?harness=zzz")).status).toBe(400);
  });
});

describe("GET /usage/kit — 킷이 덧붙인 양(늘 켜짐)", () => {
  it("hook-output.jsonl 을 훅별로 센다 · 세션 시작 합 대 2,560바이트 · 모르는 줄은 skipped", async () => {
    const repo = makeRepo();
    const rec = (event: string, hook: string, bytes: number, truncated = false): string => JSON.stringify({ at: "2026-11-24T00:00:00Z", event, hook, bytes, truncated, exit: 0 });
    writeFile(repo.root, ".agents/state/hook-output.jsonl", [rec("SessionStart", "harness-session-start", 2000), rec("SessionStart", "harness-session-start", 2400, true), rec("session-start", "harness-session-register", 100), rec("PreToolUse", "harness-protect-sources", 0), "깨진 줄"].join("\n") + "\n");
    writeFile(repo.root, "CLAUDE.md", "가".repeat(300));
    writeFile(repo.root, ".agents/hooks.json", JSON.stringify({ hooks: [{ id: "harness-a", event: "session-start", owner: "kit" }, { id: "harness-b", event: "pre-tool", owner: "pack:acme" }] }));
    writeFile(repo.root, ".agents/knots-sync.lock", JSON.stringify({ schema: "knots-sync.lock/v2", kit: { version: "2.0.0", source: null }, packs: [], entries: [{ path: "CLAUDE.md", op: "copy", owner: "kit", sha256: "x" }, { path: "docs/other.md", op: "copy", owner: "pack:acme" }] }));
    const srv = await serve(repo);
    const k = (await call(srv, "GET", "/api/v1/usage/kit")).json.data;
    const start = k.hooks.find((h: { hook: string }) => h.hook === "harness-session-start");
    expect(start).toMatchObject({ count: 2, avgBytes: 2200, lastBytes: 2400, maxBytes: 2400, truncated: 1 });
    expect(k.sessionStart).toMatchObject({ avgBytes: 2300, limit: 2560, within: true, estTokens: 767 });
    expect(k.skipped).toBe(1);
    expect(k.modules).toEqual([
      { owner: "kit", files: 1, bytes: Buffer.byteLength("가".repeat(300)), hooks: { "session-start": 1 }, estTokens: 300 },
      { owner: "pack:acme", files: 0, bytes: 0, hooks: { "pre-tool": 1 }, estTokens: 0 },
    ]);
  });

  it("기록이 없어도 200, 세션 시작 합 0", async () => {
    const k = (await call(await serve(makeRepo()), "GET", "/api/v1/usage/kit")).json.data;
    expect([k.hooks, k.sessionStart.avgBytes, k.sessionStart.within]).toEqual([[], 0, true]);
  });
});

describe("자동 요청 없음 · 모델 호출 없음(DB-R25 · R26)", () => {
  it("사용량 소스에 모델 · 네트워크 호출이 없다", () => {
    for (const f of ["usage.ts", "skills.ts", "burn.ts"]) {
      const src = fs.readFileSync(path.join(__dirname, "../src", f), "utf8");
      expect(src, f).not.toMatch(/https?:\/\/|fetch\(|child_process|net\.connect|anthropic|openai/i);
    }
  });
});

describe("GET /intents/{key}/burn — 남은 Bolt 계단선", () => {
  it("이슈 tasks.md 의 git 기록에서 날마다 남은 Bolt 를 구하고 tasks 없는 Unit 은 추정으로 센다", async () => {
    const repo = makeRepo();
    const INT = ".agents/docs/intents/INT-7-pay";
    writeFile(repo.root, `${INT}/intent.md`, "---\nkey: INT-7\ntitle: 결제\nstatus: in-review\n---\n\n# I\n");
    writeFile(repo.root, `${INT}/units.json`, `${JSON.stringify({ schema: "knots-sync.units/v1", intent: { key: "INT-7", title: "결제", doc: "intent.md" }, source: { kind: "kit" }, units: [
      { id: "U-1", title: "등록", kind: "feature", area: "pay", dependsOn: [], order: 1, issue: "DEMO-1", planned: true },
      { id: "U-2", title: "알림", kind: "feature", area: "pay", dependsOn: ["U-1"], order: 2, issue: null, planned: true, stories: ["S-1", "S-2", "S-3", "S-4"] },
      { id: "U-3", title: "뺌", kind: "feature", area: "pay", dependsOn: [], order: 3, issue: null, planned: false },
    ] }, null, 2)}\n`);
    const tasks = (done: number): string => `### Phase 1: a\n\n- [${done >= 1 ? "x" : " "}] T1\n\n### Phase 2: b\n\n- [${done >= 2 ? "x" : " "}] T2\n\n### Phase 3: c\n\n- [${done >= 3 ? "x" : " "}] T3\n`;
    writeIssue(repo.root, "DEMO-1", "upload", { requirements: "approved", design: "approved", tasks: "active", body: { tasks: tasks(0) } });
    const commitAt = (daysAgo: number, msg: string): void => {
      const when = new Date(noon(daysAgo)).toISOString();
      const env = { ...cleanEnv(repo.home), GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when };
      for (const args of [["add", "-A"], ["commit", "-q", "--allow-empty", "-m", msg]]) {
        const r = spawnSync("git", args, { cwd: repo.root, env, encoding: "utf8" });
        if (r.status !== 0) throw new Error(r.stderr);
      }
    };
    commitAt(4, "tasks 0");
    writeIssue(repo.root, "DEMO-1", "upload", { requirements: "approved", design: "approved", tasks: "active", body: { tasks: tasks(1) } });
    commitAt(2, "tasks 1");
    writeIssue(repo.root, "DEMO-1", "upload", { requirements: "approved", design: "approved", tasks: "active", body: { tasks: tasks(2) } });
    git(repo.root, "add", "-A");
    const srv = await serve(repo);
    const r = await call(srv, "GET", "/api/v1/intents/INT-7/burn?days=6");
    expect(r.status, r.text).toBe(200);
    const d = r.json.data;
    expect(d.series).toHaveLength(6);
    // U-2 추정 Bolt = ceil(4/3) = 2 는 모든 날 그대로. U-1: 5일 전 0(기록 없음) · 4일 전 3 남음 3 · 2일 전 2 남음 · 오늘 1 남음(작업 트리, 커밋 전)
    const rem = d.series.map((s: { remaining: number }) => s.remaining);
    expect(rem).toEqual([2, 3 + 2, 3 + 2, 2 + 2, 2 + 2, 1 + 2]);
    expect(d.now).toMatchObject({ remaining: 3, total: 5, done: 2, units: { done: 0, total: 2 } });
    expect(d.estimated).toBe(true);
    expect((await call(srv, "GET", "/api/v1/intents/INT-9/burn")).status).toBe(404);
    expect((await call(srv, "GET", "/api/v1/intents/INT-7/burn?days=0")).status).toBe(400);
  });
});
