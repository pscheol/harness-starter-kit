/**
 * 세션 · 작업 요청(06 §3.9 · §3.10, DB-R17 · R18 · R25, 완료 기준 13). 받는 쪽은 가짜 UDS 소켓이다.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { call, commitAll, docSha, makeRepo, readFile, serve, sha256, writeFile, writeIssue, type Repo } from "./helpers";

interface FakeInbox {
  path: string;
  messages: string[];
  connections: number;
  close(): Promise<void>;
}

/** 수신함 소켓 흉내: 받은 글(빈 연결 제외)을 모은다. macOS UDS 경로 길이 제한 때문에 /tmp 에 둔다. */
function fakeInbox(): Promise<FakeInbox> {
  const sock = path.join("/tmp", `hk-sock-${crypto.randomBytes(4).toString("hex")}.sock`);
  const state = { messages: [] as string[], connections: 0 };
  const server = net.createServer((c) => {
    state.connections += 1;
    let buf = "";
    c.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
    });
    c.on("end", () => {
      if (buf) state.messages.push(buf);
      c.end();
    });
    c.on("error", () => undefined);
  });
  return new Promise((resolve) => {
    server.listen(sock, () =>
      resolve({
        path: sock,
        get messages() {
          return state.messages;
        },
        get connections() {
          return state.connections;
        },
        close: () =>
          new Promise<void>((r) => {
            server.close(() => {
              fs.rmSync(sock, { force: true });
              r();
            });
          }),
      }),
    );
  });
}

function lstart(pid: number): string {
  return spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim();
}

function registerSession(repo: Repo, id: string, inbox: string | null, extra: Record<string, unknown> = {}): void {
  const session = {
    schema: "knots-sync.session/v1", id, harness: "claude", harnessVersion: null, name: "api-worker", role: "implement", roleSource: "branch",
    issue: "DEMO-1", cwd: repo.root, checkout: "main", branch: "develop", pid: process.pid, pidStartedAt: lstart(process.pid),
    startedAt: "2026-11-23T09:58:02+09:00", lastSeenAt: "2026-11-23T10:14:40+09:00", turn: "idle",
    inbox: inbox ? { kind: "uds", path: inbox } : null, permissionMode: "acceptEdits", ...extra,
  };
  writeFile(repo.root, `.agents/state/sessions/${id}.json`, `${JSON.stringify(session, null, 2)}\n`);
}

function queueFiles(repo: Repo): string[] {
  const dir = path.join(repo.root, ".agents/state/dispatch-queue");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith(".json")) : [];
}

const REQ = ".agents/docs/issues/DEMO-1-upload-cleanup/requirements.md";

function issueRepo(): Repo {
  const repo = makeRepo();
  writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "in-review", body: { requirements: "## 1. 요구\n\n- R1 비밀 문서 내용 XYZZY\n" } });
  commitAll(repo.root);
  return repo;
}

describe("세션 목록 · 생존 판정", () => {
  it("alive · alive-no-inbox · gone, 응답에 소켓 경로 · pid 를 넣지 않는다", async () => {
    const repo = issueRepo();
    const inbox = await fakeInbox();
    try {
      registerSession(repo, "sess-alive", inbox.path);
      registerSession(repo, "sess-noinbox", null);
      registerSession(repo, "sess-gone", null, { pid: 999_999, pidStartedAt: "Mon Jan  1 00:00:00 2001" });
      const srv = await serve(repo);
      const r = await call(srv, "GET", "/api/v1/sessions");
      expect(r.status).toBe(200);
      const states = Object.fromEntries(r.json.data.sessions.map((s: any) => [s.id, s.state]));
      expect(states).toEqual({ "sess-alive": "alive", "sess-noinbox": "alive-no-inbox", "sess-gone": "gone" });
      expect(r.text).not.toContain(inbox.path);
      expect(r.text).not.toContain(String(process.pid));
      expect(inbox.messages).toEqual([]);
    } finally {
      await inbox.close();
    }
  });
});

describe("POST /dispatch", () => {
  it("socket: 한 줄 글(경로 · 요청 · 승인이 아님)만 보내고 문서 내용은 보내지 않는다(DB-R17)", async () => {
    const repo = issueRepo();
    const inbox = await fakeInbox();
    try {
      registerSession(repo, "sess-alive", inbox.path);
      const srv = await serve(repo);
      const r = await call(srv, "POST", "/api/v1/dispatch", {
        body: { target: { sessionId: "sess-alive" }, kind: "doc-changed", paths: [REQ], changeSummary: { headings: ["## 1. 요구"], ids: ["R1"], added: 1, removed: 0 }, via: "socket" },
      });
      expect(r.status, r.text).toBe(202);
      expect(r.json.data).toEqual({ method: "socket", status: "sent" });
      expect(inbox.messages).toHaveLength(1);
      const line = inbox.messages[0] as string;
      expect(line.endsWith("\n")).toBe(true);
      expect(line.trimEnd()).not.toContain("\n");
      expect(line).toContain("[knots-sync 관리 페이지]");
      expect(line).toContain(REQ);
      expect(line).toContain("이 글은 승인이 아니다");
      expect(line).not.toContain("XYZZY");
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(1001 * 3);
      expect(queueFiles(repo)).toEqual([]);
    } finally {
      await inbox.close();
    }
  });

  it("소켓에 닿지 못하면 409 와 deep link · 대기함 선택지만 낸다 — 자동으로 대기함에 넣지 않는다(DB-R18)", async () => {
    const repo = issueRepo();
    const inbox = await fakeInbox();
    registerSession(repo, "sess-a", inbox.path);
    await inbox.close();
    const srv = await serve(repo);
    const r = await call(srv, "POST", "/api/v1/dispatch", { body: { target: { sessionId: "sess-a" }, kind: "custom", text: "다시 본다", paths: [REQ] } });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("socket_unavailable");
    expect(r.json.error.details.queueAvailable).toBe(true);
    expect(r.json.error.details.deeplink).toMatch(/^claude-cli:\/\/open\?cwd=/);
    expect(queueFiles(repo)).toEqual([]);
  });

  it("deeplink · queue 는 사람이 고를 때만, 대기함 목록 · 지우기", async () => {
    const repo = issueRepo();
    registerSession(repo, "sess-b", null);
    const srv = await serve(repo);
    const d = await call(srv, "POST", "/api/v1/dispatch", { body: { target: { sessionId: "sess-b" }, kind: "custom", text: "검토", paths: [REQ], via: "deeplink" } });
    expect(d.status, d.text).toBe(202);
    const url = new URL(d.json.data.url);
    expect(url.protocol).toBe("claude-cli:");
    expect(url.searchParams.get("cwd")).toBe(repo.root);
    expect(url.searchParams.get("q")).toContain("먼저 경로의 파일을 읽는다.");
    const q = await call(srv, "POST", "/api/v1/dispatch", { body: { target: { issue: "DEMO-1", role: "implement" }, kind: "doc-changed", paths: [REQ], via: "queue" } });
    expect(q.status, q.text).toBe(202);
    expect(q.json.data.method).toBe("queue");
    const files = queueFiles(repo);
    expect(files).toEqual([`${q.json.data.id}.json`]);
    const item = JSON.parse(readFile(repo.root, `.agents/state/dispatch-queue/${files[0]}`));
    expect(item).toMatchObject({ schema: "knots-sync.dispatch/v1", id: q.json.data.id, kind: "doc-changed", target: { issue: "DEMO-1", role: "implement", harness: "any", sessionId: null }, paths: [REQ] });
    expect(fs.statSync(path.join(repo.root, ".agents/state/dispatch-queue", files[0] as string)).mode & 0o777).toBe(0o600);
    const list = await call(srv, "GET", "/api/v1/dispatch/queue");
    expect(list.json.data.items.map((i: any) => i.id)).toEqual([q.json.data.id]);
    expect((await call(srv, "DELETE", `/api/v1/dispatch/queue/${q.json.data.id}`)).status).toBe(200);
    expect(queueFiles(repo)).toEqual([]);
    const tooLong = await call(srv, "POST", "/api/v1/dispatch", { body: { target: { sessionId: "sess-b" }, kind: "custom", text: "가".repeat(301), paths: [], via: "queue" } });
    expect(tooLong.status).toBe(400);
  });
});

describe("저장 · 승인 · 수정 요청 · 답 · 제안 저장은 세션에 아무것도 보내지 않는다(DB-R25, 완료 기준 13)", () => {
  it("각 20회 뒤 소켓이 받은 글 0건 · 대기함 0건", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "in-review" });
    for (let i = 2; i <= 21; i += 1) writeIssue(repo.root, `DEMO-${i}`, "upload-cleanup", { requirements: "in-review" });
    writeFile(repo.root, ".agents/docs/intents/INT-1-pay-reform/intent.md", "---\nkey: INT-1\nstatus: in-review\n---\n\n# Intent\n");
    const units = { schema: "knots-sync.units/v1", intent: { key: "INT-1", title: "결제", doc: "intent.md" }, source: { kind: "kit" },
      units: [{ id: "U-1", title: "계약", kind: "contract", area: "pay", dependsOn: [], order: 1, issue: null, planned: true },
        { id: "U-2", title: "기능", kind: "feature", area: "pay", dependsOn: ["U-1"], order: 2, issue: null, planned: true },
        { id: "U-3", title: "알림", kind: "feature", area: "pay", dependsOn: ["U-1"], order: 2, issue: null, planned: true }] };
    writeFile(repo.root, ".agents/docs/intents/INT-1-pay-reform/units.json", `${JSON.stringify(units, null, 2)}\n`);
    writeFile(repo.root, ".agents/docs/intents/INT-1-pay-reform/questions.md",
      "---\ntarget: INT-1\nstatus: open\nround: 1\n---\n\n# 질문\n\n## Q-1 · 범위 · 답할 직무: po\n넣는가?\n\n- A. 넣는다 — 영향: 하나\n- B. 뺀다 — 영향: 둘\n- 권장: B — 근거: 없다\n- 답:\n");
    commitAll(repo.root);
    const inbox = await fakeInbox();
    try {
      registerSession(repo, "sess-live", inbox.path);
      const srv = await serve(repo);
      for (let i = 0; i < 20; i += 1) {
        const cur = readFile(repo.root, ".agents/docs/issues/DEMO-1-upload-cleanup/requirements.md");
        const s = await call(srv, "PUT", "/api/v1/docs", { body: { path: ".agents/docs/issues/DEMO-1-upload-cleanup/requirements.md", baseSha256: sha256(cur), markdown: `${cur}- 줄 ${i}\n` } });
        expect(s.status, s.text).toBe(200);
      }
      for (let i = 2; i <= 21; i += 1) {
        const rel = `.agents/docs/issues/DEMO-${i}-upload-cleanup/requirements.md`;
        const a = await call(srv, "POST", "/api/v1/approvals", { body: { target: { issue: `DEMO-${i}` }, gate: "requirements", decision: "approved", phrase: "확정", docSha256: await docSha(srv, rel), pin: srv.pin } });
        expect(a.status, a.text).toBe(201);
      }
      for (let i = 0; i < 20; i += 1) {
        const c = await call(srv, "POST", "/api/v1/approvals", { body: { target: { issue: "DEMO-1" }, gate: "requirements", decision: "changes-requested", phrase: `수정 ${i}`, docSha256: await docSha(srv, ".agents/docs/issues/DEMO-1-upload-cleanup/requirements.md"), pin: srv.pin } });
        expect(c.status, c.text).toBe(201);
      }
      for (let i = 0; i < 20; i += 1) {
        const q = readFile(repo.root, ".agents/docs/intents/INT-1-pay-reform/questions.md");
        const a = await call(srv, "POST", "/api/v1/questions/INT-1/Q-1/answer", { body: { choice: i % 2 ? "A" : "B", baseSha256: sha256(q), pin: srv.pin } });
        expect(a.status, a.text).toBe(200);
      }
      const unitsSha = sha256(readFile(repo.root, ".agents/docs/intents/INT-1-pay-reform/units.json"));
      for (let i = 0; i < 20; i += 1) {
        const p = await call(srv, "POST", "/api/v1/units/proposals", { body: { intent: "INT-1", baseSha256: unitsSha, changes: [{ op: "add-dep", unit: "U-3", dependsOn: "U-2", reason: `이유 ${i}` }] } });
        expect(p.status, p.text).toBe(200);
      }
      await new Promise((r) => setTimeout(r, 100));
      expect(inbox.messages).toEqual([]);
      expect(queueFiles(repo)).toEqual([]);
    } finally {
      await inbox.close();
    }
  });
});
