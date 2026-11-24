/**
 * 게이트 하한(설계 04 §3.8, HK-14 design §6). 설정 · 팩 · 개인 층으로 바꿀 수 없는 상수다.
 * Python `scripts/harness/floor.py` 와 같은 값이다(시험이 묶는다). 관리 페이지(`packages/dashboard`)도 이 값을 쓴다.
 */
export const GATE_FLOOR: readonly string[] = ["requirements", "design", "mr", "done"];
export const FLOOR_HOOKS: readonly string[] = ["harness-protect-sources", "harness-block-full-verify", "harness-verify-gate", "harness-protect-approvals"];

export const isFloorHook = (id: string): boolean => FLOOR_HOOKS.includes(id);

/** flow.gates 에서 빠진 하한 게이트(flow.gates 가 없으면 기본 흐름이라 빠진 것이 없다). */
export function missingFloorGates(gates: unknown): string[] {
  if (!Array.isArray(gates)) return [];
  return GATE_FLOOR.filter((g) => !gates.includes(g));
}
