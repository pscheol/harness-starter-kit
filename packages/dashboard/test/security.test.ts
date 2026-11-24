/**
 * 접속 · 요청 검사(06 DB-R1~R5 · R12 · R21 · R23, §3.14, 완료 기준 3).
 */
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findRunning } from "../src/server";
import { call, cleanEnv, makeRepo, serve, writeFile, writeIssue } from "./helpers";

function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a): a is os.NetworkInterfaceInfo => Boolean(a) && !(a as os.NetworkInterfaceInfo).internal)
    .map((a) => a.address);
}

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 500 });
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
    s.once("timeout", () => {
      s.destroy();
      resolve(false);
    });
  });
}

describe("바인드 · Host · 토큰 · Origin", () => {
  it("127.0.0.1 에만 바인드한다 — 다른 주소로 연결 0건(DB-R1)", async () => {
    const repo = makeRepo();
    const srv = await serve(repo);
    expect(srv.address).toBe("127.0.0.1");
    expect(await canConnect("127.0.0.1", srv.port)).toBe(true);
    const others = [...lanAddresses(), "::1"];
    for (const host of others) expect([host, await canConnect(host, srv.port)]).toEqual([host, false]);
  });

  it("Host: evil.example 은 421, localhost:<포트> 는 통과(DB-R2)", async () => {
    const srv = await serve(makeRepo());
    expect((await call(srv, "GET", "/api/v1/session", { host: "evil.example" })).status).toBe(421);
    expect((await call(srv, "GET", "/", { host: `evil.example:${srv.port}` })).status).toBe(421);
    expect((await call(srv, "GET", "/api/v1/session", { host: `127.0.0.1:${srv.port + 1}` })).status).toBe(421);
    expect((await call(srv, "GET", "/api/v1/session", { host: `localhost:${srv.port}` })).status).toBe(200);
  });

  it("토큰 없는 · 틀린 /api/v1/session 은 401(DB-R3)", async () => {
    const srv = await serve(makeRepo());
    const none = await call(srv, "GET", "/api/v1/session", { token: null });
    expect(none.status).toBe(401);
    expect(none.json.error.code).toBe("unauthorized");
    expect((await call(srv, "GET", "/api/v1/session", { token: "x".repeat(43) })).status).toBe(401);
    const ok = await call(srv, "GET", "/api/v1/session");
    expect(ok.status).toBe(200);
    expect(ok.json.ok).toBe(true);
  });

  it("Origin: http://evil.example 의 PUT 은 403, Origin 없음 · JSON 아님도 403(DB-R5)", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "draft" });
    const srv = await serve(repo);
    const body = { path: ".agents/docs/issues/DEMO-1-upload-cleanup/requirements.md", baseSha256: "0", markdown: "x" };
    const evil = await call(srv, "PUT", "/api/v1/docs", { body, origin: "http://evil.example" });
    expect(evil.status).toBe(403);
    expect(evil.json.error.code).toBe("forbidden_origin");
    expect((await call(srv, "PUT", "/api/v1/docs", { body, origin: null })).status).toBe(403);
    expect((await call(srv, "PUT", "/api/v1/docs", { body, contentType: "text/plain" })).status).toBe(403);
  });

  it("본문 1 MiB 초과 · JSON 오류는 400", async () => {
    const srv = await serve(makeRepo());
    const big = await call(srv, "POST", "/api/v1/dispatch", { raw: `{"x":"${"a".repeat(1024 * 1024 + 10)}"}` });
    expect(big.status).toBe(400);
    expect((await call(srv, "POST", "/api/v1/dispatch", { raw: "{nope" })).status).toBe(400);
  });

  it("토큰 파일 0600 · 상태 폴더 0700 · dashboard.json, 끝나면 지운다(DB-R4)", async () => {
    const repo = makeRepo();
    const srv = await serve(repo);
    const state = path.join(repo.root, ".agents/state");
    expect(fs.statSync(state).mode & 0o777).toBe(0o700);
    const tokenFile = path.join(state, "dashboard.token");
    expect(fs.statSync(tokenFile).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(tokenFile, "utf8").trim()).toBe(srv.token);
    expect(Buffer.from(srv.token, "base64url").length).toBe(32);
    const info = JSON.parse(fs.readFileSync(path.join(state, "dashboard.json"), "utf8"));
    expect(info).toMatchObject({ pid: process.pid, port: srv.port, readOnly: false });
    expect(srv.pin).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(fs.readFileSync(tokenFile, "utf8")).not.toContain(srv.pin as string);
    await srv.close();
    expect(fs.existsSync(tokenFile)).toBe(false);
    expect(fs.existsSync(path.join(state, "dashboard.json"))).toBe(false);
  });

  it("같은 리포에 서버가 돌고 있으면 그 주소를 찾는다 — 에이전트 세션에는 토큰을 주지 않는다(DB-R23)", async () => {
    const repo = makeRepo();
    const srv = await serve(repo);
    const human = await findRunning(repo.root, cleanEnv(repo.home), () => null);
    expect(human?.url).toBe(`http://127.0.0.1:${srv.port}/#t=${srv.token}`);
    const agent = await findRunning(repo.root, cleanEnv(repo.home), () => "CLAUDECODE=1");
    expect(agent?.url).toBe(`http://127.0.0.1:${srv.port}/`);
    await srv.close();
    expect(await findRunning(repo.root, cleanEnv(repo.home), () => null)).toBeNull();
  });

  it("화면 파일은 토큰 없이, CSP 와 nosniff 를 붙인다", async () => {
    const srv = await serve(makeRepo());
    const page = await call(srv, "GET", "/", { token: null });
    expect(page.status).toBe(200);
    expect(page.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(page.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(page.headers["x-content-type-options"]).toBe("nosniff");
    expect(page.text).not.toContain(srv.token);
    const api = await call(srv, "GET", "/api/v1/session");
    expect(api.headers["cache-control"]).toBe("no-store");
  });

  it("/raw 는 서명 URL 만 받는다 — 틀린 서명 · 지난 시각 · 경로 조작은 403(DB-R21)", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", {
      requirements: "draft",
      body: { requirements: "## 화면\n\n![흐름](flow.png)\n" },
    });
    writeFile(repo.root, ".agents/docs/issues/DEMO-1-upload-cleanup/flow.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const srv = await serve(repo);
    const doc = await call(srv, "GET", `/api/v1/docs?path=${encodeURIComponent(".agents/docs/issues/DEMO-1-upload-cleanup/requirements.md")}`);
    expect(doc.status).toBe(200);
    const src = /<img src="([^"]+)"/.exec(doc.json.data.html)?.[1]?.replace(/&amp;/g, "&");
    expect(src).toMatch(/^\/raw\/.+\?exp=\d+&sig=[0-9a-f]{64}$/);
    const ok = await call(srv, "GET", src as string, { token: null });
    expect(ok.status).toBe(200);
    expect(ok.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(ok.headers["x-content-type-options"]).toBe("nosniff");
    const bad = (src as string).replace(/sig=[0-9a-f]{4}/, "sig=0000");
    expect((await call(srv, "GET", bad, { token: null })).status).toBe(403);
    const old = (src as string).replace(/exp=\d+/, "exp=1000");
    expect((await call(srv, "GET", old, { token: null })).status).toBe(403);
    expect((await call(srv, "GET", "/raw/..%2F..%2Fetc%2Fpasswd?exp=9999999999&sig=00", { token: null })).status).toBe(403);
  });
});
