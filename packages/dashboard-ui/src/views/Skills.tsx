// S08 스킬: 이 컴퓨터와 리포의 스킬을 읽기만 한다(설계 07). 장비 정보라 커밋하지 않고 내보내기에서 뺀다.
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useMemo, useState } from "react";
import { get } from "../lib/api";
import { clock, HARNESS_KO, HARNESS_LETTER, STAGE_CLASS, STAGE_KO, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import type { Loose } from "../lib/types";
import { Code, CommandBox, Empty, ErrorBlock, Ico, Loading, Muted, Notice, Panel, Seg, Tag, type Tone } from "../ui/common";
import { Page, TwoCol } from "../ui/Page";

const PAGE = 120;
const MARK: Record<string, [Tone, string]> = { loaded: ["ops", "쓸 수 있음"], both: ["ops", "둘 다 뜸"], shadowed: ["build", "가려짐"], no: ["line", "안 보임"] };
const ALL_H = ["claude", "codex", "kiro", "cursor", "gemini"];

/** 스킬 하나의 하네스별 표시(글자 + 상태 글 — 색만으로 말하지 않는다) */
export function HarnessMarks({ s, harnesses }: { s: Loose; harnesses: string[] }) {
  const on = harnesses.filter((hn) => ((s.harnesses[hn] as string | undefined) ?? "no") !== "no");
  if (!on.length) return <Muted size="xsm">안 보임</Muted>;
  return (
    <HStack gap={1} wrap="wrap">
      {on.map((hn) => {
        const st = s.harnesses[hn] as string;
        const [tone, text] = MARK[st] ?? (["line", st] as [Tone, string]);
        return <Tag key={hn} tone={tone} label={`${HARNESS_LETTER[hn] ?? "?"} ${text}`} />;
      })}
    </HStack>
  );
}

export default function Skills({ route }: { route: Route }) {
  const refresh = route.query.refresh === "1";
  const { state, reload } = useLoad<[Loose]>(() => [get("/skills", { query: { all: "1", ...(refresh ? { refresh: "1" } : {}) } })], [refresh]);
  const [stage, setStage] = useState("all");
  const [harness, setHarness] = useState("all");
  const [onlyGuess, setOnlyGuess] = useState(false);
  const [page, setPage] = useState(PAGE);
  const inv: Loose | null = state.status === "ready" ? state.data[0] : null;
  const sub = "이 컴퓨터의 스킬 · 읽기만 합니다 · 장비 정보라 커밋하지 않고 내보내기에서 뺍니다";
  const crumbs = [{ label: "품질" }, { label: "스킬" }];

  const skills: Loose[] = inv?.skills ?? [];
  const harnesses: string[] = inv ? (inv.harnesses.length === 5 ? ALL_H : (inv.harnesses as string[])) : [];
  const active = ALL_H.filter((x) => skills.some((s) => (s.harnesses[x] ?? "no") !== "no"));
  const shown = (active.length ? active : harnesses).slice(0, 5);
  const names = useMemo(() => new Set<string>(((inv?.conflicts ?? []) as Loose[]).map((c) => c.name as string)), [inv]);
  const list = useMemo(() => skills.filter((s) => (stage === "all" || (stage === "none" ? !s.stages.length : (s.stages as Loose[]).some((x) => x.stage === stage))) && (harness === "all" || ["loaded", "both"].includes(s.harnesses[harness])) && (!onlyGuess || (s.stages as Loose[]).some((x) => x.source === "추정"))), [skills, stage, harness, onlyGuess]);

  if (state.status === "loading") return <Page title="스킬" sub={sub} crumbs={crumbs}><Loading rows={6} /></Page>;
  if (state.status === "error" || !inv) return <Page title="스킬" sub={sub} crumbs={crumbs}><ErrorBlock error={state.status === "error" ? state.error : null} retry={reload} /></Page>;

  const stageCount = (st: string): number => skills.filter((s) => (s.stages as Loose[]).some((x) => x.stage === st)).length;
  const guessCount = skills.filter((s) => (s.stages as Loose[]).some((x) => x.source === "추정")).length;
  const resolved = (inv.map.resolved as Loose[]).filter((x) => x.harness === (inv.harnesses[0] ?? x.harness));
  const byCommand = new Map<string, Loose[]>();
  for (const x of resolved) byCommand.set(x.command, [...(byCommand.get(x.command) ?? []), x]);

  return (
    <Page title="스킬" sub={sub} crumbs={crumbs}>
      {(inv.warnings as string[]).length ? <Notice kind="warn" title={(inv.warnings as string[]).join(" · ")} /> : null}
      <TwoCol
        main={
          <>
            <Panel title="어디에 몇 개" aside={<Muted>{`이름 겹침 ${inv.conflicts.length}`}</Muted>} flush>
              <Table
                data={inv.roots as Loose[]}
                idKey="path"
                density="compact"
                columns={[
                  { key: "path", header: "위치", renderCell: (x: Loose) => <HStack gap={1} wrap="wrap"><Code>{x.path}</Code>{x.version ? <Muted size="xsm">{x.version}</Muted> : null}</HStack> },
                  { key: "scope", header: "범위", renderCell: (x: Loose) => <Text>{String(x.scope).startsWith("plugin") ? "플러그인" : x.scope === "user" ? "사용자" : String(x.scope).startsWith("nested") ? "하위 폴더" : "프로젝트"}</Text> },
                  { key: "count", header: "개수", align: "end", renderCell: (x: Loose) => (x.error ? <Text color="secondary">{x.error}</Text> : <Text hasTabularNumbers>{String(x.count)}</Text>) },
                ]}
                emptyState={<Muted>스킬 위치가 비어 있습니다</Muted>}
              />
            </Panel>
            <Panel title="스킬 목록" aside={<Muted>{`${Math.min(list.length, page)}개 표시 · 전체 ${skills.length}`}</Muted>}>
              <HStack gap={3} wrap="wrap" align="center">
                <Seg label="단계" items={[{ id: "all", label: "전체", n: skills.length }, ...Object.entries(STAGE_KO).map(([k, v]) => ({ id: k, label: v, n: stageCount(k) })), { id: "none", label: "미분류", n: skills.filter((s) => !s.stages.length).length }]} value={stage} onChange={(v) => { setStage(v); setPage(PAGE); }} />
                <Selector label="하네스 거르기" isLabelHidden size="sm" value={harness} onChange={(v) => { setHarness(v ?? "all"); setPage(PAGE); }} options={[{ value: "all", label: "하네스 모두" }, ...shown.map((x) => ({ value: x, label: HARNESS_KO[x] as string }))]} />
                <CheckboxInput label={`추정만(${guessCount})`} value={onlyGuess} onChange={setOnlyGuess} />
              </HStack>
              <VStack gap={3} aria-live="polite">
                {list.length ? (
                  <Table
                    data={list.slice(0, page)}
                    idKey="id"
                    density="compact"
                    columns={[
                      { key: "id", header: "이름", renderCell: (s: Loose) => <VStack gap={1}><Code>{s.id}</Code>{names.has(s.name) ? <Tag tone="build" label="이름 겹침" /> : null}{s.error ? <Tag tone="gate" icon="alert" label={`오류 ${s.error}`} /> : null}</VStack> },
                      { key: "description", header: "설명", renderCell: (s: Loose) => (s.description ? <Text size="sm" maxLines={2}>{s.description}</Text> : <Muted>설명 없음</Muted>) },
                      { key: "harnesses", header: "하네스", renderCell: (s: Loose) => <HarnessMarks s={s} harnesses={shown} /> },
                      { key: "loc", header: "위치", renderCell: (s: Loose) => (s.locations[0] ? <Muted size="xsm">{`${s.locations[0].path}${s.locations.length > 1 ? ` 외 ${s.locations.length - 1}` : ""}`}</Muted> : <Text>-</Text>) },
                      {
                        key: "stages",
                        header: "단계 · 출처",
                        renderCell: (s: Loose) =>
                          (s.stages as Loose[]).length ? (
                            <VStack gap={1}>
                              {(s.stages as Loose[]).map((x) => (
                                <HStack key={x.stage} gap={1} align="center"><Tag tone={(STAGE_CLASS[x.stage] === "build" ? "build" : STAGE_CLASS[x.stage] === "ops" ? "ops" : STAGE_CLASS[x.stage] === "design" ? "design" : "line") as Tone} label={STAGE_KO[x.stage] ?? x.stage} /><Muted size="xsm">{x.source === "map" ? "지도" : x.source === "metadata" ? "머리" : "추정"}</Muted></HStack>
                              ))}
                            </VStack>
                          ) : (
                            <Muted size="xsm">미분류</Muted>
                          ),
                      },
                    ]}
                  />
                ) : (
                  <Empty title="조건에 맞는 스킬이 없습니다" text="단계 · 하네스 거름을 바꿉니다." />
                )}
                {list.length > page ? <HStack justify="center"><Button label={`더 보기(${list.length - page}개 남음)`} onClick={() => setPage((p) => p + PAGE)} /></HStack> : null}
              </VStack>
            </Panel>
          </>
        }
        side={
          <>
            <Panel title="이 단계에서 쓸 내 스킬">
              {inv.map.present ? (
                [...byCommand].map(([cmd, xs]) => (
                  <VStack key={cmd} gap={1}>
                    <Code>{cmd}</Code>
                    {xs.map((x, i) => (
                      <HStack key={`${x.slot}${i}`} gap={1} align="center" wrap="wrap">
                        <Ico name={x.skill ? "ok" : "help"} size={14} />
                        <Text size="sm">{x.skill ?? `없음 · ${x.fallback}`}</Text>
                        <Muted size="xsm">{`(${x.slot}, ${HARNESS_KO[x.harness]})`}</Muted>
                      </HStack>
                    ))}
                  </VStack>
                ))
              ) : (
                <Empty title="스킬 지도가 없습니다" text="킷 명령은 .agents/skill-map.json 에서 깔린 스킬을 찾아 쓰고, 없으면 킷 기본 템플릿을 씁니다. 지도가 없으면 단계는 설명 낱말로 추정합니다." />
              )}
              <Muted>지도는 팀이 MR 로 고칩니다. 터미널: <Code>knots-sync skills --stage 설계</Code></Muted>
            </Panel>
            <Panel title="단계 × 하네스" aside={<Muted>{`단계가 붙은 스킬 ${skills.filter((s) => s.stages.length).length}`}</Muted>} flush>
              <Table
                data={Object.entries(STAGE_KO).map(([k, v]) => ({ k, v }))}
                idKey="k"
                density="compact"
                columns={[
                  { key: "v", header: "단계", renderCell: (r: Loose) => <Tag tone={(STAGE_CLASS[r.k] === "build" ? "build" : STAGE_CLASS[r.k] === "ops" ? "ops" : "design") as Tone} label={r.v} /> },
                  ...shown.map((x) => ({ key: x, header: HARNESS_KO[x] as string, align: "end" as const, renderCell: (r: Loose) => <Text hasTabularNumbers>{String(skills.filter((s) => (s.stages as Loose[]).some((y) => y.stage === r.k) && ["loaded", "both"].includes(s.harnesses[x])).length)}</Text> })),
                ]}
              />
            </Panel>
            <HStack gap={2} align="center" wrap="wrap">
              <Button label="다시 수집" icon={<Ico name="refresh" />} href={`${location.pathname}?refresh=1`} />
              <Muted size="xsm">{`${clock(inv.scannedAt)} 수집`}</Muted>
            </HStack>
            <CommandBox cmd="knots-sync skills --stage 설계" />
          </>
        }
      />
    </Page>
  );
}
