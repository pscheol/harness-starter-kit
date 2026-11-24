/**
 * 정적 내보내기(06 §3.12, DB-R20, 완료 기준 9).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exportStatic } from "../src/export";
import { cleanEnv, commitAll, git, makeRepo, tmpDir, writeFile, writeIssue } from "./helpers";

function allText(dir: string): string {
  let out = "";
  const walk = (d: string): void => {
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n);
      if (fs.statSync(f).isDirectory()) walk(f);
      else out += `\n${fs.readFileSync(f, "utf8")}`;
    }
  };
  walk(dir);
  return out;
}

describe("dashboard --export", () => {
  it("스킬 · 세션 · 대기함 · 토큰 · 홈 절대경로 · 소켓 경로가 0건인 정적 HTML", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "in-review", design: "draft" });
    writeFile(repo.root, ".agents/skills/hx-review/SKILL.md", "---\nname: hx-review\n---\n");
    const wt = path.join(repo.base, "demo.worktrees", "DEMO-2-upload-cleanup");
    git(repo.root, "worktree", "add", "-q", "-b", "feat/DEMO-2-upload-cleanup", wt);
    writeIssue(wt, "DEMO-2", "upload-cleanup", { requirements: "draft" });
    commitAll(wt);
    commitAll(repo.root);
    writeFile(repo.root, ".agents/state/sessions/s1.json", JSON.stringify({ id: "s1", inbox: { kind: "uds", path: "/tmp/cc-socks-501/abc" }, cwd: repo.root }));
    writeFile(repo.root, ".agents/state/dispatch-queue/01JDQ5AAAAAAAAAAAAAAAAAAAA.json", JSON.stringify({ id: "q1", message: "대기 요청 글" }));
    writeFile(repo.root, ".agents/state/dashboard.token", "SECRETTOKENVALUE\n");
    writeFile(repo.root, ".agents/state/approvals-log.jsonl", '{"entryId":"X"}\n');
    const out = path.join(tmpDir(), "site");
    const res = await exportStatic({ cwd: repo.root, env: cleanEnv(repo.home), out });
    expect(res.files).toContain("index.html");
    expect(res.files).toContain("issues/DEMO-1.html");
    expect(res.files).toContain("data/issues.json");
    const text = allText(out);
    for (const bad of [repo.home, os.homedir(), repo.root, "/tmp/cc-socks-", "uds:", "SECRETTOKENVALUE", "hx-review", "대기 요청 글", "kim@example.com", "~/.claude", "<script"]) {
      expect([bad, text.includes(bad)]).toEqual([bad, false]);
    }
    expect(text).toContain("DEMO-1");
    expect(text).toContain("<worktrees>/DEMO-2-upload-cleanup");
    const issues = JSON.parse(fs.readFileSync(path.join(out, "data/issues.json"), "utf8"));
    expect(issues.issues.map((i: any) => i.key)).toEqual(["DEMO-1", "DEMO-2"]);
  });

  it("끝 검사에 걸리면 출력 폴더를 지우고 실패한다", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "in-review", body: { requirements: `경로 ${repo.home}/secret.txt 를 본다\n` } });
    commitAll(repo.root);
    const out = path.join(tmpDir(), "site");
    await expect(exportStatic({ cwd: repo.root, env: cleanEnv(repo.home), out })).rejects.toMatchObject({ name: "ExportLeakError" });
    expect(fs.existsSync(out)).toBe(false);
  });

  it("비어 있지 않은 폴더에는 쓰지 않는다", async () => {
    const repo = makeRepo();
    const out = tmpDir();
    fs.writeFileSync(path.join(out, "keep.txt"), "x");
    await expect(exportStatic({ cwd: repo.root, env: cleanEnv(repo.home), out })).rejects.toMatchObject({ code: "out_not_empty" });
    expect(fs.readFileSync(path.join(out, "keep.txt"), "utf8")).toBe("x");
  });
});
