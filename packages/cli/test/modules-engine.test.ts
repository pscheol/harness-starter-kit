// 모듈 엔진(설계 10 §3.1, HK-20): add · remove · 도구 설치 · 측정 · 되돌리기. 가짜 도구를 PATH 에 둔다.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listModuleIds, loadModule } from "../src/modules/declaration";
import { undeclaredTemplateFiles } from "../src/modules/doctor";
import { parseVersion, satisfiesRange } from "../src/modules/tools";
import { BASIC_FILES, fixtureTemplates, lockEntries, readJsonFile, readTree, REAL_TEMPLATES, tmpDir } from "./helpers";
import { calls, cli, FAKE_AIDLC, FAKE_BREW, FAKE_ENTIRE, FAKE_GH, installedRepo, makeBin, type Bin } from "./modules-helpers";

const sha = (b: Buffer | string): string => crypto.createHash("sha256").update(b).digest("hex");
const T = ["--templates", REAL_TEMPLATES];
const tools = (): Record<string, string> => ({ aidlc: FAKE_AIDLC, entire: FAKE_ENTIRE, gh: FAKE_GH });
const read = (t: string, rel: string): string => fs.readFileSync(path.join(t, ...rel.split("/")), "utf8");
const meta = (t: string): Record<string, any> => readJsonFile(path.join(t, ".agents/knots-sync.json"));

/** 외부 소유 파일의 sha256 + 설정 파일 속 외부 훅 항목의 sha256 */
function externalHashes(t: string, hookMarks: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of lockEntries(t)) {
    if (!String(e.owner).startsWith("external:")) continue;
    const f = path.join(t, e.path);
    out[e.path] = fs.existsSync(f) ? sha(fs.readFileSync(f)) : "MISSING";
  }
  for (const rel of [".claude/settings.json", ".codex/hooks.json"]) {
    const f = path.join(t, rel);
    if (!fs.existsSync(f)) continue;
    const d = JSON.parse(fs.readFileSync(f, "utf8")) as { hooks?: Record<string, { hooks: { command: string }[] }[]> };
    for (const [ev, groups] of Object.entries(d.hooks ?? {})) {
      for (const g of groups) for (const h of g.hooks) if (hookMarks.some((m) => h.command.includes(m))) out[`${rel}#${ev}#${h.command}`] = sha(JSON.stringify(h));
    }
  }
  return out;
}

describe("module.json 선언(MD-R1)", () => {
  it("모듈 여섯의 선언이 읽히고 모듈 폴더의 파일은 모두 선언돼 있다", () => {
    const ids = listModuleIds(REAL_TEMPLATES);
    expect(ids).toEqual(["aidlc", "ci", "entire", "jira-workflow", "multi-harness", "notion"]);
    for (const id of ids) {
      const m = loadModule(REAL_TEMPLATES, id);
      expect(undeclaredTemplateFiles(REAL_TEMPLATES, m)).toEqual([]);
    }
    expect(loadModule(REAL_TEMPLATES, "jira-workflow").kind).toBe("kit");
    expect(loadModule(REAL_TEMPLATES, "multi-harness").files).toBe("layer");
    const aidlc = loadModule(REAL_TEMPLATES, "aidlc");
    expect(aidlc.hooks.map((h) => h.id)).toEqual(["harness-aidlc-freshness"]);
    const hooksD = JSON.parse(fs.readFileSync(path.join(REAL_TEMPLATES, "optional/aidlc/agents-root/hooks.d/aidlc.json"), "utf8")) as { hooks: { id: string; module: string }[] };
    expect(hooksD.hooks.map((h) => [h.id, h.module])).toEqual([["harness-aidlc-freshness", "aidlc"]]);
  });

  it("버전을 읽고 범위를 판정한다", () => {
    expect(parseVersion("aidlc 2.11.4 (runtime 2.11.4)")).toBe("2.11.4");
    expect(parseVersion("Entire CLI 0.13.4\nGo version: go1.27.4")).toBe("0.13.4");
    expect(satisfiesRange("2.11.4", ">=2.11 <3")).toBe(true);
    expect(satisfiesRange("3.0.0", ">=2.11 <3")).toBe(false);
    expect(satisfiesRange("0.13.4", ">=0.13 <0.14")).toBe(true);
    expect(satisfiesRange("0.14.0", ">=0.13 <0.14")).toBe(false);
    expect(satisfiesRange("x", ">=0.13")).toBe(null);
  });
});

describe("add aidlc · remove aidlc(MD-R2 · R5~R7 · R9)", () => {
  it("--dry-run 은 쓰지 않고 계획 · 외부 명령 · 설정 변경을 보인다", async () => {
    const t = await installedRepo();
    const bin = makeBin(tools());
    const before = readTree(t);
    const r = await cli(t, ["add", "aidlc", "--dry-run", ...T], bin);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain("외부 명령: aidlc config --harness claude --yes");
    expect(r.stdout).toContain('flow.design = "aidlc"');
    expect(r.stdout).toContain("harness-aidlc-freshness");
    expect([...readTree(t).keys()]).toEqual([...before.keys()]);
    expect(calls(bin)).toEqual(["aidlc --version"]);
  });

  it("외부 파일은 op none · external:aidlc 로 적고 킷 몫만 깐다. update · repair · remove · uninstall 뒤 외부 파일 sha256 이 같다(완료 기준 1 · 2)", async () => {
    const t = await installedRepo();
    const bin = makeBin(tools());
    const r = await cli(t, ["add", "aidlc", "--yes", "--json", ...T], bin);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(meta(t).modules).toContain("aidlc");
    expect(meta(t).flow.design).toBe("aidlc");
    const ext = lockEntries(t).filter((e) => e.owner === "external:aidlc");
    expect(ext.length).toBeGreaterThan(5);
    expect(new Set(ext.map((e) => e.op))).toEqual(new Set(["none"]));
    expect(ext.map((e) => e.path)).toContain(".claude/CLAUDE.md");
    expect(ext.map((e) => e.path)).toContain("aidlc/spaces/default/memory/project.md");
    // 킷 몫: layer optional/aidlc · owner kit, 훅은 설정 파일에 병합
    const kit = lockEntries(t).filter((e) => e.layer === "optional/aidlc");
    expect(kit.map((e) => e.path).sort()).toEqual([".agents/hooks.d/aidlc.json", "scripts/hooks/aidlc-freshness.py", "scripts/hooks/aidlc-freshness.sh"]);
    expect(new Set(kit.map((e) => e.owner))).toEqual(new Set(["kit"]));
    const settings = read(t, ".claude/settings.json");
    expect(settings).toContain("harness-aidlc-freshness");
    expect(settings).toContain("aidlc engine hook session-start");
    // 스냅숏
    expect(fs.readdirSync(path.join(t, ".agents/state/module-snapshots")).some((f) => f.startsWith("aidlc-"))).toBe(true);

    const marks = ["aidlc engine hook"];
    const base = externalHashes(t, marks);
    expect(Object.keys(base).length).toBeGreaterThanOrEqual(8);
    expect((await cli(t, ["update", "--yes", ...T], bin)).code).toBe(0);
    expect(externalHashes(t, marks)).toEqual(base);
    expect((await cli(t, ["repair", ...T], bin)).code).toBe(0);
    expect(externalHashes(t, marks)).toEqual(base);

    const rm = await cli(t, ["remove", "aidlc", ...T], bin);
    expect(rm.code, rm.stdout + rm.stderr).toBe(0);
    expect(meta(t).modules).not.toContain("aidlc");
    expect(meta(t).flow.design).toBe("kit");
    expect(lockEntries(t).filter((e) => e.owner === "external:aidlc")).toEqual([]);
    expect(fs.existsSync(path.join(t, ".agents/hooks.d/aidlc.json"))).toBe(false);
    expect(read(t, ".claude/settings.json")).not.toContain("harness-aidlc-freshness");
    // 파일과 외부 훅 항목은 그대로
    const after = externalHashes(t, marks);
    for (const [k, v] of Object.entries(base)) if (!k.includes("#")) expect([k, fs.existsSync(path.join(t, k)) ? sha(fs.readFileSync(path.join(t, k))) : "MISSING"]).toEqual([k, v]);
    expect(Object.keys(after).filter((k) => k.includes("#")).sort()).toEqual(Object.keys(base).filter((k) => k.includes("#")).sort());
    expect(rm.stdout).toContain("외부 소유 항목");

    // 다시 켜면 이미 있는 파일도 외부 소유로 등록된다
    expect((await cli(t, ["add", "aidlc", "--yes", ...T], bin)).code).toBe(0);
    expect(lockEntries(t).filter((e) => e.owner === "external:aidlc").length).toBe(ext.length);
    const base2 = externalHashes(t, marks);
    expect((await cli(t, ["uninstall", "--yes", ...T], bin)).code).toBe(0);
    for (const [k, v] of Object.entries(base2)) if (!k.includes("#")) expect([k, sha(fs.readFileSync(path.join(t, k)))]).toEqual([k, v]);
    expect(read(t, ".claude/settings.json")).toContain("aidlc engine hook session-start");
  });

  it("측정 전후를 owner 별로 보이고 늘어난 양이 4,096바이트를 넘으면 TTY 에서 한 번 더 묻는다. 아니오면 킷 몫을 뺀다(MD-R16)", async () => {
    const t = await installedRepo();
    const bin = makeBin(tools());
    const no = await cli(t, ["add", "aidlc", ...T], bin, { tty: true, answers: ["y", "y", "n"] });
    // 가짜 aidlc 가 만든 양은 4,096바이트보다 작다 — 확인 질문 없이 끝난다
    expect(no.code, no.stdout + no.stderr).toBe(0);
    expect(no.stdout).toMatch(/세션마다 실리는 양\(바이트, 하네스 claude\)/);
    expect(no.stdout).toMatch(/external:aidlc\s+0 →\s+[1-9]/);
    expect(no.stdout).toMatch(/훅\s+.*SessionStart 1 → 2/);
  });

  it("충돌하는 모듈이 켜져 있으면 add 는 거부하고(MD-R8) 먼저 켜야 하는 모듈이 없으면 exit 3 이다", async () => {
    const files = {
      ...BASIC_FILES,
      "optional/zz-ext/module.json": JSON.stringify({ schema: "knots-sync.module/v1", id: "zz-ext", title: "x", summary: "x", kind: "external", requires: { modules: ["jira-workflow"], tools: [] }, conflicts: ["multi-harness"], files: "layer", steps: { add: [{ applyKit: true }], remove: [{ removeKit: true }] } }),
      "optional/zz-ext/agents-rules/zz.md": "zz\n",
      "optional/jira-workflow/module.json": JSON.stringify({ schema: "knots-sync.module/v1", id: "jira-workflow", title: "j", summary: "j", kind: "kit", files: "layer", steps: { add: [{ applyKit: true }], remove: [{ removeKit: true }] } }),
      "optional/multi-harness/module.json": JSON.stringify({ schema: "knots-sync.module/v1", id: "multi-harness", title: "m", summary: "m", kind: "kit", files: "layer", steps: { add: [{ applyKit: true }], remove: [{ removeKit: true }] } }),
    };
    const templates = fixtureTemplates(files, { externalModules: ["zz-ext"] });
    const target = path.join(tmpDir(), "acme");
    const init = await cli(target, ["init", "--yes", "--templates", templates, "--agents", "claude", "--no-register"], null);
    expect(init.code, init.stdout + init.stderr).toBe(0);
    const needs = await cli(target, ["add", "zz-ext", "--templates", templates], null);
    expect(needs.code).toBe(3);
    expect(needs.stderr).toContain("먼저 jira-workflow");
    expect((await cli(target, ["add", "jira-workflow", "multi-harness", "--templates", templates], null)).code).toBe(0);
    const conflict = await cli(target, ["add", "zz-ext", "--templates", templates], null);
    expect(conflict.code).toBe(3);
    expect(conflict.stderr).toContain("같이 켤 수 없다");
    expect(meta(target).modules).not.toContain("zz-ext");
  });
});

describe("도구 설치(MD-R3, 완료 기준 10)", () => {
  const withoutEntire = (): Bin => {
    const bin = makeBin({ gh: FAKE_GH, aidlc: FAKE_AIDLC });
    fs.writeFileSync(path.join(bin.dir, "brew"), FAKE_BREW(bin.dir), { mode: 0o755 });
    return bin;
  };

  it("TTY 에서 설치 명령을 보이고 묻는다. 아니오면 exit 5 이고 실행 0건이다", async () => {
    const t = await installedRepo();
    const bin = withoutEntire();
    const r = await cli(t, ["add", "entire", ...T], bin, { tty: true, answers: ["n"] });
    expect(r.code).toBe(5);
    expect(r.stderr).toContain("brew install --cask entireio/tap/entire");
    expect(calls(bin).filter((c) => c.startsWith("brew"))).toEqual([]);
    expect(fs.existsSync(path.join(t, ".entire"))).toBe(false);
    expect(meta(t).modules).not.toContain("entire");
  });

  it("--install-tools 면 묻지 않고 그 설치기를 한 번 부른다. 설치 뒤 버전을 다시 확인하고 이어 간다", async () => {
    const t = await installedRepo();
    const bin = withoutEntire();
    const r = await cli(t, ["add", "entire", "--install-tools", "--yes", ...T], bin);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(calls(bin).filter((c) => c.startsWith("brew"))).toEqual(["brew install --cask entireio/tap/entire"]);
    expect(meta(t).modules).toContain("entire");
  });

  it("에이전트 세션에서는 --install-tools 가 있어도 설치하지 않고 명령을 출력한 뒤 exit 5 로 끝난다", async () => {
    const t = await installedRepo();
    const bin = withoutEntire();
    const r = await cli(t, ["add", "entire", "--install-tools", "--yes", ...T], bin, { agent: "CLAUDECODE=1" });
    expect(r.code).toBe(5);
    expect(r.stderr).toContain("에이전트 세션");
    expect(r.stderr).toContain("brew install --cask entireio/tap/entire");
    expect(calls(bin).filter((c) => c.startsWith("brew"))).toEqual([]);
  });

  it("TTY 가 아니고 --install-tools 도 없으면 설치하지 않는다", async () => {
    const t = await installedRepo();
    const bin = withoutEntire();
    const r = await cli(t, ["add", "entire", "--yes", ...T], bin);
    expect(r.code).toBe(5);
    expect(calls(bin).filter((c) => c.startsWith("brew"))).toEqual([]);
  });

  it("sudo 로 시작하는 설치 명령은 실행하지 않는다", async () => {
    const files = {
      ...BASIC_FILES,
      "optional/zz-sudo/module.json": JSON.stringify({
        schema: "knots-sync.module/v1", id: "zz-sudo", title: "x", summary: "x", kind: "external",
        requires: { modules: [], tools: [{ name: "zzsudo", versionCmd: ["zzsudo", "--version"], range: ">=1.0", install: { darwin: ["sudo", "apt", "install", "zzsudo"], doc: "x" } }] },
        files: "layer", steps: { add: [{ applyKit: true }], remove: [{ removeKit: true }] },
      }),
      "optional/zz-sudo/agents-rules/z.md": "z\n",
    };
    const templates = fixtureTemplates(files, { externalModules: ["zz-sudo"] });
    const target = path.join(tmpDir(), "acme");
    expect((await cli(target, ["init", "--yes", "--templates", templates, "--agents", "claude", "--no-register"], null)).code).toBe(0);
    const bin = makeBin({ sudo: "#!/bin/bash\necho sudo $* >> \"$FAKE_LOG\"\n" });
    const r = await cli(target, ["add", "zz-sudo", "--install-tools", "--yes", "--templates", templates], bin);
    expect(r.code).toBe(5);
    expect(r.stderr).toContain("sudo");
    expect(calls(bin)).toEqual([]);
  });

  it("버전이 검증 범위 밖이면 exit 4, --allow-unverified 면 경고하고 진행한다(MD-R4)", async () => {
    const t = await installedRepo();
    const bin = makeBin(tools(), { FAKE_ENTIRE_VERSION: "0.14.0" });
    const r = await cli(t, ["add", "entire", "--yes", ...T], bin);
    expect(r.code).toBe(4);
    expect(r.stderr).toContain("--allow-unverified");
    expect(fs.existsSync(path.join(t, ".entire"))).toBe(false);
    const ok = await cli(t, ["add", "entire", "--yes", "--allow-unverified", ...T], bin);
    expect(ok.code, ok.stdout + ok.stderr).toBe(0);
    expect(ok.stdout).toContain("검증된 범위");
    const doc = await cli(t, ["doctor", "--json", ...T], bin);
    expect(doc.json.findings.some((f: any) => f.kind === "tool-version")).toBe(true);
  });
});

describe("add entire(MD-R12 · R13, 완료 기준 5 · 6)", () => {
  const vis = async (value: string): Promise<{ t: string; bin: Bin; settings: Record<string, any> }> => {
    const t = await installedRepo();
    const bin = makeBin(tools(), { FAKE_VIS: value });
    const r = await cli(t, ["add", "entire", "--yes", ...T], bin);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    return { t, bin, settings: readJsonFile(path.join(t, ".entire/settings.json")) };
  };

  it("공개 원격이면 체크포인트를 올리지 않는 설정을 쓴다", async () => {
    const { bin, settings } = await vis("PUBLIC");
    expect(calls(bin)).toContain("entire configure --project --skip-push-sessions");
    expect(settings.strategy_options.push_sessions).toBe(false);
  });

  it("공개 여부를 확인하지 못해도(gh 실패) 공개로 보고 올리지 않는다", async () => {
    const { bin, settings } = await vis("FAIL");
    expect(calls(bin)).toContain("entire configure --project --skip-push-sessions");
    expect(settings.strategy_options.push_sessions).toBe(false);
  });

  it("비공개 원격이면 같은 원격에 올린다(기본값을 건드리지 않는다)", async () => {
    const { bin, settings } = await vis("PRIVATE");
    expect(calls(bin).some((c) => c.startsWith("entire configure"))).toBe(false);
    expect(settings.strategy_options).toBeUndefined();
  });

  it("구현 역할 하네스 하나에만 enable 하고 리뷰 하네스에는 켜지 않는다. 다른 하네스에 훅이 있으면 doctor 가 경고한다", async () => {
    const t = await installedRepo("claude,codex");
    const bin = makeBin(tools(), { FAKE_VIS: "PRIVATE" });
    expect((await cli(t, ["add", "entire", "--yes", ...T], bin)).code).toBe(0);
    expect(calls(bin).filter((c) => c.startsWith("entire enable"))).toEqual(["entire enable --agent claude-code --project"]);
    expect(fs.existsSync(path.join(t, ".codex/hooks.json")) ? read(t, ".codex/hooks.json").includes("entire hooks") : false).toBe(false);
    const clean = await cli(t, ["doctor", "--json", ...T], bin);
    expect(clean.json.findings.filter((f: any) => f.kind === "implement-only" && f.severity === "warn")).toEqual([]);
    // 리뷰 하네스(codex)에도 켜 본다
    fs.mkdirSync(path.join(t, ".codex"), { recursive: true });
    fs.writeFileSync(path.join(t, ".codex/hooks.json"), JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: "entire hooks codex stop" }] }] } }));
    const warned = await cli(t, ["doctor", "--json", ...T], bin);
    expect(warned.json.findings.filter((f: any) => f.kind === "implement-only" && f.severity === "warn").length).toBe(1);
  });

  it("구현 하네스가 Entire 가 지원하지 않는 kiro 면 쓰기 전에 exit 3 이다", async () => {
    const t = await installedRepo("claude,kiro");
    const m = meta(t);
    fs.writeFileSync(path.join(t, ".agents/knots-sync.json"), JSON.stringify({ ...m, roles: { implement: { harness: "kiro" } } }, null, 2));
    const bin = makeBin(tools(), { FAKE_VIS: "PRIVATE" });
    const r = await cli(t, ["add", "entire", "--yes", ...T], bin);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain("kiro");
    expect(calls(bin).filter((c) => c.startsWith("entire enable"))).toEqual([]);
  });

  it("전역 core.hooksPath 가 있으면 doctor 가 경고한다(Entire 가 그 폴더에 git 훅을 깐다)", async () => {
    const t = await installedRepo();
    const bin = makeBin(tools(), { FAKE_VIS: "PRIVATE" });
    expect((await cli(t, ["add", "entire", "--yes", ...T], bin)).code).toBe(0);
    const gc = path.join(tmpDir(), "gitconfig");
    fs.writeFileSync(gc, "[core]\n\thooksPath = /tmp/global-hooks\n");
    const doc = await cli(t, ["doctor", "--json", ...T], bin, { env: { GIT_CONFIG_GLOBAL: gc } });
    expect(doc.json.findings.some((f: any) => f.kind === "global-hooks-path")).toBe(true);
  });

  it("공개 원격인데 올리는 설정이면 doctor push-policy 오류다", async () => {
    const { t, bin } = await vis("PUBLIC");
    fs.writeFileSync(path.join(t, ".entire/settings.json"), JSON.stringify({ enabled: true }));
    const doc = await cli(t, ["doctor", "--json", "--check", ...T], bin);
    expect(doc.code).toBe(1);
    expect(doc.json.findings.some((f: any) => f.kind === "push-policy" && f.severity === "error")).toBe(true);
  });
});

describe("되돌리기(MD-R1 · 설계 10 §3.1 6 이후 실패)", () => {
  it("킷 몫을 적용한 뒤 설정 단계가 실패하면 킷 몫만 원래대로 되돌리고 외부 파일은 남긴다", async () => {
    const files = {
      ...BASIC_FILES,
      "optional/zz-rb/module.json": JSON.stringify({
        schema: "knots-sync.module/v1", id: "zz-rb", title: "x", summary: "x", kind: "external",
        requires: { modules: [], tools: [{ name: "zzrb", versionCmd: ["zzrb", "--version"], range: ">=1.0" }] },
        files: "layer", externalPaths: ["zzrb/**"], config: { set: { "project.name.x": 1 }, unset: {} },
        steps: { add: [{ run: ["zzrb", "make"] }, { registerExternal: true }, { applyKit: true }, { setConfig: true }], remove: [{ removeKit: true }] },
      }),
      "optional/zz-rb/agents-rules/rb.md": "rb\n",
    };
    const templates = fixtureTemplates(files, { externalModules: ["zz-rb"] });
    const target = path.join(tmpDir(), "acme");
    expect((await cli(target, ["init", "--yes", "--templates", templates, "--agents", "claude", "--no-register"], null)).code).toBe(0);
    const before = readTree(target);
    const bin = makeBin({ zzrb: '#!/bin/bash\n[ "$1" = "--version" ] && { echo "zzrb 1.2.0"; exit 0; }\nmkdir -p zzrb && echo made > zzrb/out.txt\n' });
    const r = await cli(target, ["add", "zz-rb", "--yes", "--templates", templates], bin);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain("킷 몫을 되돌렸다");
    expect(fs.existsSync(path.join(target, ".agents/rules/rb.md"))).toBe(false);
    expect(meta(target).modules).not.toContain("zz-rb");
    expect(lockEntries(target).some((e) => e.owner === "external:zzrb")).toBe(false);
    expect(fs.readFileSync(path.join(target, "zzrb/out.txt"), "utf8")).toBe("made\n");
    // 킷이 만든 파일은 그대로(lock · 메타 포함)
    for (const [rel, e] of before) if (!rel.startsWith(".agents/state/")) expect([rel, fs.readFileSync(path.join(target, rel)).equals(e.bytes)]).toEqual([rel, true]);
  });
});

describe("측정(MD-R16, 완료 기준 11)", () => {
  it("규칙 2개 · 스킬 5개 · SessionStart 훅 2개를 넣는 가짜 모듈의 증가량이 그 파일들의 바이트 합과 같고 훅이 2 는다", async () => {
    const files = {
      ...BASIC_FILES,
      "optional/zz-m/module.json": JSON.stringify({
        schema: "knots-sync.module/v1", id: "zz-m", title: "x", summary: "x", kind: "external",
        requires: { modules: [], tools: [{ name: "zzm", versionCmd: ["zzm", "--version"], range: ">=1.0" }] },
        files: "layer", externalPaths: [".claude/rules/zzm-*", ".claude/skills/zzm-*/**"], externalHooks: ["zzm hook"],
        steps: { add: [{ run: ["zzm", "make"] }, { registerExternal: true }, { applyKit: true }], remove: [{ removeKit: true }] },
      }),
      "optional/zz-m/agents-rules/zzm-kit.md": "kit\n",
    };
    const templates = fixtureTemplates(files, { externalModules: ["zz-m"] });
    const target = path.join(tmpDir(), "acme");
    expect((await cli(target, ["init", "--yes", "--templates", templates, "--agents", "claude", "--no-register"], null)).code).toBe(0);
    const script = `#!/bin/bash
[ "$1" = "--version" ] && { echo "zzm 1.2.0"; exit 0; }
mkdir -p .claude/rules
printf 'rule one body\\n' > .claude/rules/zzm-1.md
printf '두번째 규칙 본문입니다\\n' > .claude/rules/zzm-2.md
for i in 1 2 3 4 5; do
  mkdir -p .claude/skills/zzm-$i
  printf -- '---\\nname: zzm-%s\\ndescription: 스킬 설명 %s\\n---\\n긴 본문은 세지 않는다\\n' $i $i > .claude/skills/zzm-$i/SKILL.md
done
printf '{"hooks":{"SessionStart":[{"matcher":"","hooks":[{"type":"command","command":"zzm hook a"},{"type":"command","command":"zzm hook b"}]}]}}\\n' > .claude/settings.json
`;
    const bin = makeBin({ zzm: script });
    const r = await cli(target, ["add", "zz-m", "--yes", "--json", "--templates", templates], bin);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    const rules = Buffer.byteLength("rule one body\n") + Buffer.byteLength("두번째 규칙 본문입니다\n");
    const skills = [1, 2, 3, 4, 5].reduce((s, i) => s + Buffer.byteLength(`zzm-${i}: 스킬 설명 ${i}`), 0);
    const m = r.json.measure;
    expect(m.before.owners["external:zzm"]).toBeUndefined();
    expect(m.after.owners["external:zzm"].bytes).toBe(rules + skills);
    expect(m.after.owners["external:zzm"]).toMatchObject({ rules: 2, skills: 5 });
    expect(m.after.hooks["external:zzm"].SessionStart).toBe(2);
    expect(m.added).toBeGreaterThanOrEqual(rules + skills);
    const human = await cli(target, ["doctor", "--templates", templates], bin);
    expect(human.stdout).toMatch(/세션마다 실리는 양\(claude\):.*external:zzm/);
  });
});

describe("측정 확인(MD-R16)", () => {
  const big = async (): Promise<{ target: string; templates: string; bin: Bin }> => {
    const files = {
      ...BASIC_FILES,
      "optional/zz-big/module.json": JSON.stringify({
        schema: "knots-sync.module/v1", id: "zz-big", title: "x", summary: "x", kind: "external",
        requires: { modules: [], tools: [{ name: "zzbig", versionCmd: ["zzbig", "--version"], range: ">=1.0" }] },
        files: "layer", externalPaths: [".claude/rules/zzbig-*"], config: { set: { "flow.record": "big" }, unset: { "flow.record": "none" } },
        steps: { add: [{ run: ["zzbig", "make"], confirm: true }, { registerExternal: true }, { applyKit: true }, { setConfig: true }], remove: [{ removeKit: true }, { unsetConfig: true }] },
      }),
      "optional/zz-big/agents-rules/zzbig-kit.md": "kit\n",
    };
    const templates = fixtureTemplates(files, { externalModules: ["zz-big"] });
    const target = path.join(tmpDir(), "acme");
    expect((await cli(target, ["init", "--yes", "--templates", templates, "--agents", "claude", "--no-register"], null)).code).toBe(0);
    const bin = makeBin({ zzbig: '#!/bin/bash\n[ "$1" = "--version" ] && { echo "zzbig 1.0.0"; exit 0; }\nmkdir -p .claude/rules\nprintf "%06000d" 0 > .claude/rules/zzbig-1.md\n' });
    return { target, templates, bin };
  };

  it("늘어난 양이 4,096바이트를 넘으면 TTY 에서 한 번 더 묻고, 아니오면 킷 몫을 빼고 exit 4 로 끝낸다(외부 파일은 남는다)", async () => {
    const { target, templates, bin } = await big();
    const r = await cli(target, ["add", "zz-big", "--templates", templates], bin, { tty: true, answers: ["y", "n"] });
    expect(r.code, r.stdout + r.stderr).toBe(4);
    expect(r.stdout).toContain("6,000바이트");
    expect(r.stdout).toContain("켜지 않기로 했다");
    expect(meta(target).modules).not.toContain("zz-big");
    expect(meta(target).flow.record).toBe("none");
    expect(fs.existsSync(path.join(target, ".agents/rules/zzbig-kit.md"))).toBe(false);
    expect(fs.existsSync(path.join(target, ".claude/rules/zzbig-1.md"))).toBe(true);
  });

  it("TTY 가 아니면 묻지 않고 경고 한 줄만 낸다. 외부 명령 확인은 --yes 가 없으면 exit 5 로 쓰기 전에 멈춘다", async () => {
    const { target, templates, bin } = await big();
    const noYes = await cli(target, ["add", "zz-big", "--templates", templates], bin);
    expect(noYes.code).toBe(5);
    expect(fs.existsSync(path.join(target, ".claude/rules/zzbig-1.md"))).toBe(false);
    const ok = await cli(target, ["add", "zz-big", "--yes", "--templates", templates], bin);
    expect(ok.code, ok.stdout + ok.stderr).toBe(0);
    expect(ok.stdout).toContain("4,096바이트를 넘는다");
    expect(meta(target).modules).toContain("zz-big");
  });
});

describe("init --modules 외부 도구 모듈 · update --tools", () => {
  it("init --modules aidlc,entire 는 킷을 깐 뒤 모듈 엔진으로 켠다. all 에는 들어가지 않는다", async () => {
    const bin = makeBin(tools(), { FAKE_VIS: "PRIVATE" });
    const target = path.join(tmpDir("hk-mod-"), "acme");
    fs.mkdirSync(target, { recursive: true });
    const r = await cli(target, ["init", "--yes", "--templates", REAL_TEMPLATES, "--stack", "python", "--agents", "claude", "--modules", "aidlc,entire", "--no-register", "--json"], bin);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(meta(target).modules).toEqual(["aidlc", "entire"]);
    expect(r.json.modulesResult.length).toBe(2);
    const plain = path.join(tmpDir("hk-mod-"), "acme");
    fs.mkdirSync(plain, { recursive: true });
    const all = await cli(plain, ["init", "--yes", "--templates", REAL_TEMPLATES, "--stack", "python", "--agents", "claude", "--modules", "all", "--no-register"], bin);
    expect(all.code).toBe(0);
    // all 은 킷 모듈 전부다(ci 포함 — 이름으로 고른 것과 같다). 외부 도구 모듈은 들지 않는다
    expect(meta(plain).modules).toEqual(["jira-workflow", "multi-harness", "ci"]);
  });

  it("update --tools: 에이전트 세션에서는 목록만, 범위 밖 최신 판은 --allow-unverified 없이는 올리지 않는다", async () => {
    const t = await installedRepo();
    const bin = makeBin(tools(), { FAKE_VIS: "PRIVATE", FAKE_AIDLC_LATEST: "2.12.0" });
    expect((await cli(t, ["add", "aidlc", "--yes", ...T], bin)).code).toBe(0);
    const list = await cli(t, ["update", "--tools", "--json", ...T], bin, { agent: "CLAUDECODE=1" });
    expect(list.code, list.stdout + list.stderr).toBe(0);
    expect(list.json.tools[0]).toMatchObject({ tool: "aidlc", current: "2.11.4", latest: "2.12.0", action: "listed" });
    expect(calls(bin).some((c) => c === "aidlc update")).toBe(false);
    const yes = await cli(t, ["update", "--tools", ...T], bin, { tty: true, answers: ["y"] });
    expect(yes.code).toBe(0);
    expect(calls(bin)).toContain("aidlc update");
    const bin2 = makeBin(tools(), { FAKE_AIDLC_LATEST: "3.0.0" });
    const blocked = await cli(t, ["update", "--tools", "--json", ...T], bin2, { tty: true, answers: ["y"] });
    expect(blocked.json.tools[0]).toMatchObject({ latest: "3.0.0", action: "blocked" });
  });
});
