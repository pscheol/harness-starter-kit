/** 몹 세션과 답 API 참석자(설계 08 §3.14 · DS-R24). 처리는 mob.py, 답 줄은 `답 · 답한 사람 · 시각 · 기록: <git 사용자>`. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { call, commitAll, makeRepo, readFile, serve, sha256, writeFile } from "./helpers";

const INT = ".agents/docs/intents/INT-1-pay";
const Q = "---\ntarget: INT-1\nstatus: open\nround: 1\n---\n\n# 질문\n\n## Q-1 · 범위 · 답할 직무: po · 막는 게이트: intent\n넣는가?\n\n- A. 넣는다 — 영향: 하나\n- B. 뺀다 — 영향: 둘\n- 권장: B — 근거: 없다\n- 답:\n";

function repo() {
  const r = makeRepo({ groups: { po: ["lee@example.com"], dev: ["kim@example.com"] }, approvers: { intent: ["po"] } });
  writeFile(r.root, `${INT}/intent.md`, "---\nid: INT-1\ntitle: 결제\nstatus: draft\nkind: product\nrisk: low\n---\n\n# Intent\n");
  writeFile(r.root, `${INT}/questions.md`, Q);
  commitAll(r.root);
  return r;
}

describe("몹 세션", () => {
  it("start 는 그룹을 덮어야 하고, 열려 있으면 답 API 는 참석자 by 를 받고 기록한 사람을 따로 남긴다", async () => {
    const r = repo();
    const srv = await serve(r);
    const refused = await call(srv, "POST", "/api/v1/intents/INT-1/mob", { body: { action: "start", attendees: ["kim@example.com"] } });
    expect([refused.status, refused.json.error.code]).toEqual([422, "mob_refused"]);
    const started = await call(srv, "POST", "/api/v1/intents/INT-1/mob", { body: { action: "start", attendees: ["lee@example.com", "kim@example.com"], timeboxMin: 25 } });
    expect(started.status, started.text).toBe(200);
    expect(JSON.parse(readFile(r.root, `${INT}/mob.json`)).facilitator).toBe("kim@example.com");
    const base = () => sha256(fs.readFileSync(path.join(r.root, INT, "questions.md")));
    const none = await call(srv, "POST", "/api/v1/questions/INT-1/Q-1/answer", { body: { choice: "B", baseSha256: base(), pin: srv.pin } });
    expect([none.status, none.json.error.message]).toEqual([400, expect.stringContaining("by")]);
    const outsider = await call(srv, "POST", "/api/v1/questions/INT-1/Q-1/answer", { body: { choice: "B", by: "park@example.com", baseSha256: base(), pin: srv.pin } });
    expect([outsider.status, outsider.json.error.message]).toEqual([400, expect.stringContaining("참석자가 아니다")]);
    const ok = await call(srv, "POST", "/api/v1/questions/INT-1/Q-1/answer", { body: { choice: "B", by: "lee@example.com", baseSha256: base(), pin: srv.pin } });
    expect([ok.status, ok.json.data.kind]).toEqual([200, "answer"]);
    expect(readFile(r.root, `${INT}/questions.md`)).toMatch(/- 답: B · lee@example\.com · \S+ · 기록: kim@example\.com/);
    const status = await call(srv, "GET", "/api/v1/intents/INT-1/mob");
    expect(status.json.data.open).toBe(true);
    const closed = await call(srv, "POST", "/api/v1/intents/INT-1/mob", { body: { action: "close" } });
    expect([closed.status, closed.json.data.action]).toEqual([200, "close"]);
    expect(fs.existsSync(path.join(r.root, ".agents/state/dispatch-queue"))).toBe(false);
  });

  it("읽기 전용이면 몹 세션을 열지 않는다", async () => {
    const srv = await serve(repo(), { readOnly: true });
    const r = await call(srv, "POST", "/api/v1/intents/INT-1/mob", { body: { action: "start", attendees: ["lee@example.com"] } });
    expect([r.status, r.json.error.code]).toEqual([403, "read_only"]);
  });
});
