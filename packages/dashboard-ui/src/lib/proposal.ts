// S12 변경 제안(설계 06 §3.16): 폼 입력 → 제안 한 건, 제안 한 건 → 사람이 읽는 줄. 서버가 검증하므로 여기서는 모양만 만든다.
import type { Loose } from "./types";

/** 제안 한 건을 사람이 읽는 줄로 */
export function describeChange(c: Loose): string {
  if (c.op === "add-dep") return `${c.unit} 가 ${c.dependsOn} 에 의존`;
  if (c.op === "remove-dep") return `${c.unit} 의 ${c.dependsOn} 의존 빼기`;
  if (c.op === "split") return `${c.unit} 나누기: ${(c.into ?? []).join(" | ")}`;
  if (c.op === "merge") return `합치기: ${(c.units ?? []).join(" + ")}`;
  return `순서: ${(c.units ?? []).join(" → ")}`;
}

/** 폼 입력 → 제안 한 건 */
export function buildChange(op: string, unit: string, other: string, text: string, reason: string): Loose {
  const c: Loose = { op, ...(reason.trim() ? { reason: reason.trim() } : {}) };
  if (op === "add-dep" || op === "remove-dep") Object.assign(c, { unit, dependsOn: other });
  else if (op === "split") Object.assign(c, { unit, into: text.split("\n").map((x) => x.trim()).filter(Boolean) });
  else if (op === "merge") Object.assign(c, { units: [unit, other] });
  else Object.assign(c, { units: text.split(",").map((x) => x.trim()).filter(Boolean) });
  return c;
}
