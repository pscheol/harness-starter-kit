// S13 기록 · 사용량. 이 컴퓨터의 대화 기록을 읽기만 한다. 대화 기록은 기본 꺼짐이고 모델을 부르지 않는다(DB-R26 · R28).
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Grid } from "@astryxdesign/core/Grid";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table } from "@astryxdesign/core/Table";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMemo, useState } from "react";
import { get } from "../lib/api";
import { activityDays, ago, clock, dayLabel, fmtBytes, fmtTokens, HARNESS_KO, pct, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import type { Loose } from "../lib/types";
import { DotMatrix, HBars, LineChart, ROLE_COLOR, ROLE_NAME, StackedBars } from "../ui/charts";
import { Code, CommandBox, Empty, ErrorBlock, HarnessBadge, Ico, Key, Loading, Muted, Notice, Panel, Seg, Tag } from "../ui/common";
import { Page, Stat, TwoCol } from "../ui/Page";

function SourcesNotice({ u }: { u: Loose }) {
  return (
    <Notice kind={u.enabled ? "info" : "warn"} title={u.enabled ? "읽기만 합니다. 이 컴퓨터에서만 보입니다. " : "대화 기록 읽기는 꺼져 있습니다(기본). "}>
      <VStack gap={1}>
        {(u.sources as Loose[]).map((s) => (
          <HStack key={s.label} gap={2} wrap="wrap" align="center">
            <Code>{s.label}</Code>
            {s.state === "off" ? <Tag label="꺼짐" /> : s.state === "none" ? <Tag label="자료 없음" /> : <Muted size="xsm">{`파일 ${s.files} · 세션 ${s.sessions}${s.unreadable ? ` · 읽지 못함 ${s.unreadable}` : ""}`}</Muted>}
            {s.note ? <Muted size="xsm">{s.note}</Muted> : null}
          </HStack>
        ))}
        <Text size="sm">
          복사본을 남기지 않고 내보내기(--export) · 커밋 · 세션 요청에 넣지 않습니다. 켜는 곳: <Code>~/.config/harness-kit/config.json</Code> 의 <Code>&quot;history&quot;: &quot;on&quot;</Code>
          {u.enabled ? " — 지금 켜짐" : " — 지금 꺼짐"}
        </Text>
      </VStack>
    </Notice>
  );
}

function NowPanel({ n }: { n: Loose | null }) {
  const s = n?.session as Loose | undefined;
  if (!n || !n.enabled) return <Panel title="지금 세션"><Empty title="대화 기록 읽기가 꺼져 있습니다" text="켜면 이 리포의 가장 최근 세션 컨텍스트 사용률을 봅니다." /></Panel>;
  if (!s) return <Panel title="지금 세션"><Empty title="최근 세션 기록이 없습니다" text="이 리포에서 연 세션의 대화 기록이 아직 없습니다." /></Panel>;
  return (
    <Panel title="지금 세션" lift aside={<HStack gap={1} align="center"><HarnessBadge name={s.harness} />{s.role ? <Muted>{s.role}</Muted> : null}</HStack>}>
      <HStack gap={2} align="end" wrap="wrap">
        <Text size="3xl" weight="bold" hasTabularNumbers>{s.ratio === null ? "—" : pct(s.ratio)}</Text>
        <Muted>{s.window ? `컨텍스트 ${fmtTokens(s.used)} / ${fmtTokens(s.window)}` : `컨텍스트 ${fmtTokens(s.used)} · 창 크기: 기록에 없습니다`}</Muted>
      </HStack>
      {s.ratio !== null ? <ProgressBar label={`컨텍스트 ${pct(s.ratio)}, 알림 기준 ${pct(s.warnAt)}${s.warn ? " — 넘었습니다" : ""}`} isLabelHidden value={Math.min(100, Math.round(s.ratio * 100))} variant={s.warn ? "warning" : "accent"} marks={[{ value: Math.round(s.warnAt * 100), label: "알림 기준" }]} /> : null}
      {s.warn ? <Notice kind="warn" title="자동 압축이 가깝습니다. ">알림 기준은 설정(usage.warnAt)입니다.</Notice> : null}
      <VStack gap={1}>
        <HStack justify="between" gap={3}><Muted>마지막 요청</Muted><Text size="sm">{`${clock(s.at)} · 입력 ${fmtTokens(s.last.input)} + 캐시 읽기 ${fmtTokens(s.last.cacheRead)} + 캐시 쓰기 ${fmtTokens(s.last.cacheWrite)}`}</Text></HStack>
        <HStack justify="between" gap={3}><Muted>모델</Muted><Code>{s.model ?? "모름"}</Code></HStack>
        <HStack justify="between" gap={3}><Muted>이슈</Muted><Text size="sm">{s.issue ?? "이슈 없음"}</Text></HStack>
        <HStack justify="between" gap={3}><Muted>요청</Muted><Text size="sm">{`${s.requests}회 · ${ago(s.since)} 시작`}</Text></HStack>
      </VStack>
    </Panel>
  );
}

function KitPanel({ k }: { k: Loose }) {
  const s = k.sessionStart as Loose;
  return (
    <Panel title="킷이 덧붙인 토큰" aside={<Muted size="xsm">세션 시작 · 훅 출력</Muted>}>
      <VStack gap={2}>
        <HStack justify="between" align="center" gap={3} wrap="wrap">
          <Text weight="semibold">세션 시작 평균</Text>
          <HStack gap={2} align="center">
            <Text weight="semibold" hasTabularNumbers>{`${Number(s.avgBytes).toLocaleString()} / ${Number(s.limit).toLocaleString()}바이트`}</Text>
            <Tag tone={s.within ? "ops" : "gate"} icon={s.within ? "ok" : "alert"} label={s.within ? "상한 안" : "상한 넘음"} />
          </HStack>
        </HStack>
        <ProgressBar label={`세션 시작 ${s.avgBytes}바이트, 상한 ${s.limit}`} isLabelHidden value={Math.min(100, Math.round(s.ratio * 100))} variant={s.within ? "accent" : "warning"} />
        <Muted size="xsm">{`약 ${s.estTokens} 토큰(바이트 ÷ 3, 한글 위주 추정). 가장 컸던 실행 합 ${s.maxBytes}바이트`}</Muted>
      </VStack>
      {(k.hooks as Loose[]).length ? (
        <Table
          data={k.hooks as Loose[]}
          idKey="hook"
          density="compact"
          columns={[
            { key: "hook", header: "훅", renderCell: (x: Loose) => <VStack gap={0}><Code>{x.hook}</Code><Muted size="xsm">{x.event}</Muted></VStack> },
            { key: "count", header: "횟수", align: "end" },
            { key: "avgBytes", header: "평균", align: "end" },
            { key: "maxBytes", header: "최대", align: "end" },
          ]}
        />
      ) : (
        <Muted>아직 훅 실행 기록이 없습니다(.agents/state/hook-output.jsonl).</Muted>
      )}
      {(k.modules as Loose[]).length ? <Muted>{`소유자별 세션마다 실리는 파일: ${(k.modules as Loose[]).map((m) => `${m.owner} ${m.files}개 ${fmtBytes(m.bytes)}${Object.keys(m.hooks).length ? ` · 훅 ${(Object.values(m.hooks) as number[]).reduce((a, b) => a + b, 0)}` : ""}`).join(" · ")}`}</Muted> : null}
      <Muted size="xsm">관리 페이지 · 저장 · 승인 · 답은 세션에 아무것도 덧붙이지 않습니다(모델 호출 0).</Muted>
    </Panel>
  );
}

function UsageTab({ nowData, kitData }: { nowData: Loose | null; kitData: Loose | null }) {
  const [days, setDays] = useState("7");
  const [harness, setHarness] = useState("");
  const { state, reload } = useLoad<[Loose]>(() => [get("/usage", { query: { days, harness } })], [days, harness]);
  const kit = kitData ? <KitPanel k={kitData} /> : null;
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
  if (state.status === "loading") return <VStack gap={4}>{filters}<Loading rows={5} /></VStack>;
  if (state.status === "error" || !u) return <VStack gap={4}>{filters}<ErrorBlock error={state.status === "error" ? state.error : null} retry={reload} /></VStack>;
  const t = u.totals as Loose;
  const peak = daily.reduce((a, d) => (d.sum > a.sum ? d : a), daily[0] ?? { sum: 0, date: "", byRole: {} });
  const summary = `하루 토큰 ${daily.length}일 합 ${fmtTokens(t.sum)}. ${peak.sum ? `가장 많은 날 ${dayLabel(peak.date).text} ${fmtTokens(peak.sum)}.` : "기록이 없습니다."}`;
  const cacheVals = (u.cache.daily as Loose[]).map((d) => (d.ratio === null ? null : Math.round(d.ratio * 1000) / 10));
  const cacheSummary = cacheVals.some((v) => v !== null) ? `캐시 읽기 비율 평균 ${pct(u.cache.average)}. ${(u.cache.daily as Loose[]).map((d) => `${dayLabel(d.date).short} ${d.ratio === null ? "-" : pct(d.ratio)}`).join(", ")}` : "캐시 읽기 기록이 없습니다";

  return (
    <VStack gap={5}>
      <HStack gap={3} wrap="wrap" align="center" justify="between">
        {filters}
        {u.enabled ? <Muted size="xsm">{`${String(u.range.from).slice(0, 10)} ~ ${String(u.range.to).slice(0, 10)} · 이 리포(와 worktree)만`}</Muted> : null}
      </HStack>
      <SourcesNotice u={u} />
      {!u.enabled ? (
        <TwoCol
          main={
            <>
              <Empty title="토큰 사용량은 대화 기록 읽기를 켜면 보입니다" text="꺼진 동안 이 컴퓨터의 ~/.claude · ~/.codex 를 열지 않습니다. 킷이 덧붙인 양은 늘 보입니다." />
              <CommandBox cmd={`echo '{ "history": "on" }' > ~/.config/harness-kit/config.json`} label="켜는 명령 복사(사람이 직접)" />
            </>
          }
          side={<><NowPanel n={nowData} />{kit}</>}
        />
      ) : (
        <>
          <Grid columns={{ minWidth: 220, max: 4, repeat: "fit" }} gap={4}>
            <Stat label="토큰 합계" value={fmtTokens(t.sum)} hint={days === "1" ? "오늘" : `${days}일`} />
            <Stat label="요청" value={t.requests ?? 0} unit="회" />
            <Stat label="캐시 읽기 평균" value={pct(u.cache.average)} />
            <Stat label="추정 비용" value={u.cost ? u.cost.estimate : "-"} hint={u.cost ? "청구 금액이 아닙니다" : "usage.pricing 이 있을 때만"} />
          </Grid>
          <TwoCol
            main={
              <>
                <Panel title="하루 토큰 · 역할별" aside={<Muted size="xsm">{summary}</Muted>}>
                  {t.requests ? (
                    <VStack gap={3}>
                      <HStack gap={3} wrap="wrap" role="group" aria-label="역할 범례">
                        {roles.map((r) => (
                          <HStack key={r} gap={1} align="center">
                            <svg width="10" height="10" aria-hidden="true"><rect width="10" height="10" rx="2" fill={ROLE_COLOR[r] ?? "var(--color-data-neutral)"} /></svg>
                            <Muted size="xsm">{ROLE_NAME[r] ?? r}</Muted>
                          </HStack>
                        ))}
                      </HStack>
                      <StackedBars daily={daily} roles={roles} summary={summary} />
                      <Collapsible defaultIsOpen={false} trigger={<Text size="sm" weight="semibold">표로 보기</Text>}>
                        <Table data={daily} idKey="date" density="compact" columns={[{ key: "date", header: "날짜", renderCell: (d: Loose) => <Text>{dayLabel(d.date).text}</Text> }, ...roles.map((r) => ({ key: r, header: ROLE_NAME[r] ?? r, align: "end" as const, renderCell: (d: Loose) => <Text hasTabularNumbers>{fmtTokens(d.byRole[r] ?? 0)}</Text> })), { key: "sum", header: "합", align: "end" as const, renderCell: (d: Loose) => <Text hasTabularNumbers>{fmtTokens(d.sum)}</Text> }]} />
                      </Collapsible>
                    </VStack>
                  ) : (
                    <Empty title="이 기간 기록이 없습니다" text="이 리포의 세션이 이 기간에 없었습니다." />
                  )}
                </Panel>
                {u.cost ? <Muted size="xsm">{u.cost.note}</Muted> : null}
                <Grid columns={{ minWidth: 320, max: 2, repeat: "fit" }} gap={5}>
                  <Panel title="이슈별 토큰" aside={<Muted size="xsm">{days === "1" ? "오늘" : `${days}일`}</Muted>}>
                    {byIssue.length ? <HBars label="이슈별 토큰" fmt={fmtTokens} rows={byIssue.slice(0, 10).map((x) => ({ id: x.issue as string, label: <Key>{x.issue}</Key>, v: x.sum as number }))} /> : <Muted>기록이 없습니다</Muted>}
                    <Muted size="xsm">이슈는 세션 등록과 기록의 gitBranch 에서 찾습니다.</Muted>
                  </Panel>
                  <Panel title="캐시 읽기 비율" aside={<Muted size="xsm">{`평균 ${pct(u.cache.average)}`}</Muted>}>
                    {cacheVals.some((v) => v !== null) ? <LineChart labels={(u.cache.daily as Loose[]).map((d) => dayLabel(d.date).short)} series={[{ name: "캐시 읽기", kind: "main", values: cacheVals }]} yMin={0} yMax={100} height={150} fmt={(v) => `${v}%`} summary={cacheSummary} /> : <Muted>기록이 없습니다</Muted>}
                    <Muted size="xsm">캐시 읽기 ÷ (입력 + 캐시 읽기 + 캐시 쓰기). 높을수록 같은 앞부분을 다시 씁니다.</Muted>
                  </Panel>
                </Grid>
              </>
            }
            side={
              <>
                <NowPanel n={nowData} />
                {kit}
                {activity.some((d) => d.v > 0) ? (
                  <Panel title="하루 활동" aside={<Muted size="xsm">토큰 합계가 큰 날일수록 진합니다</Muted>}>
                    <DotMatrix days={activity} summary={`하루 활동 ${activity.length}일. 가장 많은 날 ${peak.date ? dayLabel(peak.date).text : "-"}`} />
                  </Panel>
                ) : null}
              </>
            }
          />
        </>
      )}
    </VStack>
  );
}

function HistoryTab() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [applied, setApplied] = useState({ q: "", role: "" });
  const { state, reload } = useLoad<[Loose]>(() => [get("/history", { query: applied })], [applied.q, applied.role], { tolerate: ["history_off"] });
  const filters = (
    <HStack gap={2} wrap="wrap" align="end">
      <TextInput label="프롬프트 글 찾기" isLabelHidden value={q} onChange={setQ} onEnter={() => setApplied({ q: q.trim(), role })} placeholder="프롬프트 글 찾기" size="sm" startIcon="search" />
      <Selector label="역할 거르기" isLabelHidden size="sm" value={role || "all"} onChange={(v) => { const r = !v || v === "all" ? "" : v; setRole(r); setApplied({ q: q.trim(), role: r }); }} options={[{ value: "all", label: "역할 모두" }, ...["design", "implement", "review", "docs"].map((r) => ({ value: r, label: r }))]} />
      <Button label="찾기" size="sm" icon={<Ico name="search" />} onClick={() => setApplied({ q: q.trim(), role })} />
    </HStack>
  );
  if (state.status === "loading") return <VStack gap={4}>{filters}<Loading rows={3} /></VStack>;
  if (state.status === "error") return <VStack gap={4}>{filters}<ErrorBlock error={state.error} retry={reload} /></VStack>;
  const d = state.data[0] as Loose | null;
  if (!d) return <Notice kind="warn" title="대화 기록 읽기가 꺼져 있습니다. ">프롬프트 기록은 이 컴퓨터 설정(<Code>&quot;history&quot;: &quot;on&quot;</Code>)을 켠 사람만 봅니다.</Notice>;
  return (
    <VStack gap={4}>
      {filters}
      <Muted>{`${d.total}건 중 ${d.shown}건 · ${d.note}${d.unreadable ? ` · 읽지 못한 줄 ${d.unreadable}` : ""}`}</Muted>
      {(d.prompts as Loose[]).length ? (
        <Panel title="프롬프트" flush>
          <List hasDividers>
            {(d.prompts as Loose[]).map((p, i) => (
              <ListItem key={`${p.at}${i}`} label={<Text>{p.text}</Text>} description={`${clock(p.at)}${p.issue ? ` · ${p.issue}` : ""}${p.role ? ` · ${p.role}` : ""}`} startContent={<HarnessBadge name={p.harness} />} />
            ))}
          </List>
        </Panel>
      ) : (
        <Empty title="프롬프트 기록이 없습니다" text={q ? "찾는 말을 바꿉니다." : "이 리포에서 보낸 프롬프트가 없습니다."} />
      )}
    </VStack>
  );
}

export default function Usage({ route }: { route: Route }) {
  const [tab, setTab] = useState(route.query.tab === "history" ? "history" : "usage");
  const { state, reload } = useLoad<[Loose, Loose]>(() => [get("/usage/kit"), get("/usage/now")], [], { tolerate: ["not_found"] });
  const sub = "이 컴퓨터의 대화 기록을 읽어 보여 줍니다 · 관리 페이지는 모델을 부르지 않습니다";
  const crumbs = [{ label: "운영" }, { label: "기록 · 사용량" }];
  if (state.status === "loading") return <Page title="기록 · 사용량" sub={sub} crumbs={crumbs}><Loading rows={6} /></Page>;
  if (state.status === "error") return <Page title="기록 · 사용량" sub={sub} crumbs={crumbs}><ErrorBlock error={state.error} retry={reload} /></Page>;
  const [kit, now] = state.data;
  return (
    <Page title="기록 · 사용량" sub={sub} crumbs={crumbs}>
      <VStack gap={4}>
        <TabList value={tab} onChange={(v) => { setTab(v); history.replaceState(null, "", `${location.pathname}${v === "history" ? "?tab=history" : ""}`); }} hasDivider aria-label="기록 · 사용량">
          <Tab value="usage" label="사용량" />
          <Tab value="history" label="프롬프트 기록" />
        </TabList>
        {tab === "history" ? <HistoryTab /> : <UsageTab nowData={now} kitData={kit} />}
      </VStack>
    </Page>
  );
}
