// 색 설정(사용자 결정 2026-11-24): 다섯 가지 · 기본 쿨 그레이 · 모르는 값은 기본으로 · html 속성만 바꾸고 저장한다.
// 노드 환경이라 document · localStorage 를 작은 가짜로 둔다.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyPalette, DEFAULT_PALETTE, PALETTES, storedPalette } from "../src/lib/palette";

const g = globalThis as unknown as { window?: unknown; document?: unknown };

describe("색 설정", () => {
  let store: Map<string, string>;
  let dataset: Record<string, string>;
  beforeEach(() => {
    store = new Map();
    dataset = {};
    g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } };
    g.document = { documentElement: { dataset } };
  });
  afterEach(() => {
    delete g.window;
    delete g.document;
  });

  it("다섯 가지이고 기본은 쿨 그레이다", () => {
    expect(PALETTES.map((p) => p.id)).toEqual(["cool-gray", "warm-gray", "soft", "navy", "charcoal"]);
    expect([DEFAULT_PALETTE, storedPalette()]).toEqual(["cool-gray", "cool-gray"]);
  });

  it("고르면 html data-hx-palette 와 저장값이 바뀌고, 모르는 값은 기본으로 돌아간다", () => {
    expect(applyPalette("navy")).toBe("navy");
    expect([dataset.hxPalette, store.get("hx-palette"), storedPalette()]).toEqual(["navy", "navy", "navy"]);
    store.set("hx-palette", "neon");
    expect(storedPalette()).toBe("cool-gray");
    expect(applyPalette("neon")).toBe("cool-gray");
  });

  it("CSS 에 다섯 색의 변수와 견본이 있다(기본값은 :root)", () => {
    const css = readFileSync(path.join(__dirname, "../src/css/app.css"), "utf8");
    for (const p of PALETTES.filter((x) => x.id !== DEFAULT_PALETTE)) expect(css).toContain(`:root[data-hx-palette="${p.id}"]`);
    for (const p of PALETTES) expect(css).toContain(`.hx-swatch[data-p="${p.id}"]`);
  });
});
