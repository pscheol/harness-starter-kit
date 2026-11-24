/** 역할 → 하네스(README §5, D7 기본값: 설계 · 구현 claude, 리뷰 codex, 문서 kiro). 개인 층은 여기서 보지 않는다(공유 설정 기준). */
import { CliError, EXIT } from "../core/errors";
import type { ToolDecl } from "./declaration";

const DEFAULTS: Record<string, string> = { design: "claude", implement: "claude", review: "codex", docs: "kiro" };

export function roleHarness(meta: Record<string, unknown>, role: string): string {
  const roles = meta.roles && typeof meta.roles === "object" ? (meta.roles as Record<string, unknown>) : {};
  const r = roles[role];
  const h = r !== null && typeof r === "object" ? (r as Record<string, unknown>).harness : undefined;
  return typeof h === "string" && h ? h : (DEFAULTS[role] as string);
}

export const designHarness = (meta: Record<string, unknown>): string => roleHarness(meta, "design");
export const implementHarness = (meta: Record<string, unknown>): string => roleHarness(meta, "implement");

/** 킷 하네스 id → 도구가 쓰는 이름. 도구가 지원하지 않는 하네스면 exit 3. */
export function toolHarnessName(tool: ToolDecl, harness: string, role: string): string {
  const name = tool.harnessNames[harness];
  if (!name) {
    throw new CliError(EXIT.STATE, `${tool.name} 는 ${harness} 하네스를 지원하지 않는다(${role} 역할 하네스)`, `지원: ${Object.keys(tool.harnessNames).join(" · ")}. knots-sync.json 의 roles.${role}.harness 를 바꾼 뒤 다시 한다`);
  }
  return name;
}

/** 단계 인자의 자리표를 바꾼다: {designHarnessName} · {implementHarnessName} · {designHarness} · {implementHarness} */
export function fillPlaceholders(argv: string[], meta: Record<string, unknown>, tool: ToolDecl | null): string[] {
  return argv.map((a) =>
    a.replace(/\{(design|implement)Harness(Name)?\}/g, (_m, role: string, name: string | undefined) => {
      const h = roleHarness(meta, role);
      if (!name) return h;
      if (!tool) throw new CliError(EXIT.ENV, `${a}: 이름 자리표는 도구가 있는 모듈에서만 쓴다`);
      return toolHarnessName(tool, h, role);
    }),
  );
}
