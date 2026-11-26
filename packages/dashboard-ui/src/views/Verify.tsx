// S06 검증: 마지막 검증과 단계별 시간, 품질 게이트, 정적 분석, 리뷰 지적. 읽기만 한다(리뷰 판단은 이슈 화면의 리뷰 탭).
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Grid } from "@astryxdesign/core/Grid";
import { List, ListItem } from "@astryxdesign/core/List";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useState } from "react";
import { get } from "../lib/api";
import { clock, fmtMs, pct, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import type { Loose } from "../lib/types";
import { HBars } from "../ui/charts";
import { CommandBox, Details, EmptyNote, ErrorBlock, IconNote, Key, Loading, Muted, Notice, Panel, Tag, type Tone } from "../ui/common";
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

/** 패널 안의 빈 상태: 왼쪽 정렬 한 묶음(제목 · 다음에 할 일 · 접힌 명령) */
function GatePanel({ g }: { g: Loose | null }) {
  if (!g) {
    return (
      <Panel title="품질 게이트">
        <EmptyNote title="품질 게이트 결과가 아직 없습니다" text="게이트가 한 번 돌면 검사마다 통과했는지와 기준 값이 여기 보입니다.">
          <Details label="터미널에서 돌리기">
            <CommandBox cmd="knots-sync quality" />
            <Muted>결과 파일: .agents/reports/quality-gate-last.json</Muted>
          </Details>
        </EmptyNote>
      </Panel>
    );
  }
  const [tone, , text] = STATUS[g.status] ?? (["line", "help", g.status ?? "-"] as [Tone, IconName, string]);
  return (
    <Panel
      title={g.status === "passed" ? "품질 게이트 통과" : g.status === "failed" ? "품질 게이트를 통과하지 못했습니다" : `품질 게이트 ${text}`}
      lift
      aside={
        <>
          <Tag tone={tone} label={text} />
          <Muted>{`검증 단계 ${g.level ?? "-"}${g.head ? ` · 커밋 ${String(g.head).slice(0, 7)}` : ""}`}</Muted>
        </>
      }
    >
      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        {((g.checks ?? []) as Loose[]).map((c) => (
          <VStack key={c.id} gap={1}>
            <StatusTag s={c.status} />
            <Text type="code" size="sm">
              {c.id}
            </Text>
            <Text weight="semibold" hasTabularNumbers>
              {c.value === undefined ? (c.reason ?? "-") : String(c.value)}
              {c.limit !== undefined && c.limit !== null ? <Muted>{` 기준 ${c.limit}`}</Muted> : null}
            </Text>
          </VStack>
        ))}
      </Grid>
      {(g.incomplete ?? []).length ? <Notice kind="warn" title="끝내지 못한 분석기가 있습니다.">{(g.incomplete as Loose[]).map((x) => `${x.analyzer}(${x.reason})`).join(" · ")}</Notice> : null}
    </Panel>
  );
}

function VerifyPanel({ c }: { c: Loose | undefined }) {
  if (!c) {
    return (
      <Panel title="마지막 검증">
        <EmptyNote title="고를 수 있는 작업 폴더가 없습니다" />
      </Panel>
    );
  }
  const r = c.record;
  if (!r) {
    return (
      <Panel title="마지막 검증">
        <EmptyNote title="이 브랜치에는 검증 기록이 없습니다" text="검증을 한 번 돌리면 단계마다 걸린 시간과 결과가 여기 보입니다.">
          <Details label="터미널에서 돌리기">
            <CommandBox cmd="bash scripts/verify.sh --summary" />
            <Muted>결과 파일: 이 브랜치의 .agents/state/verify-last.json</Muted>
          </Details>
        </EmptyNote>
      </Panel>
    );
  }
  const steps = (r.steps ?? []) as Loose[];
  return (
    <Panel title="마지막 검증 · 단계별 시간" aside={<StatusTag s={r.status} />}>
      <HStack gap={2} align="center" wrap="wrap">
        <Muted>{`${clock(r.finishedAt)} · ${c.issue ?? "이슈 없음"} · 검증 단계 ${r.level ?? "-"} · 전체 ${fmtMs(r.durationMs)}`}</Muted>
        {c.slowest ? <Muted>{`· 가장 느린 단계 ${c.slowest.label} ${fmtMs(c.slowest.durationMs)}`}</Muted> : null}
      </HStack>
      {steps.length ? (
        <HBars label="검증 단계별 시간" fmt={(v) => fmtMs(v)} rows={steps.map((s, i) => ({ id: `${s.label}${i}`, label: <HStack gap={2} align="center"><Text size="sm">{s.label}</Text><StatusTag s={s.status} /></HStack>, v: s.durationMs ?? 0 }))} />
      ) : (
        <Muted>단계 기록이 없습니다</Muted>
      )}
      <IconNote icon="lock">전체 검증은 CI 에서만 돕니다. 에이전트가 전체 검증을 돌리려 하면 훅이 막습니다.</IconNote>
    </Panel>
  );
}

function ReviewPanel({ rows }: { rows: Loose[] }) {
  return (
    <Panel title="리뷰 지적" aside={rows.length ? <Muted>{`이슈 ${rows.length}개`}</Muted> : undefined} flush={rows.length > 0}>
      {rows.length ? (
        <List hasDividers>
          {rows.map((i) => (
            <ListItem
              key={i.key}
              label={<Key>{i.key}</Key>}
              description={i.title ?? "리뷰 탭에서 지적마다 받아들일지 판단합니다"}
              href={`/issues/${i.key}/review`}
              endContent={
                <HStack gap={1} wrap="wrap">
                  {SEVS.filter((s) => i.review.open[s]).map((s) => (
                    <Tag key={s} tone={SEV_TONE[s] as Tone} label={`${s} ${i.review.open[s]}`} />
                  ))}
                </HStack>
              }
            />
          ))}
        </List>
      ) : (
        <EmptyNote title="열린 리뷰 지적이 없습니다" text="리뷰 보고서가 생기면 이슈마다 남은 지적이 여기 모입니다." />
      )}
    </Panel>
  );
}

function FindingsPanel({ f, found }: { f: Loose | null; found: Loose }) {
  const [onlyNew, setOnlyNew] = useState(false);
  if (!f) {
    return (
      <Panel title="정적 분석">
        <EmptyNote title="정적 분석 결과가 없습니다" text="분석기가 돌면 심각도마다 새로 생긴 것과 전체 수가 보입니다.">
          <Details label="터미널에서 돌리기">
            <CommandBox cmd="knots-sync quality --findings" />
            <Muted>결과 파일: .agents/reports/findings-latest.json</Muted>
          </Details>
        </EmptyNote>
      </Panel>
    );
  }
  const findings = ((found?.findings ?? []) as Loose[]).filter((x) => !onlyNew || x.new).slice(0, 12);
  return (
    <Panel title="정적 분석" aside={<Muted>{`분석기 ${Object.keys(f.analyzers ?? {}).length}개 · ${clock(f.at)}`}</Muted>}>
      <Table
        data={SEVS.map((s) => ({ s, n: f.new?.[s] ?? 0, all: f.bySeverity?.[s] ?? 0 }))}
        idKey="s"
        density="compact"
        columns={[
          { key: "s", header: "심각도", width: proportional(2), renderCell: (r: Loose) => <Tag tone={SEV_TONE[r.s] as Tone} label={r.s} /> },
          { key: "n", header: "새로 생김", width: proportional(1), align: "end" },
          { key: "all", header: "전체", width: proportional(1), align: "end" },
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
      {f.truncated ? <Muted>발견이 많아 앞부분만 저장했습니다.</Muted> : null}
    </Panel>
  );
}

export default function Verify({ route: _route }: { route: Route }) {
  const { state, reload, at, every, stale } = useLoad<[Loose, Loose, Loose, Loose]>(() => [get("/verify"), get("/reports/summary"), get("/reports/findings"), get("/issues")], [], { live: true });
  const [sel, setSel] = useState("0");
  const sub = "검증과 품질 게이트를 통과했는지, 손볼 리뷰 지적과 분석 결과가 남았는지 봅니다.";
  const crumbs = [{ label: "품질" }, { label: "검증" }];
  const live = { at, every, stale };
  if (state.status === "loading") return <Page title="검증" sub={sub} crumbs={crumbs} live={live}><Loading rows={6} /></Page>;
  if (state.status === "error") return <Page title="검증" sub={sub} crumbs={crumbs} live={live}><ErrorBlock error={state.error} retry={reload} /></Page>;
  const [verify, summary, found, issuesR] = state.data;
  const checkouts = (verify.checkouts ?? []) as Loose[];
  const reviewRows = ((issuesR?.issues ?? []) as Loose[]).filter((i) => i.review && (i.review.open.CRITICAL || i.review.open.HIGH || i.review.open.MEDIUM || i.review.open.LOW));
  const metrics = summary.metrics ? Object.entries(summary.metrics as Record<string, unknown>).filter(([, v]) => typeof v === "number").slice(0, 6) : [];
  const tools =
    checkouts.length > 1 ? (
      <Selector label="브랜치 고르기" size="sm" value={sel} onChange={(v) => v && setSel(v)} options={checkouts.map((c, i) => ({ value: String(i), label: `${c.checkout.branch ?? c.checkout.path}${c.checkout.kind === "main" ? " (메인 폴더)" : ""}` }))} />
    ) : undefined;

  return (
    <Page title="검증" sub={sub} crumbs={crumbs} tools={tools} live={live}>
      <GatePanel g={summary.gate} />
      <TwoCol
        main={
          <>
            <VerifyPanel c={checkouts[Number(sel)]} />
            <ReviewPanel rows={reviewRows} />
          </>
        }
        side={
          <>
            <FindingsPanel f={(summary.findings ?? null) as Loose | null} found={found} />
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
    </Page>
  );
}
