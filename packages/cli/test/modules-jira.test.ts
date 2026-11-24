// jira-workflow v2(설계 10 §3.4, 완료 기준 7): 모의 Jira REST 서버로 상태 맞추기 · 승인 가져오기 · 승인 전이 거부 · 켜지 않은 모듈. 실제 Jira 를 부르지 않는다.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commitAll, git, KIT, makeRepo, readFile, writeFile, writeIssue, type Repo } from "../../dashboard/test/helpers";
import { cli, mockServer, type Handler, type MockServer } from "./cli-run";

const TOKEN = ["not", "a", "real", "value", "1"].join("-");
const EMAIL = "robot@example.com";
const ENV = { JIRA_API_TOKEN: TOKEN, JIRA_USER_EMAIL: EMAIL };
const ST = { backlog: "10000", "requirements-draft": "10101", "requirements-review": "10102", design: "10103", implementing: "10104", verifying: "10105", done: "10106", deployed: "10107" };

function tracker(url: string, method = "rest"): string {
  return [
    "tracker: jira", `baseUrl: ${url}`, "projectKey: DEMO", "issueKeyPattern: DEMO-[0-9]+",
    "statusMap:", ...Object.entries(ST).map(([k, v]) => `  ${k}: "${v}"`),
    "approvalTransitions:", '  "10102>10103": requirements', '  "10103>10104": design', '  "10105>10106": done', '  "10106>10107": deploy',
    "sync:", `  method: ${method}`, "  restTokenEnv: JIRA_API_TOKEN", "  restUserEnv: JIRA_USER_EMAIL",
    "agentBoundary:", "  maxStatus: verifying", "",
  ].join("\n");
}

interface JiraIssueState {
  status: string;
  /** 현재 상태 ID → 갈 수 있는 상태 ID 목록 */
  moves: Record<string, string[]>;
  links: { globalId: string; url: string }[];
  history: { id: string; created: string; account: string; from: string; to: string }[];
}

function jiraHandler(issues: Record<string, JiraIssueState>, users: Record<string, { email?: string }>): Handler {
  return ({ method, url, body }) => {
    const m = /^\/rest\/api\/3\/issue\/([A-Z]+-\d+)(?:\/(transitions|remotelink|changelog))?$/.exec(url.pathname);
    if (url.pathname === "/rest/api/3/user") {
      const u = users[url.searchParams.get("accountId") ?? ""];
      return u ? { json: { emailAddress: u.email } } : { status: 404, json: {} };
    }
    if (!m) return null;
    const issue = issues[m[1] as string];
    if (!issue) return { status: 404, json: {} };
    if (!m[2]) return { json: { key: m[1], fields: { summary: "요약", issuetype: { name: "Story" }, status: { id: issue.status, name: `s${issue.status}` }, updated: "2026-11-24T00:00:00.000+0900" } } };
    if (m[2] === "transitions") {
      if (method === "POST") {
        const to = (issue.moves[issue.status] ?? []).find((t) => `t${issue.status}-${t}` === body.transition.id);
        if (!to) return { status: 400, json: {} };
        issue.status = to;
        return { status: 204 };
      }
      return { json: { transitions: (issue.moves[issue.status] ?? []).map((t) => ({ id: `t${issue.status}-${t}`, name: `to ${t}`, to: { id: t } })) } };
    }
    if (m[2] === "remotelink") {
      if (method === "POST") {
        issue.links.push({ globalId: body.globalId, url: body.object.url });
        return { status: 201, json: { id: 1 } };
      }
      return { json: issue.links.map((l) => ({ globalId: l.globalId, object: { url: l.url } })) };
    }
    const start = Number(url.searchParams.get("startAt") ?? 0);
    const page = issue.history.slice(start, start + 2);
    return {
      json: {
        startAt: start, maxResults: 2, total: issue.history.length, isLast: start + 2 >= issue.history.length,
        values: page.map((h) => ({ id: h.id, created: h.created, author: { accountId: h.account }, items: [{ field: "status", from: h.from, to: h.to }, { field: "assignee", from: "a", to: "b" }] })),
      },
    };
  };
}

interface Fixture {
  repo: Repo;
  srv: MockServer;
  issues: Record<string, JiraIssueState>;
}

async function setup(opts: { docs?: Parameters<typeof writeIssue>[3]; history?: JiraIssueState["history"]; status?: string; method?: string; modules?: string[] } = {}): Promise<Fixture> {
  const repo = makeRepo({
    modules: opts.modules ?? ["jira-workflow"],
    approvers: { requirements: ["po"], design: ["dev"], done: ["qa"] },
    groups: { po: ["pm@example.com"], dev: ["dev@example.com"], qa: ["qa@example.com"] },
  });
  writeIssue(repo.root, "DEMO-1", "upload-cleanup", opts.docs ?? { requirements: "in-review" });
  const issues: Record<string, JiraIssueState> = {
    "DEMO-1": {
      status: opts.status ?? ST.backlog,
      moves: { [ST.backlog]: [ST["requirements-draft"], ST["requirements-review"]], [ST["requirements-draft"]]: [ST["requirements-review"]], [ST.implementing]: [ST.verifying], [ST["requirements-review"]]: [ST.design], [ST.design]: [ST.implementing] },
      links: [],
      history: opts.history ?? [],
    },
  };
  const users = { pm: { email: "pm@example.com" }, dev: { email: "dev@example.com" }, qa: { email: "QA@example.com" }, other: { email: "stranger@example.com" }, hidden: {} };
  const srv = await mockServer(jiraHandler(issues, users));
  writeFile(repo.root, ".agents/issue-tracker.yml", tracker(srv.url, opts.method));
  git(repo.root, "remote", "add", "origin", "git@gitlab.com:acme/demo.git");
  commitAll(repo.root);
  return { repo, srv, issues };
}

const posts = (srv: MockServer, what: string): number => srv.seen.filter((s) => s.method === "POST" && s.url.includes(what)).length;

describe("sync jira — 모듈 · 설정", () => {
  it("모듈이 꺼져 있으면 꺼져 있다고 알리고 exit 0, Jira 를 부르지 않는다", async () => {
    const f = await setup({ modules: [] });
    const r = await cli(["sync", "jira"], f.repo, { env: ENV });
    expect([r.code, r.stdout]).toEqual([0, expect.stringContaining("모듈이 꺼져 있다")]);
    expect(f.srv.seen).toHaveLength(0);
    await f.srv.close();
  });

  it("sync.method none 이면 아무것도 하지 않고 exit 0, 연결 설정이 TBD 면 exit 3", async () => {
    const f = await setup({ method: "none" });
    const none = await cli(["sync", "jira"], f.repo, { env: ENV });
    expect([none.code, none.stdout]).toEqual([0, expect.stringContaining("none")]);
    writeFile(f.repo.root, ".agents/issue-tracker.yml", "tracker: TBD\nbaseUrl: TBD\nsync:\n  method: rest\n");
    const tbd = await cli(["sync", "jira"], f.repo, { env: ENV });
    expect(tbd.code).toBe(3);
    expect(f.srv.seen).toHaveLength(0);
    await f.srv.close();
  });

  it("토큰 환경 변수가 없으면 exit 5, 요청도 하지 않는다", async () => {
    const f = await setup();
    const r = await cli(["sync", "jira"], f.repo, { env: {} });
    expect(r.code).toBe(5);
    expect(r.stderr).toContain("JIRA_API_TOKEN");
    expect(f.srv.seen).toHaveLength(0);
    await f.srv.close();
  });
});

describe("sync jira — 리포 → Jira(에이전트 몫 전이 · 링크)", () => {
  it("킷 단계에 맞춰 에이전트 몫만 옮기고, 인증은 Basic, 토큰이 출력에 나오지 않는다", async () => {
    const f = await setup();
    const r = await cli(["sync", "jira"], f.repo, { env: ENV });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(f.issues["DEMO-1"]?.status).toBe(ST["requirements-review"]);
    expect(f.srv.seen[0]?.auth).toBe(`Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")}`);
    expect(r.stdout + r.stderr).not.toContain(TOKEN);
    expect(r.stdout).toContain("DEMO-1  전이함  백로그 → 요구사항 승인 대기");
    await f.srv.close();
  });

  it("원격 링크는 한 번만 더하고 설명은 고치지 않는다(PUT · PATCH 없음)", async () => {
    const f = await setup();
    await cli(["sync", "jira"], f.repo, { env: ENV });
    const again = await cli(["sync", "jira"], f.repo, { env: ENV });
    expect(f.issues["DEMO-1"]?.links).toHaveLength(1);
    expect(f.issues["DEMO-1"]?.links[0]?.url).toBe("https://gitlab.com/acme/demo/-/tree/develop/.agents/docs/issues/DEMO-1-upload-cleanup");
    expect(again.stdout).toContain("링크 있음");
    expect(f.srv.seen.filter((s) => s.method === "PUT" || s.method === "PATCH")).toHaveLength(0);
    const mr = await cli(["sync", "jira", "--issue", "DEMO-1", "--mr-url", "https://gitlab.com/acme/demo/-/merge_requests/9"], f.repo, { env: ENV });
    expect(mr.code, mr.stdout + mr.stderr).toBe(0);
    expect(f.issues["DEMO-1"]?.links.map((l) => l.globalId)).toEqual(["harness-kit:sdd:DEMO-1", "harness-kit:mr:DEMO-1"]);
    await f.srv.close();
  });

  it("승인 전이가 필요한 단계는 기다리고, Jira 가 앞서 있으면 되돌리지 않는다", async () => {
    const f = await setup({ docs: { requirements: "approved", design: "draft" }, status: ST["requirements-review"] });
    const r = await cli(["sync", "jira"], f.repo, { env: ENV });
    expect(r.stdout).toContain("사람 승인 전이를 기다림");
    expect(posts(f.srv, "/transitions")).toBe(0);
    f.issues["DEMO-1"]!.status = ST.implementing;
    const ahead = await cli(["sync", "jira"], { ...f.repo }, { env: ENV });
    expect(ahead.stdout).toContain("Jira 가 앞섬");
    expect(ahead.code).toBe(0);
    await f.srv.close();
  });

  it("승인 전이 · 사람 상태 · maxStatus 위로 옮기라는 요청은 거부한다(exit 4, 전이 0건)", async () => {
    const f = await setup({ status: ST["requirements-review"] });
    for (const to of ["design", "done", "deployed", "implementing"]) {
      const r = await cli(["sync", "jira", "--issue", "DEMO-1", "--to", to], f.repo, { env: ENV, agent: "CLAUDECODE=1" });
      expect([to, r.code]).toEqual([to, 4]);
      expect(r.stdout).toContain("거부");
    }
    expect(posts(f.srv, "/transitions")).toBe(0);
    expect(f.issues["DEMO-1"]?.status).toBe(ST["requirements-review"]);
    // 에이전트 몫 상태(검증)로 옮기는 요청은 전이가 있으면 된다
    f.issues["DEMO-1"]!.status = ST.implementing;
    const ok = await cli(["sync", "jira", "--issue", "DEMO-1", "--to", "verifying"], f.repo, { env: ENV, agent: "CLAUDECODE=1" });
    expect([ok.code, f.issues["DEMO-1"]?.status]).toEqual([0, ST.verifying]);
    await f.srv.close();
  });

  it("--dry-run 은 전이도 링크도 쓰지 않는다", async () => {
    const f = await setup();
    const r = await cli(["sync", "jira", "--dry-run"], f.repo, { env: ENV });
    expect(r.stdout).toContain("전이 예정");
    expect(f.srv.seen.filter((s) => s.method !== "GET")).toHaveLength(0);
    await f.srv.close();
  });
});

const HISTORY = [
  { id: "9001", created: "2026-11-24T10:00:00.000+0900", account: "pm", from: ST["requirements-review"], to: ST.design },
  { id: "9002", created: "2026-11-24T11:00:00.000+0900", account: "dev", from: ST.design, to: ST.implementing },
  { id: "9003", created: "2026-11-24T12:00:00.000+0900", account: "other", from: ST["requirements-review"], to: ST.design },
  { id: "9004", created: "2026-11-24T13:00:00.000+0900", account: "qa", from: ST.verifying, to: ST.done },
  { id: "9005", created: "2026-11-24T14:00:00.000+0900", account: "hidden", from: ST.design, to: ST.implementing },
  { id: "9006", created: "2026-11-24T15:00:00.000+0900", account: "pm", from: ST.backlog, to: ST["requirements-draft"] },
];

function pyApprovals(root: string, body: string): { code: number; out: string } {
  const script = `import json,sys\nsys.path.insert(0, ${JSON.stringify(path.join(root, "scripts"))})\nfrom harness import approvals as a\nfrom pathlib import Path\nroot=Path(${JSON.stringify(root)})\nfolder=next((root/'.agents/docs/issues').glob('DEMO-1-*'))\nentries=a.parse((folder/'approvals.md').read_bytes())['entries']\n${body}`;
  const r = spawnSync("python3", ["-c", script], { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  return { code: r.status ?? -1, out: r.stdout + r.stderr };
}

describe("sync jira --approvals — Jira → approvals.md(REST changelog 만)", () => {
  it("사람의 승인 전이 3건을 경로 jira · 근거 changelog 로 기록하고, 다시 돌리면 0건, 승인자 밖 · 이메일 없음은 경고만", async () => {
    const f = await setup({ docs: { requirements: "in-review", design: "in-review" }, status: ST.implementing, history: HISTORY });
    const r = await cli(["sync", "jira", "--approvals"], f.repo, { env: ENV, agent: "CLAUDECODE=1" });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain("승인 3건 가져옴");
    expect(r.stdout).toContain("stranger@example.com 는 approvers.requirements 에 없다");
    expect(r.stdout).toContain("작성자 이메일을 읽지 못했다");
    const dir = ".agents/docs/issues/DEMO-1-upload-cleanup";
    const text = readFile(f.repo.root, `${dir}/approvals.md`);
    expect(text.match(/^## /gm)).toHaveLength(3);
    expect(text).toContain("## 2026-11-24T10:00:00.000+09:00 · requirements · approved");
    expect(text).toContain("- 승인자: pm@example.com");
    expect(text).toContain("- 대상: requirements.md · sha256: (jira)");
    expect(text).toContain("- 경로: jira");
    expect(text).toContain("- 근거: changelog 9001");
    expect(text).toContain("- 승인자: qa@example.com");
    expect(text).not.toContain("stranger@example.com");
    expect(readFile(f.repo.root, `${dir}/requirements.md`)).toContain("status: approved");
    expect(readFile(f.repo.root, `${dir}/design.md`)).toContain("status: approved");
    // Python 파서도 같은 기록을 유효로 읽고, 승인 뒤 문서가 바뀌어도 jira 기록은 비교하지 않는다
    const py = pyApprovals(f.repo.root, "print(json.dumps([e['valid'] for e in entries]))\nprint(a.approval_state(entries,'requirements','f'*64,{}), a.approval_state(entries,'done',None,{}))");
    expect(py.out.trim().split("\n")).toEqual(["[true, true, true]", "valid valid"]);
    // 에이전트 세션의 새 기록은 승인 로그에 있어야 한다(approvals_guard 규칙)
    const log = readFile(f.repo.root, ".agents/state/approvals-log.jsonl").trim().split("\n").map((l) => JSON.parse(l));
    expect(log).toHaveLength(3);
    const ids = [...text.matchAll(/- 기록 ID: (\S+)/g)].map((m) => m[1]);
    expect(log.map((l) => l.entryId)).toEqual(ids);
    const again = await cli(["sync", "jira", "--approvals"], f.repo, { env: ENV, agent: "CLAUDECODE=1" });
    expect(again.stdout).toContain("승인 0건 가져옴 · 이미 있어 건너뜀 3건");
    expect(readFile(f.repo.root, `${dir}/approvals.md`)).toBe(text);
    expect(r.stdout + again.stdout + text).not.toContain(TOKEN);
    await f.srv.close();
  });

  it("승인 가져오기는 변경 기록 페이지를 끝까지 읽고 changelog 이외(MCP 등)를 쓰지 않는다", async () => {
    const f = await setup({ docs: { requirements: "in-review", design: "in-review" }, status: ST.implementing, history: HISTORY });
    await cli(["sync", "jira", "--approvals"], f.repo, { env: ENV });
    const pages = f.srv.seen.filter((s) => s.url.includes("/changelog")).map((s) => new URL(`http://x${s.url}`).searchParams.get("startAt"));
    expect(pages).toEqual(["0", "2", "4"]);
    expect(f.srv.seen.every((s) => s.url.startsWith("/rest/api/3/"))).toBe(true);
    await f.srv.close();
  });

  it("--verify 는 jira 경로 기록을 changelog 로 다시 대조한다(쓰지 않는다)", async () => {
    const f = await setup({ docs: { requirements: "in-review", design: "in-review" }, status: ST.implementing, history: HISTORY });
    await cli(["sync", "jira", "--approvals"], f.repo, { env: ENV });
    const ok = await cli(["sync", "jira", "--verify"], f.repo, { env: ENV });
    expect([ok.code, ok.stdout]).toEqual([0, expect.stringContaining("3건 대조 · 문제 0건")]);
    const file = path.join(f.repo.root, ".agents/docs/issues/DEMO-1-upload-cleanup/approvals.md");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("changelog 9002", "changelog 7777"));
    const bad = await cli(["sync", "jira", "--verify"], f.repo, { env: ENV });
    expect(bad.code).toBe(1);
    expect(bad.stdout).toContain("changelog 7777 가 Jira 에 없다");
    await f.srv.close();
  });

  it("승인 가져오기에서 서버 오류는 토큰 없이 경고로 남고 exit 1", async () => {
    const f = await setup({ history: HISTORY });
    await f.srv.close();
    const r = await cli(["sync", "jira", "--approvals"], f.repo, { env: ENV });
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).not.toContain(TOKEN);
  });
});

describe("KIT 경로", () => {
  it("시험이 킷 템플릿을 쓴다", () => {
    expect(fs.existsSync(path.join(KIT, "packages/templates/optional/jira-workflow/module.json"))).toBe(true);
  });
});
