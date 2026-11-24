// 업그레이드 공지(HK-24 design §7, 03 §3.11 · §5 #7): 절 고르기 · 쓰기 · 지우기 · 사람 공지 · Python(update.sh) 동일성 · update · doctor · uninstall.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addDays, coreVersion, isKitNotice, NOTICE_REL, noticeExpired, planNotice, SECTION_LIMIT, upgradeSections } from "../src/core/notice";
import { VERSION } from "../src/core/version";
import { initWith, projectionTemplates, PY_DIR } from "./projection-helpers";
import { json, META_FILE, readJsonFile, REAL_TEMPLATES, run, writeJsonFile, FIXTURE_ENV } from "./helpers";

const UPGRADE = "# 공지\n\n머리 글은 버린다.\n\n## 1.1.0\n\n- 하나\n\n## 2.0.0\n- 둘\n- 셋\n\n## 9.0.0\n- 미래\n";

function py(args: { upgradeText: string | null; from: string; to: string; today: string; existing: string | null }): { action: string; text: string | null } {
  const code = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(PY_DIR)})`,
    "from upgrade_notice import plan_notice",
    "a = json.load(sys.stdin)",
    "action, text = plan_notice(a['upgradeText'], a['from'], a['to'], a['today'], a['existing'])",
    "print(json.dumps({'action': action, 'text': text}, ensure_ascii=False))",
  ].join("\n");
  const r = spawnSync("python3", ["-B", "-c", code], { input: JSON.stringify(args), encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

describe("공지 만들기", () => {
  it("판 비교는 꼬리를 떼고, from 초과 · to 이하 절만 판 순서로", () => {
    expect(coreVersion("2.0.0-alpha.0")).toEqual([2, 0, 0]);
    expect(coreVersion("unknown")).toBeNull();
    expect(upgradeSections(UPGRADE).map((s) => s.version)).toEqual(["1.1.0", "2.0.0", "9.0.0"]);
    const p = planNotice({ upgradeText: UPGRADE, from: "1.0.8", to: "2.0.0-alpha.0", today: "2026-11-24", existing: null });
    expect(p.action).toBe("write");
    expect(p.text).toBe("---\nkitFrom: 1.0.8\nkitTo: 2.0.0-alpha.0\ndate: 2026-11-24\nexpires: 2026-12-24\n---\n# 하네스 업데이트 1.0.8 → 2.0.0-alpha.0\n\n- 하나\n- 둘\n- 셋\n");
    expect(isKitNotice(p.text as string)).toBe(true);
  });

  it("같은 판 안(alpha.0 → alpha.1) · 모르는 판이면 절이 없다", () => {
    expect(planNotice({ upgradeText: UPGRADE, from: "2.0.0-alpha.0", to: "2.0.0-alpha.1", today: "2026-11-24", existing: null }).action).toBe("none");
    expect(planNotice({ upgradeText: UPGRADE, from: "unknown", to: "2.0.0", today: "2026-11-24", existing: null }).action).toBe("none");
    expect(planNotice({ upgradeText: null, from: "1.0.0", to: "2.0.0", today: "2026-11-24", existing: null }).action).toBe("none");
  });

  it("만료된 킷 공지는 절이 없을 때 지우고, 사람 공지는 쓰지도 지우지도 않는다", () => {
    const kit = planNotice({ upgradeText: UPGRADE, from: "1.0.8", to: "2.0.0", today: "2026-11-24", existing: null }).text as string;
    expect(planNotice({ upgradeText: UPGRADE, from: "2.0.0", to: "2.0.1", today: "2026-12-30", existing: kit }).action).toBe("delete");
    expect(planNotice({ upgradeText: UPGRADE, from: "2.0.0", to: "2.0.1", today: "2026-12-01", existing: kit }).action).toBe("none");
    expect(planNotice({ upgradeText: UPGRADE, from: "1.0.8", to: "2.0.0", today: "2026-11-24", existing: "# 우리 팀 공지\n" }).action).toBe("keep-human");
    expect(planNotice({ upgradeText: UPGRADE, from: "2.0.0", to: "2.0.1", today: "2027-01-30", existing: "# 우리 팀 공지\n" }).action).toBe("none");
    expect(noticeExpired(kit, "2026-12-24")).toBe(false);
    expect(noticeExpired(kit, "2026-12-25")).toBe(true);
    expect(addDays("2026-12-20", 30)).toBe("2027-01-19");
  });

  it.each([
    ["write", { upgradeText: UPGRADE, from: "1.0.8", to: "2.0.0-alpha.0", today: "2026-11-24", existing: null }],
    ["several", { upgradeText: UPGRADE, from: "0.9.0", to: "9.1.0", today: "2026-02-27", existing: null }],
    ["human", { upgradeText: UPGRADE, from: "1.0.8", to: "2.0.0", today: "2026-11-24", existing: "공지\n" }],
    ["none", { upgradeText: UPGRADE, from: "2.0.0", to: "2.0.0", today: "2026-11-24", existing: null }],
  ])("Python(update.sh) 과 같은 결과: %s", (_name, args) => {
    const ts = planNotice(args);
    expect(py(args)).toEqual({ action: ts.action, text: ts.text ?? null });
  });

  it("킷 UPGRADE.md 의 절은 800자 이하이고 판 형식이다", () => {
    const sections = upgradeSections(fs.readFileSync(path.join(REAL_TEMPLATES, "UPGRADE.md"), "utf8"));
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) {
      expect(coreVersion(s.version), s.version).not.toBeNull();
      expect([...s.body.join("\n")].length, s.version).toBeLessThanOrEqual(SECTION_LIMIT);
    }
  });
});

describe("update · doctor · uninstall", () => {
  function withUpgrade(): string {
    const templates = projectionTemplates();
    fs.writeFileSync(path.join(templates, "UPGRADE.md"), `## ${VERSION.replace(/-.*/, "")}\n- 새 판 안내\n`);
    return templates;
  }

  it("판을 올린 update 가 공지를 쓰고, 다음 update 는 그대로 두며, 만료 뒤 update 가 지운다(03 §5 #7)", async () => {
    const templates = withUpgrade();
    const { target, cli } = await initWith(templates);
    const meta = path.join(target, META_FILE);
    writeJsonFile(meta, { ...readJsonFile(meta), kit: { version: "1.0.8" } });
    const up = await cli("update", ["--json", "--templates", templates], { today: "2026-11-24" });
    expect(up.code, up.stdout).toBe(0);
    expect(json(up).notice).toEqual({ path: NOTICE_REL, action: "write" });
    const text = fs.readFileSync(path.join(target, NOTICE_REL), "utf8");
    expect(text).toContain("kitFrom: 1.0.8\n");
    expect(text).toContain("expires: 2026-12-24\n");
    expect(text).toContain("- 새 판 안내\n");
    expect(json(await cli("update", ["--json", "--templates", templates], { today: "2026-11-25" })).notice.action).toBe("none");
    const doctor = await cli("doctor", ["--json"], { today: "2026-12-25" });
    expect(json(doctor).findings.map((f: any) => f.kind)).toContain("upgrade-notice-expired");
    expect(json(await cli("update", ["--json", "--templates", templates], { today: "2026-12-25" })).notice.action).toBe("delete");
    expect(fs.existsSync(path.join(target, NOTICE_REL))).toBe(false);
  });

  it("--dry-run 은 공지를 쓰지 않고, 사람이 만든 공지는 두며, uninstall 은 킷 공지만 지운다", async () => {
    const templates = withUpgrade();
    const { target, cli } = await initWith(templates);
    const meta = path.join(target, META_FILE);
    writeJsonFile(meta, { ...readJsonFile(meta), kit: { version: "1.0.8" } });
    expect(json(await cli("update", ["--json", "--dry-run", "--templates", templates])).notice.action).toBe("write");
    expect(fs.existsSync(path.join(target, NOTICE_REL))).toBe(false);
    fs.writeFileSync(path.join(target, NOTICE_REL), "# 팀 공지\n");
    expect(json(await cli("update", ["--json", "--templates", templates])).notice.action).toBe("keep-human");
    expect(fs.readFileSync(path.join(target, NOTICE_REL), "utf8")).toBe("# 팀 공지\n");
    const un = await run(["uninstall", "--yes", "--json", "--cwd", target, "--templates", templates], { env: FIXTURE_ENV });
    expect(un.code, un.stdout).toBe(0);
    expect(fs.existsSync(path.join(target, NOTICE_REL))).toBe(true);
  });

  it("uninstall 이 킷이 쓴 공지를 지운다", async () => {
    const templates = withUpgrade();
    const { target, cli } = await initWith(templates);
    const meta = path.join(target, META_FILE);
    writeJsonFile(meta, { ...readJsonFile(meta), kit: { version: "1.0.8" } });
    expect(json(await cli("update", ["--json", "--templates", templates])).notice.action).toBe("write");
    const un = await run(["uninstall", "--yes", "--json", "--cwd", target, "--templates", templates], { env: FIXTURE_ENV });
    expect(un.code, un.stdout).toBe(0);
    expect(fs.existsSync(path.join(target, NOTICE_REL))).toBe(false);
  });
});
