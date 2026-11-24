// update 배치(HK-13 design §6.3, R5 · R8, 02 §3.10 mirror · render · merge).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exists, lockEntry, patchLock, readText, sha256Hex, writeTree } from "./helpers";
import { initWith, projectionTemplates } from "./projection-helpers";

const KT2 = '---\npaths:\n  - "src/**/*.kt"\n---\n# 코틀린 규칙 v2\n';
const SKILL2 = "---\nname: kns-plan\ndescription: 설계 — design.md 를 만든다\n---\n\n본문 v2 {{PROJECT_NAME}}\n";

function opOf(j: Record<string, any>, p: string): Record<string, any> | undefined {
  return (j.projection.ops as Record<string, any>[]).find((o) => o.path === p);
}

async function updated(edit: (target: string) => void, kit: Record<string, string> = {}, flags: string[] = [], agents = "all", drop: string[] = []) {
  const templates = projectionTemplates();
  const { target, cli } = await initWith(templates, agents);
  edit(target);
  const next = projectionTemplates(kit, drop);
  const r = await cli("update", ["--json", "--templates", next, ...flags]);
  return { target, r, j: JSON.parse(r.stdout) as Record<string, any>, cli, next };
}

describe("update 배치 판정", () => {
  it("원본이 바뀌면 고치지 않은 복사본 · 생성물은 update, 나머지는 same(lock 해시 갱신)", async () => {
    const { target, r, j } = await updated(() => {}, { "common/agents-rules/kt.md": KT2 });
    expect(r.code, r.stdout).toBe(0);
    expect(opOf(j, ".claude/rules/kt.md")?.action).toBe("update");
    expect(opOf(j, ".kiro/steering/kt.md")?.action).toBe("update");
    expect(opOf(j, ".cursor/rules/kt.mdc")?.action).toBe("update");
    expect(opOf(j, ".claude/rules/always.md")).toBeUndefined();
    expect(readText(target, ".claude/rules/kt.md")).toBe(KT2);
    const e = lockEntry(target, ".kiro/steering/kt.md");
    expect(e).toMatchObject({ op: "render", fromSha256: sha256Hex(KT2), sha256: sha256Hex(readText(target, ".kiro/steering/kt.md")) });
  });

  it("생성 파일을 사람이 고쳤으면 conflict · .new, --accept-all 이면 .bak(exit 4 · 0)", async () => {
    const edit = (t: string) => fs.appendFileSync(path.join(t, ".kiro/steering/kt.md"), "사람 줄\n");
    const { target, r, j } = await updated(edit, { "common/agents-rules/kt.md": KT2 });
    expect(r.code).toBe(4);
    expect(opOf(j, ".kiro/steering/kt.md")).toMatchObject({ action: "conflict", new: ".kiro/steering/kt.md.new" });
    expect(readText(target, ".kiro/steering/kt.md")).toContain("사람 줄");
    expect(readText(target, ".kiro/steering/kt.md.new")).toContain("v2");
    expect(j.conflicts.map((c: { path: string }) => c.path)).toContain(".kiro/steering/kt.md");
    const all = await updated(edit, { "common/agents-rules/kt.md": KT2 }, ["--accept-all"]);
    expect(all.r.code, all.r.stdout).toBe(0);
    expect(readText(all.target, ".kiro/steering/kt.md.bak")).toContain("사람 줄");
    expect(readText(all.target, ".kiro/steering/kt.md")).toContain("v2");
  });

  it("mirror 폴더를 고쳤으면 conflict 이고 다른 파일마다 .new 만 쓴다", async () => {
    const { target, r, j } = await updated((t) => fs.appendFileSync(path.join(t, ".claude/skills/kns-plan/SKILL.md"), "사람\n"), { "common/agents-skills/kns-plan/SKILL.md": SKILL2 });
    expect(r.code).toBe(4);
    expect(opOf(j, ".claude/skills/kns-plan")?.action).toBe("conflict");
    expect(readText(target, ".claude/skills/kns-plan/SKILL.md")).toContain("사람");
    expect(readText(target, ".claude/skills/kns-plan/SKILL.md.new")).toContain("본문 v2");
    expect(exists(target, ".claude/skills/kns-plan/tool.sh.new")).toBe(false);
    expect(opOf(j, ".kiro/skills/kns-plan")?.action).toBe("update");
  });

  it("원본을 지우면(--prune) 고치지 않은 생성물도 지운다", async () => {
    const { target, r, j } = await updated(() => {}, {}, ["--prune"], "all", ["common/agents-rules/multi.md"]);
    expect(r.code, r.stdout).toBe(0);
    expect(exists(target, ".agents/rules/multi.md")).toBe(false);
    for (const p of [".claude/rules/multi.md", ".cursor/rules/multi.mdc", ".kiro/steering/multi.md"]) {
      expect(exists(target, p), p).toBe(false);
      expect(opOf(j, p)?.action).toBe("delete");
      expect(lockEntry(target, p)).toBeUndefined();
    }
  });

  it("복사본 자리가 링크면 실제 파일로 바꾼다(symlink-found)", async () => {
    const { target, r, j } = await updated((t) => {
      fs.rmSync(path.join(t, ".claude/rules/kt.md"));
      fs.symlinkSync("../../.agents/rules/kt.md", path.join(t, ".claude/rules/kt.md"));
    });
    expect(r.code, r.stdout).toBe(0);
    expect(opOf(j, ".claude/rules/kt.md")).toMatchObject({ action: "replace", reason: "symlink-found" });
    expect(fs.lstatSync(path.join(target, ".claude/rules/kt.md")).isSymbolicLink()).toBe(false);
  });
});

describe("v1 포인터 → 복사본 · 생성물(R8)", () => {
  const POINTER = "---\ninclusion: always\n---\n# kt (포인터)\n원본: `.agents/rules/kt.md`\n";
  const CMD = "---\ndescription: 설계\n---\n\n`.agents/skills/kns-plan/SKILL.md`를 읽고 그대로 수행한다.\n";
  const KIRO_SKILL = "---\nname: kns-plan\ndescription: 설계\n---\n\n`.agents/skills/kns-plan/SKILL.md`를 읽고 그대로 수행한다.\n";

  /** init 한 리포를 v1 포인터 상태로 되돌린다(lock 은 copy 항목). */
  function toV1(t: string, opts: { editSkill?: boolean } = {}) {
    fs.rmSync(path.join(t, ".kiro/skills/kns-plan"), { recursive: true });
    writeTree(t, { ".kiro/steering/kt.md": POINTER, ".claude/commands/kns-plan.md": CMD, ".claude/commands/kns-mine.md": CMD, ".kiro/skills/kns-plan/SKILL.md": KIRO_SKILL });
    patchLock(t, {
      ".kiro/steering/kt.md": { op: "copy", owner: "kit", sha256: sha256Hex(POINTER), layer: "common", from: undefined, fromSha256: undefined },
      ".claude/commands/kns-plan.md": { op: "copy", owner: "kit", sha256: sha256Hex(CMD), layer: "common" },
      ".claude/commands/kns-mine.md": { op: "copy", owner: "kit", sha256: sha256Hex(CMD), layer: "common" },
      ".kiro/skills/kns-plan": null,
      ".kiro/skills/kns-plan/SKILL.md": { op: "copy", owner: "kit", sha256: sha256Hex(KIRO_SKILL), layer: "common" },
    });
    fs.appendFileSync(path.join(t, ".claude/commands/kns-mine.md"), "사람이 고친 커맨드\n");
    if (opts.editSkill) fs.appendFileSync(path.join(t, ".kiro/skills/kns-plan/SKILL.md"), "사람\n");
  }

  it("고치지 않은 포인터는 생성물 · 복사본으로, .claude/commands 포인터는 지운다(retire)", async () => {
    const { target, r, j } = await updated((t) => toV1(t));
    expect(r.code, r.stdout).toBe(4); // 고친 커맨드 하나를 남긴다
    expect(opOf(j, ".kiro/steering/kt.md")?.action).toBe("update");
    expect(readText(target, ".kiro/steering/kt.md")).toContain("inclusion: fileMatch");
    expect(opOf(j, ".kiro/skills/kns-plan")?.action).toBe("update");
    expect(readText(target, ".kiro/skills/kns-plan/SKILL.md")).toBe(readText(target, ".agents/skills/kns-plan/SKILL.md"));
    expect(exists(target, ".claude/commands/kns-plan.md")).toBe(false);
    expect(opOf(j, ".claude/commands/kns-plan.md")?.action).toBe("retire");
    expect(opOf(j, ".claude/commands/kns-mine.md")?.action).toBe("keep-modified");
    expect(lockEntry(target, ".claude/commands/kns-mine.md")).toMatchObject({ owner: "user", sha256: null });
    expect(lockEntry(target, ".kiro/skills/kns-plan/SKILL.md")).toBeUndefined();
    expect(lockEntry(target, ".kiro/skills/kns-plan")).toMatchObject({ op: "mirror", owner: "kit" });
  });

  it("사람이 고친 포인터는 그대로 두고 새 판을 .new 로(R8)", async () => {
    const { target, r, j } = await updated((t) => toV1(t, { editSkill: true }));
    expect(r.code).toBe(4);
    expect(opOf(j, ".kiro/skills/kns-plan")?.action).toBe("conflict");
    expect(readText(target, ".kiro/skills/kns-plan/SKILL.md")).toContain("사람");
    expect(readText(target, ".kiro/skills/kns-plan/SKILL.md.new")).toBe(readText(target, ".agents/skills/kns-plan/SKILL.md"));
  });

  it("v1 CLAUDE.md: 킷 판 그대로면 @AGENTS.md + 블록으로 바꾸고, 고쳤으면 CLAUDE.md.new(03 §3.8)", async () => {
    const V1 = "# CLAUDE.md\n\n먼저 `AGENTS.md`를 읽는다.\n";
    const asV1 = (t: string, edited: boolean) => {
      writeTree(t, { "CLAUDE.md": V1 + (edited ? "사람 줄\n" : "") });
      patchLock(t, { "CLAUDE.md": { op: "copy", owner: "kit", sha256: sha256Hex(V1), layer: "stacks/jvm", keys: undefined, createdByKit: undefined } });
    };
    const same = await updated((t) => asV1(t, false), {}, [], "claude");
    expect(same.r.code, same.r.stdout).toBe(0);
    expect(readText(same.target, "CLAUDE.md").startsWith("@AGENTS.md\n\n<!-- knots-sync:begin claude")).toBe(true);
    expect(lockEntry(same.target, "CLAUDE.md")).toMatchObject({ op: "merge", createdByKit: true });
    const mine = await updated((t) => asV1(t, true), {}, [], "claude");
    expect(mine.r.code).toBe(4);
    expect(readText(mine.target, "CLAUDE.md")).toBe(`${V1}사람 줄\n`);
    expect(readText(mine.target, "CLAUDE.md.new").startsWith("@AGENTS.md\n\n")).toBe(true);
    expect(lockEntry(mine.target, "CLAUDE.md")).toMatchObject({ op: "copy", sha256: sha256Hex(V1) });
  });
});
