// doctor --only overrides(설계 04 §3.10 · §5 #6, HK-14 design §7): 이긴 층이 킷이 아닌 경로 · 항목 수 = overrides 수.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initWith, projectionTemplates } from "./projection-helpers";
import { json, META_FILE, readJsonFile, tmpDir, writeJsonFile, writeTree } from "./helpers";

function pack(dir: string): void {
  writeTree(dir, {
    "pack.json": JSON.stringify({ schema: "knots-sync.pack/v1", name: "acme", version: "1.2.0", requires: { kit: ">=2.0.0 <3.0.0" }, provides: { rules: ["acme-security"] }, overrides: [".agents/rules/always.md"] }),
    "common/agents-rules/acme-security.md": "# acme\n",
    "common/agents-rules/always.md": "# 팩 판\n",
  });
}

describe("doctor --only overrides", () => {
  it("팩 · 사람 · 프로젝트 항목 · 개인 역할이 이긴 곳을 세고, 무시한 개인 설정 · 하한 위반을 함께 낸다(04 §5 #6)", async () => {
    const templates = projectionTemplates();
    const t = await initWith(templates);
    const dir = path.join(tmpDir("hk-ovr-"), "pack");
    pack(dir);
    const meta = path.join(t.target, META_FILE);
    writeJsonFile(meta, { ...readJsonFile(meta), packs: [`file:${dir}`], roles: { review: { harness: "codex" } } });
    expect((await t.cli("update", ["--packs", "--json", "--templates", templates])).code).toBe(0);
    fs.appendFileSync(path.join(t.target, ".agents/rules/kt.md"), "사람 줄\n");
    writeTree(t.target, {
      ".agents/hooks.d/project.json": JSON.stringify({ schema: "knots-sync.hooks/v1", hooks: [{ id: "harness-session-idle", event: "stop", script: "scripts/hooks/session-register.sh", timeoutSec: 30, owner: "user" }, { id: "harness-verify-gate", event: "stop", script: "scripts/hooks/x.sh", timeoutSec: 5, owner: "user" }] }),
      ".agents/local/knots-sync.local.json": JSON.stringify({ roles: { review: { harness: "claude" } }, verify: { fullOnlyInCI: false } }),
    });
    const r = await t.cli("doctor", ["--only", "overrides", "--json", "--templates", templates]);
    expect(r.code).toBe(0);
    const out = json(r);
    expect(out.overrides.map((o: { target: string; winner: string }) => `${o.target} ${o.winner}`)).toEqual([
      ".agents/hooks.json#harness-session-idle user",
      ".agents/rules/always.md pack:acme@1.2.0",
      ".agents/rules/kt.md user",
      "roles.review.harness local",
    ]);
    expect(out.overrides.find((o: { target: string }) => o.target === ".agents/rules/always.md").declared).toBe(true);
    expect(out.overrides.find((o: { target: string }) => o.target === "roles.review.harness")).toMatchObject({ value: "claude", losers: [{ layer: "project", value: "codex" }] });
    expect(out.ignoredPersonal).toEqual([{ key: "verify.fullOnlyInCI", file: ".agents/local/knots-sync.local.json" }]);
    expect(out.floorViolations).toEqual([{ kind: "floor-override", target: ".agents/hooks.d/project.json#harness-verify-gate" }]);
    expect((await t.cli("doctor", ["--only", "overrides", "--check", "--templates", templates])).code).toBe(1);
    const human = await t.cli("doctor", ["--only", "overrides", "--templates", templates]);
    expect(human.stdout).toContain("덮어쓴 것 4건 (이긴 층 ← 진 층)");
    expect(human.stdout).toContain("(overrides 선언)");
  });

  it("새 설치는 덮어쓴 것 0건 · 하한 0건", async () => {
    const templates = projectionTemplates();
    const t = await initWith(templates);
    const out = json(await t.cli("doctor", ["--only", "overrides", "--json", "--templates", templates]));
    expect(out).toMatchObject({ overrides: [], ignoredPersonal: [], floorViolations: [] });
  });
});
