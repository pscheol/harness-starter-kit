// 개인 층(설계 04 §3.6 · §5 #2, HK-14 design §5): 설정 키 제한 · 개인 스킬 · 규칙 · 훅 배치 · 개인 lock · .git/info/exclude.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readLocalConfig, readLocalModelPolicy } from "../src/core/local";
import { initWith, projectionTemplates } from "./projection-helpers";
import { json, readTree, writeTree } from "./helpers";

const HOOK = (id: string): Record<string, unknown> => ({ id, event: "stop", script: "scripts/hooks/my.sh", timeoutSec: 5, owner: "user" });

async function installed() {
  const templates = projectionTemplates();
  const t = await initWith(templates);
  spawnSync("git", ["init", "-q"], { cwd: t.target });
  return { ...t, templates, local: (sub: string, extra: string[] = []) => t.cli("local", [sub, "--json", "--templates", templates, ...extra]) };
}

describe("개인 설정", () => {
  it("roles.<역할>.harness · git.ide 만 받고 나머지는 무시 → doctor personal-ignored(04 §5 #2)", async () => {
    const t = await installed();
    writeTree(t.target, { ".agents/local/harness-kit.local.json": JSON.stringify({ roles: { review: { harness: "claude", model: "opus" } }, git: { ide: "idea", base: "main" }, verify: { fullOnlyInCI: false }, flow: { gates: [] } }) });
    const c = readLocalConfig(t.target);
    expect(c.roles).toEqual({ review: "claude" });
    expect(c.ide).toBe("idea");
    expect(c.ignored).toEqual(["roles.review.model", "git.base", "verify.fullOnlyInCI", "flow.gates"]);
    const f = json(await t.cli("doctor", ["--json", "--only", "personal-ignored"])).findings as { hint: string }[];
    expect(f.map((x) => x.hint.split(" — ")[0])).toEqual(["roles.review.model", "git.base", "verify.fullOnlyInCI", "flow.gates"]);
    // 개인 설정은 공유 메타의 하한을 바꾸지 않는다
    expect(json(await t.cli("doctor", ["--json", "--only", "gate-floor,full-allowed"])).findings).toEqual([]);
  });

  it("개인 모델 등급은 잠기지 않은 classes 만 받는다 — locked · 다른 키 · 틀린 값은 doctor 경고(설계 12 §5 #4 · MR-R7)", async () => {
    const t = await installed();
    writeTree(t.target, { ".agents/local/model-policy.local.json": JSON.stringify({ classes: { explore: "standard", implement: "light", summarize: "huge" }, locked: [] }) });
    const m = readLocalModelPolicy(t.target);
    expect(m.classes).toEqual({ explore: "standard" });
    expect(m.ignored.map((i) => i.key)).toEqual(["classes.implement", "classes.summarize", "locked"]);
    const f = json(await t.cli("doctor", ["--json", "--only", "personal-ignored"])).findings as { path: string; hint: string }[];
    expect(f.filter((x) => x.path === ".agents/local/model-policy.local.json").map((x) => x.hint.split(" — ")[0])).toEqual(["classes.implement", "classes.summarize", "locked"]);
    const o = json(await t.cli("doctor", ["--json", "--only", "overrides"])) as { overrides: { target: string; value?: string }[] };
    expect(o.overrides.find((x) => x.target === "model-policy.classes.explore")?.value).toBe("standard");
  });

  it("깨진 개인 설정은 local-invalid, disableAllHooks 는 personal-weakens", async () => {
    const t = await installed();
    writeTree(t.target, { ".agents/local/harness-kit.local.json": "{ 깨짐", ".claude/settings.local.json": JSON.stringify({ disableAllHooks: true }) });
    const kinds = (json(await t.cli("doctor", ["--json"])).findings as { kind: string }[]).map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(["local-invalid", "personal-weakens"]));
  });
});

describe("local sync", () => {
  it("개인 스킬 · 규칙 · 훅을 배치하고 공유 lock 은 그대로, exclude 블록에 적는다", async () => {
    const t = await installed();
    const lockBefore = fs.readFileSync(path.join(t.target, ".agents/harness-kit.lock"), "utf8");
    writeTree(t.target, {
      ".agents/local/skills/my-notes/SKILL.md": "---\nname: my-notes\ndescription: 내 메모\n---\n\n본문\n",
      ".agents/local/skills/hx-plan/SKILL.md": "---\nname: hx-plan\ndescription: 겹침\n---\n",
      ".agents/local/rules/my-style.md": "# 내 글 규칙\n",
      ".agents/local/rules/always.md": "# 겹침\n",
      ".agents/local/hooks.json": JSON.stringify({ schema: "harness-kit.hooks/v1", hooks: [HOOK("harness-my-notify"), HOOK("harness-verify-gate"), HOOK("harness-session-idle")] }),
    });
    const r = await t.local("sync");
    expect(r.code, r.stdout).toBe(4);
    const out = json(r);
    expect(out.written).toEqual(
      expect.arrayContaining([".claude/skills/my-notes/SKILL.md", ".kiro/skills/my-notes/SKILL.md", ".kiro/steering/local-my-style.md", ".kiro/hooks/local-harness-my-notify.json"]),
    );
    expect(out.findings.map((f: { kind: string }) => f.kind)).toEqual(expect.arrayContaining(["personal-shadowed", "personal-floor"]));
    expect(fs.existsSync(path.join(t.target, ".claude/skills/hx-plan/SKILL.md")) && fs.readFileSync(path.join(t.target, ".claude/skills/hx-plan/SKILL.md"), "utf8")).not.toContain("겹침");
    const local = JSON.parse(fs.readFileSync(path.join(t.target, ".claude/settings.local.json"), "utf8"));
    expect(JSON.stringify(local)).toContain("harness-my-notify");
    expect(JSON.stringify(local)).not.toContain("harness-verify-gate");
    expect(fs.readFileSync(path.join(t.target, ".agents/harness-kit.lock"), "utf8")).toBe(lockBefore);
    const exclude = fs.readFileSync(path.join(t.target, ".git/info/exclude"), "utf8");
    expect(exclude).toContain("# harness-kit local begin\n");
    expect(exclude).toContain("/.claude/skills/my-notes/SKILL.md\n");
    expect(exclude).toContain("/.claude/settings.local.json\n");
    const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all", ".claude/skills/my-notes", ".kiro/steering"], { cwd: t.target, encoding: "utf8" }).stdout;
    expect(status).not.toContain("my-notes");
    expect(status).not.toContain("local-my-style");
    // 두 번째는 쓸 것이 없다
    const again = json(await t.local("sync"));
    expect(again.written).toEqual([]);
  });

  it("개인 파일을 빼면 고치지 않은 배치는 지우고, 고친 배치는 남긴다 · 개인 훅이 없으면 settings.local.json 에서 뺀다", async () => {
    const t = await installed();
    writeTree(t.target, {
      ".agents/local/skills/my-notes/SKILL.md": "---\nname: my-notes\ndescription: 내 메모\n---\n",
      ".agents/local/rules/my-style.md": "# 내 글 규칙\n",
      ".agents/local/hooks.json": JSON.stringify({ schema: "harness-kit.hooks/v1", hooks: [HOOK("harness-my-notify")] }),
    });
    expect((await t.local("sync")).code).toBe(0);
    fs.appendFileSync(path.join(t.target, ".kiro/steering/local-my-style.md"), "손\n");
    fs.rmSync(path.join(t.target, ".agents/local/skills"), { recursive: true });
    fs.rmSync(path.join(t.target, ".agents/local/rules"), { recursive: true });
    fs.rmSync(path.join(t.target, ".agents/local/hooks.json"));
    const r = json(await t.local("sync"));
    expect(r.removed).toEqual(expect.arrayContaining([".claude/skills/my-notes/SKILL.md", ".kiro/skills/my-notes/SKILL.md", ".kiro/hooks/local-harness-my-notify.json"]));
    expect(r.kept).toEqual([".kiro/steering/local-my-style.md"]);
    expect(r.settings).toBe("unmerged");
    expect(fs.existsSync(path.join(t.target, ".claude/skills/my-notes"))).toBe(false);
    expect(fs.existsSync(path.join(t.target, ".claude/settings.local.json"))).toBe(false);
  });

  it("local list 는 쓰지 않고, update 는 개인 층이 있을 때만 다시 배치한다", async () => {
    const t = await installed();
    writeTree(t.target, { ".agents/local/skills/my-notes/SKILL.md": "---\nname: my-notes\ndescription: 내 메모\n---\n" });
    const before = readTree(t.target);
    expect(json(await t.local("list")).written).toEqual([".claude/skills/my-notes/SKILL.md", ".kiro/skills/my-notes/SKILL.md"]);
    expect(readTree(t.target)).toEqual(before);
    const up = await t.cli("update", ["--json", "--templates", t.templates]);
    expect(up.code, up.stdout).toBe(0);
    expect(json(up).local.written).toEqual([".claude/skills/my-notes/SKILL.md", ".kiro/skills/my-notes/SKILL.md"]);
    expect((await t.local("bogus")).code).toBe(2);
  });
});
