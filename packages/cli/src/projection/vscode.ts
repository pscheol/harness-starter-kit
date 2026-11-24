/**
 * `.vscode/settings.json` 병합 — `git.detectWorktrees: true` 한 줄(HK-15 design §6, 설계 05 R6.1).
 * JSONC(주석 · 후행 쉼표 허용)를 다시 쓰지 않고 한 줄만 더하고 뺀다. 다른 키 · 주석 · 들여쓰기는 바이트 그대로 둔다.
 * Python `scripts/harness/projection_vscode.py` 와 같은 바이트를 낸다(시험이 묶는다).
 */
import type { MergeResult, Merger, UnmergeResult } from "./merge";

export interface VscodeSettingsWant {
  key: string;
  value: string;
}

export const VSCODE_KEY = "git.detectWorktrees";
export const VSCODE_LOCK_KEY = "jsonc:git.detectWorktrees";
const LINE_BODY = '"git.detectWorktrees": true';
const PUNCT = "{}[],:";
const SPACE = " \t\r\n﻿";
const DEFAULT_INDENT = "  ";

export const vscodeSettingsWant = (): VscodeSettingsWant => ({ key: VSCODE_KEY, value: "true" });

type Tok = { kind: string; start: number; end: number };
interface Member {
  key: string;
  kidx: number;
  ks: number;
  vs: number;
  ve: number;
  jidx: number;
}
interface Scanned {
  toks: Tok[];
  comment: boolean;
  close: number;
  members: Member[];
}

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

function tokenize(text: string): { toks: Tok[]; comment: boolean } | null {
  const toks: Tok[] = [];
  let i = 0;
  let comment = false;
  const n = text.length;
  while (i < n) {
    const c = text[i] as string;
    if (SPACE.includes(c)) i += 1;
    else if (text.startsWith("//", i)) {
      comment = true;
      const end = text.indexOf("\n", i);
      i = end < 0 ? n : end + 1;
    } else if (text.startsWith("/*", i)) {
      comment = true;
      const end = text.indexOf("*/", i + 2);
      if (end < 0) return null;
      i = end + 2;
    } else if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      if (j >= n) return null;
      toks.push({ kind: "str", start: i, end: j + 1 });
      i = j + 1;
    } else if (PUNCT.includes(c)) {
      toks.push({ kind: c, start: i, end: i + 1 });
      i += 1;
    } else {
      let j = i;
      while (j < n && !SPACE.includes(text[j] as string) && !PUNCT.includes(text[j] as string) && text[j] !== '"' && !text.startsWith("//", j) && !text.startsWith("/*", j)) j += 1;
      toks.push({ kind: "lit", start: i, end: j });
      i = j;
    }
  }
  return { toks, comment };
}

function scan(text: string): Scanned | null {
  const tokenized = tokenize(text);
  if (tokenized === null) return null;
  const { toks, comment } = tokenized;
  if (!toks.length || (toks[0] as Tok).kind !== "{") return null;
  let depth = 0;
  let close = -1;
  for (let index = 0; index < toks.length; index += 1) {
    const kind = (toks[index] as Tok).kind;
    if (kind === "{" || kind === "[") depth += 1;
    else if (kind === "}" || kind === "]") {
      depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
      if (depth < 0) return null;
    }
  }
  if (close < 0 || (toks[close] as Tok).kind !== "}" || close !== toks.length - 1) return null;
  const members: Member[] = [];
  let pos = 1;
  while (pos < close) {
    const t = toks[pos] as Tok;
    if (t.kind === ",") {
      pos += 1;
      continue;
    }
    if (t.kind !== "str" || pos + 2 >= close || (toks[pos + 1] as Tok).kind !== ":") return null;
    let key: string;
    try {
      key = JSON.parse(text.slice(t.start, t.end)) as string;
    } catch {
      return null;
    }
    let local = 0;
    let j = pos + 2;
    while (j < close) {
      const k = (toks[j] as Tok).kind;
      if (k === "{" || k === "[") local += 1;
      else if (k === "}" || k === "]") local -= 1;
      else if (k === "," && local === 0) break;
      j += 1;
    }
    members.push({ key, kidx: pos, ks: t.start, vs: (toks[pos + 2] as Tok).start, ve: (toks[j - 1] as Tok).end, jidx: j });
    pos = j;
  }
  return { toks, comment, close, members };
}

const findMember = (s: Scanned): Member | undefined => [...s.members].reverse().find((m) => m.key === VSCODE_KEY);
const isTrue = (text: string, m: Member): boolean => text.slice(m.vs, m.ve) === "true";
const lineStart = (text: string, index: number): number => (index === 0 ? 0 : text.lastIndexOf("\n", index - 1) + 1);

function indentOf(text: string, s: Scanned): string {
  const first = s.members[0];
  if (!first) return DEFAULT_INDENT;
  const prefix = text.slice(lineStart(text, first.ks), first.ks);
  return prefix !== "" && prefix.trim() === "" ? prefix : DEFAULT_INDENT;
}

function blankAfter(text: string, index: number): number {
  const end = text.indexOf("\n", index);
  const rest = end < 0 ? text.slice(index) : text.slice(index, end);
  if (rest.trim() !== "") return -1;
  return end < 0 ? text.length : end + 1;
}

export const vscodeSettings: Merger<VscodeSettingsWant> = {
  merge(cur, _want, prev = []): MergeResult {
    if (cur === null) return { ok: true, text: '{\n  "git.detectWorktrees": true\n}\n', keys: [VSCODE_LOCK_KEY], created: true };
    const s = scan(cur);
    if (s === null) return fail(".vscode/settings.json 을 JSONC 객체로 읽지 못했다");
    const found = findMember(s);
    if (found) return { ok: true, text: cur, keys: isTrue(cur, found) && prev.includes(VSCODE_LOCK_KEY) ? [VSCODE_LOCK_KEY] : [], created: false };
    const closeAt = (s.toks[s.close] as Tok).start;
    const edits: [number, number, string][] = [];
    if (s.close > 1 && (s.toks[s.close - 1] as Tok).kind !== ",") edits.push([(s.toks[s.close - 1] as Tok).end, 0, ","]);
    const line = indentOf(cur, s) + LINE_BODY;
    const closeLine = lineStart(cur, closeAt);
    if (closeLine > (s.toks[0] as Tok).start && cur.slice(closeLine, closeAt).trim() === "") edits.push([closeLine, 1, `${line}\n`]);
    else edits.push([closeAt, 1, `\n${line}\n`]);
    let text = cur;
    for (const [at, , piece] of [...edits].sort((a, b) => b[0] - a[0] || b[1] - a[1])) text = text.slice(0, at) + piece + text.slice(at);
    return { ok: true, text, keys: [VSCODE_LOCK_KEY], created: false };
  },
  unmerge(cur, keys): UnmergeResult {
    const s = scan(cur);
    if (!keys.includes(VSCODE_LOCK_KEY)) return { ok: true, text: cur, empty: s !== null && !s.members.length && !s.comment };
    if (s === null) return fail(".vscode/settings.json 을 JSONC 객체로 읽지 못했다");
    const found = findMember(s);
    if (!found || !isTrue(cur, found)) return { ok: true, text: cur, empty: false };
    let start = found.ks;
    let end = found.ve;
    const next = s.toks[found.jidx] as Tok;
    const trailing = next.kind === ",";
    if (trailing) end = next.end;
    const ownLine = cur.slice(lineStart(cur, start), start).trim() === "";
    const after = blankAfter(cur, end);
    if (ownLine && after >= 0) {
      start = lineStart(cur, start);
      end = after;
    } else if (ownLine) start = lineStart(cur, start);
    const edits: [number, number][] = [];
    const before = s.toks[found.kidx - 1] as Tok | undefined;
    if (!trailing && found.kidx > 1 && before?.kind === ",") edits.push([before.start, before.end]);
    edits.push([start, end]);
    let text = cur;
    for (const [at, stop] of [...edits].sort((a, b) => b[0] - a[0])) text = text.slice(0, at) + text.slice(stop);
    const rest = scan(text);
    return { ok: true, text, empty: rest !== null && !rest.members.length && !rest.comment };
  },
  missing(cur, keys): string[] {
    if (!keys.includes(VSCODE_LOCK_KEY)) return [];
    const s = scan(cur);
    const found = s ? findMember(s) : undefined;
    return !found || !isTrue(cur, found) ? [VSCODE_LOCK_KEY] : [];
  },
};
