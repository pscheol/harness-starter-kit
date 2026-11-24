// 체크포인트 목록 · 설명(설계 10 §3.3 · 06 GET /checkpoints, 완료 기준 5). 가짜 entire.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { REAL_TEMPLATES } from "./helpers";
import { cli, FAKE_AIDLC, FAKE_ENTIRE, FAKE_GH, installedRepo, makeBin } from "./modules-helpers";

const T = ["--templates", REAL_TEMPLATES];
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com", GIT_CONFIG_GLOBAL: "/dev/null" };
const git = (cwd: string, ...a: string[]): string => execFileSync("git", a, { cwd, env: GIT_ENV, encoding: "utf8" });

describe("checkpoints", () => {
  it("구현 세션 커밋에만 Entire-Checkpoint 트레일러가 있고, 목록은 그 커밋만 local · 원격에만 으로 가른다", async () => {
    const t = await installedRepo();
    const bin = makeBin({ aidlc: FAKE_AIDLC, entire: FAKE_ENTIRE, gh: FAKE_GH }, { FAKE_VIS: "PRIVATE" });
    expect((await cli(t, ["add", "entire", "--yes", ...T], bin)).code).toBe(0);
    git(t, "add", "-A");
    git(t, "commit", "-q", "-m", "chore: entire");
    git(t, "switch", "-q", "-c", "feat/DEMO-1-pay");
    git(t, "commit", "-q", "--allow-empty", "-m", "feat: 구현 세션 1\n\nEntire-Checkpoint: aaaa11112222");
    git(t, "commit", "-q", "--allow-empty", "-m", "feat: 구현 세션 2\n\nEntire-Checkpoint: bbbb33334444");
    git(t, "commit", "-q", "--allow-empty", "-m", "fix: 리뷰 세션(codex)에서 만든 커밋");
    git(t, "update-ref", "refs/entire/checkpoints/aa/aa11112222", "HEAD");

    const list = await cli(t, ["checkpoints", "--issue", "DEMO-1", "--json", ...T], bin);
    expect(list.code, list.stdout + list.stderr).toBe(0);
    expect(list.json.commits).toBe(3);
    const rows = list.json.checkpoints as { id: string; state: string; subject: string }[];
    expect(rows.map((r) => [r.id, r.state]).sort()).toEqual([["aaaa11112222", "local"], ["bbbb33334444", "remote-or-missing"]]);
    // 리뷰 세션 커밋 = 트레일러 0건
    const trailers = git(t, "log", "--format=%(trailers:key=Entire-Checkpoint,valueonly)", "-n", "1").trim();
    expect(trailers).toBe("");
    const human = await cli(t, ["checkpoints", "--issue", "DEMO-1", ...T], bin);
    expect(human.stdout).toContain("aaaa11112222");
    expect(human.stdout).toContain("원격에만 또는 없음");
  });

  it("설명은 entire checkpoint explain 출력의 제어 문자를 지운다. entire 가 없으면 available false", async () => {
    const t = await installedRepo();
    const bin = makeBin({ aidlc: FAKE_AIDLC, entire: FAKE_ENTIRE, gh: FAKE_GH }, { FAKE_VIS: "PRIVATE" });
    expect((await cli(t, ["add", "entire", "--yes", ...T], bin)).code).toBe(0);
    const ex = await cli(t, ["checkpoints", "aaaa11112222", "--json", ...T], bin);
    expect(ex.code, ex.stdout + ex.stderr).toBe(0);
    expect(ex.json).toMatchObject({ available: true, untrusted: true });
    expect(ex.json.text).toContain("체크포인트 설명");
    // eslint-disable-next-line no-control-regex
    expect(/[\u0000-\u0008\u001b]/.test(ex.json.text as string)).toBe(false);
    const none = await cli(t, ["checkpoints", "aaaa11112222", "--json", ...T], makeBin({ gh: FAKE_GH }));
    expect(none.json).toMatchObject({ available: false });
    expect((await cli(t, ["checkpoints", "x", "--json", ...T], bin)).code).toBe(2);
  });

  it("entire 모듈이 꺼져 있으면 enabled false", async () => {
    const t = await installedRepo();
    const r = await cli(t, ["checkpoints", "--json", ...T], null);
    expect(r.json).toMatchObject({ enabled: false, checkpoints: [] });
  });
});
