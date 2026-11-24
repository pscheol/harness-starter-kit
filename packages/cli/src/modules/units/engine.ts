/**
 * 배포 단위 동기화 엔진(tools/harness/sync.py 이식, 설계 10 §3.5).
 * 원본 tools/harness/shared/ → 단위마다 파일 복사(링크 아님) · UNIT_* 토큰 치환. `--check` 의 줄 형식은 sync.py 와 같다(MD-R16).
 * Python 과 다른 점: 사람이 고친 단위 파일은 쓰기를 멈추지 않고 `<경로>.new` 로 옆에 둔다(설계 02 update 규칙),
 * 단위마다 `.agents/harness-kit.lock` 에 `layer: unit:<id>` 항목을 남긴다.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { LOCK_SCHEMA, readLock, serializeLock, type LockEntry, type LockV2 } from "../../core/lock";
import { atomicWrite, collectStates, fileState, safeUnlink, SafetyError, sameState, validatePath, type FileState } from "./safety";

export class RegistryError extends Error {}

export const REGISTRY = "tools/harness/units.json";
export const SHARED = "tools/harness/shared";
export const MANIFEST = ".agents/harness.json";
export const SCHEMA = "harness-kit.deploy-units/v1";
const IGNORED_PARTS = new Set(["__pycache__", ".DS_Store", ".pytest_cache", ".mypy_cache", ".ruff_cache"]);
const UNIT_TOKENS = ["UNIT_ID", "UNIT_TITLE", "UNIT_PATH", "UNIT_STACK"] as const;
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const S_IXUSR = 0o100;
const EXEC_BITS = 0o111;

export interface Unit {
  id: string;
  path: string;
  root: string;
  title: string;
  stack: string;
  exclude: string[];
}

export type Planned = Map<string, { text: string; executable: boolean }>;

export interface Plan {
  unit: Unit;
  planned: Planned;
  excluded: Set<string>;
  previous: Set<string>;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const sortedStrings = (xs: Iterable<string>): string[] => [...xs].sort(cmp);

/** Python 의 `Path` 정렬(조각별 비교)과 같은 순서. */
function partsCompare(a: string, b: string): number {
  const pa = a.split("/");
  const pb = b.split("/");
  for (let i = 0; i < Math.min(pa.length, pb.length); i += 1) {
    const c = cmp(pa[i] as string, pb[i] as string);
    if (c) return c;
  }
  return pa.length - pb.length;
}

/** Python fnmatch.fnmatch(posix: 대소문자 구분). `*` 는 `/` 도 넘는다. */
export function fnmatch(name: string, pattern: string): boolean {
  let re = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i] as string;
    if (c === "*") re += ".*";
    else if (c === "?") re += ".";
    else if (c === "[") {
      let j = i + 1;
      if (pattern[j] === "!") j += 1;
      if (pattern[j] === "]") j += 1;
      while (j < pattern.length && pattern[j] !== "]") j += 1;
      if (j >= pattern.length) re += "\\[";
      else {
        let stuff = pattern.slice(i + 1, j).replace(/\\/g, "\\\\");
        stuff = stuff[0] === "!" ? `^${stuff.slice(1)}` : stuff[0] === "^" ? `\\${stuff}` : stuff;
        re += `[${stuff}]`;
        i = j;
      }
    } else re += c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "s").test(name);
}

/** Python Path.read_text(): UTF-8, 줄바꿈은 \n 으로 통일(범용 줄바꿈). */
export function readText(file: string): string {
  return fs.readFileSync(file).toString("utf8").replace(/\r\n?/g, "\n");
}

const sha = (text: string): string => crypto.createHash("sha256").update(text, "utf8").digest("hex");

export function loadUnits(repo: string, registry: string): Unit[] {
  let data: { schema?: unknown; units?: unknown };
  try {
    data = JSON.parse(readText(registry)) as typeof data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new RegistryError(`No such file or directory: '${registry}'`);
    throw new RegistryError(err instanceof Error ? err.message : String(err));
  }
  if (data.schema !== undefined && data.schema !== SCHEMA) throw new RegistryError(`${REGISTRY}: schema 가 ${SCHEMA} 가 아니다: ${String(data.schema)}`);
  const units: Unit[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(data.units) ? (data.units as Record<string, unknown>[]) : [];
  for (const raw of list) {
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!ID_PATTERN.test(id) || seen.has(id)) throw new RegistryError(`invalid or duplicate unit id: '${id}'`);
    seen.add(id);
    const relative = typeof raw.path === "string" ? raw.path : "";
    const target = path.join(repo, relative);
    const parts = relative.split("/");
    const resolved = fs.existsSync(target) ? fs.realpathSync(target) : path.resolve(target);
    if (path.isAbsolute(relative) || parts.includes("..") || !(resolved === fs.realpathSync(repo) || resolved.startsWith(fs.realpathSync(repo) + path.sep))) {
      throw new RegistryError(`${id}: path escapes the repository: ${relative}`);
    }
    validatePath(repo, target, true);
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw new RegistryError(`${id}: unit directory does not exist: ${relative}`);
    units.push({
      id, path: relative, root: target,
      title: typeof raw.title === "string" ? raw.title : id,
      stack: typeof raw.stack === "string" ? raw.stack : "",
      exclude: Array.isArray(raw.exclude) ? raw.exclude.map(String) : [],
    });
  }
  return units;
}

export function sourceFiles(shared: string): string[] {
  const files: string[] = [];
  validatePath(path.dirname(shared), shared, true);
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.relative(shared, full).split(path.sep);
      if (rel.some((p) => IGNORED_PARTS.has(p))) continue;
      const st = fs.lstatSync(full);
      if (st.isSymbolicLink()) throw new SafetyError(`symlink source refused: ${full}`);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) {
        validatePath(shared, full);
        files.push(full);
      }
    }
  };
  walk(shared);
  return files.sort((a, b) => partsCompare(path.relative(shared, a).split(path.sep).join("/"), path.relative(shared, b).split(path.sep).join("/")));
}

export function render(text: string, unit: Unit): string {
  const values: Record<string, string> = { UNIT_ID: unit.id, UNIT_TITLE: unit.title, UNIT_PATH: unit.path, UNIT_STACK: unit.stack };
  let out = text;
  for (const token of UNIT_TOKENS) out = out.split(`{{${token}}}`).join(values[token] as string);
  return out;
}

export function plannedFiles(shared: string, unit: Unit): { planned: Planned; excluded: Set<string> } {
  const planned: Planned = new Map();
  const excluded = new Set<string>();
  for (const source of sourceFiles(shared)) {
    const relative = path.relative(shared, source).split(path.sep).join("/").split("__UNIT_ID__").join(unit.id);
    if (unit.exclude.some((pattern) => fnmatch(relative, pattern))) {
      excluded.add(relative);
      continue;
    }
    const executable = (fs.statSync(source).mode & S_IXUSR) !== 0;
    if (relative === MANIFEST) throw new RegistryError(`${source}: reserved deployment manifest cannot be a shared source`);
    planned.set(relative, { text: render(readText(source), unit), executable });
  }
  return { planned, excluded };
}

export function collisions(unit: Unit, planned: Planned, previous: Set<string>): string[] {
  const found: string[] = [];
  for (const [relative, { text }] of planned) {
    const target = path.join(unit.root, relative);
    if (!previous.has(relative) && fs.existsSync(target) && fs.statSync(target).isFile() && readText(target) !== text) {
      found.push(`collision: ${unit.path}/${relative} — 단위 파일과 겹친다. 원본 이름을 바꾸거나 --adopt 로 덮어쓴다`);
    }
  }
  return found;
}

export function stale(previous: Set<string>, planned: Planned, excluded: Set<string>): string[] {
  return sortedStrings([...previous].filter((x) => !planned.has(x) && !excluded.has(x)));
}

function plannedState(text: string, executable: boolean, original: FileState | null): { sha256: string; mode: number; executable: boolean } {
  const mode = original ? original.mode : 0o644;
  return { sha256: sha(text), mode: executable ? mode | EXEC_BITS : mode & ~EXEC_BITS, executable };
}

export function manifestText(unit: Unit, planned: Planned, originals: Map<string, FileState | null>): string {
  const deployed: Record<string, unknown> = {};
  for (const relative of sortedStrings(planned.keys())) {
    const p = planned.get(relative) as { text: string; executable: boolean };
    deployed[relative] = plannedState(p.text, p.executable, originals.get(relative) ?? null);
  }
  const manifest = { unit: unit.id, title: unit.title, stack: unit.stack, source: SHARED, shared: sortedStrings(planned.keys()), deployed };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function insideAny(target: string, others: string[]): boolean {
  return others.some((o) => target === o || target.startsWith(o + path.sep));
}

export function previousShared(unit: Unit, others: string[]): Set<string> {
  const file = path.join(unit.root, MANIFEST);
  validatePath(unit.root, file);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Set();
  let shared: unknown;
  try {
    shared = (JSON.parse(readText(file)) as { shared?: unknown }).shared ?? [];
  } catch (err) {
    throw new RegistryError(`${unit.path}/${MANIFEST}: invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!Array.isArray(shared)) throw new RegistryError(`${unit.path}/${MANIFEST}: shared must be a list`);
  for (const relative of shared) {
    if (typeof relative !== "string" || !relative || path.isAbsolute(relative) || relative.split("/").includes("..")) {
      throw new RegistryError(`${unit.path}/${MANIFEST}: invalid shared path ${JSON.stringify(relative)}`);
    }
    const target = path.resolve(unit.root, relative);
    if (!(target === unit.root || target.startsWith(unit.root + path.sep)) || insideAny(target, others)) {
      throw new RegistryError(`${unit.path}/${MANIFEST}: shared path leaves the harness: ${relative}`);
    }
  }
  return new Set(shared as string[]);
}

export function differences(plan: Plan): string[] {
  const { unit, planned, excluded, previous } = plan;
  const problems: string[] = [];
  for (const [relative, { text, executable }] of planned) {
    const target = path.join(unit.root, relative);
    const label = `${unit.path}/${relative}`;
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) problems.push(`missing: ${label}`);
    else if (readText(target) !== text) problems.push(`differs: ${label}`);
    else if (executable !== ((fs.statSync(target).mode & S_IXUSR) !== 0)) problems.push(`mode differs: ${label}`);
  }
  for (const relative of stale(previous, planned, excluded)) if (fs.existsSync(path.join(unit.root, relative))) problems.push(`stale: ${unit.path}/${relative}`);
  for (const relative of sortedStrings([...previous].filter((x) => excluded.has(x)))) problems.push(`excluded: ${unit.path}/${relative} — 배포 목록에서만 뺀다(파일은 남는다)`);
  const manifest = path.join(unit.root, MANIFEST);
  if (!fs.existsSync(manifest) || readText(manifest) !== manifestText(unit, planned, collectStates(unit.root, planned.keys()))) problems.push(`differs: ${unit.path}/${MANIFEST}`);
  return problems;
}

export function selectUnits(all: Unit[], selected: string[]): Unit[] {
  const known = new Set(all.map((u) => u.id));
  const unknown = sortedStrings(selected.filter((x) => !known.has(x)));
  if (unknown.length) throw new RegistryError(`unknown unit: ${unknown.join(", ")} (known: ${sortedStrings(known).join(", ")})`);
  return all.filter((u) => selected.length === 0 || selected.includes(u.id));
}

export function buildPlans(repo: string, all: Unit[], units: Unit[]): Plan[] {
  const shared = path.join(repo, SHARED);
  const roots = new Map(all.map((u) => [u.id, u.root]));
  return units.map((unit) => {
    const others = [...roots].filter(([id, root]) => id !== unit.id && root !== unit.root && (root === unit.root || root.startsWith(unit.root + path.sep))).map(([, r]) => r);
    const { planned, excluded } = plannedFiles(shared, unit);
    const previous = previousShared(unit, others);
    for (const relative of planned.keys()) {
      if (insideAny(path.join(unit.root, relative), others)) throw new RegistryError(`${path.join(unit.root, relative)}: shared path leaves the harness`);
    }
    return { unit, planned, excluded, previous };
  });
}

// ── 쓰기 ─────────────────────────────────────────────────────────────────────
interface Recorded {
  sha256?: string;
  executable?: boolean;
  mode?: number;
}

function deployedOf(unit: Unit): Record<string, Recorded> {
  const file = path.join(unit.root, MANIFEST);
  if (!fs.existsSync(file)) return {};
  const d = (JSON.parse(readText(file)) as { deployed?: unknown }).deployed;
  if (d === undefined) return {};
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new RegistryError(`${file}: deployed must be an object`);
  return d as Record<string, Recorded>;
}

const matchesPlan = (actual: FileState | null, desired: { text: string; executable: boolean } | undefined): boolean =>
  !desired ? actual === null : actual !== null && actual.sha256 === sha(desired.text) && ((actual.mode & S_IXUSR) !== 0) === desired.executable;

const matchesDeployment = (actual: FileState | null, rec: Recorded | undefined): boolean =>
  actual !== null && !!rec && actual.sha256 === rec.sha256 && ((actual.mode & S_IXUSR) !== 0) === rec.executable && actual.mode === (rec.mode ?? actual.mode);

export interface ApplyResult {
  unit: string;
  shared: number;
  changed: number;
  /** 사람이 고쳐 쓰지 않고 `.new` 로 둔 경로 */
  kept: string[];
  removedKept: string[];
}

export function applyPlan(repo: string, plan: Plan, adopt: boolean): ApplyResult {
  const { unit, planned, excluded, previous } = plan;
  const root = unit.root;
  const expected = collectStates(repo, [...planned.keys(), ...previous, MANIFEST].map((r) => path.relative(repo, path.join(root, r)).split(path.sep).join("/")));
  const stateOf = (relative: string): FileState | null => expected.get(path.relative(repo, path.join(root, relative)).split(path.sep).join("/")) ?? null;
  const deployed = deployedOf(unit);
  const result: ApplyResult = { unit: unit.id, shared: planned.size, changed: 0, kept: [], removedKept: [] };
  const finalState = new Map<string, FileState | null>();
  for (const [relative, { text, executable }] of planned) {
    const original = stateOf(relative);
    const rel = path.relative(repo, path.join(root, relative)).split(path.sep).join("/");
    const desired = plannedState(text, executable, original);
    if (original && original.sha256 === desired.sha256 && original.mode === desired.mode) {
      finalState.set(relative, original);
      fs.rmSync(path.join(root, `${relative}.new`), { force: true });
      continue;
    }
    const managed = previous.has(relative);
    const local = original !== null && (managed ? (deployed[relative] ? !matchesDeployment(original, deployed[relative]) : !matchesPlan(original, { text, executable })) : !adopt && readText(path.join(root, relative)) !== text);
    if (local) {
      atomicWrite(repo, `${rel}.new`, text, desired.mode, fileState(repo, `${rel}.new`));
      result.kept.push(relative);
      finalState.set(relative, original);
      continue;
    }
    atomicWrite(repo, rel, text, desired.mode, original);
    fs.rmSync(path.join(root, `${relative}.new`), { force: true });
    result.changed += 1;
    finalState.set(relative, fileState(repo, rel));
  }
  for (const relative of stale(previous, planned, excluded)) {
    const rel = path.relative(repo, path.join(root, relative)).split(path.sep).join("/");
    const original = stateOf(relative);
    if (original === null) continue;
    if (!deployed[relative] || !matchesDeployment(original, deployed[relative])) {
      result.removedKept.push(relative);
      continue;
    }
    safeUnlink(repo, rel, original);
    result.changed += 1;
  }
  const manifestRel = path.relative(repo, path.join(root, MANIFEST)).split(path.sep).join("/");
  const originals = new Map<string, FileState | null>([...planned.keys()].map((r) => [r, stateOf(r)]));
  const text = manifestText(unit, planned, originals);
  const manifestOriginal = stateOf(MANIFEST);
  if (manifestOriginal === null || manifestOriginal.sha256 !== sha(text)) atomicWrite(repo, manifestRel, text, manifestOriginal ? manifestOriginal.mode : 0o644, manifestOriginal);
  writeUnitLock(repo, plan, finalState);
  return result;
}

/** 단위의 `.agents/harness-kit.lock` 에 `layer: unit:<id>` 항목을 쓴다. 이미 있는 다른 항목은 건드리지 않고, 같은 경로의 다른 레이어 항목은 덮지 않는다. */
function writeUnitLock(repo: string, plan: Plan, finalState: Map<string, FileState | null>): void {
  const { unit, planned } = plan;
  const lockRel = path.relative(repo, path.join(unit.root, ".agents/harness-kit.lock")).split(path.sep).join("/");
  const file = path.join(repo, lockRel);
  const layer = `unit:${unit.id}`;
  let lock: LockV2 = { schema: LOCK_SCHEMA, kit: { version: null, source: null }, packs: [], entries: [] };
  if (fs.existsSync(file)) {
    const read = readLock(file);
    if (read.status !== "ok" || read.format !== "v2") return;
    lock = read.lock;
  }
  const others = lock.entries.filter((e) => e.layer !== layer);
  const taken = new Set(others.map((e) => e.path));
  const mine: LockEntry[] = [];
  for (const relative of sortedStrings(planned.keys())) {
    if (taken.has(relative)) continue;
    const st = finalState.get(relative);
    mine.push({ path: relative, op: "copy", owner: "kit", sha256: st ? st.sha256 : null, layer });
  }
  const text = serializeLock({ ...lock, entries: [...others, ...mine] });
  const before = fileState(repo, lockRel);
  if (before === null || before.sha256 !== sha(text)) atomicWrite(repo, lockRel, text, before ? before.mode : 0o644, before);
}

export { sameState };
