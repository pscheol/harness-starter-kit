/**
 * 배포 · 운영 명령(HK-21, 설계 14): deploy · ops · metrics · rules · approve deploy:<기록> · intake --from ops:… · status --ops.
 * 판정 · 계산은 설치본 scripts/harness/*.py 하나다 — CLI 는 부르고 종료 코드 · --json 을 옮긴다.
 */
import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { call, cleanEnv, commitAll, makeRepo, readFile, serve, writeFile, type Repo } from "../../dashboard/test/helpers";
import { doneIssue, plan, ready } from "../../dashboard/test/ops-helpers";
import { dashboardDeps } from "../src/commands/dashboard";
import { main, type Io } from "../src/main";
import { CLI_DIR } from "./helpers";

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
  json: any;
}

async function cli(argv: string[], repo: Repo, opts: { tty?: boolean; answers?: string[]; agent?: string | null } = {}): Promise<CliRun> {
  let stdout = "";
  let stderr = "";
  const stdin = new PassThrough();
  for (const a of opts.answers ?? []) stdin.write(`${a}\n`);
  const io: Io = {
    stdout: (s) => {
      stdout += s;
    },
    stderr: (s) => {
      stderr += s;
    },
    env: cleanEnv(repo.home),
    cwd: repo.root,
    cliFile: path.join(CLI_DIR, "dist", "cli.js"),
    isTTY: opts.tty ?? false,
    nodeVersion: process.versions.node,
    stdin,
    today: "2026-12-10",
    agentSession: () => (opts.agent === undefined ? null : opts.agent),
  };
  const code = await main(argv, io);
  stdin.end();
  let json: any = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = null;
  }
  return { code, stdout, stderr, json };
}

function deployRepo(): { repo: Repo; record: string; id: string } {
  const repo = makeRepo({ gates: ["requirements", "design", "tasks", "mr", "done", "deploy"] });
  doneIssue(repo, "DEMO-1", "pay-api");
  doneIssue(repo, "DEMO-2", "pay-method");
  commitAll(repo.root);
  const record = plan(repo);
  return { repo, record, id: record.split("/").pop()?.replace(/\.md$/, "") as string };
}

const OPS_RECORD = `---
kind: ops-record
topic: payment-v2-week1
period: { from: 2026-12-01, to: 2026-12-07 }
created: 2026-12-08
---

## 1. 목표 대비 실측
| ID | 지표 | 목표 | 실측 | 판정 | 출처 |
|---|---|---|---|---|---|
| INT-7 SC-1 | 결제 실패율 | ≤ 0.5% | 0.42% | 충족 | https://grafana.example/d/pay?from=1&to=2 |

## 5. 다음 Intent 후보
| ID | 후보 | 근거 | 종류 | 접수 |
|---|---|---|---|---|
| NX-1 | 결제 API p95 개선 | INT-7 SC-1 | change | — |
`;

describe("deploy · approve deploy:<기록>", () => {
  it("plan → check(D3) → approve(면제) → check --require-approved", async () => {
    const { repo, record, id } = deployRepo();
    ready(repo, record, false);
    const bad = await cli(["deploy", "check", id, "--json"], repo);
    expect([bad.code, bad.json.failed]).toEqual([1, ["D3"]]);
    const refused = await cli(["approve", `deploy:${id}`, "--gate", "deploy", "--phrase", "10%부터 연다", "--waive-rollback", "검증 환경에 PG 샌드박스가 없다", "--json"], repo, { tty: true, answers: [id], agent: "CLAUDECODE=1" });
    expect([refused.code, refused.json.error.code]).toEqual([3, "read_only"]);
    const wrongKey = await cli(["approve", `deploy:${id}`, "--gate", "deploy", "--phrase", "x", "--waive-rollback", "검증 환경에 PG 샌드박스가 없다", "--json"], repo, { tty: true, answers: ["DEMO-1"] });
    expect([wrongKey.code, wrongKey.json.error.code]).toEqual([1, "not_confirmed"]);
    const noWaiver = await cli(["approve", `deploy:${id}`, "--gate", "deploy", "--phrase", "x", "--json"], repo, { tty: true, answers: [id] });
    expect([noWaiver.code, noWaiver.json.error.code, noWaiver.json.error.details.conditions]).toEqual([1, "gate_precondition", ["D3"]]);
    const ok = await cli(["approve", `deploy:${id}`, "--gate", "deploy", "--phrase", "10%부터 연다", "--waive-rollback", "검증 환경에 PG 샌드박스가 없다", "--json"], repo, { tty: true, answers: [id] });
    expect(ok.code, ok.stdout + ok.stderr).toBe(0);
    expect(ok.json.issues).toEqual(["DEMO-1", "DEMO-2"]);
    expect(readFile(repo.root, ".agents/docs/issues/DEMO-2-pay-method/approvals.md")).toContain("- 경로: terminal");
    const done = await cli(["deploy", "check", id, "--require-approved"], repo);
    expect(done.code, done.stdout + done.stderr).toBe(0);
  });

  it("plan 은 done 을 통과하지 않은 이슈 키를 내고 exit 1, 사용법 틀리면 exit 2", async () => {
    const { repo } = deployRepo();
    const r = await cli(["deploy", "plan", "DEMO-9"], repo);
    expect(r.code).toBe(1);
    expect((await cli(["deploy"], repo)).code).toBe(2);
    expect((await cli(["deploy", "check"], repo)).code).toBe(2);
  });
});

describe("ops · metrics · rules · intake --from · status --ops", () => {
  it("ops new / check, status --ops 는 GET /ops 와 같다", async () => {
    const repo = makeRepo();
    commitAll(repo.root);
    const made = await cli(["ops", "new", "--topic", "payment-v2-week1", "--from", "2026-12-01", "--to", "2026-12-07", "--json"], repo);
    expect(made.code, made.stdout + made.stderr).toBe(0);
    expect(made.json.record).toBe(".agents/docs/ops/records/2026-12-07-payment-v2-week1.md");
    expect((await cli(["ops", "check"], repo)).code).toBe(0);
    expect((await cli(["ops", "nope"], repo)).code).toBe(2);
    const srv = await serve(repo, { deps: dashboardDeps() });
    const api = await call(srv, "GET", "/api/v1/ops");
    const out = await cli(["status", "--ops", "--json"], repo);
    expect(out.code).toBe(0);
    expect(out.json).toEqual(api.json.data);
  });

  it("metrics: 기준선은 킷 도입 커밋이 없으면 exit 1, 기본은 5개 지표 JSON", async () => {
    const repo = makeRepo();
    commitAll(repo.root);
    const base = await cli(["metrics", "--baseline"], repo);
    expect(base.code).toBe(1);
    const r = await cli(["metrics", "--json"], repo);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(Object.keys(r.json.metrics).sort()).toEqual(["approvalWaitHours", "changeFailureRate", "leadTimeHours", "mttrHours", "reworkRate"]);
  });

  it("rules: candidates 는 후보 없음, promote · reject 는 에이전트 세션이면 exit 3", async () => {
    const repo = makeRepo();
    commitAll(repo.root);
    expect((await cli(["rules", "candidates"], repo)).stdout).toContain("새 규칙 후보가 없다");
    const agent = await cli(["rules", "promote", "RC-1", "--json"], repo, { tty: true, agent: "CLAUDECODE=1" });
    expect([agent.code, agent.json.error.code]).toEqual([3, "read_only"]);
    expect((await cli(["rules", "reject", "RC-1"], repo, { tty: true })).code).toBe(2);
    expect((await cli(["rules", "promote", "RC-1"], repo, { tty: true })).code).toBe(1);
  });

  it("intake --from ops:… 은 Intent 를 만들고 같은 후보는 다시 만들지 않는다", async () => {
    const repo = makeRepo();
    fs.cpSync(path.resolve(CLI_DIR, "../templates/common/agents-docs/_spec-templates"), path.join(repo.root, ".agents/docs/_spec-templates"), { recursive: true });
    writeFile(repo.root, ".agents/docs/ops/records/2026-12-08-payment-v2-week1.md", OPS_RECORD);
    commitAll(repo.root);
    const first = await cli(["intake", "--from", "ops:ops/records/2026-12-08-payment-v2-week1.md#NX-1", "--json"], repo);
    expect(first.code, first.stdout + first.stderr).toBe(0);
    expect(readFile(repo.root, `${first.json.folder}/intake.md`)).toContain("type: ops");
    const again = await cli(["intake", "--from", "ops:ops/records/2026-12-08-payment-v2-week1.md#NX-1", "--json"], repo);
    expect([again.code, again.json.existing]).toEqual([0, true]);
    const bad = await cli(["intake", "--from", "ops:nothing#NX-1"], repo);
    expect(bad.code).toBe(1);
  });
});
