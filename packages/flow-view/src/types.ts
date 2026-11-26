/** `GET /flow`(설계 06 §3.16)의 모양. 서버 `flow.ts` 의 `flowData` 와 같다. */
export interface UnitData {
  issue?: string | null;
  area?: string | null;
  title?: string | null;
  session?: { name: string | null; harness: string | null } | null;
  steps?: string[];
  flags?: string[];
  bolts?: { done: number; total: number; estimated: boolean };
  contracts?: string[];
}

export interface FlowNodeIn {
  id: string;
  type: "unit" | "contract-unit" | string;
  position: { x: number; y: number };
  data: UnitData;
}

export interface FlowEdgeIn {
  source: string;
  target: string;
  kind: "depends" | "contract" | string;
  label?: string;
}

export interface FlowData {
  nodes: FlowNodeIn[];
  edges: FlowEdgeIn[];
}

/** 화면이 넘기는 글(번역 · 단계 이름). 번들 안에 한국어를 박지 않는다. */
export interface FlowLabels {
  canvas: string;
  controls: string;
  minimap: string;
  contract: string;
  contractTag: string;
  noSession: string;
  bolt: string;
  estimated: string;
  steps: Record<string, string>;
  state: { done: string; active: string; todo: string };
  flags: Record<string, string>;
  /** 표시 값 풀이(예: failed → 실패). 없으면 원문 그대로 */
  flagValues?: Record<string, string>;
  area: string;
}

export function stepOf(raw: string): { id: string; state: "done" | "active" | "todo" } {
  const [id, st] = raw.split(":");
  return { id: id as string, state: st === "done" ? "done" : st === "active" ? "active" : "todo" };
}

export function flagText(flag: string, labels: FlowLabels): string {
  const [kind, value] = flag.split(":");
  const base = labels.flags[kind as string] ?? (kind as string);
  return value ? `${base} ${labels.flagValues?.[value] ?? value}` : base;
}

export function ariaLabelOf(id: string, type: string, d: UnitData, labels: FlowLabels): string {
  const parts = [`${id} ${d.title ?? ""}`.trim()];
  if (type === "contract-unit") parts.push(labels.contractTag);
  const active = (d.steps ?? []).map(stepOf).find((s) => s.state === "active");
  if (active) parts.push(`${labels.steps[active.id] ?? active.id} ${labels.state.active}`);
  else {
    const done = (d.steps ?? []).map(stepOf).filter((s) => s.state === "done");
    if (done.length) parts.push(`${labels.steps[(done[done.length - 1] as { id: string }).id] ?? ""} ${labels.state.done}`);
  }
  for (const f of d.flags ?? []) parts.push(flagText(f, labels));
  if (d.bolts) parts.push(`${labels.bolt} ${d.bolts.done}/${d.bolts.total}${d.bolts.estimated ? ` ${labels.estimated}` : ""}`);
  return parts.join(", ");
}
