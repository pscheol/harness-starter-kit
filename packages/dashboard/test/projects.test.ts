/**
 * 여러 프로젝트 모드(06 §3.17, DB-R27, 완료 기준 16) · 대화 기록 꺼짐(DB-R28, 완료 기준 17).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { call, cleanEnv, commitAll, makeRepo, serve, snapshotTree, tmpDir, writeFile, writeIssue } from "./helpers";

function registry(home: string, paths: string[]): void {
  writeFile(home, ".config/harness-kit/projects.json", `${JSON.stringify({ schema: "harness-kit.projects/v1", projects: paths.map((p) => ({ path: p, name: path.basename(p), addedAt: "2026-11-23" })) }, null, 2)}\n`);
}

const id = (p: string): string => crypto.createHash("sha256").update(fs.realpathSync(p)).digest("hex").slice(0, 12);

const READS = ["session", "overview", "issues", "intents", "verify", "reports/summary", "reports/findings", "worktrees", "sessions", "dispatch/queue", "harness", "flow/gates"];

describe("dashboard --all", () => {
  it("등록 프로젝트 3개, 모든 읽기 API 뒤 세 리포와 ~/.config/harness-kit 의 파일 수 · mtime 이 그대로다(DB-R27)", async () => {
    const parent = tmpDir();
    const repos = ["alpha", "beta", "gamma"].map((n) => makeRepo({}, n, parent));
    for (const [i, r] of repos.entries()) {
      writeIssue(r.root, `DEMO-${i + 1}`, "upload-cleanup", { requirements: "in-review" });
      commitAll(r.root);
    }
    const home = (repos[0] as { home: string }).home;
    registry(home, [...repos.map((r) => r.root), path.join(parent, "missing")]);
    const before = repos.map((r) => snapshotTree(r.root));
    const cfgBefore = snapshotTree(path.join(home, ".config/harness-kit"));
    const srv = await serve(repos[0] as never, { mode: { kind: "all" }, env: cleanEnv(home) });
    const list = await call(srv, "GET", "/api/v1/projects");
    expect(list.status, list.text).toBe(200);
    expect(list.json.data.projects.map((p: any) => [p.name, p.id, p.state])).toEqual([
      ["alpha", id(repos[0]!.root), "ok"], ["beta", id(repos[1]!.root), "ok"], ["gamma", id(repos[2]!.root), "ok"], ["missing", expect.any(String), "missing"],
    ]);
    const overview = await call(srv, "GET", "/api/v1/projects/overview");
    expect(overview.status).toBe(200);
    expect(overview.json.data.projects).toHaveLength(4);
    expect(overview.json.data.projects[3]).toMatchObject({ name: "missing", state: "missing" });
    expect((await call(srv, "GET", "/api/v1/sessions?scope=machine")).status).toBe(200);
    for (const r of repos) {
      for (const route of READS) {
        const res = await call(srv, "GET", `/api/v1/p/${id(r.root)}/${route}`);
        expect([route, res.status]).toEqual([route, 200]);
      }
    }
    const issues = await call(srv, "GET", `/api/v1/p/${id(repos[1]!.root)}/issues`);
    expect(issues.json.data.issues.map((i: any) => i.key)).toEqual(["DEMO-2"]);
    expect((await call(srv, "GET", "/api/v1/p/000000000000/overview")).status).toBe(404);
    expect((await call(srv, "GET", "/api/v1/overview")).status).toBe(404);
    expect(repos.map((r) => snapshotTree(r.root))).toEqual(before);
    expect(snapshotTree(path.join(home, ".config/harness-kit"))).toEqual(cfgBefore);
    expect(fs.existsSync(path.join(repos[0]!.root, ".agents/state/dashboard.token"))).toBe(false);
  });

  it("--root 는 깊이 3까지 하네스 리포를 찾고, --workspace 는 파일의 목록을 쓴다. 단일 모드에는 /projects 가 없다", async () => {
    const parent = tmpDir();
    const a = makeRepo({}, "a", path.join(parent, "x"));
    const b = makeRepo({}, "b", path.join(parent, "x", "y"));
    makeRepo({}, "deep", path.join(parent, "x", "y", "z", "w"));
    const srv = await serve(a, { mode: { kind: "root", dir: parent }, env: cleanEnv(a.home) });
    const r = await call(srv, "GET", "/api/v1/projects");
    expect(r.json.data.projects.map((p: any) => p.name).sort()).toEqual(["a", "b"]);
    const ws = writeFile(parent, "ws.json", JSON.stringify({ projects: [b.root] }));
    const srv2 = await serve(a, { mode: { kind: "workspace", file: ws }, env: cleanEnv(a.home) });
    expect((await call(srv2, "GET", "/api/v1/projects")).json.data.projects.map((p: any) => p.name)).toEqual(["b"]);
    const single = await serve(makeRepo());
    expect((await call(single, "GET", "/api/v1/projects")).status).toBe(404);
  });
});

describe("대화 기록은 기본 꺼짐(DB-R28)", () => {
  it("history 가 없거나 off 면 /history 404 history_off, ~/.claude · ~/.codex 를 열지 않는다", async () => {
    const repo = makeRepo();
    writeFile(repo.home, ".claude/projects/x/a.jsonl", "{}\n");
    writeFile(repo.home, ".codex/sessions/a.jsonl", "{}\n");
    const touched: string[] = [];
    const watch = (p: unknown): void => {
      const s = String(p);
      if (s.includes(`${repo.home}/.claude`) || s.includes(`${repo.home}/.codex`)) touched.push(s);
    };
    const origRead = fs.readFileSync;
    const origDir = fs.readdirSync;
    const origOpen = fs.openSync;
    const origStat = fs.statSync;
    (fs as any).readFileSync = (p: any, ...a: any[]) => (watch(p), (origRead as any)(p, ...a));
    (fs as any).readdirSync = (p: any, ...a: any[]) => (watch(p), (origDir as any)(p, ...a));
    (fs as any).openSync = (p: any, ...a: any[]) => (watch(p), (origOpen as any)(p, ...a));
    (fs as any).statSync = (p: any, ...a: any[]) => (watch(p), (origStat as any)(p, ...a));
    try {
      const srv = await serve(repo);
      const h = await call(srv, "GET", "/api/v1/history");
      expect([h.status, h.json.error.code]).toEqual([404, "history_off"]);
      writeFile(repo.home, ".config/harness-kit/config.json", JSON.stringify({ history: "off" }));
      expect((await call(srv, "GET", "/api/v1/history")).json.error.code).toBe("history_off");
      for (const r of ["usage", "usage/now", "usage/kit", "overview", "sessions"]) await call(srv, "GET", `/api/v1/${r}`);
      expect(touched).toEqual([]);
      writeFile(repo.home, ".config/harness-kit/config.json", JSON.stringify({ history: "on" }));
      const before = snapshotTree(repo.root);
      const on = await call(srv, "GET", "/api/v1/history");
      expect([on.status, on.json.data.enabled, on.json.data.prompts]).toEqual([200, true, []]);
      expect(snapshotTree(repo.root)).toEqual(before);
    } finally {
      (fs as any).readFileSync = origRead;
      (fs as any).readdirSync = origDir;
      (fs as any).openSync = origOpen;
      (fs as any).statSync = origStat;
    }
  });

  it("범위 밖 API 는 501 과 제공 이슈를 낸다", async () => {
    const srv = await serve(makeRepo());
    for (const [route, stage, method] of [["checkpoints", "HK-20", "GET"]] as const) {
      const r = await call(srv, method, `/api/v1/${route}`);
      expect([route, r.status, r.json.error.code, r.json.error.details.stage]).toEqual([route, 501, "not_implemented", stage]);
    }
  });
});
