/**
 * 문서 읽기 · 저장(06 §3.6, DB-R7~R10 · R15 · R21, 완료 기준 4 · 5 · 6).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { call, commitAll, docSha, git, makeRepo, python, readFile, serve, sha256, snapshotTree, writeFile, writeIssue } from "./helpers";

const REQ = ".agents/docs/issues/DEMO-1-upload-cleanup/requirements.md";

describe("허용 목록 밖 경로 저장은 403 이고 파일이 그대로다(완료 기준 4)", () => {
  it("경로 17종", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "draft" });
    writeFile(repo.root, ".agents/docs/issues/DEMO-1-upload-cleanup/review.md", "# review\n");
    writeFile(repo.root, ".agents/docs/issues/DEMO-1-upload-cleanup/approvals.md", "# 승인 기록 — DEMO-1\n");
    writeFile(repo.root, ".agents/docs/intents/INT-1-pay-reform/units.json", "{}\n");
    writeFile(repo.root, ".agents/docs/intents/INT-1-pay-reform/questions.md", "---\nstatus: open\n---\n");
    writeFile(repo.root, ".agents/docs/intents/INT-1-pay-reform/plans/screens/a.html", "<p>x</p>\n");
    writeFile(repo.root, ".agents/rules/guardrails.md", "# rules\n");
    writeFile(repo.root, "docs/features/upload.md", "# f\n");
    fs.mkdirSync(path.join(repo.root, "elsewhere"), { recursive: true });
    writeFile(repo.root, "elsewhere/requirements.md", "---\nstatus: draft\n---\n");
    fs.symlinkSync(path.join(repo.root, "elsewhere"), path.join(repo.root, ".agents/docs/issues/DEMO-9-linked-issue"));
    commitAll(repo.root);
    const srv = await serve(repo);
    const before = snapshotTree(repo.root, (rel) => rel.startsWith(".agents/state"));
    const paths = [
      "../outside.md",
      "/etc/hosts",
      ".git/config",
      ".agents/docs/issues/DEMO-1-upload-cleanup/../../../../README.md",
      ".agents/docs//issues/DEMO-1-upload-cleanup/requirements.md",
      ".agents\\docs\\issues\\DEMO-1-upload-cleanup\\requirements.md",
      `${REQ}\u0000.md`,
      ".agents/docs/issues/DEMO-9-linked-issue/requirements.md",
      ".agents/docs/intents/INT-1-pay-reform/units.json",
      ".agents/docs/issues/DEMO-1-upload-cleanup/review.md",
      ".agents/docs/issues/DEMO-1-upload-cleanup/approvals.md",
      ".agents/docs/intents/INT-1-pay-reform/questions.md",
      ".agents/docs/intents/INT-1-pay-reform/plans/screens/a.html",
      ".agents/rules/guardrails.md",
      ".agents/knots-sync.json",
      "scripts/verify.sh",
      "docs/features/upload.md",
    ];
    for (const p of paths) {
      const r = await call(srv, "PUT", "/api/v1/docs", { body: { path: p, baseSha256: "0".repeat(64), markdown: "---\nstatus: draft\n---\nx\n" } });
      expect([p, r.status, r.json?.error?.code]).toEqual([p, 403, "forbidden_path"]);
    }
    expect(snapshotTree(repo.root, (rel) => rel.startsWith(".agents/state"))).toEqual(before);
  });
});

describe("문서 읽기 · 렌더", () => {
  it("머리 · sha256 · HTML. 원문 HTML 은 실행되지 않고 javascript: 링크는 빠진다(DB-R21)", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", {
      requirements: "in-review",
      body: { requirements: "## 4. 기준\n\n<script>alert(1)</script>\n\n[나쁨](javascript:alert(1)) [좋음](https://example.com) [옆](design.md)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\n<b>code</b>\n```\n" },
    });
    commitAll(repo.root);
    const srv = await serve(repo);
    const r = await call(srv, "GET", `/api/v1/docs?path=${encodeURIComponent(REQ)}`);
    expect(r.status).toBe(200);
    const d = r.json.data;
    expect(d.sha256).toBe(sha256(fs.readFileSync(path.join(repo.root, REQ))));
    expect(d.frontmatter.status).toBe("in-review");
    expect(d.writable).toBe(true);
    expect(d.html).toContain("<h2>4. 기준</h2>");
    expect(d.html).not.toContain("<script>");
    expect(d.html).toContain("&lt;script&gt;");
    expect(d.html).not.toContain("javascript:");
    expect(d.html).toContain('href="https://example.com"');
    expect(d.html).toContain("<table>");
    expect(d.html).toContain("&lt;b&gt;code&lt;/b&gt;");
    expect((await call(srv, "GET", `/api/v1/docs?path=${encodeURIComponent(".agents/docs/issues/DEMO-1-upload-cleanup/none.md")}`)).status).toBe(404);
  });
});

describe("문서 저장", () => {
  it("같은 baseSha256 으로 두 번 저장하면 둘째가 409 이고 첫째 내용이 남는다(DB-R7, 완료 기준 5)", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "draft" });
    commitAll(repo.root);
    const srv = await serve(repo);
    const base = await docSha(srv, REQ);
    const first = readFile(repo.root, REQ).replace("R1 업로드를 정리한다.", "R1 업로드를 정리한다.\n- R2.3 지운 파일을 남기지 않는다.");
    const a = await call(srv, "PUT", "/api/v1/docs", { body: { path: REQ, baseSha256: base, markdown: first } });
    expect(a.status, a.text).toBe(200);
    expect(a.json.data.sha256).toBe(sha256(first));
    expect(a.json.data.changeSummary).toMatchObject({ ids: ["R2.3"], added: 1, removed: 0 });
    expect(a.json.data.changeSummary.headings).toEqual(["## 1. 요구"]);
    expect(a.json.meta.commit).toContain("커밋");
    const b = await call(srv, "PUT", "/api/v1/docs", { body: { path: REQ, baseSha256: base, markdown: first.replace("R2.3", "R9") } });
    expect(b.status).toBe(409);
    expect(b.json.error.code).toBe("conflict");
    expect(b.json.error.details.currentSha256).toBe(sha256(first));
    expect(b.json.error.details.currentMarkdown).toBe(first);
    expect(readFile(repo.root, REQ)).toBe(first);
  });

  it("status 를 approved 로 바꾸는 저장은 422, approved 문서를 고치면 in-review 로 돌린다(DB-R15)", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "in-review" });
    commitAll(repo.root);
    const srv = await serve(repo);
    const text = readFile(repo.root, REQ);
    const bad = await call(srv, "PUT", "/api/v1/docs", { body: { path: REQ, baseSha256: sha256(text), markdown: text.replace("status: in-review", "status: approved") } });
    expect(bad.status).toBe(422);
    expect(bad.json.error.code).toBe("status_change_forbidden");
    expect(readFile(repo.root, REQ)).toBe(text);
    writeFile(repo.root, REQ, text.replace("status: in-review", "status: approved"));
    const approved = readFile(repo.root, REQ);
    const r = await call(srv, "PUT", "/api/v1/docs", { body: { path: REQ, baseSha256: sha256(approved), markdown: `${approved}\n추가 줄\n` } });
    expect(r.status, r.text).toBe(200);
    expect(r.json.data.statusChanged).toBe("approved→in-review");
    expect(readFile(repo.root, REQ)).toContain("status: in-review");
  });

  it("CRLF 와 파일 권한을 지킨다", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "draft" });
    const full = path.join(repo.root, REQ);
    fs.writeFileSync(full, fs.readFileSync(full, "utf8").replace(/\n/g, "\r\n"));
    fs.chmodSync(full, 0o640);
    commitAll(repo.root);
    const srv = await serve(repo);
    const cur = fs.readFileSync(full, "utf8");
    const r = await call(srv, "PUT", "/api/v1/docs", { body: { path: REQ, baseSha256: sha256(cur), markdown: `${cur.replace(/\r\n/g, "\n")}끝 줄\n` } });
    expect(r.status, r.text).toBe(200);
    const after = fs.readFileSync(full, "utf8");
    expect(after.endsWith("끝 줄\r\n")).toBe(true);
    expect(after.replace(/\r\n/g, "")).not.toContain("\n");
    expect(fs.statSync(full).mode & 0o777).toBe(0o640);
  });

  it("이슈 브랜치가 worktree 에 체크아웃돼 있으면 그 파일만 바뀌고 메인 · git 객체 · HEAD 는 그대로다(DB-R9 · R10, 완료 기준 6)", async () => {
    const repo = makeRepo();
    const wt = path.join(repo.base, "demo.worktrees", "DEMO-2-upload-cleanup");
    git(repo.root, "worktree", "add", "-q", "-b", "feat/DEMO-2-upload-cleanup", wt);
    git(wt, "config", "user.email", "kim@example.com");
    const rel = writeIssue(wt, "DEMO-2", "upload-cleanup", { requirements: "draft" });
    commitAll(wt, "req");
    const srv = await serve(repo);
    const file = `${rel}/requirements.md`;
    const heads = [git(repo.root, "rev-parse", "HEAD"), git(wt, "rev-parse", "HEAD"), git(repo.root, "for-each-ref")];
    const objects = git(repo.root, "count-objects", "-v");
    const mainBefore = snapshotTree(repo.root, (r) => r.startsWith(".agents/state"));
    const cur = readFile(wt, file);
    const r = await call(srv, "PUT", "/api/v1/docs", { body: { path: file, baseSha256: sha256(cur), markdown: `${cur}\n- R2 추가\n` } });
    expect(r.status, r.text).toBe(200);
    expect(r.json.data.branch).toBe("feat/DEMO-2-upload-cleanup");
    expect(r.json.data.savedTo).toBe("../demo.worktrees/DEMO-2-upload-cleanup");
    expect(readFile(wt, file)).toContain("R2 추가");
    expect(fs.existsSync(path.join(repo.root, file))).toBe(false);
    expect(snapshotTree(repo.root, (x) => x.startsWith(".agents/state"))).toEqual(mainBefore);
    expect([git(repo.root, "rev-parse", "HEAD"), git(wt, "rev-parse", "HEAD"), git(repo.root, "for-each-ref")]).toEqual(heads);
    expect(git(repo.root, "count-objects", "-v")).toBe(objects);
    expect(git(repo.root, "worktree", "list", "--porcelain").split("worktree ").length).toBe(3);
  });

  it("이슈 브랜치가 어느 폴더에도 체크아웃돼 있지 않으면 409, 같은 키 브랜치가 둘이면 409 ambiguous_branch", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-3", "upload-cleanup", { requirements: "draft" });
    commitAll(repo.root);
    git(repo.root, "branch", "feat/DEMO-3-upload-cleanup");
    const srv = await serve(repo);
    const file = ".agents/docs/issues/DEMO-3-upload-cleanup/requirements.md";
    const cur = readFile(repo.root, file);
    const objects = git(repo.root, "count-objects", "-v");
    const r = await call(srv, "PUT", "/api/v1/docs", { body: { path: file, baseSha256: sha256(cur), markdown: `${cur}x\n` } });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("branch_not_checked_out");
    expect(r.json.error.message).toContain("wt new DEMO-3");
    expect(readFile(repo.root, file)).toBe(cur);
    expect(git(repo.root, "count-objects", "-v")).toBe(objects);
    git(repo.root, "branch", "fix/DEMO-3-upload-cleanup-again");
    const two = await call(srv, "PUT", "/api/v1/docs", { body: { path: file, baseSha256: sha256(cur), markdown: `${cur}x\n` } });
    expect(two.status).toBe(409);
    expect(two.json.error.code).toBe("ambiguous_branch");
  });

  it("다른 세션이 점유한 파일은 force 없이 409 lease_held, force 면 저장하고 leaseHeldBy 를 준다", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "draft" });
    commitAll(repo.root);
    const reg = python(["scripts/session-coordination.py", "--root", repo.root, "register", "--session", "other-session-1", "--client", "codex", "--issue", "DEMO-1", "--files", REQ, "--json"], repo.root);
    expect(reg.code, reg.stderr + reg.stdout).toBe(0);
    const srv = await serve(repo);
    const cur = readFile(repo.root, REQ);
    const r = await call(srv, "PUT", "/api/v1/docs", { body: { path: REQ, baseSha256: sha256(cur), markdown: `${cur}x\n` } });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("lease_held");
    const f = await call(srv, "PUT", "/api/v1/docs", { body: { path: REQ, baseSha256: sha256(cur), markdown: `${cur}x\n`, force: true } });
    expect(f.status, f.text).toBe(200);
    expect(f.json.data.leaseHeldBy).toBe("other-session-1");
  });
});
