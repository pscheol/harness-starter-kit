/* 자리 계산: 라이브러리 없이 dependsOn 깊이로 층을 나눈다.
 * - 기능 Unit: x = 계약을 뺀 의존 깊이(왼쪽 → 오른쪽), 같은 깊이는 아래로 쌓는다.
 * - 계약 Unit: 위 띠에 둔다. x = 그 계약을 쓰는 Unit 중 가장 왼쪽 열.
 * - Intent는 모두를 감싸는 영역(머리 포함)이다.
 */
import { MarkerType } from "@xyflow/react";
import { EDGE_LABELS } from "./data.js";

const DESIGN = "#3046c5";

export const G = {
  NODE_W: 224,
  NODE_H: 164,
  COL_GAP: 84,
  ROW_GAP: 76,
  PAD: 18,
  HEAD_H: 58
};

const INK = "#14213d";
const INK_SOFT = "#46536b";
const INK_FAINT = "#5f6b80";

/** @param {Array<{id:string, kind:string, dependsOn:string[]}>} units */
export function featureDepths(units) {
  const byId = new Map(units.map((u) => [u.id, u]));
  const memo = new Map();
  const visiting = new Set();
  function depth(id) {
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) throw new Error("dependsOn 고리: " + [...visiting, id].join(" → "));
    visiting.add(id);
    const u = byId.get(id);
    const deps = (u ? u.dependsOn : []).filter((d) => byId.get(d) && byId.get(d).kind !== "contract");
    const d = deps.length ? 1 + Math.max(...deps.map(depth)) : 0;
    visiting.delete(id);
    memo.set(id, d);
    return d;
  }
  units.filter((u) => u.kind !== "contract").forEach((u) => depth(u.id));
  return memo;
}

/** 자리 {id: {x, y, col}} 와 영역 크기. extraBottom = 아래로 돌아가는 제안 선 자리 */
export function computeLayout(units, extraBottom) {
  const depths = featureDepths(units);
  const colX = (c) => G.PAD + c * (G.NODE_W + G.COL_GAP);
  const bandY = G.HEAD_H;
  const rowY = bandY + G.NODE_H + G.ROW_GAP;
  const pos = {};
  const perCol = {};
  units
    .filter((u) => u.kind !== "contract")
    .forEach((u) => {
      const c = depths.get(u.id);
      const k = perCol[c] || 0;
      perCol[c] = k + 1;
      pos[u.id] = { x: colX(c), y: rowY + k * (G.NODE_H + G.ROW_GAP), col: c };
    });
  const taken = new Set();
  units
    .filter((u) => u.kind === "contract")
    .forEach((u) => {
      const cols = units.filter((f) => f.dependsOn.includes(u.id) && pos[f.id]).map((f) => pos[f.id].col);
      let c = cols.length ? Math.min(...cols) : 0;
      while (taken.has(c)) c += 1;
      taken.add(c);
      pos[u.id] = { x: colX(c), y: bandY, col: c };
    });
  const cols = Math.max(1, ...Object.values(pos).map((p) => p.col + 1));
  const bottom = Math.max(rowY + G.NODE_H, ...Object.values(pos).map((p) => p.y + G.NODE_H));
  return {
    pos,
    width: G.PAD * 2 + cols * G.NODE_W + (cols - 1) * G.COL_GAP,
    height: bottom + G.PAD + (extraBottom || 0)
  };
}

/** 위상 순서(계약 먼저, 그다음 의존 순서) */
export function topoOrder(units) {
  const depths = featureDepths(units);
  const rank = (u) => (u.kind === "contract" ? -1 : depths.get(u.id));
  return [...units].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}

export function unitAriaLabel(u) {
  const parts = [(u.kind === "contract" ? "계약 Unit " : "Unit ") + u.id, u.issue, u.title, u.status.text];
  if (u.bolts) parts.push("Bolt " + u.bolts[0] + "/" + u.bolts[1]);
  if (u.blocking) parts.push(u.blocking + " 막힘");
  if (u.question) parts.push(u.question);
  return parts.join(" · ");
}

export function buildNodes(intent, units, layout, selectedId, proposal) {
  const coFor = { "U-1": "3", "U-4": "4" };
  /* 영역 번호 11: 제안이 건드리는 Unit */
  if (proposal) proposal.changes.forEach((c) => { coFor[c.to] = "11"; });
  const region = {
    id: intent.key,
    type: "intent",
    position: { x: 0, y: 0 },
    data: { intent, units },
    style: { width: layout.width, height: layout.height },
    width: layout.width,
    height: layout.height,
    draggable: false,
    selectable: false,
    focusable: false,
    zIndex: 0
  };
  const unitNodes = units.map((u) => ({
    id: u.id,
    type: "unit",
    position: { x: layout.pos[u.id].x, y: layout.pos[u.id].y },
    data: { unit: u },
    width: G.NODE_W,
    height: G.NODE_H,
    selected: u.id === selectedId,
    draggable: false,
    zIndex: 1,
    ariaRole: "button",
    ariaLabel: unitAriaLabel(u),
    domAttributes: Object.assign({ "aria-roledescription": "Unit" }, coFor[u.id] ? { "data-co": coFor[u.id] } : {})
  }));
  return [region, ...unitNodes];
}

/** 선은 먼저 끝나야 하는 Unit → 기다리는 Unit 방향이다. proposal이 있으면 더할 선은 파란 점선, 뺄 선은 표시만 바꾼다 */
export function buildEdges(units, layout, view, proposal) {
  const removed = new Set(proposal ? proposal.changes.filter((c) => c.op === "remove").map((c) => c.from + ">" + c.to) : []);
  const byId = new Map(units.map((u) => [u.id, u]));
  const edges = [];
  units.forEach((u) => {
    u.dependsOn.forEach((src) => {
      const s = byId.get(src);
      if (!s) return;
      const contract = s.kind === "contract";
      const sameCol = layout.pos[src].col === layout.pos[u.id].col;
      const hot = Boolean(view.selectedId) && (view.selectedId === src || view.selectedId === u.id);
      const dim = !view.isMatch(src) || !view.isMatch(u.id);
      const color = hot ? INK : contract ? INK_SOFT : INK_FAINT;
      const cut = removed.has(src + ">" + u.id);
      edges.push({
        id: src + ">" + u.id,
        source: src,
        target: u.id,
        sourceHandle: contract ? (sameCol ? "b" : "r") : "r",
        targetHandle: contract ? "t" : "l",
        type: contract ? "contract" : "dep",
        selectable: false,
        focusable: false,
        ariaLabel: src + " → " + u.id + (contract ? " 계약" : EDGE_LABELS[src + ">" + u.id] ? " " + EDGE_LABELS[src + ">" + u.id] : "") + (cut ? " · 빼기 제안" : ""),
        className: [hot ? "e-hot" : "", dim ? "e-dim" : "", cut ? "e-cut" : ""].join(" ").trim(),
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color },
        data: {
          label: cut ? "빼기 제안" : contract ? "계약" : EDGE_LABELS[src + ">" + u.id] || "",
          cut,
          title: cut ? (EDGE_LABELS[src + ">" + u.id] || "") + " · 변경 제안으로 뺄 의존" : contract ? (u.consumes || []).join(", ") : "",
          hot,
          dim
        }
      });
    });
  });
  if (proposal) {
    proposal.changes
      .filter((c) => c.op === "add" && byId.get(c.from) && byId.get(c.to))
      .forEach((c) => {
        edges.push({
          id: "p:" + c.from + ">" + c.to,
          source: c.from,
          target: c.to,
          sourceHandle: "b",
          targetHandle: "bt",
          type: "proposed",
          selectable: false,
          focusable: false,
          ariaLabel: c.from + " → " + c.to + " " + c.label + " · 더하기 제안",
          className: "e-proposed",
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: DESIGN },
          data: { label: "+ " + c.label + " · 제안", title: c.why }
        });
      });
  }
  return edges;
}

/** 제안이 건드리는 Unit */
export function touchedByProposal(proposal) {
  const ids = new Set();
  if (proposal) proposal.changes.forEach((c) => { ids.add(c.to); });
  return ids;
}
