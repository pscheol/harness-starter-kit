/** 요구사항 접수 POST /intake(설계 08 §3.11, HK-19 design §4). 처리는 intake.py — 여기서는 본문 검사 · base64 · 경로 거부 · 422 를 본다. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { call, KIT, makeRepo, readFile, serve, type Repo } from "./helpers";

const TEMPLATES = path.join(KIT, "packages/templates/common/agents-docs/_spec-templates");

function repo(): Repo {
  const r = makeRepo();
  fs.cpSync(TEMPLATES, path.join(r.root, ".agents/docs/_spec-templates"), { recursive: true });
  return r;
}

describe("POST /intake", () => {
  it("글 · base64 첨부를 Intent 폴더로 받고 신뢰하지 않는 입력으로 적는다", async () => {
    const r = repo();
    const srv = await serve(r);
    const res = await call(srv, "POST", "/api/v1/intake", {
      body: { title: "결제 개편", kind: "feature", name: "pay-reform", text: "토큰 결제", links: ["https://example.com/a"], files: [{ name: "memo.md", base64: Buffer.from("# 메모\n").toString("base64") }] },
    });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    const folder = res.json.data.folder as string;
    expect(folder).toBe(".agents/docs/intents/INT-1-pay-reform");
    expect(readFile(r.root, `${folder}/intake.md`)).toContain("trust: untrusted");
    expect(readFile(r.root, `${folder}/attachments/01-memo.md`)).toBe("# 메모\n");
    expect(res.json.data.next).toBe("/hx-intent INT-1");
    await srv.close();
  });

  it("브라우저 요청은 로컬 경로를 받지 않는다 · 본문 검사 400 · 비밀값 422", async () => {
    const r = repo();
    const srv = await serve(r);
    const paths = await call(srv, "POST", "/api/v1/intake", { body: { title: "x", kind: "feature", name: "x", paths: ["/etc/hosts"] } });
    expect([paths.status, paths.json.error.code]).toEqual([400, "bad_request"]);
    expect(paths.json.error.message).toContain("터미널(CLI)에서만");
    for (const body of [{ kind: "feature", name: "x" }, { title: "x", kind: "epic", name: "x" }, { title: "x", kind: "feature", name: "Bad Name" }, { title: "x", kind: "feature", name: "x", files: [{ name: "../up", base64: "" }] }]) {
      expect((await call(srv, "POST", "/api/v1/intake", { body })).status).toBe(400);
    }
    const secret = await call(srv, "POST", "/api/v1/intake", { body: { title: "x", kind: "change", name: "leak", text: `키 ${"AK"}${"IA"}${"Q".repeat(16)}` } });
    expect([secret.status, secret.json.error.code]).toEqual([422, "intake_rejected"]);
    expect(fs.existsSync(path.join(r.root, ".agents/docs/intents"))).toBe(false);
    await srv.close();
  });

  it("읽기 전용 모드는 접수하지 않는다", async () => {
    const r = repo();
    const srv = await serve(r, { readOnly: true });
    const res = await call(srv, "POST", "/api/v1/intake", { body: { title: "x", kind: "feature", name: "x" } });
    expect([res.status, res.json.error.code]).toEqual([403, "read_only"]);
    await srv.close();
  });
});
