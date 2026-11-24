/** 스킬 스캐너(설계 07 SK-R1~R15). 임시 HOME · 임시 리포만 읽고 `~/` 아래에 쓰지 않는다. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { guessStages } from "../src/skills";
import { YamlError, parseYaml } from "../src/yaml-lite";
import { call, makeRepo, serve, snapshotTree, writeFile } from "./helpers";

const skillMd = (name: string, desc: string, extra = ""): string => `---\nname: ${name}\ndescription: ${desc}\n${extra}---\n\n본문 ${name}\n`;

async function inventory(srv: Awaited<ReturnType<typeof serve>>, query = ""): Promise<any> {
  const r = await call(srv, "GET", `/api/v1/skills${query}`);
  expect(r.status, r.text).toBe(200);
  return r.json.data;
}

describe("YAML 머리 해석(07 §3.2)", () => {
  it("맵 · 따옴표 · 흐름 배열 · 블록 문자열 · 이어지는 줄 · 안쪽 맵", () => {
    const y = parseYaml(`name: x\ndescription: "한 줄: 따옴표"\nlong: 첫째 줄\n  둘째 줄\nblock: |\n  가\n  나\nfold: >-\n  하나\n  둘\nmetadata:\n  hx-stages: [design, "ops"]\n  seq:\n    - a\n    - b\nmodel: null\nn: 3\nflag: true\n`);
    expect(y).toEqual({ name: "x", description: "한 줄: 따옴표", long: "첫째 줄 둘째 줄", block: "가\n나\n", fold: "하나 둘", metadata: { "hx-stages": ["design", "ops"], seq: ["a", "b"] }, model: null, n: 3, flag: true });
  });

  it.each([
    ["별칭", "a: *x\n"],
    ["앵커", "a: &x 1\n"],
    ["태그", "a: !!str 1\n"],
    ["탭 들여쓰기", "a:\n\tb: 1\n"],
    ["닫히지 않은 따옴표", 'a: "x\n'],
    ["같은 키", "a: 1\na: 2\n"],
    ["키: 값 아님", "그냥 글\n"],
    ["깊이 8 초과", `a:\n${Array.from({ length: 10 }, (_, i) => `${"  ".repeat(i + 1)}k${i}:`).join("\n")}\n${"  ".repeat(11)}v: 1\n`],
  ])("오류: %s", (_n, text) => {
    expect(() => parseYaml(text)).toThrow(YamlError);
  });
});

describe("스캐너", () => {
  it("위치별 개수가 find -L 과 같다(SK-R15) · realpath 로 묶는다(SK-R5) · 읽기만 한다(SK-R1)", async () => {
    const repo = makeRepo();
    const h = repo.home;
    writeFile(h, ".agents/skills/alpha/SKILL.md", skillMd("alpha", "알파"));
    writeFile(h, ".agents/skills/beta/SKILL.md", skillMd("beta", "베타"));
    writeFile(h, ".claude/skills/own/SKILL.md", skillMd("own", "내 것"));
    fs.symlinkSync(path.join(h, ".agents/skills/alpha"), path.join(h, ".claude/skills/alpha"));
    fs.symlinkSync(path.join(h, ".agents/skills/beta"), path.join(h, ".kiro-beta-link"));
    writeFile(h, ".kiro/skills/k1/SKILL.md", skillMd("k1", "키로"));
    writeFile(h, ".claude/skills/nested-holder/inner/SKILL.md", skillMd("deep", "더 깊은"));
    const srv = await serve(repo);
    const before = snapshotTree(h);
    const inv = await inventory(srv);
    expect(snapshotTree(h)).toEqual(before);
    for (const [root, display] of [[".agents/skills", "~/.agents/skills"], [".claude/skills", "~/.claude/skills"], [".kiro/skills", "~/.kiro/skills"]] as const) {
      const find = spawnSync("find", ["-L", path.join(h, root), "-mindepth", "2", "-maxdepth", "2", "-name", "SKILL.md"], { encoding: "utf8" }).stdout.split("\n").filter(Boolean).length;
      const row = inv.roots.find((r: any) => r.path === display);
      expect([display, row.count]).toEqual([display, find]);
    }
    const claude = inv.roots.find((r: any) => r.path === "~/.claude/skills");
    expect([claude.symlinks, claude.nested]).toEqual([1, 1]);
    const alpha = inv.skills.find((s: any) => s.id === "alpha");
    expect(alpha.locations.map((l: any) => l.path).sort()).toEqual(["~/.agents/skills/alpha", "~/.claude/skills/alpha"]);
    expect(inv.skills.some((s: any) => s.id === "deep")).toBe(false);
    expect(JSON.stringify(inv)).not.toContain(h);
  });

  it("고리 · 머리 없음 · YAML 오류 · 300 KiB · 이름의 ':' 는 error · warning 으로 남고 스캔이 끝까지 돈다(SK-R12 · R13)", async () => {
    const repo = makeRepo();
    const h = repo.home;
    writeFile(h, ".claude/skills/good/SKILL.md", skillMd("good", "정상"));
    writeFile(h, ".claude/skills/nofm/SKILL.md", "그냥 글\n");
    writeFile(h, ".claude/skills/badyaml/SKILL.md", "---\nname: [x\n---\n");
    writeFile(h, ".claude/skills/huge/SKILL.md", `---\nname: huge\ndescription: 큼\n---\n${"가".repeat(110_000)}\n`);
    writeFile(h, ".claude/skills/colon/SKILL.md", skillMd("my:colon", "이름에 콜론"));
    fs.mkdirSync(path.join(h, ".claude/skills/loop"), { recursive: true });
    fs.symlinkSync(path.join(h, ".claude/skills/loop/SKILL.md"), path.join(h, ".claude/skills/loop/SKILL.md"));
    const inv = await inventory(await serve(repo));
    const by = Object.fromEntries(inv.skills.map((s: any) => [s.id, s]));
    expect(by.nofm.error).toBe("no-frontmatter");
    expect(by.badyaml.error).toBe("yaml");
    expect(by.huge.error).toBe("too-large");
    expect(by.loop.error).toBe("symlink-loop");
    expect(by["my:colon"].warnings).toContain("name-colon");
    expect(by["my:colon"].warnings).toContain("name-dir-mismatch");
    expect(by.good.error).toBeNull();
    expect(by.nofm.harnesses.claude).toBe("no");
  });

  it("같은 이름 · 다른 내용: Claude 는 user 가 loaded, project 가 shadowed · Codex 는 both(SK-R6 · R7)", async () => {
    const repo = makeRepo();
    writeFile(repo.home, ".claude/skills/twin/SKILL.md", skillMd("twin", "사용자 쪽"));
    writeFile(repo.root, ".claude/skills/twin/SKILL.md", skillMd("twin", "프로젝트 쪽"));
    writeFile(repo.home, ".agents/skills/twin/SKILL.md", skillMd("twin", "에이전트 쪽"));
    const inv = await inventory(await serve(repo));
    const twins = inv.skills.filter((s: any) => s.id === "twin");
    expect(twins).toHaveLength(3);
    const user = twins.find((s: any) => s.locations[0].path === "~/.claude/skills/twin");
    const proj = twins.find((s: any) => s.locations[0].path === ".claude/skills/twin");
    expect([user.harnesses.claude, proj.harnesses.claude]).toEqual(["loaded", "shadowed"]);
    expect(proj.shadowedBy.claude).toBe("~/.claude/skills/twin");
    expect(user.harnesses.cursor).toBe("both");
    expect(inv.conflicts).toHaveLength(1);
    expect(inv.conflicts[0].name).toBe("twin");
    expect(inv.conflicts[0].candidates).toHaveLength(3);
  });

  it("내용이 같은 복사본은 copies 로 묶는다", async () => {
    const repo = makeRepo();
    writeFile(repo.home, ".agents/skills/same/SKILL.md", skillMd("same", "같음"));
    writeFile(repo.home, ".codex/skills/same/SKILL.md", skillMd("same", "같음"));
    const inv = await inventory(await serve(repo));
    const same = inv.skills.filter((s: any) => s.id === "same");
    expect(same).toHaveLength(2);
    expect(same[0].copies).toHaveLength(1);
    expect(inv.conflicts).toEqual([]);
  });

  it("플러그인: 꺼 둔 것은 0개, 켠 것은 설치 기록의 버전 하나만(SK-R4)", async () => {
    const repo = makeRepo();
    const h = repo.home;
    const cache = (m: string, p: string, v: string): string => path.join(h, ".claude/plugins/cache", m, p, v);
    writeFile(cache("mk", "on", "2.0.0"), ".claude-plugin/plugin.json", JSON.stringify({ name: "on", skills: ["./skills/", "./extra/"] }));
    writeFile(cache("mk", "on", "2.0.0"), "skills/s-new/SKILL.md", skillMd("s-new", "새 버전"));
    writeFile(cache("mk", "on", "2.0.0"), "extra/e-one/SKILL.md", skillMd("e-one", "추가 경로"));
    writeFile(cache("mk", "on", "1.0.0"), "skills/s-old/SKILL.md", skillMd("s-old", "옛 버전"));
    writeFile(cache("mk", "off", "1.0.0"), "skills/s-off/SKILL.md", skillMd("s-off", "꺼짐"));
    writeFile(cache("mk", "guess", "0.9.0"), "skills/s-g/SKILL.md", skillMd("s-g", "추정 버전"));
    writeFile(cache("mk", "guess", "0.10.0"), "skills/s-g2/SKILL.md", skillMd("s-g2", "추정 버전 2"));
    writeFile(h, ".claude/plugins/installed_plugins.json", JSON.stringify({ version: 2, plugins: { "on@mk": [{ scope: "user", installPath: cache("mk", "on", "2.0.0"), version: "2.0.0", lastUpdated: "2026-11-01" }], "off@mk": [{ scope: "user", installPath: cache("mk", "off", "1.0.0"), version: "1.0.0" }] } }));
    writeFile(h, ".claude/settings.json", JSON.stringify({ enabledPlugins: { "on@mk": true, "off@mk": false, "guess@mk": true } }));
    const inv = await inventory(await serve(repo));
    const ids = inv.skills.map((s: any) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["on:s-new", "on:e-one", "guess:s-g2"]));
    for (const gone of ["on:s-old", "off:s-off", "guess:s-g"]) expect(ids).not.toContain(gone);
    const root = inv.roots.filter((r: any) => r.path === "plugin:on@mk");
    expect(root.map((r: any) => [r.version, r.versionSource])).toEqual([["2.0.0", "installed"], ["2.0.0", "installed"]]);
    expect(inv.roots.find((r: any) => r.path === "plugin:guess@mk").versionSource).toBe("cache-guess");
    expect(inv.skills.find((s: any) => s.id === "on:s-new").harnesses).toMatchObject({ claude: "loaded", codex: "no" });
  });

  it("installPath 가 캐시 밖이면 install-path 오류, version 이 2 가 아니면 건너뛰고 경고", async () => {
    const repo = makeRepo();
    writeFile(repo.home, ".claude/plugins/installed_plugins.json", JSON.stringify({ version: 2, plugins: { "bad@mk": [{ scope: "user", installPath: path.join(repo.base, "elsewhere") }] } }));
    fs.mkdirSync(path.join(repo.base, "elsewhere"), { recursive: true });
    writeFile(repo.home, ".claude/settings.json", JSON.stringify({ enabledPlugins: { "bad@mk": true } }));
    const srv = await serve(repo);
    const inv = await inventory(srv, "?refresh=1");
    expect(inv.roots.find((r: any) => r.path === "plugin:bad@mk").error).toBe("install-path");
    writeFile(repo.home, ".claude/plugins/installed_plugins.json", JSON.stringify({ version: 3, plugins: {} }));
    const v3 = await inventory(srv, "?refresh=1");
    expect(v3.warnings.join(" ")).toContain("version");
  });

  it("단계: 지도 > metadata.hx-stages > 추정, 지도 칸 해석 · 개인 층 앞 더하기(SK-R8 · R9)", async () => {
    const repo = makeRepo();
    writeFile(repo.home, ".claude/skills/planner/SKILL.md", skillMd("planner", "PRD 를 쓴다"));
    writeFile(repo.home, ".claude/skills/hx-kit/SKILL.md", skillMd("hx-kit", "킷 스킬", "metadata:\n  hx-stages: [design]\n"));
    writeFile(repo.home, ".claude/skills/guessed/SKILL.md", skillMd("guessed", "code review and security audit for pull requests"));
    writeFile(repo.home, ".claude/skills/weather/SKILL.md", skillMd("weather", "오늘 날씨를 알려 준다"));
    writeFile(repo.home, ".claude/skills/mine/SKILL.md", skillMd("mine", "내 기획"));
    writeFile(repo.root, ".agents/skill-map.json", JSON.stringify({ schema: "harness-kit.skill-map/v1", stages: { design: { "screen-plan": ["planner", "absent-skill"] } }, commands: { "/hx-screen-plan": { slots: ["design.screen-plan"], fallback: "template:plans/screens" }, "/hx-backlog": { slots: ["design.backlog"], fallback: "template:plans/backlog.md" } }, exclude: [] }));
    writeFile(repo.root, ".agents/local/skill-map.local.json", JSON.stringify({ prepend: { "design.screen-plan": ["mine"] } }));
    const srv = await serve(repo);
    const inv = await inventory(srv);
    const by = Object.fromEntries(inv.skills.map((s: any) => [s.id, s]));
    expect(by.planner.stages).toEqual([{ stage: "design", slot: "screen-plan", source: "map" }]);
    expect(by["hx-kit"].stages).toEqual([{ stage: "design", slot: null, source: "metadata" }]);
    expect(by.guessed.stages[0]).toMatchObject({ stage: "verify", source: "추정" });
    expect(by.weather.stages).toEqual([]);
    expect(inv.map.present).toBe(true);
    const r = inv.map.resolved.filter((x: any) => x.harness === "claude");
    expect(r.find((x: any) => x.command === "/hx-screen-plan").skill).toBe("mine");
    expect(r.find((x: any) => x.command === "/hx-backlog")).toMatchObject({ skill: null, fallback: "template:plans/backlog.md" });
    const design = await inventory(srv, `?stage=${encodeURIComponent("설계")}`);
    expect(design.skills.map((s: any) => s.id)).toEqual(["planner", "hx-kit"]);
    const claude = await inventory(srv, "?harness=codex");
    expect(claude.skills).toEqual([]);
  });

  it("--no-user 는 사용자 위치와 플러그인을 읽지 않는다 · 하네스는 meta.agents 만 보이고 --all 이면 다섯", async () => {
    const repo = makeRepo();
    writeFile(repo.home, ".claude/skills/u/SKILL.md", skillMd("u", "사용자"));
    writeFile(repo.root, ".agents/skills/p/SKILL.md", skillMd("p", "프로젝트"));
    const srv = await serve(repo);
    const noUser = await inventory(srv, "?user=0");
    expect(noUser.skills.map((s: any) => s.id)).toEqual(["p"]);
    expect(noUser.harnesses).toEqual(["claude", "codex"]);
    expect((await inventory(srv, "?user=0&all=1")).harnesses).toHaveLength(5);
  });

  it("하위 폴더 스킬은 nested 로 읽고 worktree · 빌드 폴더는 건너뛴다", async () => {
    const repo = makeRepo();
    writeFile(repo.root, "svc/api/.claude/skills/n1/SKILL.md", skillMd("n1", "하위"));
    writeFile(repo.root, "node_modules/x/.claude/skills/n2/SKILL.md", skillMd("n2", "건너뜀"));
    writeFile(repo.root, ".claude/worktrees/agent-1/.claude/skills/n3/SKILL.md", skillMd("n3", "건너뜀"));
    const inv = await inventory(await serve(repo), "?user=0");
    expect(inv.skills.map((s: any) => s.id)).toEqual(["n1"]);
    expect(inv.roots[0].scope).toBe("nested:svc/api");
  });

  it("추정 정확도 70% 이상 · 미분류 40% 이하(합성 라벨 30개, 07 §5 7)", () => {
    const labeled: [string, string, string | null][] = [
      ["create-prd", "Write a PRD with requirements and user stories", "design"],
      ["wireframe-kit", "Make wireframe and storyboard for the app", "design"],
      ["ux-research", "UX journey and persona building", "design"],
      ["요구사항-정리", "요구사항과 화면 기획을 정리한다", "design"],
      ["design-system", "Create a design system with tokens", "design"],
      ["tdd-guide", "Test-driven development: write tests first", "implement"],
      ["refactor-cleaner", "Refactor and remove dead code", "implement"],
      ["scaffold-service", "Scaffold a new service with coding standard", "implement"],
      ["구현-도우미", "기능을 구현하고 리팩터한다", "implement"],
      ["patterns-go", "Go patterns and implement idioms", "implement"],
      ["code-review", "Review code for quality and security", "verify"],
      ["security-scan", "Security scan and vulnerability audit", "verify"],
      ["qa-runner", "Run QA with regression and coverage", "verify"],
      ["lint-fixer", "Lint and regression checks", "verify"],
      ["보안-점검", "보안 취약점을 점검한다", "verify"],
      ["update-docs", "Update documentation, readme and changelog", "docs"],
      ["release-notes", "Write release note and changelog", "docs"],
      ["codemap", "Generate codemap documentation", "docs"],
      ["문서-갱신", "문서와 릴리스 노트를 갱신한다", "docs"],
      ["docs-lookup", "Look up documentation for libraries", "docs"],
      ["canary-watch", "Deploy canary and monitor rollback", "ops"],
      ["incident-retro", "Incident retro and observability review", "ops"],
      ["배포-도우미", "배포와 장애 대응, 운영 회고", "ops"],
      ["on-call", "On-call monitor and incident rollback", "ops"],
      ["deploy-check", "Deploy checks and rollback plan", "ops"],
      ["weather", "Korea weather forecast by region", null],
      ["subway", "Seoul subway arrival times", null],
      ["lotto", "Lotto results and numbers", null],
      ["recipe", "Cooking recipe finder", null],
      ["kbo", "KBO baseball results", null],
    ];
    let hits = 0;
    let none = 0;
    for (const [name, desc, want] of labeled) {
      const g = guessStages(name, desc);
      if (g.stages.length === 0) none += 1;
      if ((want === null && g.stages.length === 0) || (want !== null && g.stages.includes(want as never))) hits += 1;
    }
    expect(hits / labeled.length).toBeGreaterThanOrEqual(0.7);
    expect(none / labeled.length).toBeLessThanOrEqual(0.4);
  });

  it("캐시: 같은 입력이면 같은 결과, refresh=1 은 다시 읽는다", async () => {
    const repo = makeRepo();
    writeFile(repo.home, ".claude/skills/a/SKILL.md", skillMd("a", "하나"));
    const srv = await serve(repo);
    const first = await inventory(srv);
    const second = await inventory(srv);
    expect(second.scannedAt).toBe(first.scannedAt);
    writeFile(repo.home, ".claude/skills/b/SKILL.md", skillMd("b", "둘"));
    expect((await inventory(srv)).skills.map((s: any) => s.id)).toEqual(["a", "b"]);
    expect((await inventory(srv, "?refresh=1")).scannedAt).not.toBe(first.scannedAt);
  });

  it("스캔은 모델 · 네트워크를 쓰지 않는다: 소스에 http 주소 · fetch · child_process 가 없다", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/skills.ts"), "utf8");
    expect(src).not.toMatch(/https?:\/\/|fetch\(|child_process|net\.connect/);
  });
});
