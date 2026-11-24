/** 흐름 보기 패키지(HK-18, 설계 06 §3.16): 접근성 글 · 번들이 소스에서 같은 바이트로 다시 만들어지는지 · 크기 · 외부 요청 없음. */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ariaLabelOf, flagText, stepOf, type FlowLabels } from "../src/types";

const DIR = path.resolve(__dirname, "..");
const VENDOR = path.resolve(DIR, "../dashboard/static/vendor");
const sha = (f: string): string => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

const labels: FlowLabels = {
  canvas: "Unit 의존 흐름", controls: "조절", minimap: "미니맵", contract: "계약", contractTag: "계약", noSession: "세션 없음", bolt: "Bolt", estimated: "추정",
  steps: { requirements: "요구사항", design: "설계", impl: "구현", mr: "MR" },
  state: { done: "지남", active: "진행 중", todo: "아직" },
  flags: { critical: "CRITICAL", verify: "검증" },
  area: "영역",
};

describe("노드 글(색만으로 말하지 않는다)", () => {
  it("stepOf · flagText", () => {
    expect(stepOf("impl:active")).toEqual({ id: "impl", state: "active" });
    expect(stepOf("requirements:done")).toEqual({ id: "requirements", state: "done" });
    expect(stepOf("mr")).toEqual({ id: "mr", state: "todo" });
    expect(flagText("critical:1", labels)).toBe("CRITICAL 1");
    expect(flagText("verify:failed", labels)).toBe("검증 failed");
  });

  it("ariaLabelOf: Unit 이름 · 지금 단계 · 표시 · Bolt 를 글로 읽는다", () => {
    const text = ariaLabelOf("U-1", "unit", { title: "결제수단 등록", steps: ["requirements:done", "design:done", "impl:active", "mr"], flags: ["critical:1"], bolts: { done: 2, total: 4, estimated: false } }, labels);
    expect(text).toBe("U-1 결제수단 등록, 구현 진행 중, CRITICAL 1, Bolt 2/4");
    expect(ariaLabelOf("U-4", "contract-unit", { title: "API", steps: ["requirements:done"] }, labels)).toBe("U-4 API, 계약, 요구사항 지남");
    expect(ariaLabelOf("U-2", "unit", { title: "정산", bolts: { done: 0, total: 1, estimated: true } }, labels)).toContain("Bolt 0/1 추정");
  });
});

describe("번들(R2)", () => {
  it("소스에서 다시 빌드하면 커밋된 번들과 같은 바이트다(같은 소스 · 같은 esbuild 판)", () => {
    const before = ["flow.bundle.js", "flow.bundle.css", "THIRD-PARTY-LICENSES.txt"].map((f) => sha(path.join(VENDOR, f)));
    const r = spawnSync("node", ["build.mjs"], { cwd: DIR, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const after = ["flow.bundle.js", "flow.bundle.css", "THIRD-PARTY-LICENSES.txt"].map((f) => sha(path.join(VENDOR, f)));
    expect(after).toEqual(before);
  });

  it("크기 예산 · 외부 요청 없음 · 라이선스 문구(react · @xyflow/react · d3)", () => {
    const js = fs.readFileSync(path.join(VENDOR, "flow.bundle.js"), "utf8");
    expect(Buffer.byteLength(js)).toBeLessThan(450 * 1024);
    expect(fs.statSync(path.join(VENDOR, "flow.bundle.css")).size).toBeLessThan(30 * 1024);
    expect(js).not.toMatch(/fetch\(\s*["'`]https?:|XMLHttpRequest|sendBeacon|WebSocket\(/);
    expect(js).toContain("export{"); // ES 모듈 한 파일
    const lic = fs.readFileSync(path.join(VENDOR, "THIRD-PARTY-LICENSES.txt"), "utf8");
    for (const name of ["@xyflow/react@", "react@", "react-dom@", "d3-zoom@"]) expect(lic, name).toContain(name);
    expect(lic).toMatch(/MIT/);
  });

  it("package.json: 런타임 의존성 0, react 등은 devDependency 에만(번들에만 들어간다)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(DIR, "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(pkg.dependencies).toEqual({});
    for (const n of ["react", "react-dom", "@xyflow/react"]) expect(pkg.devDependencies[n]).toBeTruthy();
    const cli = JSON.parse(fs.readFileSync(path.join(DIR, "../cli/package.json"), "utf8")) as { dependencies: Record<string, string> };
    const dash = JSON.parse(fs.readFileSync(path.join(DIR, "../dashboard/package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect([cli.dependencies, dash.dependencies]).toEqual([{}, {}]);
  });
});
