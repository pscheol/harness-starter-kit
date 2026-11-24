// 접수 출처 jira · notion(설계 10 §3.6, 완료 기준은 design 의 HK-20b 절): 모의 서버로 가져오기 · 같은 형식 · 신뢰하지 않는 입력 · 다시 가져오기 diff. 실제 서비스를 부르지 않는다.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commitAll, git, KIT, makeRepo, readFile, writeFile, type Repo } from "../../dashboard/test/helpers";
import { cli, mockServer, type Handler, type MockServer } from "./cli-run";

const TEMPLATES = path.join(KIT, "packages/templates/common/agents-docs/_spec-templates");
const JTOKEN = ["not", "real", "jira", "9"].join("-");
const NTOKEN = ["not", "real", "notion", "3"].join("-");
const AWS = `${"AK"}${"IA"}${"Q".repeat(16)}`;

function repoWith(modules: string[], extra: Record<string, unknown> = {}): Repo {
  const r = makeRepo({ modules });
  fs.cpSync(TEMPLATES, path.join(r.root, ".agents/docs/_spec-templates"), { recursive: true });
  const file = path.join(r.root, ".agents/harness-kit.json");
  const meta = { ...JSON.parse(fs.readFileSync(file, "utf8")), ...extra };
  fs.writeFileSync(file, `${JSON.stringify(meta, null, 2)}\n`);
  commitAll(r.root);
  return r;
}

const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

// ── Jira ────────────────────────────────────────────────────────────────────
interface JiraMock {
  description: unknown;
  attach: { filename: string; size: number; body: string }[];
  children: { key: string; summary: string; description: unknown }[];
}

const para = (...c: unknown[]): unknown => ({ type: "paragraph", content: c });
const t = (text: string, marks?: unknown[]): unknown => ({ type: "text", text, ...(marks ? { marks } : {}) });
const doc = (...c: unknown[]): unknown => ({ type: "doc", version: 1, content: c });

function jiraHandler(m: JiraMock, base: () => string): Handler {
  return ({ url }) => {
    if (url.pathname === "/rest/api/3/issue/DEMO-40") {
      return { json: { key: "DEMO-40", fields: { summary: "결제 개편", description: m.description, issuetype: { name: "Epic" }, status: { id: "1", name: "진행" }, updated: "2026-11-20T10:00:00.000+0900",
        attachment: m.attach.map((a, i) => ({ filename: a.filename, size: a.size, content: `${base()}/attach/${i}` })) } } };
    }
    if (url.pathname === "/rest/api/3/search/jql") {
      return { json: { issues: m.children.map((c) => ({ key: c.key, fields: { summary: c.summary, description: c.description, issuetype: { name: "Story" }, status: { id: "2", name: "할 일" }, updated: "2026-11-21T10:00:00.000+0900", attachment: [] } })) } };
    }
    const a = /^\/attach\/(\d+)$/.exec(url.pathname);
    if (a) return { raw: Buffer.from(m.attach[Number(a[1])]?.body ?? ""), type: "text/markdown" };
    return null;
  };
}

async function jiraSetup(m: JiraMock, modules = ["jira-workflow"]): Promise<{ repo: Repo; srv: MockServer }> {
  const repo = repoWith(modules);
  let srv!: MockServer;
  srv = await mockServer(jiraHandler(m, () => srv.url));
  writeFile(repo.root, ".agents/issue-tracker.yml", `tracker: jira\nbaseUrl: ${srv.url}\nprojectKey: DEMO\nissueKeyPattern: DEMO-[0-9]+\nsync:\n  method: rest\n  restTokenEnv: JIRA_API_TOKEN\n  restUserEnv: JIRA_USER_EMAIL\n`);
  commitAll(repo.root);
  return { repo, srv };
}

const J_ENV = { JIRA_API_TOKEN: JTOKEN, JIRA_USER_EMAIL: "robot@example.com" };
const BASE: JiraMock = {
  description: doc(
    { type: "heading", attrs: { level: 2 }, content: [t("목표")] },
    para(t("토큰 결제를 "), t("도입", [{ type: "strong" }]), t(" 한다 "), t("가이드", [{ type: "link", attrs: { href: "https://example.com/g" } }]), t("‮\u0007숨김")),
    { type: "bulletList", content: [{ type: "listItem", content: [para(t("카드"))] }, { type: "listItem", content: [para(t("계좌"))] }] },
  ),
  attach: [{ filename: "spec.md", size: 12, body: "# 명세\n본문\n" }],
  children: [{ key: "DEMO-41", summary: "계약 정의", description: doc(para(t("API 계약"))) }, { key: "DEMO-42", summary: "알림", description: null }],
};

describe("intake --from jira:<키>", () => {
  it("에픽 설명 · 하위 항목 · 첨부를 intake.md 로 가져오고 출처를 남긴다(에픽 키가 Intent 키, 신뢰하지 않는 입력, 제어 문자 제거)", async () => {
    const { repo, srv } = await jiraSetup(BASE);
    const r = await cli(["intake", "--from", "jira:DEMO-40", "--name", "pay-reform", "--json"], repo, { env: J_ENV });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    const folder = ".agents/docs/intents/DEMO-40-pay-reform";
    expect(r.json.folder).toBe(folder);
    const intake = readFile(repo.root, `${folder}/intake.md`);
    expect(intake).toContain("trust: untrusted");
    expect(intake).toMatch(/^source: \{"type":"jira"|^source: \{"type": "jira"/m);
    const source = JSON.parse(/^source: (\{.*\})$/m.exec(intake)![1] as string);
    expect(source).toMatchObject({ type: "jira", ref: "DEMO-40", url: `${srv.url}/browse/DEMO-40`, version: "2026-11-21T10:00:00.000+0900" });
    expect(source.importedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(intake).toContain("#### 목표");
    expect(intake).toContain("**도입**");
    expect(intake).toContain("[가이드](https://example.com/g)");
    expect(intake).toContain("- 카드");
    expect(intake).toContain("### DEMO-41 계약 정의");
    expect(intake).toContain("API 계약");
    expect(intake).not.toMatch(/[‮\u0007]/);
    expect(readFile(repo.root, `${folder}/attachments/01-DEMO-40-spec.md`)).toBe("# 명세\n본문\n");
    const secrets = walk(path.join(repo.root, folder)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
    expect(secrets).not.toContain(JTOKEN);
    expect(srv.seen.find((s) => s.url.startsWith("/rest/"))?.auth).toBe(`Basic ${Buffer.from(`robot@example.com:${JTOKEN}`).toString("base64")}`);
    await srv.close();
  });

  it("같은 출처를 다시 가져오면 변화 없음, 바뀌면 diff 만 보이고(exit 4) --yes 로만 반영한다", async () => {
    const m: JiraMock = structuredClone(BASE);
    const { repo, srv } = await jiraSetup(m);
    const args = ["intake", "--from", "jira:DEMO-40", "--name", "pay-reform"];
    expect((await cli(args, repo, { env: J_ENV })).code).toBe(0);
    const file = path.join(repo.root, ".agents/docs/intents/DEMO-40-pay-reform/intake.md");
    const before = fs.readFileSync(file, "utf8");
    const same = await cli(args, repo, { env: J_ENV });
    expect([same.code, same.stdout]).toEqual([0, expect.stringContaining("변화 없음")]);
    expect(fs.readFileSync(file, "utf8")).toBe(before);
    m.description = doc(para(t("범위가 바뀌었다")));
    const diff = await cli(args, repo, { env: J_ENV });
    expect(diff.code).toBe(4);
    expect(diff.stdout).toContain("-");
    expect(diff.stdout).toMatch(/\+.*범위가 바뀌었다/);
    expect(fs.readFileSync(file, "utf8")).toBe(before);
    expect(fs.readdirSync(path.join(repo.root, ".agents/docs/intents"))).toEqual(["DEMO-40-pay-reform"]);
    const applied = await cli([...args, "--yes"], repo, { env: J_ENV });
    expect(applied.code, applied.stdout + applied.stderr).toBe(0);
    const after = fs.readFileSync(file, "utf8");
    expect(after).toContain("범위가 바뀌었다");
    expect(/^submittedAt: .*$/m.exec(after)?.[0]).toBe(/^submittedAt: .*$/m.exec(before)?.[0]);
    await srv.close();
  });

  it("비밀값이 든 글은 가져오지 않는다(exit 1, 폴더 없음). 큰 첨부는 내려받지 않고 링크로 둔다", async () => {
    const leak: JiraMock = { ...structuredClone(BASE), description: doc(para(t(`키 ${AWS}`))) };
    const a = await jiraSetup(leak);
    const r = await cli(["intake", "--from", "jira:DEMO-40", "--name", "pay-reform"], a.repo, { env: J_ENV });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("비밀값");
    expect(fs.existsSync(path.join(a.repo.root, ".agents/docs/intents"))).toBe(false);
    await a.srv.close();
    const big: JiraMock = { ...structuredClone(BASE), attach: [{ filename: "huge.bin", size: 50 * 1024 * 1024, body: "x" }] };
    const b = await jiraSetup(big);
    const ok = await cli(["intake", "--from", "jira:DEMO-40", "--name", "pay-reform", "--json"], b.repo, { env: J_ENV });
    expect(ok.code, ok.stdout + ok.stderr).toBe(0);
    expect(ok.json.warnings.join("\n")).toContain("내려받지 않고 링크로 둔다");
    expect(b.srv.seen.some((s) => s.url.startsWith("/attach/"))).toBe(false);
    await b.srv.close();
  });

  it("모듈이 꺼져 있으면 exit 3, 토큰이 없으면 exit 5, --name 이 없으면 exit 2", async () => {
    const off = await jiraSetup(BASE, []);
    expect((await cli(["intake", "--from", "jira:DEMO-40", "--name", "pay-reform"], off.repo, { env: J_ENV })).code).toBe(3);
    await off.srv.close();
    const on = await jiraSetup(BASE);
    expect((await cli(["intake", "--from", "jira:DEMO-40", "--name", "pay-reform"], on.repo, { env: {} })).code).toBe(5);
    expect((await cli(["intake", "--from", "jira:DEMO-40"], on.repo, { env: J_ENV })).code).toBe(2);
    expect((await cli(["intake", "--from", "slack:x", "--name", "pay-reform"], on.repo, { env: J_ENV })).code).toBe(2);
    await on.srv.close();
  });
});

// ── Notion ──────────────────────────────────────────────────────────────────
const PAGE = "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9";
const CHILD = "11111111-2222-3333-4444-555555555555";
const rt = (text: string, ann: Record<string, boolean> = {}, href: string | null = null): unknown => ({ plain_text: text, annotations: ann, href });
const block = (id: string, type: string, body: Record<string, unknown>, has_children = false): unknown => ({ id, type, has_children, [type]: body });

interface NotionMock {
  writeBackCalls: unknown[];
  s3: MockServer;
}

function notionHandler(m: NotionMock): Handler {
  const props = {
    제목: { type: "title", title: [rt("결제 수단 개편")] },
    종류: { type: "select", select: { name: "변경" } },
    상태: { type: "status", status: { name: "초안" } },
    "하네스 키": { type: "rich_text", rich_text: [] },
    담당: { type: "people", people: [{ name: "Kim" }] },
  };
  return ({ method, url, body }) => {
    if (method === "PATCH" && url.pathname === `/v1/pages/${PAGE}`) {
      m.writeBackCalls.push(body);
      return { json: {} };
    }
    if (url.pathname === `/v1/pages/${PAGE}`) return { json: { id: PAGE, url: "https://www.notion.so/Pay-0a1b2c3d4e5f60718293a4b5c6d7e8f9", last_edited_time: "2026-11-22T01:00:00.000Z", properties: props } };
    if (url.pathname === `/v1/pages/${CHILD}`) return { json: { id: CHILD, last_edited_time: "2026-11-23T01:00:00.000Z", properties: {} } };
    if (url.pathname === `/v1/blocks/${PAGE}/children`) {
      if (!url.searchParams.get("start_cursor")) {
        return { json: { has_more: true, next_cursor: "c2", results: [
          block("b1", "heading_1", { rich_text: [rt("목표")] }),
          block("b2", "paragraph", { rich_text: [rt("토큰 "), rt("결제", { bold: true }), rt(" 링크", {}, "https://example.com/x")] }),
          block("b3", "bulleted_list_item", { rich_text: [rt("카드")] }, true),
        ] } };
      }
      return { json: { has_more: false, results: [
        block("b4", "code", { rich_text: [rt("print(1)")], language: "python" }),
        block("b5", "table", { table_width: 2 }, true),
        block("b6", "image", { type: "file", file: { url: `${m.s3.url}/img/diagram.png?sig=1` }, caption: [] }),
        block(CHILD, "child_page", { title: "부록" }),
        block("b8", "to_do", { rich_text: [rt("검토")], checked: true }),
      ] } };
    }
    if (url.pathname === "/v1/blocks/b3/children") return { json: { has_more: false, results: [block("b3a", "bulleted_list_item", { rich_text: [rt("해외 카드")] })] } };
    if (url.pathname === "/v1/blocks/b5/children") return { json: { has_more: false, results: [block("r1", "table_row", { cells: [[rt("항목")], [rt("값")]] }), block("r2", "table_row", { cells: [[rt("한도")], [rt("100")]] })] } };
    if (url.pathname === `/v1/blocks/${CHILD}/children`) return { json: { has_more: false, results: [block("c1", "paragraph", { rich_text: [rt("부록 본문")] })] } };
    return null;
  };
}

async function notionSetup(notion: Record<string, unknown> = { database: "db1", properties: { title: "제목", kind: "종류", status: "상태", key: "하네스 키" }, kindMap: { 변경: "change", 신규: "feature" }, writeBack: false }): Promise<{ repo: Repo; srv: MockServer; s3: MockServer; m: NotionMock }> {
  const repo = repoWith(["notion"], { notion });
  const s3 = await mockServer(({ url }) => (url.pathname === "/img/diagram.png" ? { raw: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), type: "image/png" } : null));
  const m: NotionMock = { writeBackCalls: [], s3 };
  const srv = await mockServer(notionHandler(m));
  return { repo, srv, s3, m };
}

const N_ENV = (srv: MockServer): Record<string, string> => ({ NOTION_TOKEN: NTOKEN, NOTION_API_BASE: srv.url });
const URL_REF = "https://www.notion.so/acme/Pay-0a1b2c3d4e5f60718293a4b5c6d7e8f9?pvs=4";

describe("intake --from notion:<페이지>", () => {
  it("블록 → Markdown · 속성 표 · 하위 페이지(--depth 기본 1) · 이미지 첨부 · kindMap · 서명 주소에는 인증을 붙이지 않는다", async () => {
    const { repo, srv, s3 } = await notionSetup();
    const r = await cli(["intake", "--from", `notion:${URL_REF}`, "--name", "pay-method", "--json"], repo, { env: N_ENV(srv) });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    const folder = ".agents/docs/intents/INT-1-pay-method";
    expect(r.json.folder).toBe(folder);
    const intake = readFile(repo.root, `${folder}/intake.md`);
    expect(intake).toContain("kind: change");
    expect(intake).toContain("trust: untrusted");
    expect(intake).toContain("# 접수 — 결제 수단 개편");
    expect(intake).toContain("| 종류 | 변경 |");
    expect(intake).toContain("| 담당 | Kim |");
    expect(intake).toContain("### 목표");
    expect(intake).toContain("토큰 **결제** [링크](https://example.com/x)");
    expect(intake).toContain("- 카드\n  - 해외 카드");
    expect(intake).toContain("```python\nprint(1)\n```");
    expect(intake).toContain("| 항목 | 값 |\n|---|---|\n| 한도 | 100 |");
    expect(intake).toContain("- [x] 검토");
    expect(intake).toContain("## 하위 페이지: 부록");
    expect(intake).toContain("부록 본문");
    expect(intake).toContain("(첨부: diagram.png)");
    expect(fs.readFileSync(path.join(repo.root, folder, "attachments/01-diagram.png"))).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
    const source = JSON.parse(/^source: (\{.*\})$/m.exec(intake)![1] as string);
    expect(source).toMatchObject({ type: "notion", ref: PAGE, version: "2026-11-23T01:00:00.000Z" });
    expect(srv.seen[0]?.auth).toBe(`Bearer ${NTOKEN}`);
    expect(s3.seen.every((x) => x.auth === undefined)).toBe(true);
    const all = walk(path.join(repo.root, folder)).map((f) => fs.readFileSync(f).toString("latin1")).join("\n") + readFile(repo.root, ".agents/harness-kit.json");
    expect(all).not.toContain(NTOKEN);
    expect(srv.seen.filter((x) => x.method !== "GET")).toHaveLength(0);
    await srv.close();
    await s3.close();
  });

  it("--depth 0 은 하위 페이지를 따라가지 않고, 같은 출처를 다시 가져오면 변화 없음", async () => {
    const { repo, srv, s3 } = await notionSetup();
    const args = ["intake", "--from", `notion:${PAGE.replace(/-/g, "")}`, "--name", "pay-method", "--depth", "0"];
    const r = await cli(args, repo, { env: N_ENV(srv) });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    const intake = readFile(repo.root, ".agents/docs/intents/INT-1-pay-method/intake.md");
    expect(intake).not.toContain("부록 본문");
    expect(intake).toContain("(하위 페이지: 부록)");
    expect(srv.seen.some((x) => x.url.includes(CHILD))).toBe(false);
    const again = await cli(args, repo, { env: N_ENV(srv) });
    expect([again.code, again.stdout]).toEqual([0, expect.stringContaining("변화 없음")]);
    await srv.close();
    await s3.close();
  });

  it("writeBack 은 기본 꺼짐이고, 켜면 접수됨 · Intent 키만 속성에 쓴다", async () => {
    const off = await notionSetup();
    await cli(["intake", "--from", `notion:${PAGE}`, "--name", "pay-method"], off.repo, { env: N_ENV(off.srv) });
    expect(off.m.writeBackCalls).toHaveLength(0);
    await off.srv.close();
    await off.s3.close();
    const on = await notionSetup({ database: "db1", properties: { title: "제목", kind: "종류", status: "상태", key: "하네스 키" }, kindMap: { 변경: "change" }, writeBack: true });
    const r = await cli(["intake", "--from", `notion:${PAGE}`, "--name", "pay-method"], on.repo, { env: N_ENV(on.srv) });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(on.m.writeBackCalls).toEqual([{ properties: { 상태: { status: { name: "접수됨" } }, "하네스 키": { rich_text: [{ type: "text", text: { content: "INT-1" } }] } } }]);
    await on.srv.close();
    await on.s3.close();
  });

  it("모듈이 꺼져 있으면 exit 3, 토큰이 없으면 exit 5, 주소가 틀리면 exit 2", async () => {
    const { repo, srv, s3 } = await notionSetup();
    expect((await cli(["intake", "--from", `notion:${PAGE}`, "--name", "pay-method"], repo, { env: { NOTION_API_BASE: srv.url } })).code).toBe(5);
    expect((await cli(["intake", "--from", "notion:https://example.com/page", "--name", "pay-method"], repo, { env: N_ENV(srv) })).code).toBe(2);
    expect((await cli(["intake", "--from", "notion:not-an-id", "--name", "pay-method"], repo, { env: N_ENV(srv) })).code).toBe(2);
    const off = repoWith([]);
    expect((await cli(["intake", "--from", `notion:${PAGE}`, "--name", "pay-method"], off, { env: N_ENV(srv) })).code).toBe(3);
    await srv.close();
    await s3.close();
  });
});

describe("기존 intake", () => {
  it("--from 없이도 같은 intake.py 를 쓴다(회귀): --key 로 jira-workflow 의 에픽 키를 줄 수 있다", async () => {
    const repo = repoWith(["jira-workflow"]);
    const bad = await cli(["intake", "--title", "결제", "--kind", "feature", "--name", "pay-reform", "--text", "본문"], repo);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain("Jira 에픽 키");
    const ok = await cli(["intake", "--title", "결제", "--kind", "feature", "--name", "pay-reform", "--key", "DEMO-40", "--text", "본문", "--json"], repo);
    expect(ok.code, ok.stdout + ok.stderr).toBe(0);
    expect(ok.json.folder).toBe(".agents/docs/intents/DEMO-40-pay-reform");
    git(repo.root, "status", "--short");
  });
});
