// S13 기록 · 사용량. 이 컴퓨터의 대화 기록을 읽기만 한다. 대화 기록 읽기는 기본 켬(사용자 결정 2026-11-26)이고, config.json 의 "history": "off" 면 끈다. 모델을 부르지 않는다.
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Grid } from "@astryxdesign/core/Grid";
import { List, ListItem } from "@astryxdesign/core/List";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMemo, useState } from "react";
import { get } from "../lib/api";
import { activityDays, ago, clock, dayLabel, fmtBytes, fmtTokens, HARNESS_KO, pct, ROLE_KO, usageSummary, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import type { Loose } from "../lib/types";
import { DotMatrix, HBars, LineChart, ROLE_COLOR, ROLE_NAME, StackedBars } from "../ui/charts";
import { Code, Details, ErrorBlock, HarnessBadge, Ico, Key, Loading, Muted, Notice, Panel, Seg, Tag } from "../ui/common";
import { Page, Stat, StatRow, TwoCol } from "../ui/Page";

/** 대화 기록을 읽는 화면은 기록 파일을 훑으므로 다른 화면(5초)보다 느리게 다시 읽는다 */
const USAGE_LIVE_MS = 15000;
const CONFIG = "~/.config/knots-sync/config.json";

const EVENT_KO: Record<string, string> = {
  SessionStart: "세션 시작",
  SessionEnd: "세션 끝",
  PreToolUse: "도구 쓰기 전",
  PostToolUse: "도구 쓴 뒤",
  UserPromptSubmit: "프롬프트 보낼 때",
  Stop: "응답이 끝날 때",
  SubagentStop: "하위 에이전트가 끝날 때",
};
const ownerName = (o: string): string => (o === "kit" ? "킷" : o === "user" ? "직접 넣은 것" : o.startsWith("external:") ? o.slice("external:".length) : o);

/** 켜져 있을 때: 조용한 한 줄 + 읽는 곳 · 끄는 법은 '자세히' 안에 */
function HistoryOnNote({ u }: { u: Loose }) {
  const sources = (u.sources ?? []) as Loose[];
  return (
    <VStack gap={1}>
      <HStack gap={1} align="center" wrap="wrap">
        <Ico name="eye" size={14} />
        <Muted>이 컴퓨터의 대화 기록을 읽기만 합니다. 복사본을 남기지 않고, 내보내기 · 커밋 · 세션 요청에 넣지 않습니다.</Muted>
      </HStack>
      <Details label="읽는 곳 · 끄는 법">
        {sources.map((s) => (
          <HStack key={s.id ?? s.label} gap={2} wrap="wrap" align="center">
            <Code>{s.label}</Code>
            {s.state === "off" ? <Tag label="꺼짐" /> : s.state === "none" ? <Tag label="자료 없음" /> : <Muted>{`파일 ${s.files} · 세션 ${s.sessions}${s.unreadable ? ` · 읽지 못함 ${s.unreadable}` : ""}`}</Muted>}
            {s.note ? <Muted>{s.note}</Muted> : null}
          </HStack>
        ))}
        <Muted>
          끄려면 <Code>{u.config ?? CONFIG}</Code> 에 <Code>{'"history": "off"'}</Code> 를 넣습니다. 다른 설정 줄은 그대로 둡니다.
        </Muted>
      </Details>
    </VStack>
  );
}

/** 꺼져 있을 때: 다시 켜는 법을 차분하게 */
function HistoryOffNotice({ info }: { info: Loose | null }) {
  const userOff = info?.current === "off";
  return (
    <Notice kind="info" title={userOff ? "대화 기록 읽기를 꺼 두었습니다" : "대화 기록 읽기가 꺼져 있습니다"}>
      <VStack gap={1}>
        <Text size="sm">토큰 사용량 · 지금 세션 · 프롬프트 기록은 켜면 보입니다. 꺼진 동안에는 이 컴퓨터의 대화 기록 폴더를 열지 않습니다. 킷이 세션에 덧붙이는 양은 늘 보입니다.</Text>
        <Details label="다시 켜는 법">
          <Muted>
            <Code>{info?.config ?? CONFIG}</Code> 에서 <Code>{userOff ? '"history": "off"' : '"history"'}</Code> 를 지우거나 <Code>{'"history": "on"'}</Code> 으로 바꿉니다. 다른 설정 줄은 그대로 둡니다.
          </Muted>
        </Details>
      </VStack>
    </Notice>
  );
}

function NowPanel({ n }: { n: Loose | null }) {
  if (!n || !n.enabled) return null;
  const s = n.session as Loose | undefined | null;
  if (!s) {
    return (
      <Panel title="지금 세션">
        <Muted>이 리포에서 최근 이틀 동안 연 세션의 기록이 없습니다.</Muted>
      </Panel>
    );
  }
  const role = s.role ? (ROLE_KO[s.role] ?? s.role) : null;
  return (
    <Panel title="지금 세션" lift aside={<HStack gap={1} align="center"><HarnessBadge name={s.harness} />{role && s.role !== "unknown" ? <Muted>{role}</Muted> : null}</HStack>}>
      <HStack gap={2} align="end" wrap="wrap">
        <Text size="3xl" weight="bold" hasTabularNumbers>{s.ratio === null ? "—" : pct(s.ratio)}</Text>
        <Muted>{s.window ? `컨텍스트 ${fmtTokens(s.used)} / ${fmtTokens(s.window)}` : `컨텍스트 ${fmtTokens(s.used)} · 창 크기는 기록에 없습니다`}</Muted>
      </HStack>
      {s.ratio !== null ? <ProgressBar label={`컨텍스트 ${pct(s.ratio)}, 알림 기준 ${pct(s.warnAt)}${s.warn ? " — 넘었습니다" : ""}`} isLabelHidden value={Math.min(100, Math.round(s.ratio * 100))} variant={s.warn ? "warning" : "accent"} marks={[{ value: Math.round(s.warnAt * 100), label: "알림 기준" }]} /> : null}
      {s.warn ? <Notice kind="warn" title="자동 압축이 가깝습니다.">새 세션을 열거나 대화를 정리할 때입니다. 알림 기준은 설정(usage.warnAt)에서 바꿉니다.</Notice> : null}
      {/* 이름 칸 폭을 고정해 "마지막 요청"이 두 줄로 꺾이지 않게 한다 */}
      <MetadataList label={{ position: "start", width: "5.5rem" }}>
        <MetadataListItem label="마지막 요청"><Text size="sm" hasTabularNumbers>{`${clock(s.at)} · 입력 ${fmtTokens(s.last.input)} · 캐시 읽기 ${fmtTokens(s.last.cacheRead)} · 캐시 쓰기 ${fmtTokens(s.last.cacheWrite)}`}</Text></MetadataListItem>
        <MetadataListItem label="모델"><Code>{s.model ?? "모름"}</Code></MetadataListItem>
        <MetadataListItem label="이슈"><Text size="sm">{s.issue ?? "이슈 없음"}</Text></MetadataListItem>
        <MetadataListItem label="요청"><Text size="sm">{`${s.requests}회 · ${ago(s.since)} 시작`}</Text></MetadataListItem>
      </MetadataList>
    </Panel>
  );
}

const bytesOrNone = (n: number) => (n ? <Text hasTabularNumbers>{fmtBytes(n)}</Text> : <Muted>없음</Muted>);

function KitPanels({ k }: { k: Loose }) {
  const s = k.sessionStart as Loose;
  const hooks = [...((k.hooks ?? []) as Loose[])].sort((a, b) => b.avgBytes - a.avgBytes || b.count - a.count);
  const load = (k.load ?? null) as Loose | null;
  const modules = (k.modules ?? []) as Loose[];
  return (
    <>
      <Panel title="킷이 세션에 덧붙이는 양" aside={<Tag tone={s.within ? "ops" : "gate"} icon={s.within ? "ok" : "alert"} label={s.within ? "상한 안" : "상한 넘음"} />}>
        <VStack gap={2}>
          <HStack justify="between" align="center" gap={3} wrap="wrap">
            <Text weight="semibold">세션을 열 때 평균</Text>
            <Text weight="semibold" hasTabularNumbers>{`약 ${Number(s.estTokens).toLocaleString()} 토큰 · ${Number(s.avgBytes).toLocaleString()} / ${Number(s.limit).toLocaleString()}바이트`}</Text>
          </HStack>
          <ProgressBar label={`세션 시작 ${s.avgBytes}바이트, 상한 ${s.limit}`} isLabelHidden value={Math.min(100, Math.round(s.ratio * 100))} variant={s.within ? "accent" : "warning"} />
          <Muted>{`토큰은 바이트 ÷ 3 으로 어림합니다(한글 위주 글). 가장 컸던 세션 시작은 ${Number(s.maxBytes).toLocaleString()}바이트입니다.`}</Muted>
        </VStack>
        {load ? <Text size="sm">{`그 밖에 ${HARNESS_KO[load.harness] ?? load.harness} 가 세션마다 읽는 규칙 · 스킬 · 에이전트 설명은 약 ${fmtTokens(load.estTokens)} 토큰입니다.`}</Text> : null}
        <Muted>관리 페이지에서 보고 저장 · 승인 · 답하는 일은 세션에 아무것도 덧붙이지 않습니다.</Muted>
        {load || modules.length ? (
          <Details label="누가 얼마나 덧붙이나">
            {load
              ? Object.entries((load.owners ?? {}) as Record<string, Loose>).map(([o, v]) => (
                  <Muted key={o}>{`${ownerName(o)}: 파일 ${v.files}개 · ${fmtBytes(v.bytes)}(규칙 ${v.rules ?? 0} · 스킬 ${v.skills ?? 0} · 에이전트 ${v.agents ?? 0})`}</Muted>
                ))
              : null}
            {modules.map((m) => (
              <Muted key={m.owner}>{`${ownerName(m.owner)}가 깐 세션 파일 ${m.files}개 · ${fmtBytes(m.bytes)}${Object.keys(m.hooks ?? {}).length ? ` · 훅 ${(Object.values(m.hooks) as number[]).reduce((a, b) => a + b, 0)}개` : ""}`}</Muted>
            ))}
          </Details>
        ) : null}
      </Panel>
      <Panel title="훅이 덧붙인 글" aside={<Muted>{`훅 ${hooks.length}개`}</Muted>} flush={hooks.length > 0}>
        {hooks.length ? (
          <Table
            data={hooks}
            idKey={(x: Loose) => `${x.event}:${x.hook}`}
            density="compact"
            columns={[
              { key: "hook", header: "훅", width: proportional(3, { minWidth: 220 }), renderCell: (x: Loose) => <VStack gap={0}><Code>{x.hook}</Code><Muted>{EVENT_KO[x.event] ?? x.event}</Muted></VStack> },
              { key: "count", header: "실행", width: proportional(1), align: "end", renderCell: (x: Loose) => <Text hasTabularNumbers>{`${x.count}회`}</Text> },
              { key: "avgBytes", header: "평균", width: proportional(1), align: "end", renderCell: (x: Loose) => bytesOrNone(x.avgBytes) },
              { key: "maxBytes", header: "가장 많을 때", width: proportional(1), align: "end", renderCell: (x: Loose) => bytesOrNone(x.maxBytes) },
            ]}
          />
        ) : (
          <Muted>아직 훅이 돈 기록이 없습니다. 세션에서 훅이 한 번 돌면 보입니다.</Muted>
        )}
      </Panel>
    </>
  );
}

function UsageTab({ nowData, kitData }: { nowData: Loose | null; kitData: Loose | null }) {
  const [days, setDays] = useState("7");
  const [harness, setHarness] = useState("");
  const { state, reload } = useLoad<[Loose]>(() => [get("/usage", { query: { days, harness } })], [days, harness], { live: USAGE_LIVE_MS });
  const kit = kitData ? <KitPanels k={kitData} /> : null;
  const filters = (
    <HStack gap={3} wrap="wrap" align="center">
      <Muted>기간</Muted>
      <Seg label="기간" items={[{ id: "1", label: "오늘" }, { id: "7", label: "7일" }, { id: "30", label: "30일" }]} value={days} onChange={setDays} />
      <Selector label="하네스" isLabelHidden size="sm" value={harness || "all"} onChange={(v) => setHarness(!v || v === "all" ? "" : v)} options={[{ value: "all", label: "하네스 모두" }, ...["claude", "codex", "kiro"].map((x) => ({ value: x, label: HARNESS_KO[x] as string }))]} />
    </HStack>
  );
  const u: Loose | null = state.status === "ready" ? state.data[0] : null;
  const daily = (u?.daily ?? []) as Array<{ date: string; sum: number; byRole: Record<string, number> }>;
  const roles = (u?.roles ?? []) as string[];
  const byIssue = (u?.byIssue ?? []) as Loose[];
  const activity = useMemo(() => activityDays(daily), [daily]);
  if (state.status === "error") return <VStack gap={4}>{filters}<ErrorBlock error={state.error} retry={reload} /></VStack>;
  if (state.status === "loading" || !u) return <VStack gap={4}>{filters}<Loading rows={5} /></VStack>;
  if (!u.enabled) {
    return (
      <VStack gap={5}>
        <HistoryOffNotice info={u} />
        {kit}
      </VStack>
    );
  }
  // 대화 기록이 꺼져 있거나 기록이 없으면 totals 가 null 이다(빈 합계로 본다)
  const t = (u.totals ?? { sum: 0, requests: 0 }) as Loose;
  const peak = daily.reduce((a, d) => (d.sum > a.sum ? d : a), daily[0] ?? { sum: 0, date: "", byRole: {} });
  const { summary, cacheVals, cacheSummary } = usageSummary(u);
  const period = days === "1" ? "오늘" : `${days}일`;
  const hasCache = cacheVals.some((v) => v !== null);

  return (
    <VStack gap={5}>
      <HStack gap={3} wrap="wrap" align="center" justify="between">
        {filters}
        <Muted>{`${String(u.range.from).slice(0, 10)} ~ ${String(u.range.to).slice(0, 10)} · 이 리포와 그 작업 폴더만`}</Muted>
      </HStack>
      <HistoryOnNote u={u} />
      {t.requests ? (
        <StatRow>
          <Stat label="토큰 합계" value={fmtTokens(t.sum)} hint={period} />
          <Stat label="요청" value={t.requests ?? 0} unit="회" hint={period} />
          <Stat label="캐시 읽기 평균" value={pct(u.cache?.average)} hint="높을수록 같은 앞부분을 다시 씁니다" />
          {u.cost ? <Stat label="추정 비용" value={u.cost.estimate} hint="청구 금액이 아닙니다" /> : null}
        </StatRow>
      ) : null}
      <TwoCol
        main={
          <>
            <Panel title="하루 토큰 · 역할별" aside={t.requests ? <Muted>{summary}</Muted> : undefined}>
              {t.requests ? (
                <VStack gap={3}>
                  <HStack gap={3} wrap="wrap" role="group" aria-label="역할 범례">
                    {roles.map((r) => (
                      <HStack key={r} gap={1} align="center">
                        <svg width="10" height="10" aria-hidden="true"><rect width="10" height="10" rx="2" fill={ROLE_COLOR[r] ?? "var(--color-data-neutral)"} /></svg>
                        <Muted>{ROLE_NAME[r] ?? r}</Muted>
                      </HStack>
                    ))}
                  </HStack>
                  <StackedBars daily={daily} roles={roles} summary={summary} />
                  <Collapsible defaultIsOpen={false} chevronPosition="start" trigger={<Text size="sm" color="secondary">표로 보기</Text>}>
                    <Table data={daily} idKey="date" density="compact" columns={[{ key: "date", header: "날짜", width: proportional(2), renderCell: (d: Loose) => <Text>{dayLabel(d.date).text}</Text> }, ...roles.map((r) => ({ key: r, header: ROLE_NAME[r] ?? r, width: proportional(1), align: "end" as const, renderCell: (d: Loose) => <Text hasTabularNumbers>{fmtTokens(d.byRole[r] ?? 0)}</Text> })), { key: "sum", header: "합", width: proportional(1), align: "end" as const, renderCell: (d: Loose) => <Text hasTabularNumbers>{fmtTokens(d.sum)}</Text> }]} />
                  </Collapsible>
                </VStack>
              ) : (
                <VStack gap={1}>
                  <Text weight="semibold">{`${period} 동안 이 리포의 세션 기록이 없습니다`}</Text>
                  <Muted>{days === "30" ? "이 리포에서 세션을 열면 다음 갱신 때 보입니다." : "기간을 30일로 늘려 봅니다."}</Muted>
                </VStack>
              )}
            </Panel>
            {u.cost ? <Muted>{u.cost.note}</Muted> : null}
            {byIssue.length || hasCache ? (
              <Grid columns={{ minWidth: 320, max: 2, repeat: "fit" }} gap={5}>
                <Panel title="이슈별 토큰" aside={<Muted>{period}</Muted>}>
                  {byIssue.length ? <HBars label="이슈별 토큰" fmt={fmtTokens} rows={byIssue.slice(0, 10).map((x) => ({ id: x.issue as string, label: <Key>{x.issue}</Key>, v: x.sum as number }))} /> : <Muted>이슈에 묶인 기록이 없습니다</Muted>}
                  <Muted>세션이 등록한 이슈나 브랜치 이름으로 이슈를 찾습니다.</Muted>
                </Panel>
                <Panel title="캐시 읽기 비율" aside={<Muted>{`평균 ${pct(u.cache?.average)}`}</Muted>}>
                  {hasCache ? <LineChart labels={(u.cache.daily as Loose[]).map((d) => dayLabel(d.date).short)} series={[{ name: "캐시 읽기", kind: "main", values: cacheVals }]} yMin={0} yMax={100} height={150} fmt={(v) => `${v}%`} summary={cacheSummary} /> : <Muted>기록이 없습니다</Muted>}
                  <Muted>캐시 읽기 ÷ (입력 + 캐시 읽기 + 캐시 쓰기). 높을수록 같은 앞부분을 다시 씁니다.</Muted>
                </Panel>
              </Grid>
            ) : null}
            {kit}
          </>
        }
        side={
          <>
            <NowPanel n={nowData} />
            {activity.some((d) => d.v > 0) ? (
              <Panel title="하루 활동" aside={<Muted>많이 쓴 날일수록 진합니다</Muted>}>
                <DotMatrix days={activity} summary={`하루 활동 ${activity.length}일. 가장 많은 날 ${peak.date ? dayLabel(peak.date).text : "-"}`} />
              </Panel>
            ) : null}
          </>
        }
      />
    </VStack>
  );
}

function HistoryTab({ info }: { info: Loose | null }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [applied, setApplied] = useState({ q: "", role: "" });
  // 찾는 말을 적는 칸이 있어 자동 갱신은 켜지 않는다(찾기를 누를 때 다시 읽는다)
  const { state, reload } = useLoad<[Loose]>(() => [get("/history", { query: applied })], [applied.q, applied.role], { tolerate: ["history_off"] });
  const filters = (
    <HStack gap={2} wrap="wrap" align="end">
      <TextInput label="프롬프트 글 찾기" isLabelHidden value={q} onChange={setQ} onEnter={() => setApplied({ q: q.trim(), role })} placeholder="프롬프트 글 찾기" size="sm" startIcon="search" />
      <Selector label="역할 거르기" isLabelHidden size="sm" value={role || "all"} onChange={(v) => { const r = !v || v === "all" ? "" : v; setRole(r); setApplied({ q: q.trim(), role: r }); }} options={[{ value: "all", label: "역할 모두" }, ...["design", "implement", "review", "docs"].map((r) => ({ value: r, label: ROLE_KO[r] ?? r }))]} />
      <Button label="찾기" size="sm" icon={<Ico name="search" />} onClick={() => setApplied({ q: q.trim(), role })} />
    </HStack>
  );
  if (state.status === "loading") return <VStack gap={4}>{filters}<Loading rows={3} /></VStack>;
  if (state.status === "error") return <VStack gap={4}>{filters}<ErrorBlock error={state.error} retry={reload} /></VStack>;
  const d = state.data[0] as Loose | null;
  if (!d) return <HistoryOffNotice info={info} />;
  const prompts = (d.prompts ?? []) as Loose[];
  return (
    <VStack gap={4}>
      {filters}
      <Muted>{`${d.total}건 중 ${d.shown}건 · ${d.note}${d.unreadable ? ` · 읽지 못한 줄 ${d.unreadable}` : ""}`}</Muted>
      <Panel title="프롬프트" flush={prompts.length > 0}>
        {prompts.length ? (
          <List hasDividers>
            {prompts.map((p, i) => (
              <ListItem key={`${p.at}${i}`} label={<Text>{p.text}</Text>} description={`${clock(p.at)}${p.issue ? ` · ${p.issue}` : ""}${p.role ? ` · ${ROLE_KO[p.role] ?? p.role}` : ""}`} startContent={<HarnessBadge name={p.harness} />} />
            ))}
          </List>
        ) : (
          <VStack gap={1}>
            <Text weight="semibold">프롬프트 기록이 없습니다</Text>
            <Muted>{applied.q || applied.role ? "찾는 말이나 역할을 바꿉니다." : "이 리포에서 보낸 프롬프트가 아직 없습니다."}</Muted>
          </VStack>
        )}
      </Panel>
    </VStack>
  );
}

export default function Usage({ route }: { route: Route }) {
  const [tab, setTab] = useState(route.query.tab === "history" ? "history" : "usage");
  const { state, reload, at, every, stale } = useLoad<[Loose, Loose]>(() => [get("/usage/kit"), get("/usage/now")], [], { tolerate: ["not_found"], live: USAGE_LIVE_MS });
  const sub = "이 리포의 세션이 토큰을 얼마나 쓰는지, 킷이 세션에 얼마나 덧붙이는지 봅니다. 관리 페이지는 모델을 부르지 않습니다.";
  const crumbs = [{ label: "운영" }, { label: "기록 · 사용량" }];
  const live = { at, every, stale };
  if (state.status === "loading") return <Page title="기록 · 사용량" sub={sub} crumbs={crumbs} live={live}><Loading rows={6} /></Page>;
  if (state.status === "error") return <Page title="기록 · 사용량" sub={sub} crumbs={crumbs} live={live}><ErrorBlock error={state.error} retry={reload} /></Page>;
  const [kit, now] = state.data;
  return (
    <Page title="기록 · 사용량" sub={sub} crumbs={crumbs} live={live}>
      <VStack gap={4}>
        <TabList value={tab} onChange={(v) => { setTab(v); history.replaceState(null, "", `${location.pathname}${v === "history" ? "?tab=history" : ""}`); }} hasDivider aria-label="기록 · 사용량">
          <Tab value="usage" label="사용량" />
          <Tab value="history" label="프롬프트 기록" />
        </TabList>
        {tab === "history" ? <HistoryTab info={now} /> : <UsageTab nowData={now} kitData={kit} />}
      </VStack>
    </Page>
  );
}
