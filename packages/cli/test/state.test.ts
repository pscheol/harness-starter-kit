// json · 메타 · lock 형식.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatJson } from "../src/core/json";
import { parseLockText, serializeLock, v1LabelToLayer, type LockV2 } from "../src/core/lock";
import { buildMeta, readMeta, serializeMeta } from "../src/core/meta";
import { tmpDir } from "./helpers";

describe("formatJson", () => {
  it("스칼라 배열은 한 줄, 객체 배열은 항목마다 한 줄, 끝 줄바꿈", () => {
    const text = formatJson({ a: 1, b: ["x", "y"], c: { d: [], e: {} }, f: [{ p: "x", q: [1, null] }, { p: "y" }], g: "한글" });
    expect(text).toBe(
      [
        "{",
        '  "a": 1,',
        '  "b": ["x", "y"],',
        '  "c": {',
        '    "d": [],',
        '    "e": {}',
        "  },",
        '  "f": [',
        '    {"p": "x", "q": [1, null]},',
        '    {"p": "y"}',
        "  ],",
        '  "g": "한글"',
        "}",
        "",
      ].join("\n"),
    );
    expect(JSON.parse(text)).toBeTruthy();
  });
});

const TOKENS = {
  PROJECT_NAME: "Acme Notes",
  PROJECT_SLUG: "acme-notes",
  PACKAGE_NS: "",
  SERVICE_NAME: "acme-notes",
  PRIMARY_LANGUAGE: "Kotlin/Java",
  BUILD_TOOL: "Gradle",
  TEST_CMD: "./gradlew check",
  DOMAIN_EXAMPLE: "",
  PROTECTED_PATH: "docs/references",
};

const SELECTION = {
  stack: "jvm",
  arch: "hexagonal",
  domain: "backend",
  lang: null,
  agents: ["claude", "codex"],
  agentsOrigin: "flag" as const,
  modules: [],
};

describe("메타 v2", () => {
  const meta = buildMeta({ version: "2.0.0-alpha.0", selection: SELECTION, tokens: TOKENS, issue: {}, base: undefined, today: "2026-11-23" });

  it("v1.1 기본값과 README §5 순서", () => {
    expect(meta).toMatchObject({
      schema: "harness-kit/v2",
      kit: { version: "2.0.0-alpha.0" },
      project: { name: "Acme Notes", slug: "acme-notes" },
      issueKey: { source: "kit", prefix: "ACME-NOTES" },
      git: { base: "develop" },
      verify: { fullOnlyInCI: true },
      packs: [],
      tokens: TOKENS,
      installedAt: "2026-11-23",
      updatedAt: "2026-11-23",
    });
    expect(Object.keys(meta)).toEqual([
      "schema", "kit", "project", "stack", "arch", "domain", "agents", "modules", "flow", "issueKey", "git", "packs", "verify", "tokens", "installedAt", "updatedAt",
    ]);
    expect((meta.flow as { gates: string[] }).gates).toHaveLength(9);
  });

  it("이슈 키 · base 플래그", () => {
    const m = buildMeta({ version: "2", selection: SELECTION, tokens: TOKENS, issue: { source: "jira", prefix: "KNOTS" }, base: "main", today: "2026-11-23" });
    expect(m.issueKey).toEqual({ source: "jira", prefix: "KNOTS" });
    expect((m.git as { base: string }).base).toBe("main");
  });

  it("쓰기: 모르는 키는 뒤에 보존, 배열은 한 줄(v1 sed 가 읽는다)", () => {
    const text = serializeMeta({ zeta: 1, ...meta, roles: { review: { harness: "codex" } } });
    const keys = Object.keys(JSON.parse(text) as object);
    expect(keys.indexOf("roles")).toBeGreaterThan(keys.indexOf("flow"));
    expect(keys.indexOf("roles")).toBeLessThan(keys.indexOf("issueKey"));
    expect(keys.at(-1)).toBe("zeta");
    expect(text).toContain('  "agents": ["claude", "codex"],\n');
    // harness_meta_list 의 sed 식과 같은 정규식
    expect(/"agents"\s*:\s*\[([^\]]*)\]/.exec(text)?.[1]).toBe('"claude", "codex"');
    expect(/"stack"\s*:\s*"([^"]*)"/.exec(text)?.[1]).toBe("jvm");
  });

  it("읽기: v2 · v1(setup.sh) · 없음 · 깨짐", () => {
    const dir = tmpDir();
    const file = path.join(dir, "harness-kit.json");
    expect(readMeta(file).status).toBe("missing");
    fs.writeFileSync(file, serializeMeta(meta));
    const v2 = readMeta(file);
    expect(v2).toMatchObject({ status: "ok", schema: "v2" });
    fs.writeFileSync(
      file,
      JSON.stringify({ kitVersion: "1.0.8", domain: "backend", stack: "jvm", arch: "hexagonal", agents: ["claude"], modules: [], installedAt: "2026-11-01", updatedAt: "2026-11-02", tokens: TOKENS }),
    );
    const v1 = readMeta(file);
    expect(v1.status).toBe("ok");
    if (v1.status !== "ok") return;
    expect(v1.schema).toBe("v1");
    expect(v1.meta).toMatchObject({
      schema: "harness-kit/v2",
      kit: { version: "1.0.8" },
      project: { name: "Acme Notes", slug: "acme-notes" },
      issueKey: { source: "kit", prefix: "ACME-NOTES" },
      git: { base: "develop" },
      verify: { fullOnlyInCI: true },
      installedAt: "2026-11-01",
    });
    fs.writeFileSync(file, "{ 깨진");
    expect(readMeta(file).status).toBe("invalid");
    fs.writeFileSync(file, JSON.stringify({ schema: "harness-kit/v9" }));
    expect(readMeta(file).status).toBe("invalid");
    fs.writeFileSync(file, JSON.stringify({ schema: "harness-kit/v2", stack: 3 }));
    expect(readMeta(file).status).toBe("invalid");
  });
});

describe("lock", () => {
  const lock: LockV2 = {
    schema: "harness-kit.lock/v2",
    kit: { version: "2.0.0", source: "npm:harness-kit@2.0.0" },
    packs: [],
    entries: [
      { path: "b.md", op: "copy", owner: "kit", sha256: "b".repeat(64), layer: "common" },
      { path: ".agents/a.md", op: "copy", owner: "user", sha256: null, layer: "stacks/jvm" },
    ],
  };

  it("v2 쓰기: 경로 사전순, 항목 한 줄, 키 순서 path · op · owner · sha256 · layer", () => {
    const text = serializeLock(lock);
    expect(text).toContain('    {"path": ".agents/a.md", "op": "copy", "owner": "user", "sha256": null, "layer": "stacks/jvm"},\n');
    expect(text.indexOf(".agents/a.md")).toBeLessThan(text.indexOf('"b.md"'));
    const back = parseLockText(text);
    expect(back.format).toBe("v2");
    expect(back.lock.entries.map((e) => e.path)).toEqual([".agents/a.md", "b.md"]);
  });

  it("v1 라벨 → v2 layer", () => {
    expect(v1LabelToLayer("common")).toBe("common");
    expect(v1LabelToLayer("frontend")).toBe("domains/frontend");
    expect(v1LabelToLayer("backend")).toBe("domains/backend");
    expect(v1LabelToLayer("jvm")).toBe("stacks/jvm");
    expect(v1LabelToLayer("jvm/hexagonal")).toBe("stacks/jvm/arch/hexagonal");
    expect(v1LabelToLayer("mod/platform-guards")).toBe("optional/platform-guards");
  });

  it("v1 읽기: 주석 · 빈 줄 · '-' 해시 · 겹치는 경로(뒤 layer, 앞 sha)", () => {
    const a = "a".repeat(64);
    const c = "c".repeat(64);
    const text = [
      "# harness-kit lock v1 — sha256<TAB>layer<TAB>agent<TAB>path",
      `${a}\tcommon\tcore\tscripts/guards/_template.sh`,
      "",
      "# 주석",
      `-\tjvm/hexagonal\tcore\tARCHITECTURE.md`,
      `${c}\tmod/platform-guards\tcore\tscripts/guards/_template.sh`,
      `${c}\tjvm\tclaude\tCLAUDE.md`,
      "",
    ].join("\n");
    const { format, lock: v } = parseLockText(text);
    expect(format).toBe("v1");
    expect(v.kit.version).toBeNull();
    expect(v.entries).toEqual([
      { path: "ARCHITECTURE.md", op: "copy", owner: "kit", sha256: null, layer: "stacks/jvm/arch/hexagonal" },
      { path: "CLAUDE.md", op: "copy", owner: "kit", sha256: c, layer: "stacks/jvm" },
      { path: "scripts/guards/_template.sh", op: "copy", owner: "kit", sha256: a, layer: "optional/platform-guards" },
    ]);
  });

  it("해석할 수 없는 lock 은 거부한다", () => {
    expect(() => parseLockText("# harness-kit lock v1\nabc\tcommon\n")).toThrow();
    expect(() => parseLockText('{"schema": "harness-kit.lock/v9", "entries": []}')).toThrow();
    expect(() => parseLockText('{"schema": "harness-kit.lock/v2", "entries": [{"op": "copy"}]}')).toThrow();
    expect(() => parseLockText("")).toThrow();
  });
});
