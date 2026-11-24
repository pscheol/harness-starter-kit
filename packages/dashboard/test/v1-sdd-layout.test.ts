/**
 * v1 SDD 배치(단계 폴더 `<영역>-specs/{requirements,design,tasks/{active,check,completed}}/NNN-유형-이름.md`) 읽기(설계 11 MG-R10 · §3.7, 완료 기준 7).
 * v3.0 전까지 보드 · 관리 페이지 진행 탭이 이 옛 배치 이슈를 읽는다.
 */
import { describe, expect, it } from "vitest";
import { call, commitAll, makeRepo, python, serve, writeFile } from "./helpers";

const SPECS = ".agents/docs/upload-specs";
const head = (status: string): string => `---\nstatus: ${status}\n---\n# 옛 문서\n`;

/** v1 배치 이슈 다섯 개: 요구사항만 · 설계 검토 중 · tasks active · tasks check · tasks completed. */
function writeV1Issues(root: string): string[] {
  const names = ["001-feat-draft-only", "002-feat-design-review", "003-feat-in-progress", "004-feat-in-check", "005-feat-finished"];
  const put = (rel: string, body: string): void => void writeFile(root, `${SPECS}/${rel}`, body);
  put(`requirements/${names[0]}.md`, head("draft"));
  for (const n of names.slice(1)) put(`requirements/${n}.md`, head("approved"));
  put(`design/${names[1]}.md`, head("in-review"));
  for (const n of names.slice(2)) put(`design/${n}.md`, head("approved"));
  put(`tasks/active/${names[2]}.md`, "# 옛 tasks\n\n- [ ] T001 하는 중\n");
  put(`tasks/check/${names[3]}.md`, "# 옛 tasks\n\n- [x] T001 끝\n");
  put(`tasks/completed/${names[4]}.md`, "# 옛 tasks\n\n- [x] T001 끝\n");
  return names;
}

describe("v1 SDD 배치 읽기(MG-R10)", () => {
  it("v1 배치 이슈 5개가 board 와 같은 상태로 관리 페이지 진행 목록에 보인다", async () => {
    const repo = makeRepo();
    const names = writeV1Issues(repo.root);
    commitAll(repo.root);
    const srv = await serve(repo);
    const r = await call(srv, "GET", "/api/v1/issues");
    expect(r.status, r.text).toBe(200);
    const issues = r.json.data.issues as { key: string; boardState: string; stage: string }[];
    const board = python(["scripts/sdd-layout.py", "board", "--json"], repo.root);
    expect(board.code, board.stderr).toBe(0);
    const fromBoard = Object.fromEntries((JSON.parse(board.stdout).issues as { key: string; state: string }[]).map((i) => [i.key, i.state]));
    for (const n of names) {
      const seen = issues.find((i) => i.key === n);
      expect(seen, `${n} 가 진행 목록에 없다`).toBeDefined();
      expect([n, seen?.boardState]).toEqual([n, fromBoard[n]]);
    }
    expect(names.map((n) => fromBoard[n]).filter(Boolean).length).toBe(5);
    expect(new Set(names.map((n) => fromBoard[n])).size).toBeGreaterThanOrEqual(4);
  });

  it("v1 배치 문서는 읽기 전용이다 — 승인 API 가 옛 키로는 쓰지 않는다", async () => {
    const repo = makeRepo();
    const names = writeV1Issues(repo.root);
    commitAll(repo.root);
    const srv = await serve(repo);
    const body = { target: { issue: names[1] }, gate: "design", decision: "approved", phrase: "확정", docSha256: "0".repeat(64), pin: srv.pin };
    const r = await call(srv, "POST", "/api/v1/approvals", { body });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });
});
