// 옛 이름(harness-kit) 리포 — 상태 파일 이름 · schema · hx- 킷 스킬(HK-22b).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BASIC_FILES, exists, installedFixture, json, LOCK_FILE, META_FILE, readJsonFile, sha256Hex, writeJsonFile } from "./helpers";

const OLD_META = ".agents/harness-kit.json";
const OLD_LOCK = ".agents/harness-kit.lock";
const SKILL = "---\nname: kns-plan\ndescription: 설계\n---\n본문\n";
const OLD_SKILL = "---\nname: hx-plan\ndescription: 설계\n---\n본문\n";
const FILES = { ...BASIC_FILES, "common/agents-skills/kns-plan/SKILL.md": SKILL };

/** 새 판으로 깐 뒤 상태 파일을 옛 이름 · 옛 schema 로 되돌린다(v2-alpha 리포를 흉내 낸다). */
async function legacyInstall() {
  const fx = await installedFixture({ files: FILES });
  const meta = readJsonFile(path.join(fx.target, META_FILE));
  const lock = readJsonFile(path.join(fx.target, LOCK_FILE));
  writeJsonFile(path.join(fx.target, OLD_META), { ...meta, schema: "harness-kit/v2" });
  writeJsonFile(path.join(fx.target, OLD_LOCK), { ...lock, schema: "harness-kit.lock/v2" });
  fs.rmSync(path.join(fx.target, META_FILE));
  fs.rmSync(path.join(fx.target, LOCK_FILE));
  return fx;
}

describe("옛 이름 상태 파일", () => {
  it("doctor 는 옛 파일을 읽고 legacy-names 를 알리며 아무것도 옮기지 않는다", async () => {
    const { target, cli } = await legacyInstall();
    const r = await cli("doctor", ["--json"]);
    const kinds = (json(r).findings as { kind: string; path: string }[]).filter((f) => f.kind === "legacy-names").map((f) => f.path);
    expect(kinds.sort()).toEqual([OLD_META, OLD_LOCK].sort());
    expect([exists(target, OLD_META), exists(target, OLD_LOCK), exists(target, META_FILE)]).toEqual([true, true, false]);
  });

  it("update --dry-run 은 옮기지 않고, update 는 새 이름 · 새 schema 로 쓰고 옛 파일을 남기지 않는다", async () => {
    const { target, templates, cli } = await legacyInstall();
    const dry = await cli("update", ["--dry-run", "--json", "--templates", templates]);
    expect(dry.code, dry.stdout + dry.stderr).toBe(0);
    expect([exists(target, OLD_META), exists(target, META_FILE)]).toEqual([true, false]);
    const r = await cli("update", ["--json", "--templates", templates]);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect([exists(target, OLD_META), exists(target, OLD_LOCK)]).toEqual([false, false]);
    expect(readJsonFile(path.join(target, META_FILE)).schema).toBe("knots-sync/v2");
    expect(readJsonFile(path.join(target, LOCK_FILE)).schema).toBe("knots-sync.lock/v2");
  });

  it("init 은 옛 이름 메타가 있으면 이미 설치된 리포로 본다", async () => {
    const { templates, cli } = await legacyInstall();
    const r = await cli("init", ["--yes", "--templates", templates, "--agents", "claude"]);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain(OLD_META);
  });
});

describe("옛 hx- 킷 스킬", () => {
  it("고치지 않은 hx- 스킬은 --prune 없이 지우고, 고친 것은 남겨 알린다", async () => {
    const { target, templates, cli } = await installedFixture({ files: FILES });
    const lockFile = path.join(target, LOCK_FILE);
    const lock = readJsonFile(lockFile);
    const mine = "---\nname: hx-mine\n---\n고친 본문\n";
    fs.mkdirSync(path.join(target, ".agents/skills/hx-plan"), { recursive: true });
    fs.mkdirSync(path.join(target, ".agents/skills/hx-mine"), { recursive: true });
    fs.writeFileSync(path.join(target, ".agents/skills/hx-plan/SKILL.md"), OLD_SKILL);
    fs.writeFileSync(path.join(target, ".agents/skills/hx-mine/SKILL.md"), mine);
    const old = (p: string, sha: string) => ({ path: p, op: "copy", owner: "kit", sha256: sha, layer: "common" });
    lock.entries.push(old(".agents/skills/hx-plan/SKILL.md", sha256Hex(OLD_SKILL)), old(".agents/skills/hx-mine/SKILL.md", sha256Hex("원래 판\n")));
    writeJsonFile(lockFile, lock);
    const r = await cli("update", ["--json", "--templates", templates]);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    const ops = new Map((json(r).ops as { path: string; action: string }[]).map((o) => [o.path, o.action]));
    expect(ops.get(".agents/skills/hx-plan/SKILL.md")).toBe("delete");
    expect(ops.get(".agents/skills/hx-mine/SKILL.md")).toBe("orphan");
    expect(exists(target, ".agents/skills/hx-plan/SKILL.md")).toBe(false);
    expect(exists(target, ".agents/skills/hx-mine/SKILL.md")).toBe(true);
    expect(exists(target, ".agents/skills/kns-plan/SKILL.md")).toBe(true);
  });
});


describe("생성 구간(보드)만 다른 킷 파일", () => {
  const INDEX = "# 보드\n\n<!-- BOARD:BEGIN — scripts/board.sh 가 생성합니다. -->\n(비어 있음)\n<!-- BOARD:END -->\n\n끝\n";
  const files = { ...BASIC_FILES, "common/agents-docs/specs-index.md": INDEX };

  it("보드 구간만 바뀌었으면 update 가 충돌로 보지 않고 그대로 둔다. 구간 밖을 고쳤으면 .new 로 받는다", async () => {
    const { target, templates, cli } = await installedFixture({ files });
    const file = path.join(target, ".agents/docs/specs-index.md");
    const board = INDEX.replace("(비어 있음)", "| DEMO-1 | 요구 |");
    fs.writeFileSync(file, board);
    const r = await cli("update", ["--json", "--templates", templates]);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toBe(board);
    expect(exists(target, ".agents/docs/specs-index.md.new")).toBe(false);
    fs.writeFileSync(file, `${board}사람이 더한 줄\n`);
    const again = await cli("update", ["--json", "--templates", templates]);
    expect(again.code).toBe(4);
    expect(exists(target, ".agents/docs/specs-index.md.new")).toBe(true);
  });
});
