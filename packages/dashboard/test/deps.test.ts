/**
 * 모델을 부르지 않는다(DB-R26, 완료 기준 15): 의존성 트리에 모델 SDK 0개, 소스에 모델 API 주소 0건,
 * 시험 중 밖으로 나가는 연결 0건(127.0.0.1 · UDS 만).
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { call, commitAll, DASH_DIR, KIT, makeRepo, serve, writeIssue } from "./helpers";

const SDK = /(^|\/)(@anthropic-ai\/|anthropic$|openai$|@openai\/|@google\/generative-ai|@google\/genai|@ai-sdk\/|^ai$|langchain|@langchain\/|cohere-ai|@mistralai\/|ollama|@aws-sdk\/client-bedrock|replicate$|groq-sdk|together-ai)/;
const HOSTS = /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai|api\.cohere\.|bedrock-runtime/;

function files(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const n of fs.readdirSync(d)) {
      if (n === "node_modules" || n === "dist") continue;
      const f = path.join(d, n);
      if (fs.statSync(f).isDirectory()) walk(f);
      else if (ext.test(n)) out.push(f);
    }
  };
  walk(dir);
  return out;
}

describe("DB-R26 모델 SDK · 모델 API 없음", () => {
  it("CLI · 대시보드 런타임 의존성 0, lock 에 모델 SDK 0개", () => {
    for (const pkg of ["packages/cli/package.json", "packages/dashboard/package.json"]) {
      const j = JSON.parse(fs.readFileSync(path.join(KIT, pkg), "utf8"));
      expect([pkg, Object.keys(j.dependencies ?? {})]).toEqual([pkg, []]);
      for (const name of Object.keys({ ...(j.devDependencies ?? {}), ...(j.optionalDependencies ?? {}), ...(j.peerDependencies ?? {}) })) expect([pkg, name, SDK.test(name)]).toEqual([pkg, name, false]);
    }
    const lock = fs.readFileSync(path.join(KIT, "pnpm-lock.yaml"), "utf8");
    const names = [...lock.matchAll(/^ {2}'?((?:@[^/\s']+\/)?[^@\s':]+)@/gm)].map((m) => m[1] as string);
    expect(names.length).toBeGreaterThan(5);
    expect(names.filter((n) => SDK.test(n))).toEqual([]);
  });

  it("소스에 모델 API 주소가 없다", () => {
    const src = [...files(path.join(DASH_DIR, "src"), /\.ts$/), ...files(path.join(KIT, "packages/cli/src"), /\.ts$/)];
    expect(src.length).toBeGreaterThan(20);
    expect(src.filter((f) => HOSTS.test(fs.readFileSync(f, "utf8")))).toEqual([]);
  });

  it("모든 읽기 API 를 부르는 동안 밖으로 나가는 연결 0건", async () => {
    const repo = makeRepo();
    writeIssue(repo.root, "DEMO-1", "upload-cleanup", { requirements: "in-review" });
    commitAll(repo.root);
    const seen: string[] = [];
    const orig = net.Socket.prototype.connect;
    (net.Socket.prototype as any).connect = function (this: net.Socket, ...args: any[]) {
      const o = args[0];
      seen.push(typeof o === "object" && o !== null ? String(o.path ?? `${o.host ?? "localhost"}:${o.port}`) : String(o));
      return (orig as any).apply(this, args);
    };
    try {
      const srv = await serve(repo);
      for (const r of ["session", "overview", "issues", "issues/DEMO-1", "intents", "verify", "reports/summary", "reports/findings", "reviews/DEMO-1", "worktrees", "sessions", "dispatch/queue", "harness", "flow/gates", "questions?target=DEMO-1"]) {
        const res = await call(srv, "GET", `/api/v1/${r}`);
        expect([r, res.status < 500]).toEqual([r, true]);
      }
    } finally {
      (net.Socket.prototype as any).connect = orig;
    }
    expect(seen.filter((s) => !/^(127\.0\.0\.1|localhost):\d+$/.test(s) && !s.startsWith("/"))).toEqual([]);
  });
});
