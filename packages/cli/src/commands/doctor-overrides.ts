/**
 * `doctor --only overrides`(설계 04 §3.10 · §5 #6, HK-14 design §7): 경로 · 항목마다 이긴 층과 진 층.
 * 셈: 이긴 층이 킷이 아닌 경로 · 항목 수. 관리 페이지 하네스 탭이 같은 JSON 을 읽는다. 읽기만 한다.
 */
import fs from "node:fs";
import path from "node:path";
import { str } from "../cli/args";
import type { Ctx } from "../cli/context";
import { FLOOR_HOOKS, missingFloorGates } from "../core/floor";
import { sha256 } from "../core/hash";
import { selectionFromMeta, tokensFromMeta, type Installed } from "../core/installed";
import { loadLayout } from "../core/layout";
import { readLocalConfig, readLocalModelPolicy, LOCAL_CONFIG, LOCAL_MODEL_POLICY } from "../core/local";
import { locateTemplates } from "../core/templates";
import { wanted } from "../core/update-plan";
import { VERSION } from "../core/version";

export interface Override {
  target: string;
  winner: string;
  losers: (string | { layer: string; value: string })[];
  declared?: boolean;
  value?: string;
  note?: string;
}

export interface OverridesReport {
  overrides: Override[];
  ignoredPersonal: { key: string; file: string }[];
  floorViolations: { kind: string; target: string }[];
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function readJson(target: string, rel: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path.join(target, ...rel.split("/")), "utf8"));
  } catch {
    return null;
  }
}

function ids(doc: unknown, key: string): string[] {
  return isObj(doc) && Array.isArray(doc[key]) ? (doc[key] as unknown[]).map((x) => (isObj(x) && typeof x.id === "string" ? x.id : "")).filter(Boolean) : [];
}

function kitPaths(ctx: Ctx, target: string, inst: Installed): Set<string> | null {
  try {
    const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: ctx.io.env, cliFile: ctx.io.cliFile, cwd: ctx.io.cwd, version: VERSION });
    const layout = loadLayout(loc.dir);
    const { selection } = selectionFromMeta(layout, loc.dir, inst.meta);
    const tokens = tokensFromMeta(layout, selection, inst.meta, ctx.io.env, target);
    return new Set(wanted({ layout, templatesDir: loc.dir, selection, tokens }).want.keys());
  } catch {
    return null;
  }
}

export function overridesReport(ctx: Ctx, target: string, inst: Installed): OverridesReport {
  const kitVer = `kit@${inst.lock.kit.version ?? inst.meta.kit.version}`;
  const kit = kitPaths(ctx, target, inst);
  const out: Override[] = [];
  for (const e of inst.lock.entries) {
    if (e.op !== "copy" && e.op !== "none") continue;
    const kitHas = kit?.has(e.path) ?? false;
    if (e.owner.startsWith("pack:") && kitHas) out.push({ target: e.path, winner: e.layer && e.layer.startsWith("pack:") ? e.layer : e.owner, losers: [kitVer], declared: true });
    else if (e.owner === "user" && kitHas) out.push({ target: e.path, winner: "user", losers: [kitVer], note: fs.existsSync(path.join(target, ...`${e.path}.new`.split("/"))) ? ".new 있음" : ".new 없음" });
    else if (e.owner === "kit" && e.op === "copy" && typeof e.sha256 === "string") {
      let cur: string | null = null;
      try {
        cur = sha256(fs.readFileSync(path.join(target, ...e.path.split("/"))));
      } catch {
        cur = null;
      }
      if (cur !== null && cur !== e.sha256) out.push({ target: e.path, winner: "user", losers: [kitVer], note: "사람이 고친 킷 파일" });
    }
  }
  // 항목 단위: 프로젝트 파일이 킷 · 팩 id 를 덮는다
  for (const [base, dir, key] of [
    [".agents/hooks.json", ".agents/hooks.d", "hooks"],
    [".agents/verify-checks.json", ".agents/verify-checks.d", "checks"],
  ] as const) {
    const kitIds = ids(readJson(target, base), key);
    const project = ids(readJson(target, `${dir}/project.json`), key);
    for (const id of project) if (kitIds.includes(id) && !FLOOR_HOOKS.includes(id)) out.push({ target: `${base}#${id}`, winner: "user", losers: ["kit"] });
  }
  const local = readLocalConfig(target);
  const metaRoles = isObj((inst.meta as unknown as Record<string, unknown>).roles) ? ((inst.meta as unknown as Record<string, unknown>).roles as Record<string, unknown>) : {};
  for (const [role, harness] of Object.entries(local.roles)) {
    const project = isObj(metaRoles[role]) && typeof (metaRoles[role] as Record<string, unknown>).harness === "string" ? String((metaRoles[role] as Record<string, unknown>).harness) : null;
    if (project !== harness) out.push({ target: `roles.${role}.harness`, winner: "local", value: harness, losers: project ? [{ layer: "project", value: project }] : [] });
  }
  const floorViolations: OverridesReport["floorViolations"] = [];
  const raw = inst.meta as unknown as Record<string, unknown>;
  for (const g of missingFloorGates(isObj(raw.flow) ? raw.flow.gates : undefined)) floorViolations.push({ kind: "gate-floor", target: `flow.gates#${g}` });
  const kitHooks = ids(readJson(target, ".agents/hooks.json"), "hooks");
  if (kitHooks.length) for (const id of FLOOR_HOOKS) if (!kitHooks.includes(id)) floorViolations.push({ kind: "floor-hook-missing", target: `.agents/hooks.json#${id}` });
  for (const id of ids(readJson(target, ".agents/hooks.d/project.json"), "hooks")) if (FLOOR_HOOKS.includes(id)) floorViolations.push({ kind: "floor-override", target: `.agents/hooks.d/project.json#${id}` });
  const models = readLocalModelPolicy(target);
  for (const [cls, tier] of Object.entries(models.classes)) out.push({ target: `model-policy.classes.${cls}`, winner: "local", value: tier, losers: [] });
  const ignoredPersonal = [...local.ignored.map((key) => ({ key, file: LOCAL_CONFIG })), ...models.ignored.map((i) => ({ key: i.key, file: LOCAL_MODEL_POLICY }))];
  return { overrides: out.sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : 0)), ignoredPersonal, floorViolations };
}

export function overridesLines(r: OverridesReport): string[] {
  const loser = (l: Override["losers"][number]): string => (typeof l === "string" ? l : `${l.layer}(${l.value})`);
  const width = Math.max(10, ...r.overrides.map((o) => o.target.length));
  return [
    `덮어쓴 것 ${r.overrides.length}건 (이긴 층 ← 진 층)`,
    ...r.overrides.map((o) => `  ${o.target.padEnd(width)}  ${o.winner}${o.value ? `(${o.value})` : ""} ← ${o.losers.map(loser).join(", ") || "-"}${o.declared ? "  (overrides 선언)" : ""}${o.note ? `  (${o.note})` : ""}`),
    `무시한 개인 설정 ${r.ignoredPersonal.length}건`,
    ...r.ignoredPersonal.map((i) => `  ${i.file} ${i.key} — ${i.file === LOCAL_MODEL_POLICY ? "개인 모델 설정은 잠기지 않은 classes 만 바꾼다" : "개인 층은 roles · git.ide 만 바꾼다"}`),
    `하한 ${r.floorViolations.length}건 위반`,
    ...r.floorViolations.map((v) => `  ✖ ${v.kind} ${v.target}`),
  ];
}
