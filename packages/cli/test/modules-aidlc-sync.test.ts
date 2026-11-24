// sync aidlc 어댑터(설계 10 §3.2, MD-R9 · R10, 완료 기준 3 · 4). 형식 근거: docs/analysis/05-aidlc-entire-real-tools.md
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEdgeBlock, readAidlcIntent } from "../src/modules/aidlc/adapter-v2";
import { REAL_TEMPLATES, tmpDir } from "./helpers";
import { cli, FAKE_AIDLC, installedRepo, makeBin } from "./modules-helpers";

const T = ["--templates", REAL_TEMPLATES];
const INTENT_DIR = "aidlc/spaces/default/intents/261124-todo-sync";
const UG = `${INTENT_DIR}/inception/units-generation`;

const DEP = (units: { name: string; kind: string; dep: string[] }[]): string =>
  `# Unit 의존\n\n본문\n\n\`\`\`yaml\nunits:\n${units.map((u) => `  - name: ${u.name}\n    kind: ${u.kind}\n    depends_on: [${u.dep.join(", ")}]`).join("\n")}\n\`\`\`\n`;

const UOW = (rows: [string, string, string][]): string =>
  `# Units\n\n| Unit ID | Directory | Name | Kind |\n|---|---|---|---|\n${rows.map(([id, dir, name]) => `| ${id} | ${dir} | ${name} | service |`).join("\n")}\n`;

const MAP = (rows: [string, string, string][]): string => `# 스토리 맵\n\n| Story | Unit | Directory |\n|---|---|---|\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n`;

function write(root: string, files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) {
    const f = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  }
}

const full = (extra: Record<string, string> = {}): Record<string, string> => ({
  [`${INTENT_DIR}/aidlc-state.md`]: "# AI-DLC State Tracking\n\n- **Project**: Todo CLI with sync\n- **Scope**: classic\n",
  [`${INTENT_DIR}/project-description.json`]: '"Todo CLI with sync"\n',
  [`${INTENT_DIR}/inception/user-stories/stories.md`]: "# 스토리\n\n### US1.1 할 일 추가\nAs a user...\n\n### US1.2 할 일 목록\nAs a user...\n\n### US2.1 동기화\nAs a user...\n",
  [`${UG}/unit-of-work.md`]: UOW([["U1", "u1-ledger", "원장 계약"], ["U2", "u2-cli", "CLI"], ["U3", "u3-sync", "동기화"]]),
  [`${UG}/unit-of-work-dependency.md`]: DEP([{ name: "u1-ledger", kind: "spec", dep: [] }, { name: "u2-cli", kind: "service", dep: ["u1-ledger"] }, { name: "u3-sync", kind: "service", dep: ["u1-ledger", "u2-cli"] }]),
  [`${UG}/unit-of-work-story-map.md`]: MAP([["US1.1", "U2", "u2-cli"], ["US1.2", "U2", "u2-cli"], ["US2.1", "U3; U2", "u3-sync"]]),
  ...extra,
});

async function ready(): Promise<{ t: string; bin: ReturnType<typeof makeBin> }> {
  const t = await installedRepo();
  const bin = makeBin({ aidlc: FAKE_AIDLC });
  expect((await cli(t, ["add", "aidlc", "--yes", ...T], bin)).code).toBe(0);
  return { t, bin };
}

const units = (t: string, folder: string): Record<string, any> => JSON.parse(fs.readFileSync(path.join(t, ".agents/docs/intents", folder, "units.json"), "utf8")) as Record<string, any>;

describe("AI-DLC 2.11 산출물 읽기", () => {
  it("edge 블록 · Unit 표 · 스토리 맵을 읽고 Unit 이 여럿인 스토리는 첫 Unit 에만 둔다", () => {
    const root = tmpDir();
    write(root, full());
    const r = readAidlcIntent(path.join(root, INTENT_DIR));
    expect(r.missing).toEqual([]);
    expect(r.title).toBe("Todo CLI with sync");
    expect(r.units.map((u) => [u.name, u.sourceId, u.kind, u.dependsOn])).toEqual([
      ["u1-ledger", "U1", "spec", []],
      ["u2-cli", "U2", "service", ["u1-ledger"]],
      ["u3-sync", "U3", "service", ["u1-ledger", "u2-cli"]],
    ]);
    expect(r.units.find((u) => u.name === "u3-sync")?.stories).toEqual(["US2.1"]);
    expect(r.units.find((u) => u.name === "u2-cli")?.stories).toEqual(["US1.1", "US1.2"]);
    expect(r.shared).toEqual([{ story: "US2.1", units: ["u3-sync", "u2-cli"] }]);
    expect(r.stories.map((s) => s.id)).toEqual(["US1.1", "US1.2", "US2.1"]);
  });

  it("필수 항목이 없으면 빠진 항목을 알린다(추측하지 않는다)", () => {
    const root = tmpDir();
    write(root, { [`${INTENT_DIR}/aidlc-state.md`]: "# x\n" });
    const r = readAidlcIntent(path.join(root, INTENT_DIR));
    expect(r.missing.join("\n")).toContain("Intent 제목");
    expect(r.missing.join("\n")).toContain("unit-of-work-dependency.md");
    expect(parseEdgeBlock("```yaml\nfoo: 1\n```")).toBeNull();
  });
});

describe("sync aidlc", () => {
  it("킷 설계와 같은 units.json 형식(source · sourceId 만 다르다)으로 쓰고 intent.json 에 링크를 남긴다", async () => {
    const { t, bin } = await ready();
    write(t, full());
    const r = await cli(t, ["sync", "aidlc", "--json", ...T], bin);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    const folder = path.basename(r.json.intents[0].folder as string);
    expect(folder).toBe("INT-1-todo-sync");
    const u = units(t, folder);
    expect(u.schema).toBe("harness-kit.units/v1");
    expect(u.source).toMatchObject({ kind: "aidlc", path: `${INTENT_DIR}/` });
    expect(u.units.map((x: any) => [x.id, x.name, x.kind, x.dependsOn, x.order, x.stories, x.planned, x.issue])).toEqual([
      ["U-1", "u1-ledger", "contract", [], 1, [], true, null],
      ["U-2", "u2-cli", "feature", ["U-1"], 2, ["US1.1", "US1.2"], true, null],
      ["U-3", "u3-sync", "feature", ["U-1", "U-2"], 3, ["US2.1"], true, null],
    ]);
    // 킷 설계 units.json(08 §3.5)과 키 집합이 같다(sourceId · source 제외)
    const kitUnitKeys = ["id", "name", "title", "kind", "area", "repo", "stories", "nfr", "risks", "dependsOn", "provides", "consumes", "order", "issue", "planned"];
    for (const x of u.units) expect(Object.keys(x).filter((k) => k !== "sourceId").sort()).toEqual([...kitUnitKeys].sort());
    expect(Object.keys(u).filter((k) => k !== "source").sort()).toEqual(["decomposition", "intent", "schema", "unassigned", "units"]);
    expect(Object.keys(u.decomposition).sort()).toEqual(["domains", "integrations", "reasons", "split", "stories", "userTypes"]);
    const link = JSON.parse(fs.readFileSync(path.join(t, ".agents/docs/intents", folder, "intent.json"), "utf8")) as Record<string, any>;
    expect(link).toMatchObject({ schema: "harness-kit.intent-link/v1", key: "INT-1", source: "aidlc", aidlc: { space: "default", intent: "261124-todo-sync", path: `${INTENT_DIR}/` } });
    expect(link.adapter.inputSha256).toBe(u.source.inputSha256);
    expect(r.json.intents[0].notes.join("\n")).toContain("US2.1");
  });

  it("같은 입력을 두 번 주면 두 번째는 쓰기 0건이다(MD-R10)", async () => {
    const { t, bin } = await ready();
    write(t, full());
    expect((await cli(t, ["sync", "aidlc", ...T], bin)).code).toBe(0);
    const files = [".agents/docs/intents/INT-1-todo-sync/units.json", ".agents/docs/intents/INT-1-todo-sync/intent.json"].map((f) => path.join(t, f));
    const stats = files.map((f) => fs.statSync(f).mtimeMs);
    await new Promise((r) => setTimeout(r, 30));
    const again = await cli(t, ["sync", "aidlc", "--json", ...T], bin, { env: { HARNESS_KIT_NOW: "2099-01-01T00:00:00.000Z" } });
    expect(again.code).toBe(0);
    expect(again.json.intents[0].action).toBe("same");
    expect(files.map((f) => fs.statSync(f).mtimeMs)).toEqual(stats);
    const chk = await cli(t, ["sync", "aidlc", "--check", ...T], bin);
    expect(chk.code).toBe(0);
  });

  it("--check 는 쓰지 않고 차이가 있으면 exit 1. Unit 을 AI-DLC 에서 지운 뒤 다시 가져오면 planned false 이고 다른 Unit 의 issue 는 그대로다", async () => {
    const { t, bin } = await ready();
    write(t, full());
    expect((await cli(t, ["sync", "aidlc", ...T], bin)).code).toBe(0);
    const uf = path.join(t, ".agents/docs/intents/INT-1-todo-sync/units.json");
    const data = JSON.parse(fs.readFileSync(uf, "utf8")) as Record<string, any>;
    data.units[1].issue = "DEMO-2"; // /hx-specify --from-unit 이 채운 연결
    fs.writeFileSync(uf, JSON.stringify(data, null, 2));
    // u3-sync 를 AI-DLC 쪽에서 지운다
    write(t, {
      [`${UG}/unit-of-work.md`]: UOW([["U1", "u1-ledger", "원장 계약"], ["U2", "u2-cli", "CLI"]]),
      [`${UG}/unit-of-work-dependency.md`]: DEP([{ name: "u1-ledger", kind: "spec", dep: [] }, { name: "u2-cli", kind: "service", dep: ["u1-ledger"] }]),
      [`${UG}/unit-of-work-story-map.md`]: MAP([["US1.1", "U2", "u2-cli"], ["US1.2", "U2", "u2-cli"], ["US2.1", "U2", "u2-cli"]]),
    });
    const before = fs.readFileSync(uf, "utf8");
    const chk = await cli(t, ["sync", "aidlc", "--check", "--json", ...T], bin);
    expect(chk.code).toBe(1);
    expect(chk.json.intents[0].action).toBe("check-diff");
    expect(fs.readFileSync(uf, "utf8")).toBe(before);
    expect((await cli(t, ["sync", "aidlc", ...T], bin)).code).toBe(0);
    const u = units(t, "INT-1-todo-sync");
    const byId = Object.fromEntries(u.units.map((x: any) => [x.id, x]));
    expect(byId["U-3"].planned).toBe(false);
    expect(byId["U-2"]).toMatchObject({ issue: "DEMO-2", planned: true });
    expect(byId["U-2"].stories).toEqual(["US1.1", "US1.2", "US2.1"]);
    expect(byId["U-1"].id).toBe("U-1");
  });

  it("--intent 로 지정한 폴더에 필수 항목이 없으면 exit 2 와 빠진 항목, 지정하지 않으면 건너뛰고 알린다", async () => {
    const { t, bin } = await ready();
    write(t, { [`${INTENT_DIR}/aidlc-state.md`]: "# x\n\n- **Project**: 미완성\n" });
    const all = await cli(t, ["sync", "aidlc", "--json", ...T], bin);
    expect(all.code).toBe(0);
    expect(all.json.intents[0].action).toBe("pending");
    const one = await cli(t, ["sync", "aidlc", "--intent", INTENT_DIR, ...T], bin);
    expect(one.code).toBe(2);
    expect(one.stderr).toContain("unit-of-work-dependency.md");
    expect(fs.existsSync(path.join(t, ".agents/docs/intents"))).toBe(false);
  });

  it("aidlc 모듈이 꺼져 있으면 exit 3, sync units · jira 는 HK-20b 안내(exit 2)", async () => {
    const t = await installedRepo();
    expect((await cli(t, ["sync", "aidlc", ...T], null)).code).toBe(3);
    const later = await cli(t, ["sync", "units", ...T], null);
    expect(later.code).toBe(2);
    expect(later.stderr).toContain("HK-20b");
  });

  it("AI-DLC 구현 쪽 산출물이 생기면 doctor 가 경고한다", async () => {
    const { t, bin } = await ready();
    write(t, full({ [`${INTENT_DIR}/construction/u2-cli/code/x.md`]: "x\n" }));
    const d = await cli(t, ["doctor", "--json", ...T], bin);
    expect(d.json.findings.some((f: any) => f.kind === "construction-artifacts")).toBe(true);
  });
});
