/**
 * `knots-sync sync aidlc` — AI-DLC 산출물을 intent.json · units.json 으로 옮긴다(설계 10 §3.2, MD-R9 · R10).
 * 같은 입력(sha256)이면 쓰지 않는다. 다시 가져올 때 sourceId 가 같은 Unit 은 id · issue 를 지킨다.
 * AI-DLC 를 실행하지 않고 모델을 부르지 않는다. 파일만 읽는다.
 */
import fs from "node:fs";
import path from "node:path";
import { bool, str } from "../../cli/args";
import { targetOf, type CommandResult, type Ctx } from "../../cli/context";
import { CliError, EXIT, usageError } from "../../core/errors";
import { git } from "../../core/git";
import { isDir, writeFileAtomic } from "../../core/fsx";
import { META_REL, readMeta } from "../../core/meta";
import { VERSION } from "../../core/version";
import { runCmd, parseVersion } from "../tools";
import { readAidlcIntent, READER_VERSION, type ARead, type AUnit } from "./adapter-v2";
import { metaFile } from "../../core/legacy-names";

const INTENTS = ".agents/docs/intents";
const LABEL = /^\d{6}-(.+)$/;
const FOLDER = /^([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-(.+)$/;
const INT_KEY = /^INT-([1-9][0-9]{0,5})$/;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);

function readJson(file: string): Obj | null {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return isObj(j) ? j : null;
  } catch {
    return null;
  }
}

/** AI-DLC Intent 폴더 후보: aidlc/spaces/<space>/intents/<폴더>/ (aidlc-state.md 가 있는 것) */
function candidates(root: string): { space: string; dir: string; abs: string }[] {
  const out: { space: string; dir: string; abs: string }[] = [];
  const spaces = path.join(root, "aidlc", "spaces");
  if (!isDir(spaces)) return out;
  for (const space of fs.readdirSync(spaces).sort()) {
    const intents = path.join(spaces, space, "intents");
    if (!isDir(intents)) continue;
    for (const dir of fs.readdirSync(intents).sort()) {
      const abs = path.join(intents, dir);
      if (isDir(abs) && fs.existsSync(path.join(abs, "aidlc-state.md"))) out.push({ space, dir, abs });
    }
  }
  return out;
}

function spaceOf(root: string, abs: string): { space: string; dir: string } {
  const m = /aidlc\/spaces\/([^/]+)\/intents\/([^/]+)\/?$/.exec(path.relative(root, abs).split(path.sep).join("/"));
  return { space: m?.[1] ?? "default", dir: m?.[2] ?? path.basename(abs) };
}

function nextKey(root: string, base: string, env: Record<string, string | undefined>): string {
  const nums: number[] = [];
  const add = (name: string): void => {
    const m = FOLDER.exec(name);
    const k = m ? INT_KEY.exec(m[1] as string) : null;
    if (k) nums.push(Number(k[1]));
  };
  const dir = path.join(root, INTENTS);
  if (isDir(dir)) for (const n of fs.readdirSync(dir)) add(n);
  const listed = git(["-C", root, "ls-tree", "-d", "--name-only", `${base}:${INTENTS}`], env);
  if (listed.status === 0) for (const n of listed.stdout.split(/\s+/).filter(Boolean)) add(n);
  return `INT-${Math.max(0, ...nums) + 1}`;
}

/** 기존 intent.json 중 aidlc.path 가 같은 폴더 */
function existingLink(root: string, aidlcPath: string): { folder: string; key: string } | null {
  const base = path.join(root, INTENTS);
  if (!isDir(base)) return null;
  for (const name of fs.readdirSync(base).sort()) {
    const link = readJson(path.join(base, name, "intent.json"));
    const a = link && isObj(link.aidlc) ? link.aidlc : null;
    const m = FOLDER.exec(name);
    if (a && m && String(a.path).replace(/\/$/, "") === aidlcPath.replace(/\/$/, "")) return { folder: name, key: m[1] as string };
  }
  return null;
}

function layers(units: AUnit[]): Map<string, number> {
  const by = new Map(units.map((u) => [u.name, u]));
  const memo = new Map<string, number>();
  const depth = (n: string, stack: string[]): number => {
    if (memo.has(n)) return memo.get(n) as number;
    if (stack.includes(n)) return 1;
    const u = by.get(n);
    const d = 1 + Math.max(0, ...(u?.dependsOn ?? []).filter((x) => by.has(x)).map((x) => depth(x, [...stack, n])));
    memo.set(n, d);
    return d;
  };
  for (const u of units) depth(u.name, []);
  return memo;
}

const areaOf = (name: string): string => {
  const a = name.replace(/^u\d+-/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return KEBAB.test(a) ? a : "unit";
};

/** units.json 만들기. existing 의 Unit 은 sourceId 로 이어 붙여 id · issue 를 지킨다(MD-R10). */
export function buildUnits(r: ARead, key: string, aidlcPath: string, existing: Obj | null): Obj {
  const old = (existing && Array.isArray(existing.units) ? existing.units : []).filter(isObj);
  const bySource = new Map(old.filter((u) => typeof u.sourceId === "string").map((u) => [u.sourceId as string, u]));
  let max = Math.max(0, ...old.map((u) => Number(/^U-(\d+)$/.exec(String(u.id))?.[1] ?? 0)));
  const idOf = new Map<string, string>();
  for (const u of r.units) {
    const prev = bySource.get(u.sourceId);
    idOf.set(u.name, prev ? String(prev.id) : `U-${(max += 1)}`);
  }
  const depth = layers(r.units);
  const live = new Set(r.units.map((u) => u.sourceId));
  const units: Obj[] = r.units.map((u) => {
    const prev = bySource.get(u.sourceId);
    return {
      id: idOf.get(u.name),
      name: u.name,
      title: u.title,
      kind: u.kind === "spec" ? "contract" : "feature",
      area: areaOf(u.name),
      repo: null,
      stories: u.stories,
      nfr: [],
      risks: [],
      dependsOn: u.dependsOn.map((d) => idOf.get(d) as string).filter(Boolean),
      provides: [],
      consumes: [],
      order: depth.get(u.name) ?? 1,
      issue: prev && typeof prev.issue === "string" ? prev.issue : null,
      planned: true,
      sourceId: u.sourceId,
    };
  });
  // AI-DLC 쪽에서 사라진 Unit 은 지우지 않고 제외로 둔다(planned false, 번호 · issue 유지)
  for (const u of old) if (typeof u.sourceId === "string" && !live.has(u.sourceId)) units.push({ ...u, planned: false });
  units.sort((a, b) => Number(/^U-(\d+)$/.exec(String(a.id))?.[1]) - Number(/^U-(\d+)$/.exec(String(b.id))?.[1]));
  const planned = units.filter((u) => u.planned !== false);
  return {
    schema: "knots-sync.units/v1",
    intent: { key, title: r.title, doc: "intent.json" },
    source: { kind: "aidlc", path: aidlcPath, inputSha256: r.inputSha256 },
    decomposition: { stories: r.stories.length, domains: 0, userTypes: 0, integrations: 0, split: planned.length > 1, reasons: planned.length > 1 ? ["aidlc"] : [] },
    units,
    unassigned: [],
  };
}

const text = (o: unknown): string => `${JSON.stringify(o, null, 2)}\n`;

function toolVersion(ctx: Ctx, root: string): string | null {
  const r = runCmd(ctx.io, root, ["aidlc", "--version"], { timeout: 15_000 });
  return r.missing ? null : parseVersion(`${r.stdout}\n${r.stderr}`);
}

interface One {
  intent: string;
  key: string | null;
  folder: string | null;
  action: "created" | "updated" | "same" | "pending" | "check-diff";
  units: number;
  stories: number;
  missing: string[];
  notes: string[];
  inputSha256: string | null;
}

export function runSyncAidlc(ctx: Ctx): CommandResult {
  const root = targetOf(ctx);
  const check = bool(ctx.values, "check");
  const metaRead = readMeta(metaFile(root));
  if (metaRead.status !== "ok") throw new CliError(EXIT.STATE, `설치되지 않은 리포다(${META_REL}): ${root}`, "설치는 knots-sync init");
  const meta = metaRead.meta;
  if (!meta.modules.includes("aidlc")) throw new CliError(EXIT.STATE, "aidlc 모듈이 꺼져 있다", "knots-sync add aidlc");
  const flow = isObj(meta.flow) ? meta.flow : {};
  const base = isObj(meta.git) && typeof meta.git.base === "string" ? meta.git.base : "develop";
  const asked = str(ctx.values, "intent");
  const all = candidates(root);
  let picks: { space: string; dir: string; abs: string }[];
  if (asked !== undefined) {
    const abs = path.resolve(root, asked);
    if (!isDir(abs)) throw usageError(`AI-DLC Intent 폴더가 없다: ${asked}`, "aidlc/spaces/<space>/intents/<폴더>");
    const { space, dir } = spaceOf(root, abs);
    picks = [{ space, dir, abs }];
  } else picks = all;
  if (picks.length === 0) {
    return { code: EXIT.OK, data: { command: "sync", tool: "aidlc", target: root, check, intents: [] }, lines: ["knots-sync sync aidlc — AI-DLC Intent 가 없다(aidlc/spaces/*/intents/*/aidlc-state.md)"] };
  }
  const version = toolVersion(ctx, root);
  const adaptedAt = ctx.io.env.KNOTS_SYNC_NOW ?? new Date().toISOString();
  const results: One[] = [];
  let firstFail: CliError | null = null;
  for (const p of picks) {
    const aidlcPath = `${path.relative(root, p.abs).split(path.sep).join("/")}/`;
    const r = readAidlcIntent(p.abs);
    const one: One = { intent: p.dir, key: null, folder: null, action: "pending", units: r.units.length, stories: r.stories.length, missing: r.missing, notes: [], inputSha256: r.inputSha256 };
    if (flow.design !== "aidlc") one.notes.push("flow.design 이 aidlc 가 아니다(knots-sync add aidlc 가 설정한다)");
    if (r.missing.length) {
      if (asked !== undefined) firstFail ??= new CliError(EXIT.USAGE, `${p.dir}: 필수 항목이 없다 — ${r.missing.join(" · ")}`, "AI-DLC 에서 Units Generation 단계를 마친 뒤 다시 한다. 추측해서 채우지 않는다");
      results.push(one);
      continue;
    }
    const link = existingLink(root, aidlcPath);
    const keyFlag = str(ctx.values, "key");
    let key = link?.key ?? keyFlag ?? null;
    if (key === null) {
      if (meta.modules.includes("jira-workflow")) throw usageError("jira-workflow 모듈이 켜져 있다 — Intent 키는 Jira 에픽 키다", "--key <에픽 키> 로 준다");
      key = nextKey(root, base, ctx.io.env);
    }
    const label = (LABEL.exec(p.dir)?.[1] ?? p.dir).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "intent";
    const folderName = link?.folder ?? `${key}-${label}`;
    const folderAbs = path.join(root, INTENTS, folderName);
    const linkFile = path.join(folderAbs, "intent.json");
    const unitsFile = path.join(folderAbs, "units.json");
    const oldLink = readJson(linkFile);
    const oldUnits = readJson(unitsFile);
    const sameInput = oldLink !== null && isObj(oldLink.adapter) && oldLink.adapter.inputSha256 === r.inputSha256;
    one.key = key;
    one.folder = `${INTENTS}/${folderName}`;
    const units = buildUnits(r, key, aidlcPath, oldUnits);
    const unitsText = text(units);
    const unitsSame = fs.existsSync(unitsFile) && fs.readFileSync(unitsFile, "utf8") === unitsText;
    for (const s of r.shared) one.notes.push(`스토리 ${s.story} 가 Unit 여럿에 적혀 있다(${s.units.join(", ")}) — 킷은 한 Unit 에만 둔다: ${s.units[0]}`);
    if (r.gateApprovals) one.notes.push(`AI-DLC 승인 기록 ${r.gateApprovals}건: 승인자(이메일)가 기록에 없어 approvals.md 로 옮기지 않았다 — 사람이 관리 페이지 · knots-sync approve 로 승인한다`);
    if (sameInput && unitsSame) {
      one.action = "same";
      results.push(one);
      continue;
    }
    if (check) {
      one.action = "check-diff";
      results.push(one);
      continue;
    }
    const linkOut = {
      schema: "knots-sync.intent-link/v1",
      key,
      title: r.title,
      source: "aidlc",
      aidlc: { space: p.space, intent: p.dir, path: aidlcPath, version },
      adapter: { name: "knots-sync/aidlc", version: VERSION, reader: READER_VERSION, inputSha256: r.inputSha256, adaptedAt },
      stories: r.stories,
    };
    fs.mkdirSync(folderAbs, { recursive: true });
    if (!unitsSame) writeFileAtomic(unitsFile, Buffer.from(unitsText, "utf8"), false);
    writeFileAtomic(linkFile, Buffer.from(text(linkOut), "utf8"), false);
    one.action = oldLink === null ? "created" : "updated";
    results.push(one);
  }
  const diff = results.some((o) => o.action === "check-diff");
  const lines = [`knots-sync sync aidlc${check ? " --check" : ""} — ${root}`];
  for (const o of results) {
    if (o.action === "pending") lines.push(`  ${o.intent}: 아직 가져올 수 없다 — ${o.missing.join(" · ")}`);
    else lines.push(`  ${o.intent} → ${o.folder}: ${o.action === "same" ? "변화 없음" : o.action === "check-diff" ? "달라졌다(쓰지 않았다)" : o.action === "created" ? "만들었다" : "갱신했다"} · Unit ${o.units} · 스토리 ${o.stories}`);
    for (const n of o.notes) lines.push(`    · ${n}`);
  }
  if (firstFail) throw firstFail;
  return { code: check && diff ? EXIT.CHECK : EXIT.OK, data: { command: "sync", tool: "aidlc", target: root, check, intents: results }, lines };
}
