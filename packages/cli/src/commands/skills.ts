/**
 * skills · usage · history — 스킬 목록(설계 07 §3.9)과 기록 · 사용량(설계 06 §3.18) 콘솔 명령(HK-18).
 * 관리 페이지와 같은 처리 함수(packages/dashboard/src/api.ts)를 부른다. --json 은 API 의 data 와 같다.
 */
import { STAGE_ALIAS } from "../../../dashboard/src/skills";
import { bool, str } from "../cli/args";
import type { CommandResult, Ctx } from "../cli/context";
import { run } from "./api-call";

interface SkillRow {
  id: string;
  harnesses: Record<string, string>;
  stages: { stage: string; slot: string | null; source: string }[];
  locations: { path: string }[];
  warnings: string[];
  error: string | null;
}

const STAGE_KO: Record<string, string> = { design: "설계", implement: "구현", verify: "검증", docs: "반영", ops: "운영" };
const SOURCE_KO: Record<string, string> = { map: "지도", metadata: "머리", 추정: "추정" };
const pad = (s: string, n: number): string => (s.length >= n ? `${s} ` : s.padEnd(n));

function skillLines(d: Record<string, unknown>, stage: string | undefined): string[] {
  const roots = (d.roots as { path: string; scope: string; count: number; error?: string }[]) ?? [];
  const skills = (d.skills as SkillRow[]) ?? [];
  const harnesses = (d.harnesses as string[]) ?? [];
  const conflicts = (d.conflicts as { name: string; candidates: string[] }[]) ?? [];
  const lines: string[] = [];
  if (stage === undefined) {
    lines.push("위치별 개수", ...roots.map((r) => `  ${pad(r.path, 44)} ${pad(r.scope, 16)} ${String(r.count).padStart(4)}${r.error ? ` (읽지 못함: ${r.error})` : ""}`));
    const map = d.map as { present: boolean; resolved: { command: string; slot: string; harness: string; skill: string | null; fallback: string }[] };
    lines.push(map.present ? "지도 칸별 해석" : "스킬 지도 없음(.agents/skill-map.json) — 단계는 설명 낱말로 추정한다");
    for (const r of map.resolved) lines.push(`  ${pad(r.command, 18)} ${pad(r.slot, 22)} ${pad(r.harness, 8)} ${r.skill ?? `— (${r.fallback})`}`);
  }
  lines.push(`스킬 ${String(d.shown ?? skills.length)}개(전체 ${String(d.total ?? skills.length)}) — 하네스: ${harnesses.join(" · ")}`);
  if (skills.length) {
    lines.push(`${pad("이름", 34)} ${pad("단계", 12)} ${pad("출처", 8)} ${harnesses.map((h) => pad(h, 8)).join("")}위치`);
    for (const s of skills) {
      const want = stage ? (STAGE_ALIAS[stage] ?? stage) : null;
      const st = want ? s.stages.find((x) => x.stage === want) : s.stages[0];
      const stText = st ? `${STAGE_KO[st.stage] ?? st.stage}${st.slot ? `/${st.slot}` : ""}` : "미분류";
      const overlap = conflicts.some((c) => c.name === s.id) ? " (이름 겹침)" : "";
      lines.push(`${pad(s.id, 34)} ${pad(stText, 12)} ${pad(SOURCE_KO[st?.source ?? ""] ?? "-", 8)} ${harnesses.map((h) => pad(s.harnesses[h] ?? "no", 8)).join("")}${s.locations[0]?.path ?? ""}${overlap}${s.error ? ` [오류: ${s.error}]` : ""}`);
    }
  }
  if (conflicts.length) lines.push("이름 겹침", ...conflicts.map((c) => `  ${c.name}: ${c.candidates.join(" · ")}`));
  return lines;
}

export async function runSkills(ctx: Ctx): Promise<CommandResult> {
  const v = ctx.values;
  const query: Record<string, string> = {};
  for (const k of ["stage", "harness"]) if (str(v, k)) query[k] = str(v, k) as string;
  for (const k of ["conflicts", "errors", "all", "refresh"]) if (bool(v, k)) query[k] = "1";
  if (bool(v, "no-user")) query.user = "0";
  return run(ctx, "GET", "/skills", { query }, (d) => skillLines(d, str(v, "stage")));
}

function fmt(n: number): string {
  const trim = (x: number): string => x.toFixed(1).replace(/\.0$/, "");
  return n >= 1_000_000 ? `${trim(n / 1_000_000)}M` : n >= 1000 ? `${trim(n / 1000)}K` : String(n);
}

export async function runUsage(ctx: Ctx): Promise<CommandResult> {
  const v = ctx.values;
  if (bool(v, "kit")) {
    return run(ctx, "GET", "/usage/kit", {}, (d) => {
      const s = d.sessionStart as { avgBytes: number; limit: number; within: boolean };
      const hooks = (d.hooks as { event: string; hook: string; count: number; avgBytes: number; maxBytes: number }[]) ?? [];
      const mods = (d.modules as { owner: string; files: number; bytes: number }[]) ?? [];
      return [
        `세션 시작 평균 ${s.avgBytes} / ${s.limit}바이트 ${s.within ? "(상한 안)" : "(상한 넘음)"}`,
        ...hooks.map((h) => `  ${pad(h.event, 14)} ${pad(h.hook, 30)} ${String(h.count).padStart(5)}회 평균 ${h.avgBytes} 최대 ${h.maxBytes}바이트`),
        ...mods.map((m) => `  owner ${pad(m.owner, 16)} 세션마다 실리는 파일 ${m.files}개 ${m.bytes}바이트`),
      ];
    });
  }
  if (bool(v, "now")) {
    return run(ctx, "GET", "/usage/now", {}, (d) => {
      if (d.enabled === false) return ["대화 기록 읽기가 꺼져 있다 — ~/.config/knots-sync/config.json 에 \"history\": \"on\""];
      const s = d.session as { id: string; model: string | null; used: number; window: number | null; ratio: number | null; warn: boolean; issue: string | null } | null;
      if (!s) return ["이 리포의 최근 세션 기록이 없다"];
      return [`${s.id} · ${s.model ?? "모델 모름"} · 컨텍스트 ${fmt(s.used)}${s.window ? ` / ${fmt(s.window)} (${Math.round((s.ratio ?? 0) * 100)}%)` : " (창 크기: 기록에 없다)"}${s.warn ? " · 알림 기준을 넘었다" : ""}${s.issue ? ` · ${s.issue}` : ""}`];
    });
  }
  const query: Record<string, string> = {};
  if (str(v, "days")) query.days = str(v, "days") as string;
  if (str(v, "harness")) query.harness = str(v, "harness") as string;
  return run(ctx, "GET", "/usage", { query }, (d) => {
    const sources = (d.sources as { label: string; state: string; files: number; sessions: number; unreadable: number; note?: string }[]) ?? [];
    const srcLines = sources.map((s) => `  ${pad(s.label, 36)} ${pad(s.state, 5)} 파일 ${s.files} 세션 ${s.sessions}${s.unreadable ? ` 읽지 못함 ${s.unreadable}` : ""}${s.note ? ` · ${s.note}` : ""}`);
    if (bool(v, "sources")) return ["읽는 곳", ...srcLines];
    if (d.enabled === false) return ["대화 기록 읽기가 꺼져 있다(기본). 켜려면 사람이 ~/.config/knots-sync/config.json 에 \"history\": \"on\" 을 쓴다", ...srcLines];
    const t = d.totals as { sum: number; input: number; output: number; cacheRead: number; cacheWrite: number; requests: number };
    const daily = (d.daily as { date: string; sum: number }[]) ?? [];
    const issues = (d.byIssue as { issue: string; sum: number }[]) ?? [];
    const cache = d.cache as { average: number | null };
    return [
      `토큰 ${fmt(t.sum)} (입력 ${fmt(t.input)} · 출력 ${fmt(t.output)} · 캐시 읽기 ${fmt(t.cacheRead)} · 캐시 쓰기 ${fmt(t.cacheWrite)}) · 요청 ${t.requests}회 · 캐시 읽기 비율 ${cache.average === null ? "-" : `${Math.round(cache.average * 100)}%`}`,
      "하루 토큰", ...daily.map((x) => `  ${x.date} ${fmt(x.sum)}`),
      "이슈별 토큰", ...issues.slice(0, 10).map((x) => `  ${pad(x.issue, 14)} ${fmt(x.sum)}`),
      "읽는 곳", ...srcLines,
    ];
  });
}

export async function runHistory(ctx: Ctx): Promise<CommandResult> {
  const query: Record<string, string> = {};
  for (const k of ["q", "session", "role"]) if (str(ctx.values, k)) query[k] = str(ctx.values, k) as string;
  return run(ctx, "GET", "/history", { query }, (d) => {
    const list = (d.prompts as { at: string; text: string; harness: string; issue: string | null }[]) ?? [];
    return list.length ? [`프롬프트 ${String(d.total)}건 중 ${list.length}건`, ...list.map((x) => `${x.at.slice(0, 16).replace("T", " ")} ${pad(x.harness, 7)} ${pad(x.issue ?? "-", 12)} ${x.text.replace(/\s+/g, " ").slice(0, 100)}`)] : ["프롬프트 기록이 없다"];
  });
}

