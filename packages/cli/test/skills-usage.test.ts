/**
 * 화면 없이 쓰기(설계 06 §3.15 · 07 §3.9 · 06 §3.18): skills · usage · history 명령(HK-18).
 * 사람용 출력 · 종료 코드 · 도움말. --json 이 API data 와 같은 것은 dashboard-cli.test.ts 가 본다.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanEnv, makeRepo, writeFile, type Repo } from "../../dashboard/test/helpers";
import { main, type Io } from "../src/main";
import { CLI_DIR } from "./helpers";

async function cli(argv: string[], repo: Repo): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const io: Io = {
    stdout: (s) => {
      stdout += s;
    },
    stderr: (s) => {
      stderr += s;
    },
    env: cleanEnv(repo.home),
    cwd: repo.root,
    cliFile: path.join(CLI_DIR, "dist", "cli.js"),
    isTTY: false,
    nodeVersion: process.versions.node,
    today: "2026-11-24",
    agentSession: () => null,
  };
  const code = await main(argv, io);
  return { code, stdout, stderr };
}

const skill = (name: string, desc: string, extra = ""): string => `---\nname: ${name}\ndescription: ${desc}\n${extra}---\n\n본문\n`;

describe("skills", () => {
  it("기본: 위치별 개수 · 지도 칸 해석 · 스킬 표. --stage 설계 는 설계 단계만 지도 출처 먼저", async () => {
    const repo = makeRepo();
    writeFile(repo.home, ".claude/skills/planner/SKILL.md", skill("planner", "PRD 를 쓴다"));
    writeFile(repo.home, ".claude/skills/guessed/SKILL.md", skill("guessed", "wireframe and storyboard helper"));
    writeFile(repo.home, ".claude/skills/code-review/SKILL.md", skill("code-review", "Review code and security"));
    writeFile(repo.root, ".agents/skill-map.json", JSON.stringify({ schema: "knots-sync.skill-map/v1", stages: { design: { "screen-plan": ["planner"] } }, commands: { "/kns-screen-plan": { slots: ["design.screen-plan"], fallback: "template:plans/screens" } }, exclude: [] }));
    const all = await cli(["skills"], repo);
    expect(all.code, all.stderr).toBe(0);
    expect(all.stdout).toContain("위치별 개수");
    expect(all.stdout).toContain("~/.claude/skills");
    expect(all.stdout).toMatch(/\/kns-screen-plan\s+design\.screen-plan\s+claude\s+planner/);
    expect(all.stdout).toContain("스킬 3개");
    const design = await cli(["skills", "--stage", "설계"], repo);
    expect(design.code).toBe(0);
    expect(design.stdout).not.toContain("위치별 개수");
    const lines = design.stdout.split("\n").filter((l) => /^(planner|guessed|code-review)\s/.test(l));
    expect(lines.map((l) => l.split(/\s+/)[0])).toEqual(["planner", "guessed"]);
    expect(lines[0]).toContain("지도");
    expect(lines[1]).toContain("추정");
    const en = await cli(["skills", "--stage", "design", "--json"], repo);
    expect(JSON.parse(en.stdout).skills.map((s: { id: string }) => s.id)).toEqual(["planner", "guessed"]);
  });

  it("--harness · --conflicts · --errors · --no-user", async () => {
    const repo = makeRepo();
    writeFile(repo.home, ".claude/skills/twin/SKILL.md", skill("twin", "하나"));
    writeFile(repo.home, ".agents/skills/twin/SKILL.md", skill("twin", "둘"));
    writeFile(repo.home, ".claude/skills/broken/SKILL.md", "그냥 글\n");
    writeFile(repo.root, ".agents/skills/mine/SKILL.md", skill("mine", "프로젝트"));
    const conflicts = await cli(["skills", "--conflicts"], repo);
    expect(conflicts.stdout).toContain("이름 겹침");
    expect(conflicts.stdout).toContain("twin:");
    const errors = await cli(["skills", "--errors"], repo);
    expect(errors.stdout).toContain("[오류: no-frontmatter]");
    const noUser = await cli(["skills", "--no-user", "--json"], repo);
    expect(JSON.parse(noUser.stdout).skills.map((s: { id: string }) => s.id)).toEqual(["mine"]);
    const codex = JSON.parse((await cli(["skills", "--harness", "codex", "--json"], repo)).stdout);
    expect(codex.skills.map((s: { id: string }) => s.id).sort()).toEqual(["mine", "twin"]);
  });

  it("모르는 플래그 · 단계는 exit 2 가 아니라 빈 목록, 리포 밖이면 exit 3", async () => {
    const repo = makeRepo();
    expect((await cli(["skills", "--nope"], repo)).code).toBe(2);
    expect((await cli(["skills", "--stage", "없는단계"], repo)).code).toBe(0);
    const out = await cli(["skills", "--cwd", repo.base], { ...repo, root: repo.base });
    expect(out.code).toBe(3);
  });

  it("--help 와 예약 목록: skills · usage 는 더 이상 예약이 아니다", async () => {
    const repo = makeRepo();
    expect((await cli(["skills", "--help"], repo)).stdout).toContain("knots-sync skills");
    expect((await cli(["usage", "--help"], repo)).stdout).toContain("usage --kit");
    expect((await cli(["--help"], repo)).stdout).toMatch(/skills\s+이 컴퓨터/);
  });
});

describe("usage · history", () => {
  it("꺼져 있으면(기본) usage 는 켜는 곳을 알리고 exit 0, history 는 exit 1(history_off)", async () => {
    const repo = makeRepo();
    const u = await cli(["usage"], repo);
    expect(u.code).toBe(0);
    expect(u.stdout).toContain('"history": "on"');
    expect(u.stdout).toContain("꺼져 있다");
    const now = await cli(["usage", "--now"], repo);
    expect(now.stdout).toContain("꺼져 있다");
    const h = await cli(["history"], repo);
    expect(h.code).toBe(1);
    expect(h.stderr).toContain("꺼져 있습니다");
  });

  it("usage --kit 은 늘 보인다: 세션 시작 평균 · 훅별 · owner", async () => {
    const repo = makeRepo();
    writeFile(repo.root, ".agents/state/hook-output.jsonl", `${JSON.stringify({ at: "2026-11-24T00:00:00Z", event: "SessionStart", hook: "harness-session-start", bytes: 900, truncated: false, exit: 0 })}\n`);
    const k = await cli(["usage", "--kit"], repo);
    expect(k.code).toBe(0);
    expect(k.stdout).toContain("세션 시작 평균 900 / 2560바이트 (상한 안)");
    expect(k.stdout).toContain("harness-session-start");
  });

  it("켜면 usage · --sources · --now · history --q 사람용 출력", async () => {
    const repo = makeRepo();
    writeFile(repo.home, ".config/knots-sync/config.json", JSON.stringify({ history: "on" }));
    const enc = repo.root.replace(/[^A-Za-z0-9]/g, "-");
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    writeFile(repo.home, `.claude/projects/${enc}/a.jsonl`, `${JSON.stringify({ type: "assistant", sessionId: "s1", cwd: repo.root, gitBranch: "feat/DEMO-1-x", timestamp: noon.toISOString(), message: { id: "m1", model: "claude-sonnet-4-5", usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 8000, cache_creation_input_tokens: 500 } } })}\n`);
    writeFile(repo.home, ".claude/history.jsonl", `${JSON.stringify({ display: "결제 개편 시작", timestamp: noon.getTime(), project: repo.root, sessionId: "s1" })}\n`);
    const u = await cli(["usage", "--days", "1"], repo);
    expect(u.code, u.stderr).toBe(0);
    expect(u.stdout).toContain("토큰 10K");
    expect(u.stdout).toContain("DEMO-1");
    const s = await cli(["usage", "--sources"], repo);
    expect(s.stdout).toContain("읽는 곳");
    expect(s.stdout).not.toContain("하루 토큰");
    const n = await cli(["usage", "--now"], repo);
    expect(n.stdout).toContain("s1 · claude-sonnet-4-5 · 컨텍스트 9.5K / 200K (5%)");
    const h = await cli(["history", "--q", "결제"], repo);
    expect(h.stdout).toContain("프롬프트 1건 중 1건");
    expect(h.stdout).toContain("결제 개편 시작");
    expect((await cli(["history", "--q", "없는말"], repo)).stdout).toContain("프롬프트 기록이 없다");
    expect((await cli(["usage", "--days", "0"], repo)).code).toBe(2);
  });
});

describe("status --flow --burn", () => {
  it("Intent 의 남은 Bolt 를 --json 으로 낸다(--days 로 기간)", async () => {
    const repo = makeRepo();
    const INT = ".agents/docs/intents/INT-7-pay";
    writeFile(repo.root, `${INT}/intent.md`, "---\nkey: INT-7\ntitle: 결제\nstatus: in-review\n---\n\n# I\n");
    writeFile(repo.root, `${INT}/units.json`, `${JSON.stringify({ schema: "knots-sync.units/v1", intent: { key: "INT-7", title: "결제", doc: "intent.md" }, source: { kind: "kit" }, units: [{ id: "U-1", title: "등록", kind: "feature", area: "pay", dependsOn: [], order: 1, issue: null, planned: true, stories: ["S-1", "S-2", "S-3"] }] }, null, 2)}\n`);
    const r = await cli(["status", "--flow", "INT-7", "--burn", "--days", "3", "--json"], repo);
    expect(r.code, r.stderr).toBe(0);
    const d = JSON.parse(r.stdout);
    expect(d.series).toHaveLength(3);
    expect(d.now).toMatchObject({ remaining: 1, total: 1, units: { done: 0, total: 1 } });
    expect(d.estimated).toBe(true);
  });
});
