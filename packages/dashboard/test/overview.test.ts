/**
 * 읽기 · 데이터 모델 · 처리할 일 · 보드 일치 · 응답 시간(06 §3.2~§3.4, DB-R6 · R24, 완료 기준 1 · 12).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { call, commitAll, git, makeRepo, python, readFile, serve, writeFile, writeIssue } from "./helpers";

function boardJson(root: string): any {
  const r = python(["scripts/sdd-layout.py", "board", "--json"], root);
  if (r.code !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

describe("이슈 모델 · 보드 일치", () => {
  it("진행 상태가 board.sh --json 과 같다(완료 기준 1) · 체크아웃 · 출처 · 단계", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "draft" });
    writeIssue(repo.root, "DEMO-2", "upload-cleanup", { requirements: "approved", design: "in-review" });
    writeIssue(repo.root, "DEMO-3", "upload-cleanup", { requirements: "approved", design: "approved", tasks: "active" });
    writeIssue(repo.root, "DEMO-4", "upload-cleanup", { requirements: "approved", design: "approved", tasks: "completed", body: { tasks: "### Phase 1\n\n- [x] T001 끝\n" } });
    writeIssue(repo.root, "DEMO-5", "upload-cleanup", { area: "billing", requirements: "approved", design: "approved", tasks: "check", body: { tasks: "### Phase 1\n\n- [x] T001 끝\n" } });
    writeFile(repo.root, ".agents/docs/upload-specs/requirements/001-feat-old-upload.md", "---\nstatus: approved\n---\n# 옛\n");
    writeFile(repo.root, ".agents/docs/upload-specs/design/001-feat-old-upload.md", "---\nstatus: approved\n---\n# 옛\n");
    writeFile(repo.root, ".agents/docs/upload-specs/tasks/active/001-feat-old-upload.md", "# 옛 tasks\n");
    commitAll(repo.root);
    const wt = path.join(repo.base, "demo.worktrees", "DEMO-6-upload-cleanup");
    git(repo.root, "worktree", "add", "-q", "-b", "feat/DEMO-6-upload-cleanup", wt);
    writeIssue(wt, "DEMO-6", "upload-cleanup", { requirements: "in-review" });
    commitAll(wt);
    git(repo.root, "branch", "feat/DEMO-7-upload-cleanup");
    git(repo.root, "worktree", "add", "-q", path.join(repo.base, "tmp-7"), "feat/DEMO-7-upload-cleanup");
    const wt7 = path.join(repo.base, "tmp-7");
    writeIssue(wt7, "DEMO-7", "upload-cleanup", { requirements: "draft" });
    commitAll(wt7);
    git(repo.root, "worktree", "remove", wt7);
    const srv = await serve(repo);
    const r = await call(srv, "GET", "/api/v1/issues");
    expect(r.status, r.text).toBe(200);
    const issues = r.json.data.issues as any[];
    const board = boardJson(repo.root);
    const fromBoard = Object.fromEntries(board.issues.map((i: any) => [i.key, i.state]));
    const mainKeys = board.issues.map((i: any) => i.key);
    expect(mainKeys).toContain("001-feat-old-upload");
    for (const k of mainKeys) expect([k, issues.find((i) => i.key === k)?.boardState]).toEqual([k, fromBoard[k]]);
    const six = issues.find((i) => i.key === "DEMO-6");
    expect(six).toMatchObject({ source: "worktree", branch: "feat/DEMO-6-upload-cleanup", checkout: { kind: "worktree", path: "../demo.worktrees/DEMO-6-upload-cleanup", dirty: false } });
    expect(six.boardState).toBe(boardJson(wt).issues.find((i: any) => i.key === "DEMO-6").state);
    const seven = issues.find((i) => i.key === "DEMO-7");
    expect(seven).toMatchObject({ source: "branch", branch: "feat/DEMO-7-upload-cleanup", checkout: null, stage: "requirements" });
    const one = issues.find((i) => i.key === "DEMO-1");
    expect(one).toMatchObject({ source: "base", stage: "requirements", docs: { requirements: { status: "draft", clarify: 0, approval: "none" } } });
    expect(one.docs.requirements.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(issues.find((i) => i.key === "DEMO-2").stage).toBe("requirements");
    expect(issues.find((i) => i.key === "DEMO-3").docs.tasks.bolts).toEqual({ total: 1, done: 0 });
    expect(issues.find((i) => i.key === "DEMO-5").area).toBe("billing");
    const filtered = await call(srv, "GET", "/api/v1/issues?area=billing");
    expect(filtered.json.data.issues.map((i: any) => i.key)).toEqual(["DEMO-5"]);
    expect((await call(srv, "GET", "/api/v1/issues/DEMO-404")).status).toBe(404);
  });

  it("stat 이 바뀐 것만 다시 읽고 응답은 요청 시점 파일과 같다(DB-R6), 목록은 ETag · 304", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "draft" });
    commitAll(repo.root);
    const srv = await serve(repo);
    const a = await call(srv, "GET", "/api/v1/issues/DEMO-1");
    expect(a.json.data.docs.requirements.status).toBe("draft");
    const etag = a.headers.etag as string;
    expect(etag).toBeTruthy();
    expect((await call(srv, "GET", "/api/v1/issues/DEMO-1", { headers: { "If-None-Match": etag } })).status).toBe(304);
    const rel = ".agents/docs/issues/DEMO-1-upload-cleanup/requirements.md";
    writeFile(repo.root, rel, readFile(repo.root, rel).replace("status: draft", "status: in-review"));
    const b = await call(srv, "GET", "/api/v1/issues/DEMO-1", { headers: { "If-None-Match": etag } });
    expect(b.status).toBe(200);
    expect(b.json.data.docs.requirements.status).toBe("in-review");
  });
});

describe("처리할 일(06 §3.4, DB-R24)", () => {
  it("rank 순서 · gate-mine · questions · verify-failed · approval-stale · worktree-cleanup · 50건 상한", async () => {
    const repo = makeRepo({ approvers: { design: ["po"] }, groups: { po: ["lee@example.com"] } });
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "approved", design: "in-review" });
    writeIssue(repo.root, "DEMO-2", "upload-cleanup", { requirements: "in-review" });
    writeIssue(repo.root, "DEMO-3", "upload-cleanup", { requirements: "in-review", body: { requirements: "- R1 [NEEDS CLARIFICATION: 범위]\n" } });
    for (let i = 10; i < 70; i += 1) writeIssue(repo.root, `DEMO-${i}`, "upload-cleanup", { requirements: "in-review" });
    writeFile(repo.root, ".agents/docs/issues/DEMO-1-upload-cleanup/approvals.md",
      `# 승인 기록 — DEMO-1\n\n## 2026-11-23T10:00:00+09:00 · requirements · approved\n- 승인자: lee@example.com (Lee) · 그룹: po\n- 대상: requirements.md · sha256: ${"0".repeat(64)}\n- 문구: "확정"\n- 경로: terminal\n- 기록 ID: 01JDQ4ZK6B7Y0M9W2S3T4V5X6Y\n`);
    commitAll(repo.root);
    writeFile(repo.root, ".agents/state/verify-last.json", JSON.stringify({ schema: "harness-kit.verify-last/v1", level: "changed", status: "failed", finishedAt: "2026-11-23T01:02:11Z", durationMs: 1000, head: { sha: git(repo.root, "rev-parse", "HEAD"), dirty: false }, steps: [] }));
    const remote = path.join(repo.base, "remote.git");
    git(repo.base, "init", "-q", "--bare", remote);
    git(repo.root, "remote", "add", "origin", remote);
    git(repo.root, "push", "-q", "origin", "develop");
    const wt = path.join(repo.base, "demo.worktrees", "DEMO-4-upload-cleanup");
    git(repo.root, "worktree", "add", "-q", "-b", "feat/DEMO-4-upload-cleanup", wt);
    const srv = await serve(repo);
    const r = await call(srv, "GET", "/api/v1/overview");
    expect(r.status, r.text).toBe(200);
    const d = r.json.data;
    expect(d.todo.length).toBe(50);
    const ranks = d.todo.map((t: any) => t.rank);
    expect([...ranks].sort((a: number, b: number) => a - b)).toEqual(ranks);
    expect(new Set(d.todo.map((t: any) => t.kind))).toEqual(new Set(["gate-mine"]));
    expect(d.todo[0].since <= d.todo[49].since).toBe(true);
    // rank 2 가 61건이라 50건 뒤는 rank 별 수만 낸다: 2 gate-mine · 3 questions · 4 verify-failed · 5 approval-stale · 7 worktree-cleanup
    expect(d.more).toMatchObject({ 2: 11, 3: 1, 4: 1, 5: 1, 7: 1 });
    expect(d.stages.requirements).toBeGreaterThan(50);
    for (const t of d.todo) expect(Object.keys(t).sort()).toEqual(["kind", "link", "mine", "rank", "reason", "since", "target", "title"]);
  });
});

describe("응답 시간(완료 기준 12)", () => {
  it("이슈 20개 · worktree 3개에서 캐시가 찬 뒤 GET /overview 100회 p95 500ms 이하", async () => {
    const repo = makeRepo();
    for (let i = 1; i <= 20; i += 1) writeIssue(repo.root, `DEMO-${i}`, "upload-cleanup", { requirements: i % 2 ? "approved" : "in-review", design: i % 3 ? "draft" : undefined });
    commitAll(repo.root);
    for (let i = 101; i <= 103; i += 1) git(repo.root, "worktree", "add", "-q", "-b", `feat/DEMO-${i}-upload-cleanup`, path.join(repo.base, "demo.worktrees", `DEMO-${i}-upload-cleanup`));
    const srv = await serve(repo);
    await call(srv, "GET", "/api/v1/overview");
    const times: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      const t = performance.now();
      const r = await call(srv, "GET", "/api/v1/overview");
      times.push(performance.now() - t);
      expect(r.status).toBe(200);
    }
    times.sort((a, b) => a - b);
    const p95 = times[94] as number;
    expect(p95).toBeLessThanOrEqual(500);
    console.info(`GET /overview p95 ${p95.toFixed(1)}ms (100회, 이슈 20 · worktree 3)`);
  });
});
