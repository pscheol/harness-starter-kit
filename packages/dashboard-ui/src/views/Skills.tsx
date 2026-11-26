// S08 스킬: 이 컴퓨터와 리포의 스킬을 읽기만 한다(설계 07). 장비 정보라 커밋하지 않고 내보내기에서 뺀다.
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useMemo, useRef, useState } from "react";
import { get } from "../lib/api";
import { clock, HARNESS_KO, STAGE_CLASS, STAGE_KO, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import type { Loose } from "../lib/types";
import { Code, CommandBox, Details, ErrorBlock, Ico, Loading, Muted, Notice, Panel, Seg, Tag, TermHelp, type Tone } from "../ui/common";
import { Page, TwoCol } from "../ui/Page";

const PAGE = 120;
/** 스킬 목록은 600KB 가까이 되고 자주 바뀌지 않는다. 다른 화면(5초)보다 느리게 다시 읽는다 */
const SKILLS_LIVE_MS = 30000;
const MARK: Record<string, [Tone, string]> = { loaded: ["ops", ""], both: ["build", "둘 다 뜸"], shadowed: ["build", "가려짐"], no: ["line", "안 보임"] };
const ALL_H = ["claude", "codex", "kiro", "cursor", "gemini"];
/** 표 안에서 쓰는 짧은 하네스 이름 */
const SHORT_H: Record<string, string> = { claude: "Claude", codex: "Codex", kiro: "Kiro", cursor: "Cursor", gemini: "Gemini" };
const SOURCE_KO: Record<string, string> = { map: "팀이 정함", metadata: "스킬이 밝힘", 추정: "낱말로 추정" };

const stageTone = (st: string): Tone => (STAGE_CLASS[st] === "build" ? "build" : STAGE_CLASS[st] === "ops" ? "ops" : STAGE_CLASS[st] === "design" ? "design" : "line");

/** 스킬 하나의 하네스별 표시(이름 + 상태 글 — 색만으로 말하지 않는다) */
export function HarnessMarks({ s, harnesses }: { s: Loose; harnesses: string[] }) {
  const on = harnesses.filter((hn) => ((s.harnesses[hn] as string | undefined) ?? "no") !== "no");
  if (!on.length) return <Muted>안 보임</Muted>;
  return (
    <HStack gap={1} wrap="wrap">
      {on.map((hn) => {
        const st = s.harnesses[hn] as string;
        const [tone, text] = MARK[st] ?? (["line", st] as [Tone, string]);
        return <Tag key={hn} tone={tone} label={text ? `${SHORT_H[hn] ?? hn} ${text}` : (SHORT_H[hn] ?? hn)} />;
      })}
    </HStack>
  );
}

/** 스킬 위치를 짧게: 플러그인은 이름만, 나머지는 경로 그대로 */
function rootName(x: Loose): string {
  const p = String(x.path);
  const m = /^plugin:([^@]+)@/.exec(p);
  return m ? (m[1] as string) : p;
}
function scopeName(scope: string): string {
  if (scope.startsWith("plugin")) return "플러그인";
  if (scope === "user") return "내 컴퓨터";
  if (scope.startsWith("nested")) return "하위 폴더";
  return "이 리포";
}

export default function Skills({ route }: { route: Route }) {
  // 다시 수집은 한 번만 서버에 refresh 를 보낸다(자동 갱신마다 다시 훑지 않게)
  const forceNext = useRef(route.query.refresh === "1");
  const [force, setForce] = useState(0);
  const { state, reload, at, every, stale } = useLoad<[Loose]>(
    () => {
      const refresh = forceNext.current;
      forceNext.current = false;
      return [get("/skills", { query: { all: "1", ...(refresh ? { refresh: "1" } : {}) } })];
    },
    [force],
    { live: SKILLS_LIVE_MS },
  );
  const [stage, setStage] = useState("all");
  const [harness, setHarness] = useState("all");
  const [onlyGuess, setOnlyGuess] = useState(false);
  const [page, setPage] = useState(PAGE);
  const inv: Loose | null = state.status === "ready" ? state.data[0] : null;
  const sub = "어느 하네스에서 어떤 스킬을 쓸 수 있는지, 단계마다 무엇을 쓰는지 봅니다. 이 컴퓨터의 정보라 커밋 · 내보내기에 넣지 않습니다.";
  const crumbs = [{ label: "품질" }, { label: "스킬" }];
  const live = { at, every, stale };
  const rescan = (): void => {
    forceNext.current = true;
    setForce((n) => n + 1);
  };
  const tools = (
    <HStack gap={2} align="center">
      {inv?.scannedAt ? <Muted>{`${clock(inv.scannedAt)}에 훑음`}</Muted> : null}
      <Button label="다시 훑기" size="sm" icon={<Ico name="refresh" />} onClick={rescan} isDisabled={state.status === "loading"} />
    </HStack>
  );

  const skills: Loose[] = inv?.skills ?? [];
  const harnesses: string[] = inv ? (inv.harnesses.length === 5 ? ALL_H : (inv.harnesses as string[])) : [];
  const active = ALL_H.filter((x) => skills.some((s) => (s.harnesses[x] ?? "no") !== "no"));
  const shown = (active.length ? active : harnesses).slice(0, 5);
  const names = useMemo(() => new Set<string>(((inv?.conflicts ?? []) as Loose[]).map((c) => c.name as string)), [inv]);
  const list = useMemo(() => skills.filter((s) => (stage === "all" || (stage === "none" ? !s.stages.length : (s.stages as Loose[]).some((x) => x.stage === stage))) && (harness === "all" || ["loaded", "both"].includes(s.harnesses[harness])) && (!onlyGuess || (s.stages as Loose[]).some((x) => x.source === "추정"))), [skills, stage, harness, onlyGuess]);

  if (state.status === "loading") return <Page title="스킬" sub={sub} crumbs={crumbs} tools={tools} live={live}><Loading rows={6} /></Page>;
  if (state.status === "error" || !inv) return <Page title="스킬" sub={sub} crumbs={crumbs} tools={tools} live={live}><ErrorBlock error={state.status === "error" ? state.error : null} retry={reload} /></Page>;

  const stageCount = (st: string): number => skills.filter((s) => (s.stages as Loose[]).some((x) => x.stage === st)).length;
  const guessCount = skills.filter((s) => (s.stages as Loose[]).some((x) => x.source === "추정")).length;
  const resolved = ((inv.map?.resolved ?? []) as Loose[]).filter((x) => x.harness === (inv.harnesses[0] ?? x.harness));
  const byCommand = new Map<string, Loose[]>();
  for (const x of resolved) byCommand.set(x.command, [...(byCommand.get(x.command) ?? []), x]);
  const conflicts = (inv.conflicts ?? []) as Loose[];

  return (
    <Page title="스킬" sub={sub} crumbs={crumbs} tools={tools} live={live}>
      {(inv.warnings as string[]).length ? <Notice kind="warn" title={(inv.warnings as string[]).join(" · ")} /> : null}
      <TwoCol
        main={
          <>
            <Panel title="단계별로 쓸 수 있는 스킬" aside={<Muted>{`단계가 붙은 스킬 ${skills.filter((s) => s.stages.length).length}개`}</Muted>} flush>
              <Table
                data={Object.entries(STAGE_KO).map(([k, v]) => ({ k, v }))}
                idKey="k"
                density="compact"
                columns={[
                  { key: "v", header: "단계", width: proportional(1), renderCell: (r: Loose) => <Tag tone={stageTone(r.k)} label={r.v} /> },
                  ...shown.map((x) => ({ key: x, header: SHORT_H[x] ?? x, width: proportional(1), align: "end" as const, renderCell: (r: Loose) => <Text hasTabularNumbers>{String(skills.filter((s) => (s.stages as Loose[]).some((y) => y.stage === r.k) && ["loaded", "both"].includes(s.harnesses[x])).length)}</Text> })),
                ]}
              />
            </Panel>
            <Panel title="스킬 목록" aside={<Muted>{`${Math.min(list.length, page)}개 보임 · 전체 ${skills.length}개`}</Muted>}>
              <HStack gap={3} wrap="wrap" align="center">
                <Seg label="단계" items={[{ id: "all", label: "전체", n: skills.length }, ...Object.entries(STAGE_KO).map(([k, v]) => ({ id: k, label: v, n: stageCount(k) })), { id: "none", label: "단계 없음", n: skills.filter((s) => !s.stages.length).length }]} value={stage} onChange={(v) => { setStage(v); setPage(PAGE); }} />
                <Selector label="하네스 거르기" isLabelHidden size="sm" value={harness} onChange={(v) => { setHarness(v ?? "all"); setPage(PAGE); }} options={[{ value: "all", label: "하네스 모두" }, ...shown.map((x) => ({ value: x, label: HARNESS_KO[x] as string }))]} />
                <CheckboxInput label={`낱말로 추정한 것만(${guessCount})`} value={onlyGuess} onChange={setOnlyGuess} />
              </HStack>
              <VStack gap={3} aria-live="polite">
                {list.length ? (
                  <Table
                    data={list.slice(0, page)}
                    idKey="id"
                    density="compact"
                    verticalAlign="top"
                    columns={[
                      { key: "id", header: "이름", width: proportional(2), renderCell: (s: Loose) => <VStack gap={1}><Code>{s.id}</Code>{names.has(s.name) ? <Tag tone="build" label="같은 이름이 여러 곳에" /> : null}{s.error ? <Tag tone="gate" icon="alert" label={`읽지 못함: ${s.error}`} /> : null}</VStack> },
                      { key: "description", header: "설명", width: proportional(4), renderCell: (s: Loose) => (s.description ? <Text size="sm" maxLines={2}>{s.description}</Text> : <Muted>설명 없음</Muted>) },
                      { key: "harnesses", header: "쓸 수 있는 하네스", width: proportional(2), renderCell: (s: Loose) => <HarnessMarks s={s} harnesses={shown} /> },
                      {
                        key: "stages",
                        header: "단계",
                        width: proportional(2),
                        renderCell: (s: Loose) =>
                          (s.stages as Loose[]).length ? (
                            <VStack gap={1}>
                              {(s.stages as Loose[]).map((x) => (
                                <HStack key={x.stage} gap={1} align="center" wrap="wrap">
                                  <Tag tone={stageTone(x.stage)} label={STAGE_KO[x.stage] ?? x.stage} />
                                  <Muted>{SOURCE_KO[x.source] ?? x.source}</Muted>
                                </HStack>
                              ))}
                            </VStack>
                          ) : (
                            <Muted>단계 없음</Muted>
                          ),
                      },
                    ]}
                  />
                ) : (
                  <VStack gap={1}>
                    <Text weight="semibold">조건에 맞는 스킬이 없습니다</Text>
                    <Muted>단계나 하네스 거름을 바꿉니다.</Muted>
                  </VStack>
                )}
                {list.length > page ? (
                  <HStack justify="center">
                    <Button label={`더 보기(${list.length - page}개 남음)`} onClick={() => setPage((p) => p + PAGE)} />
                  </HStack>
                ) : null}
              </VStack>
              <Details label="터미널에서 보기">
                <CommandBox cmd="knots-sync skills --stage 설계" />
              </Details>
            </Panel>
          </>
        }
        side={
          <>
            <Panel title="단계마다 쓰는 스킬">
              {inv.map?.present ? (
                [...byCommand].map(([cmd, xs]) => (
                  <VStack key={cmd} gap={1}>
                    <Code>{cmd}</Code>
                    {xs.map((x, i) => (
                      <HStack key={`${x.slot}${i}`} gap={1} align="center" wrap="wrap">
                        <Ico name={x.skill ? "ok" : "help"} size={14} />
                        <Text size="sm">{x.skill ?? `없음 · ${x.fallback}`}</Text>
                        <Muted>{`(${x.slot}, ${HARNESS_KO[x.harness] ?? x.harness})`}</Muted>
                      </HStack>
                    ))}
                  </VStack>
                ))
              ) : (
                <VStack gap={1}>
                  <Text weight="semibold">단계별로 정해 둔 스킬이 없습니다</Text>
                  <Muted>킷 명령은 정해 둔 스킬이 없으면 킷 기본 방법을 쓰고, 스킬의 단계는 설명 낱말로 추정합니다.</Muted>
                </VStack>
              )}
              <Details>
                <Muted>
                  단계마다 쓸 스킬은 <Code>.agents/skill-map.json</Code> 에 적고, 팀이 병합 요청으로 고칩니다.
                </Muted>
              </Details>
            </Panel>
            <Panel title="스킬이 있는 곳" aside={conflicts.length ? <Tag tone="build" label={`같은 이름 ${conflicts.length}개`} /> : undefined} flush>
              <Table
                data={inv.roots as Loose[]}
                idKey="path"
                density="compact"
                textOverflow="truncate"
                columns={[
                  { key: "path", header: "위치", width: proportional(3), renderCell: (x: Loose) => <Text type="code" size="sm" maxLines={1}>{rootName(x)}</Text> },
                  { key: "scope", header: "범위", width: proportional(2), renderCell: (x: Loose) => <Text size="sm">{scopeName(String(x.scope))}</Text> },
                  { key: "count", header: "개수", width: proportional(1), align: "end", renderCell: (x: Loose) => <Text hasTabularNumbers>{String(x.count)}</Text> },
                ]}
                emptyState={<Muted>스킬이 있는 곳을 찾지 못했습니다</Muted>}
              />
              {conflicts.length ? (
                <VStack gap={2} paddingBlock={4} paddingInline={2}>
                  <HStack gap={1} align="center">
                    <Muted>같은 이름의 스킬이 여러 곳에 있으면 하네스가 하나만 쓰거나 둘 다 띄웁니다.</Muted>
                    <TermHelp term="harness" />
                  </HStack>
                  <Details label="겹치는 이름 보기">
                    {conflicts.map((c) => (
                      <VStack key={c.name} gap={0}>
                        <Text size="sm" weight="semibold">{c.name}</Text>
                        {((c.candidates ?? []) as string[]).map((p) => (
                          <Text key={p} type="code" size="sm" wordBreak="break-all">
                            {p}
                          </Text>
                        ))}
                      </VStack>
                    ))}
                  </Details>
                </VStack>
              ) : null}
            </Panel>
          </>
        }
      />
    </Page>
  );
}
