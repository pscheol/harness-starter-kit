/**
 * AI-DLC v2(2.11.x) 산출물 읽기 — 버전별 읽기 모듈(설계 10 §3.2 3단계).
 * 알려진 파일만 읽는다. 추측해서 채우지 않는다: 필수 항목(Intent 제목 · Unit 목록)이 없으면 빠진 항목을 돌려준다.
 * 파일 이름 · 형식의 근거: docs/analysis/05-aidlc-entire-real-tools.md (aidlc 2.11.4, 2026-11-24).
 *
 *   <Intent 폴더>/project-description.json            Intent 제목(JSON 문자열) — 없으면 aidlc-state.md 의 "- **Project**:" 줄
 *   <Intent 폴더>/aidlc-state.md                      범위(scope) · 시작일
 *   <Intent 폴더>/inception/units-generation/unit-of-work.md              Unit 표(Unit ID · Directory · …)
 *   <Intent 폴더>/inception/units-generation/unit-of-work-dependency.md   ```yaml units: - name · kind · depends_on 블록
 *   <Intent 폴더>/inception/units-generation/unit-of-work-story-map.md    | US1.1 | U1 | u1-ledger | 행
 *   <Intent 폴더>/inception/user-stories/stories.md   USx.y 스토리(있을 때만)
 */
import fs from "node:fs";
import path from "node:path";
import { byteCompare } from "../../core/fsx";
import { sha256 } from "../../core/hash";

export const READER_VERSION = "aidlc-v2";
const UG = "inception/units-generation";

export interface AUnit {
  /** AI-DLC Unit 디렉터리 이름(u1-ledger) */
  name: string;
  /** AI-DLC Unit 식별자: 표의 Unit ID(U1), 없으면 디렉터리 이름 */
  sourceId: string;
  /** service | spec | ui | packaging | library | null */
  kind: string | null;
  title: string;
  dependsOn: string[];
  stories: string[];
}

export interface AStory {
  id: string;
  title: string;
}

export interface ARead {
  folder: string;
  title: string | null;
  scope: string | null;
  units: AUnit[];
  stories: AStory[];
  /** 스토리 → 같이 적힌 나머지 Unit(킷은 스토리를 한 Unit 에만 둔다) */
  shared: { story: string; units: string[] }[];
  inputSha256: string;
  fileCount: number;
  missing: string[];
  /** 승인 줄(GATE_APPROVED) 수 — 승인자 정보가 없어 옮기지 않는다 */
  gateApprovals: number;
}

function read(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** 폴더 안 파일 전부(`.aidlc-` 로 시작하는 내부 폴더 · 파일 제외), 상대 경로 바이트 순 */
export function listInputs(folder: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(path.join(folder, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (e.name.startsWith(".aidlc-")) continue;
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(child);
      else if (e.isFile()) out.push(child);
    }
  };
  walk("");
  return out.sort(byteCompare);
}

export function inputSha(folder: string, files: string[]): string {
  return sha256(files.map((f) => `${f}\0${sha256(fs.readFileSync(path.join(folder, f)))}\n`).join(""));
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

const isSep = (line: string): boolean => /^\s*\|?\s*:?-{2,}/.test(line);

/** 머리 줄에 want 가 모두 든 표의 데이터 행(머리 칸 이름 → 값) */
function tableRows(text: string, want: string[]): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < lines.length - 1; i += 1) {
    const head = (lines[i] as string).includes("|") ? cells(lines[i] as string).map((c) => c.toLowerCase().replace(/[*`]/g, "")) : null;
    if (!head || !isSep(lines[i + 1] as string) || !want.every((w) => head.includes(w))) continue;
    for (let j = i + 2; j < lines.length && (lines[j] as string).includes("|"); j += 1) {
      const row = cells(lines[j] as string);
      rows.push(Object.fromEntries(head.map((h, k) => [h, (row[k] ?? "").replace(/[*`]/g, "").trim()])));
    }
  }
  return rows;
}

interface Edge {
  name: string;
  kind: string | null;
  dependsOn: string[];
}

/** unit-of-work-dependency.md 의 ```yaml units: 블록(필수). 형식이 틀리면 null */
export function parseEdgeBlock(text: string): Edge[] | null {
  const m = /```ya?ml\s*\n([\s\S]*?)```/g;
  let block: string | null = null;
  for (let r = m.exec(text); r; r = m.exec(text)) if (/^units:\s*$/m.test(r[1] as string)) block = r[1] as string;
  if (block === null) return null;
  const edges: Edge[] = [];
  let cur: Edge | null = null;
  let listFor: "depends" | null = null;
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "");
    if (!line.trim() || /^units:\s*$/.test(line.trim())) continue;
    const name = /^\s*-\s+name:\s*(\S+)\s*$/.exec(line);
    if (name) {
      cur = { name: name[1] as string, kind: null, dependsOn: [] };
      edges.push(cur);
      listFor = null;
      continue;
    }
    if (!cur) return null;
    const kind = /^\s+kind:\s*(\S+)\s*$/.exec(line);
    if (kind) {
      cur.kind = kind[1] as string;
      listFor = null;
      continue;
    }
    const dep = /^\s+depends_on:\s*(.*)$/.exec(line);
    if (dep) {
      const v = (dep[1] as string).trim();
      if (v.startsWith("[")) {
        cur.dependsOn = v.replace(/^\[|\]$/g, "").split(",").map((x) => x.trim()).filter(Boolean);
        listFor = null;
      } else listFor = "depends";
      continue;
    }
    const item = /^\s+-\s+(\S+)\s*$/.exec(line);
    if (item && listFor === "depends") cur.dependsOn.push(item[1] as string);
  }
  return edges;
}

const dirTitle = (name: string): string => name.replace(/^u\d+-/, "").replace(/-/g, " ").trim() || name;

export function readAidlcIntent(folder: string): ARead {
  const missing: string[] = [];
  const files = listInputs(folder);
  const state = read(path.join(folder, "aidlc-state.md"));
  let title: string | null = null;
  const desc = read(path.join(folder, "project-description.json"));
  if (desc !== null) {
    try {
      const j = JSON.parse(desc) as unknown;
      if (typeof j === "string" && j.trim()) title = j.trim();
    } catch {
      title = null;
    }
  }
  if (title === null && state !== null) title = /^- \*\*Project\*\*:\s*(.+?)\s*$/m.exec(state)?.[1] ?? null;
  if (title === null) missing.push("Intent 제목(project-description.json 또는 aidlc-state.md 의 Project 줄)");
  const scope = state !== null ? (/^- \*\*Scope\*\*:\s*(\S+)/m.exec(state)?.[1] ?? null) : null;

  const dep = read(path.join(folder, UG, "unit-of-work-dependency.md"));
  const uow = read(path.join(folder, UG, "unit-of-work.md"));
  const edges = dep === null ? null : parseEdgeBlock(dep);
  if (dep === null) missing.push(`${UG}/unit-of-work-dependency.md`);
  else if (edges === null || edges.length === 0) missing.push(`${UG}/unit-of-work-dependency.md 의 yaml units 블록`);

  const table = uow === null ? [] : tableRows(uow, ["unit id", "directory"]);
  if (uow === null) missing.push(`${UG}/unit-of-work.md`);
  const byDir = new Map(table.map((r) => [r.directory ?? "", r]));
  const titleKey = ["name", "title", "unit", "unit name"].find((k) => table[0] && k in table[0]);

  const mapText = read(path.join(folder, UG, "unit-of-work-story-map.md"));
  const idToName = new Map<string, string>();
  for (const r of table) if (r["unit id"] && r.directory) idToName.set(r["unit id"], r.directory);
  const storyUnits = new Map<string, string[]>();
  if (mapText !== null) {
    for (const line of mapText.split(/\r?\n/)) {
      if (!line.includes("|")) continue;
      const c = cells(line).map((x) => x.replace(/[*`]/g, ""));
      const id = c[0] ?? "";
      if (!/^(US\d+\.\d+|FR\d+(?:\.\d+)?|NFR\d+(?:\.\d+)?)$/.test(id)) continue;
      const targets = (c[1] ?? "").split(/[;,]/).map((x) => x.trim()).filter(Boolean).map((x) => idToName.get(x) ?? x);
      storyUnits.set(id, [...(storyUnits.get(id) ?? []), ...targets]);
    }
  }
  const storiesText = read(path.join(folder, "inception/user-stories/stories.md"));
  const stories: AStory[] = [];
  const seen = new Set<string>();
  if (storiesText !== null) {
    for (const line of storiesText.split(/\r?\n/)) {
      const m = /^\s*(?:#{1,6}\s+|[-*]\s+|\|\s*)?\**(US\d+\.\d+)\**[\s:|—–-]*(.*)$/.exec(line);
      if (m && !seen.has(m[1] as string)) {
        seen.add(m[1] as string);
        stories.push({ id: m[1] as string, title: (m[2] as string).replace(/[|*`]/g, "").trim().slice(0, 120) });
      }
    }
  }
  const useUs = stories.length > 0;
  if (!useUs) for (const id of storyUnits.keys()) if (!seen.has(id)) stories.push({ id, title: "" });
  const kept = (id: string): boolean => (useUs ? id.startsWith("US") : true);

  const units: AUnit[] = (edges ?? []).map((e) => {
    const row = byDir.get(e.name);
    const mine = [...storyUnits].filter(([id, us]) => kept(id) && us[0] === e.name).map(([id]) => id);
    return {
      name: e.name,
      sourceId: row?.["unit id"] || e.name,
      kind: e.kind,
      title: (titleKey && row?.[titleKey]) || dirTitle(e.name),
      dependsOn: e.dependsOn,
      stories: mine,
    };
  });
  const shared = [...storyUnits].filter(([id, us]) => kept(id) && new Set(us).size > 1).map(([story, us]) => ({ story, units: [...new Set(us)] }));
  for (const u of units) for (const d of u.dependsOn) if (!units.some((x) => x.name === d)) missing.push(`Unit ${u.name} 의 depends_on ${d} 가 Unit 목록에 없다`);

  let gateApprovals = 0;
  for (const f of files.filter((x) => x.startsWith("audit/") && x.endsWith(".md"))) {
    gateApprovals += (read(path.join(folder, f)) ?? "").split(/\r?\n/).filter((l) => /^\*\*Event\*\*:\s*GATE_APPROVED\b/.test(l)).length;
  }
  return { folder, title, scope, units, stories, shared, inputSha256: inputSha(folder, files), fileCount: files.length, missing, gateApprovals };
}
