/** 흐름 보기 패키지(HK-18 → HK-26, 설계 06 §3.16): 접근성 글 · 소스에 외부 요청 없음 · 의존성. 번들은 packages/dashboard-ui 가 화면 번들 안의 늦게 받는 조각으로 만든다. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ariaLabelOf, flagText, stepOf, type FlowLabels } from "../src/types";

const DIR = path.resolve(__dirname, "..");

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
    expect(flagText("verify:failed", labels)).toBe("검증 failed"); // 값 풀이가 없으면 원문
    expect(flagText("verify:failed", { ...labels, flagValues: { failed: "실패" } })).toBe("검증 실패");
  });

  it("ariaLabelOf: Unit 이름 · 지금 단계 · 표시 · Bolt 를 글로 읽는다", () => {
    const text = ariaLabelOf("U-1", "unit", { title: "결제수단 등록", steps: ["requirements:done", "design:done", "impl:active", "mr"], flags: ["critical:1"], bolts: { done: 2, total: 4, estimated: false } }, labels);
    expect(text).toBe("U-1 결제수단 등록, 구현 진행 중, CRITICAL 1, Bolt 2/4");
    expect(ariaLabelOf("U-4", "contract-unit", { title: "API", steps: ["requirements:done"] }, labels)).toBe("U-4 API, 계약, 요구사항 지남");
    expect(ariaLabelOf("U-2", "unit", { title: "정산", bolts: { done: 0, total: 1, estimated: true } }, labels)).toContain("Bolt 0/1 추정");
  });
});

describe("소스(R7)", () => {
  it("외부 요청 · 인라인 스타일 요소가 없다(화면 CSP)", () => {
    for (const f of fs.readdirSync(path.join(DIR, "src"))) {
      const src = fs.readFileSync(path.join(DIR, "src", f), "utf8");
      expect([f, /fetch\(\s*["'`]https?:|XMLHttpRequest|sendBeacon|WebSocket\(|createElement\(\s*["']style["']/.test(src)]).toEqual([f, false]);
    }
  });

  it("package.json: 런타임 의존성 0, react 등은 devDependency 에만(화면 번들에만 들어간다), 자체 빌드 스크립트 없음", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(DIR, "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string>; scripts: Record<string, string> };
    expect(pkg.dependencies).toEqual({});
    for (const n of ["react", "react-dom", "@xyflow/react"]) expect(pkg.devDependencies[n]).toBeTruthy();
    expect(pkg.scripts.build).toBeUndefined();
    const cli = JSON.parse(fs.readFileSync(path.join(DIR, "../cli/package.json"), "utf8")) as { dependencies: Record<string, string> };
    const dash = JSON.parse(fs.readFileSync(path.join(DIR, "../dashboard/package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect([cli.dependencies, dash.dependencies]).toEqual([{}, {}]);
  });
});
