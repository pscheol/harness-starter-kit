/**
 * doctor 의 배치 검사(HK-13 design §6.6, 02 §3.11). `scripts/harness/check_layout.py` 와 같은 판정이다(시험이 묶는다).
 */
import fs from "node:fs";
import path from "node:path";
import { CliError } from "../core/errors";
import { sha256 } from "../core/hash";
import type { LockEntry } from "../core/lock";
import { META_REL, readMeta } from "../core/meta";
import { buildContext, fullMergeWant, wantedOps } from "./engine";
import { parseFrontmatter, splitFrontmatter } from "./frontmatter";
import { MERGE_KIND, missingWith } from "./merge";
import { HOOKS_REL } from "./hooks";
import { hooksBundleSha, loadSources, treeSha, walkView } from "./sources";
import { parseSpec } from "./spec";
import { FsView } from "./view";

export const PROJECTION_KINDS = ["stale", "symlink-found", "merge-missing", "relative-ref", "skill-model-field", "role-model-locked", "pending-new", "steering-size", "layout-conflict"];
const LIMIT = 24 * 1024;
const SOURCE_DIRS = [".agents/rules/", ".agents/skills/", ".agents/roles/"];

export interface LayoutFinding {
  kind: string;
  severity: "error" | "warn" | "info";
  path: string;
  hint: string;
}

function lstat(p: string): fs.Stats | null {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

function currentSha(p: string, isDir: boolean): string | null {
  const st = lstat(p);
  if (!st || st.isSymbolicLink()) return null;
  if (isDir) return st.isDirectory() ? treeSha(walkView(new FsView(p), "")) : null;
  return st.isFile() ? sha256(fs.readFileSync(p)) : null;
}

function linksInside(p: string, prefix = ""): string[] {
  const st = lstat(p);
  if (!st?.isDirectory() || st.isSymbolicLink()) return [];
  const out: string[] = [];
  for (const name of fs.readdirSync(p).sort()) {
    const q = path.join(p, name);
    const s = lstat(q);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (s?.isSymbolicLink()) out.push(rel);
    else if (s?.isDirectory()) out.push(...linksInside(q, rel));
  }
  return out.sort();
}

export function hasRelativeRef(text: string): boolean {
  const stripped = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  return /\[[^\]]*\]\((\.\.\/[^)\s]*)\)/.test(stripped);
}

function fmOf(file: string): Record<string, unknown> {
  const { block } = splitFrontmatter(fs.readFileSync(file, "utf8"));
  return block === null ? {} : parseFrontmatter(block);
}

/** `inclusion: always`(또는 inclusion 없음) Kiro steering 합계 바이트. */
export function kiroAlwaysBytes(target: string): number {
  const dir = path.join(target, ".kiro/steering");
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    const p = path.join(dir, name);
    if (!lstat(p)?.isFile()) continue;
    const inc = fmOf(p).inclusion;
    if (((typeof inc === "string" && inc) || "always") === "always") total += fs.statSync(p).size;
  }
  return total;
}

function specAt(target: string): ReturnType<typeof parseSpec> | null {
  const file = path.join(target, "scripts/harness/projection.json");
  return fs.existsSync(file) ? parseSpec(fs.readFileSync(file, "utf8")) : null;
}

/** lock 항목별 배치 판정 + 원본 머리 검사 + steering 크기. 메타 · lock 검사는 doctor 가 한다. */
export function layoutFindings(target: string, entries: LockEntry[]): LayoutFinding[] {
  const out: LayoutFinding[] = [];
  const meta = readMeta(path.join(target, META_REL));
  const tokens = meta.status === "ok" ? meta.meta.tokens : {};
  const agents = meta.status === "ok" ? meta.meta.agents : [];
  let spec: ReturnType<typeof parseSpec> | null | undefined;
  for (const e of entries) {
    if (e.owner !== "kit") continue;
    const p = path.join(target, ...e.path.split("/"));
    const from = typeof e.from === "string" ? e.from : null;
    if (e.op === "mirror" || e.op === "render") {
      const st = lstat(p);
      const isDir = e.op === "mirror" && ((Boolean(st?.isDirectory()) && !st?.isSymbolicLink()) || Boolean(from && lstat(path.join(target, ...from.split("/")))?.isDirectory()));
      if (st?.isSymbolicLink()) {
        out.push({ kind: "symlink-found", severity: "error", path: e.path, hint: "링크 대신 실제 파일을 둔다 → npx harness-kit repair" });
        continue;
      }
      for (const inner of linksInside(p)) out.push({ kind: "symlink-found", severity: "error", path: `${e.path}/${inner}`, hint: "링크 대신 실제 파일을 둔다 → npx harness-kit repair" });
      const cur = currentSha(p, isDir);
      if (cur === null) {
        out.push({ kind: "missing", severity: "error", path: e.path, hint: `원본 ${from ?? "?"} 에서 다시 만든다 → npx harness-kit repair` });
        continue;
      }
      if (typeof e.sha256 !== "string" || cur !== e.sha256) {
        out.push({ kind: "drifted", severity: "error", path: e.path, hint: `복사본 · 생성물을 직접 고쳤다. 원본 ${from ?? "?"} 을 고친다 → npx harness-kit repair` });
        continue;
      }
      if (from && typeof e.fromSha256 === "string") {
        const sp = path.join(target, ...from.split("/"));
        const now = from === HOOKS_REL ? hooksBundleSha(new FsView(target)) : currentSha(sp, Boolean(lstat(sp)?.isDirectory()));
        if (now === null) out.push({ kind: "stale", severity: "error", path: e.path, hint: `원본 ${from} 이 없다 → npx harness-kit update` });
        else if (now !== e.fromSha256) out.push({ kind: "stale", severity: "error", path: e.path, hint: `원본 ${from} 가 바뀌었다 → npx harness-kit repair` });
      }
    } else if (e.op === "merge" && Array.isArray(e.keys) && e.keys.length) {
      const kind = MERGE_KIND[e.path];
      if (!kind) continue;
      if (spec === undefined) spec = specAt(target);
      if (!spec) continue;
      const st = lstat(p);
      const cur = st?.isFile() ? fs.readFileSync(p, "utf8") : null;
      const keys = e.keys as string[];
      const lost = cur === null ? keys : missingWith(kind, cur, keys, fullMergeWant(kind, spec, tokens, loadSources(new FsView(target))));
      if (lost.length) out.push({ kind: "merge-missing", severity: "error", path: e.path, hint: `킷 키 ${lost.slice(0, 3).join(", ")}${lost.length > 3 ? " …" : ""} 가 없다 → npx harness-kit repair` });
    } else if (e.op === "copy") {
      const st = lstat(p);
      if (!st?.isFile()) continue; // missing 은 doctor 의 copy 검사가 낸다
      if (SOURCE_DIRS.some((d) => e.path.startsWith(d)) && e.path.endsWith(".md") && hasRelativeRef(fs.readFileSync(p, "utf8"))) {
        out.push({ kind: "relative-ref", severity: "error", path: e.path, hint: "킷 원본은 `../` 대신 리포 기준 경로(.agents/…)를 쓴다(복사본에서 깨진다)" });
      }
    }
  }
  for (const e of entries) {
    for (const side of [`${e.path}.new`, `${e.path}.bak`]) {
      if (lstat(path.join(target, ...side.split("/")))) out.push({ kind: "pending-new", severity: "warn", path: side, hint: `병합하거나 지운다(diff -u ${e.path} ${side})` });
    }
  }
  try {
    const s = spec === undefined ? specAt(target) : spec;
    if (s) {
      const ctx = buildContext({ view: new FsView(target), spec: s, tokens, agents });
      wantedOps(ctx);
      out.push(...ctx.findings);
    }
  } catch (err) {
    if (!(err instanceof CliError)) throw err;
    out.push({ kind: "layout-conflict", severity: "error", path: ".agents", hint: err.message });
  }
  const always = kiroAlwaysBytes(target);
  if (always > LIMIT) out.push({ kind: "steering-size", severity: "warn", path: ".kiro/steering", hint: `inclusion: always steering = ${always.toLocaleString("en-US")} bytes (기준 ${LIMIT.toLocaleString("en-US")})` });
  return out;
}
