/**
 * 결정적 JSON 쓰기(메타 · lock · 출력).
 * - 객체는 여러 줄, 들여쓰기 2칸.
 * - 스칼라만 든 배열은 한 줄: ["a", "b"]. v1 harness_meta_list 의 sed 가 한 줄 배열을 읽는다.
 * - 객체가 든 배열은 항목마다 한 줄(lock entries). 끝에 줄바꿈 하나.
 */
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function isScalar(v: unknown): boolean {
  return v === null || typeof v !== "object";
}

function inline(v: unknown): string {
  if (isScalar(v)) return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")}}`;
}

function block(v: unknown, indent: string): string {
  if (isScalar(v)) return JSON.stringify(v) ?? "null";
  const inner = `${indent}  `;
  if (Array.isArray(v)) {
    if (v.length === 0 || v.every(isScalar)) return inline(v);
    return `[\n${v.map((x) => `${inner}${inline(x)}`).join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
  if (entries.length === 0) return "{}";
  return `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${block(x, inner)}`).join(",\n")}\n${indent}}`;
}

export function formatJson(value: unknown): string {
  return `${block(value as Json, "")}\n`;
}
