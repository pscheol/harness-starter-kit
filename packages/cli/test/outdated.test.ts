// outdated — 설치 · CLI · 소스 최신 태그 비교(HK-12 design §5). 네트워크 없이 로컬 bare 저장소를 원격으로 쓴다.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_DIR, installedFixture, json, LOCK_FILE, META_FILE, readJsonFile, readTree, run, tmpDir, writeJsonFile } from "./helpers";

const VERSION = (JSON.parse(fs.readFileSync(path.join(CLI_DIR, "package.json"), "utf8")) as { version: string }).version;

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "init.defaultBranch=main", ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

/** 태그를 단 로컬 bare 저장소(원격 흉내). */
function bareRemote(tags: string[]): string {
  const root = tmpDir("hk-remote-");
  const work = path.join(root, "work");
  const bare = path.join(root, "kit.git");
  fs.mkdirSync(work);
  git(work, "init", "-q");
  fs.writeFileSync(path.join(work, "README.md"), "kit\n");
  git(work, "add", "README.md");
  git(work, "commit", "-q", "-m", "init");
  for (const t of tags) git(work, "tag", t);
  git(root, "clone", "-q", "--bare", work, bare);
  return bare;
}

async function setInstalled(target: string, version: string): Promise<void> {
  const meta = readJsonFile(path.join(target, META_FILE));
  writeJsonFile(path.join(target, META_FILE), { ...meta, kit: { version } });
}

describe("outdated", () => {
  it("설치 · CLI · 최신 태그를 낸다. 사전 출시 태그는 설치나 CLI 가 사전 출시일 때 센다(R12.3)", async () => {
    const { target, cli } = await installedFixture();
    const remote = bareRemote(["v1.0.8", "v2.0.0-alpha.0", "v2.1.0", "v2.2.0-rc.1", "junk", "release-3"]);
    const before = readTree(target);
    const r = await cli("outdated", ["--json", "--source", remote]);
    expect(r.code, r.stdout).toBe(0);
    expect(r.stderr).toBe("");
    const j = json(r);
    expect(j).toMatchObject({ command: "outdated", installed: VERSION, cli: VERSION });
    expect(j.latest).toMatchObject({ status: "ok", version: "2.2.0-rc.1", stable: "2.1.0", source: remote, tags: 4 });
    expect(j.newest).toBe("2.2.0-rc.1");
    expect(j.newer).toBe(true);
    expect(j.upgrade).toBe("npx harness-kit@2.2.0-rc.1 update");
    expect((await cli("outdated", ["--check", "--source", remote])).code).toBe(1);
    expect(readTree(target)).toEqual(before);
    const human = await cli("outdated", ["--source", remote]);
    expect(human.stdout).toContain("2.2.0-rc.1");
  });

  it("최신 태그가 설치 판과 같으면 새 판이 없다, --check 는 0", async () => {
    const { cli } = await installedFixture();
    const remote = bareRemote(["v1.0.8", `v${VERSION}`]);
    const r = await cli("outdated", ["--json", "--check", "--source", remote]);
    expect(r.code, r.stdout).toBe(0);
    expect(json(r)).toMatchObject({ newer: false, newest: VERSION, upgrade: null });
  });

  it("CLI 가 설치 판보다 새것이면 소스를 몰라도 새 판이 있다 — harness-kit update 안내", async () => {
    const { target, cli } = await installedFixture();
    await setInstalled(target, "1.0.8");
    const r = await cli("outdated", ["--json"]);
    expect(r.code, r.stdout).toBe(0);
    const j = json(r);
    expect(j).toMatchObject({ installed: "1.0.8", cli: VERSION, newer: true, upgrade: "harness-kit update" });
    expect(j.latest).toMatchObject({ status: "unknown", source: null });
    expect((await cli("outdated", ["--check"])).code).toBe(1);
  });

  it("소스에 닿지 못하면 '확인 못 함' 으로 두고 exit 0(네트워크 없음과 같다)", async () => {
    const { cli } = await installedFixture();
    const gone = path.join(tmpDir(), "nowhere.git");
    const r = await cli("outdated", ["--json", "--source", gone]);
    expect(r.code, r.stdout).toBe(0);
    expect(json(r).latest).toMatchObject({ status: "unknown", source: gone });
    expect(json(r).latest.reason).toBeTruthy();
    const human = await cli("outdated", ["--source", gone]);
    expect(human.stdout).toContain("확인 못 함");
    expect((await cli("outdated", ["--check", "--source", gone])).code).toBe(0);
  });

  it("HARNESS_KIT_SOURCE 환경변수 · lock kit.source(file:) 에서 소스를 찾는다", async () => {
    const { target, cli } = await installedFixture();
    const remote = bareRemote(["v9.0.0"]);
    expect(json(await cli("outdated", ["--json"], { env: { HARNESS_KIT_SOURCE: remote } })).latest).toMatchObject({ version: "9.0.0", source: remote });
    const lock = readJsonFile(path.join(target, LOCK_FILE));
    writeJsonFile(path.join(target, LOCK_FILE), { ...lock, kit: { ...lock.kit, source: `file:${remote}` } });
    expect(json(await cli("outdated", ["--json"])).latest).toMatchObject({ status: "ok", version: "9.0.0" });
  });

  it("-로 시작하는 소스는 exit 2, 설치 안 된 폴더는 exit 3", async () => {
    const { cli } = await installedFixture();
    expect((await cli("outdated", ["--source=--upload-pack=touch /tmp/x"])).code).toBe(2);
    expect((await run(["outdated", "--cwd", tmpDir()])).code).toBe(3);
  });
});
