// S06 검증: 마지막 검증과 단계별 시간, 품질 게이트, 정적 분석, 리뷰 지적. 읽기만 한다(리뷰 판단은 이슈 화면의 review 탭).
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Grid } from "@astryxdesign/core/Grid";
import { List, ListItem } from "@astryxdesign/core/List";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useState } from "react";
import { get } from "../lib/api";
import { clock, fmtMs, pct, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import type { Loose } from "../lib/types";
import { HBars } from "../ui/charts";
import { CommandBox, Empty, ErrorBlock, IconNote, Key, Loading, Muted, Notice, Panel, Tag, type Tone } from "../ui/common";
import type { IconName } from "../ui/icons";
import { Page, TwoCol } from "../ui/Page";

const STATUS: Record<string, [Tone, IconName, string]> = {
  passed: ["ops", "ok", "통과"],
  failed: ["gate", "fail", "실패"],
  warned: ["build", "alert", "경고"],
  reported: ["line", "help", "보고만"],
  skipped: ["line", "help", "건너뜀"],
  incomplete: ["gate", "alert", "끝내지 못함"],
};
const SEV_TONE: Record<string, Tone> = { CRITICAL: "gate", HIGH: "gate", MEDIUM: "build", LOW: "line" };
const SEVS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function StatusTag({ s }: { s: string | null | undefined }) {
  const [tone, ic, text] = STATUS[s ?? ""] ?? (["line", "help", s ?? "-"] as [Tone, IconName, string]);
  return <Tag tone={tone} icon={ic} label={text} />;
}

function GatePanel({ g }: { g: Loose | null }) {
  if (!g) {
    return (
      <Panel title="품질 게이트">
        <Notice kind="info" title="품질 게이트 결과가 아직 없습니다. ">게이트가 돌면 .agents/reports/quality-gate-last.json 이 생깁니다.</Notice>
        <CommandBox cmd="npx harness-kit quality" />
      </Panel>
    );
  }
  const [tone, , text] = STATUS[g.status] ?? (["line", "help", g.status ?? "-"] as [Tone, IconName, string]);
  return (
    <Panel
      title={g.status === "passed" ? "품질 게이트 통과" : g.status === "failed" ? "품질 게이트 통과 못 함" : `품질 게이트 ${text}`}
      lift
      aside={
        <>
          <Tag tone={tone} label={text} />
          <Muted size="xsm">{`${g.mode ?? ""} · level ${g.level ?? "-"}${g.head ? ` · head ${String(g.head).slice(0, 7)}` : ""}`}</Muted>
        </>
      }
    >
      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={3}>
        {((g.checks ?? []) as Loose[]).map((c) => (
          <VStack key={c.id} gap={1}>
            <StatusTag s={c.status} />
            <Text type="code" size="sm">
              {c.id}
            </Text>
            <Text weight="semibold" hasTabularNumbers>
              {c.value === undefined ? (c.reason ?? "-") : String(c.value)}
              {c.limit !== undefined && c.limit !== null ? <Muted size="xsm">{` 기준 ${c.limit}`}</Muted> : null}
            </Text>
          </VStack>
        ))}
      </Grid>
      {(g.incomplete ?? []).length ? <Notice kind="warn" title="끝내지 못한 분석기: ">{(g.incomplete as Loose[]).map((x) => `${x.analyzer}(${x.reason})`).join(" · ")}</Notice> : null}
    </Panel>
  );
}

function VerifyPanel({ c }: { c: Loose | undefined }) {
  if (!c) return <Panel title="마지막 검증"><Empty title="체크아웃이 없습니다" /></Panel>;
  const r = c.record;
  if (!r) {
    return (
      <Panel title="마지막 검증">
        <Empty title="검증 기록이 없습니다" text="bash scripts/verify.sh 를 돌리면 이 브랜치의 .agents/state/verify-last.json 이 생깁니다." />
        <CommandBox cmd="bash scripts/verify.sh --summary" />
      </Panel>
    );
  }
  const steps = r.steps as Loose[];
  return (
    <Panel title="마지막 검증 · 단계별 시간" aside={<Tag label={`level ${r.level ?? "-"}`} />}>
      <HStack gap={2} align="center" wrap="wrap">
        <Muted>{`${clock(r.finishedAt)} · ${c.issue ?? "이슈 없음"} · 전체 ${fmtMs(r.durationMs)}`}</Muted>
        <StatusTag s={r.status} />
        {c.slowest ? <Muted size="xsm">{`· 가장 느린 단계 ${c.slowest.label} ${fmtMs(c.slowest.durationMs)}`}</Muted> : null}
      </HStack>
      {steps.length ? (
        <HBars label="검증 단계별 시간" fmt={(v) => fmtMs(v)} rows={steps.map((s, i) => ({ id: `${s.label}${i}`, label: <HStack gap={2} align="center"><Text size="sm">{s.label}</Text><StatusTag s={s.status} /></HStack>, v: s.durationMs ?? 0 }))} />
      ) : (
        <Muted>단계 기록이 없습니다</Muted>
      )}
      <IconNote icon="lock" size="xsm">full 은 CI 에서만 돕니다. 에이전트의 --full 은 훅이 막습니다.</IconNote>
    </Panel>
  );
}

export default function Verify({ route: _route }: { route: Route }) {
  const { state, reload } = useLoad<[Loose, Loose, Loose, Loose]>(() => [get("/verify"), get("/reports/summary"), get("/reports/findings"), get("/issues")], []);
  const [sel, setSel] = useState("0");
  const [onlyNew, setOnlyNew] = useState(false);
  const sub = "마지막 검증 · 품질 게이트 · 정적 분석. 결과는 .agents/reports · .agents/state 에서 읽습니다";
  const crumbs = [{ label: "품질" }, { label: "검증" }];
  if (state.status === "loading") return <Page title="검증" sub={sub} crumbs={crumbs}><Loading rows={6} /></Page>;
  if (state.status === "error") return <Page title="검증" sub={sub} crumbs={crumbs}><ErrorBlock error={state.error} retry={reload} /></Page>;
  const [verify, summary, found, issuesR] = state.data;
  const checkouts = verify.checkouts as Loose[];
  const findings = (found.findings as Loose[]).filter((x) => !onlyNew || x.new).slice(0, 12);
  const f = summary.findings as Loose | null;
  const reviewRows = (issuesR.issues as Loose[]).filter((i) => i.review && (i.review.open.CRITICAL || i.review.open.HIGH || i.review.open.MEDIUM || i.review.open.LOW));
  const metrics = summary.metrics ? Object.entries(summary.metrics as Record<string, unknown>).filter(([, v]) => typeof v === "number").slice(0, 6) : [];

  return (
    <Page title="검증" sub={sub} crumbs={crumbs} tools={checkouts.length > 1 ? <Selector label="브랜치 고르기" size="sm" value={sel} onChange={(v) => v && setSel(v)} options={checkouts.map((c, i) => ({ value: String(i), label: `${c.checkout.branch ?? c.checkout.path}${c.checkout.kind === "main" ? " (메인 폴더)" : ""}` }))} /> : undefined}>
      <GatePanel g={summary.gate} />
      <TwoCol
        main={
          <>
            <VerifyPanel c={checkouts[Number(sel)]} />
            <Panel title="리뷰 지적" aside={<Muted>{`${reviewRows.length}개 이슈`}</Muted>} flush>
              {reviewRows.length ? (
                <List hasDividers>
                  {reviewRows.map((i) => (
                    <ListItem
                      key={i.key}
                      label={<Key>{i.key}</Key>}
                      href={`/issues/${i.key}/review`}
                      endContent={
                        <HStack gap={1} wrap="wrap">
                          {SEVS.filter((s) => i.review.open[s]).map((s) => (
                            <Tag key={s} tone={SEV_TONE[s] as Tone} label={`${s} ${i.review.open[s]}`} />
                          ))}
                          <Button label="리뷰 판단" size="sm" href={`/issues/${i.key}/review`} />
                        </HStack>
                      }
                    />
                  ))}
                </List>
              ) : (
                <Empty title="열린 리뷰 지적이 없습니다" text="리뷰 보고서가 생기면 지적과 판단이 여기 모입니다." />
              )}
            </Panel>
          </>
        }
        side={
          <>
            <Panel title="정적 분석" aside={<Muted size="xsm">{f ? `SARIF ${Object.keys(f.analyzers ?? {}).length}종 · ${clock(f.at)}` : "결과 없음"}</Muted>}>
              {f ? (
                <VStack gap={3}>
                  <Table
                    data={SEVS.map((s) => ({ s, n: f.new[s] ?? 0, all: f.bySeverity[s] ?? 0 }))}
                    idKey="s"
                    density="compact"
                    columns={[
                      { key: "s", header: "심각도", renderCell: (r: Loose) => <Tag tone={SEV_TONE[r.s] as Tone} label={r.s} /> },
                      { key: "n", header: "새로 생김", align: "end" },
                      { key: "all", header: "전체", align: "end" },
                    ]}
                  />
                  <CheckboxInput label="새로 생긴 것만" value={onlyNew} onChange={setOnlyNew} />
                  {findings.length ? (
                    <List hasDividers>
                      {findings.map((x, i) => (
                        <ListItem key={`${x.check}${i}`} label={x.title ?? x.check} description={`${x.path ?? ""}${x.line ? `:${x.line}` : ""}`} startContent={<Tag tone={SEV_TONE[x.severity] ?? "line"} label={x.severity} />} />
                      ))}
                    </List>
                  ) : (
                    <Muted>보여 줄 발견이 없습니다</Muted>
                  )}
                  {f.truncated ? <Muted size="xsm">발견이 많아 앞부분만 저장됐습니다.</Muted> : null}
                </VStack>
              ) : (
                <>
                  <Empty title="정적 분석 결과가 없습니다" text="분석기가 돌면 .agents/reports/findings-latest.json 이 생깁니다." />
                  <CommandBox cmd="npx harness-kit quality --findings" />
                </>
              )}
            </Panel>
            {metrics.length ? (
              <Panel title="지표">
                <VStack gap={1}>
                  {metrics.map(([k, v]) => (
                    <HStack key={k} justify="between" gap={3}>
                      <Muted>{k}</Muted>
                      <Text weight="semibold" hasTabularNumbers>
                        {k.toLowerCase().includes("percent") ? `${v}%` : k.toLowerCase().includes("ratio") ? pct(v as number, 1) : String(v)}
                      </Text>
                    </HStack>
                  ))}
                </VStack>
              </Panel>
            ) : null}
          </>
        }
      />
      <Muted size="xsm">체크포인트(entire 모듈)는 HK-20 에서 제공합니다. 검증 시간 추이는 날마다의 기록을 따로 저장하지 않아 보이지 않습니다.</Muted>
    </Page>
  );
}
