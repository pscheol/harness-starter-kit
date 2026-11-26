// S10 배포 · 운영 기록(설계 14 §3.12): 배포 기록 · 장애 · 운영 기록 · 다음 요구사항 후보 · 전달 지표 · 자동 검증 배포 · 규칙 후보. 읽기만 한다(화면 문구는 합니다체).
// 장애 → bug 이슈와 후보 → 요구사항은 새 요구사항 접수로 보낸다(읽기 전용 서버에서는 접수 단추를 숨긴다). 규칙 승격 · 거절은 명령을 복사해 사람이 터미널에서 한다.
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { get } from "../lib/api";
import type { Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { CommandBox, Details, EmptyNote, ErrorBlock, Key, Loading, Muted, Notice, Panel, Tag, TermHelp, type Tone } from "../ui/common";
import { Page, Section, Stat, StatRow, TwoCol } from "../ui/Page";

const STATE: Record<string, [Tone, string]> = {
  planned: ["line", "계획"],
  approved: ["design", "승인됨"],
  deploying: ["build", "배포 중"],
  succeeded: ["ops", "성공"],
  "rolled-back": ["gate", "롤백됨"],
  failed: ["gate", "실패"],
};
const APPROVAL: Record<string, [Tone, string]> = {
  valid: ["ops", "승인됨"],
  none: ["line", "승인 전"],
  stale: ["build", "다시 승인"],
  partial: ["build", "한 명 더 필요"],
  invalid: ["gate", "승인자가 아님"],
};
const AUTO: Record<string, [Tone, string]> = {
  off: ["line", "꺼짐"],
  none: ["line", "실행 없음"],
  passed: ["ops", "통과"],
  failed: ["gate", "실패"],
  stopped: ["gate", "멈춤"],
};
const CANDIDATE: Record<string, [Tone, string]> = { proposed: ["build", "제안됨"], accepted: ["ops", "받아들임"], rejected: ["line", "거절함"] };
const RISK_KO: Record<string, string> = { high: "높음", medium: "보통", low: "낮음" };
const METRICS: Array<{ id: string; label: string; kind: "hours" | "rate" }> = [
  { id: "leadTimeHours", label: "병합까지 걸린 시간", kind: "hours" },
  { id: "changeFailureRate", label: "배포 실패율", kind: "rate" },
  { id: "mttrHours", label: "복구 시간", kind: "hours" },
  { id: "approvalWaitHours", label: "승인 대기 시간", kind: "hours" },
  { id: "reworkRate", label: "다시 고친 비율", kind: "rate" },
];
const METHOD_KO: Record<string, string> = { kit: "킷 기록", git: "git 만", merge: "병합까지", unavailable: "읽지 못함", none: "자료 없음" };

const metricValue = (m: Loose | null | undefined): number | null => {
  const v = m ? (m.median ?? m.value ?? null) : null;
  return v === null || v === undefined ? null : Number(v);
};
const metricText = (m: Loose | null | undefined, kind: "hours" | "rate"): string => {
  const v = metricValue(m);
  if (v === null) return "—";
  return kind === "rate" ? `${Math.round(v * 100)}%` : `${v}시간`;
};

const tag = (map: Record<string, [Tone, string]>, key: string) => {
  const [tone, label] = map[key] ?? ["line", key];
  return <Tag tone={tone} label={label} />;
};

const dayOf = (iso: unknown): string => (typeof iso === "string" && iso ? iso.slice(0, 10) : "—");
const recordName = (path: string): string => path.split("/").pop()?.replace(/\.md$/, "") ?? path;

/** 패널 안의 빈 상태: 왼쪽 정렬 한 묶음(제목 · 다음에 할 일 · 접힌 명령) */
function DeploysTable({ deploys }: { deploys: Loose[] }) {
  // 열을 5개로 줄인다(본문 칸 폭에서 넘치지 않게): 환경은 묶음 아래, 끝난 날은 상태 아래에 작은 글로
  return (
    <Table
      data={deploys}
      idKey="path"
      density="compact"
      columns={[
        { key: "key", header: "묶음 · 환경", width: proportional(3, { minWidth: 72 }), renderCell: (r: Loose) => <VStack gap={0}><Key>{recordName(r.path)}</Key><Muted>{r.env}</Muted></VStack> },
        { key: "state", header: "상태", width: proportional(2, { minWidth: 72 }), renderCell: (r: Loose) => <VStack gap={0.5} align="start">{tag(STATE, r.state)}{r.finishedAt ? <Muted>{`${dayOf(r.finishedAt)} 끝남`}</Muted> : null}</VStack> },
        { key: "risk", header: "위험도", width: proportional(1, { minWidth: 72 }), renderCell: (r: Loose) => <Tag tone={r.risk === "high" ? "gate" : "line"} label={RISK_KO[r.risk] ?? r.risk} /> },
        { key: "approval", header: "배포 승인", width: proportional(2, { minWidth: 72 }), renderCell: (r: Loose) => tag(APPROVAL, r.approval) },
        { key: "test", header: "롤백 시험", width: proportional(1, { minWidth: 72 }), renderCell: (r: Loose) => <Tag tone={r.rollbackTest === "passed" ? "ops" : "line"} label={r.rollbackTest === "passed" ? "통과" : "없음"} /> },
      ]}
    />
  );
}

function IncidentsTable({ incidents }: { incidents: Loose[] }) {
  return (
    <Table
      data={incidents}
      idKey="id"
      density="compact"
      columns={[
        { key: "id", header: "장애", width: proportional(1, { minWidth: 72 }), renderCell: (r: Loose) => <Key>{r.id}</Key> },
        { key: "grade", header: "등급", width: proportional(1, { minWidth: 72 }), renderCell: (r: Loose) => <Tag tone={r.grade <= 2 ? "gate" : "build"} label={`등급 ${r.grade}`} /> },
        { key: "date", header: "날짜", width: proportional(1, { minWidth: 72 }), renderCell: (r: Loose) => <Text hasTabularNumbers>{r.date}</Text> },
        { key: "cause", header: "원인 배포", width: proportional(2, { minWidth: 72 }), renderCell: (r: Loose) => <Text>{r.cause ? recordName(String(r.cause)) : "—"}</Text> },
        { key: "follow", header: "후속 이슈", width: proportional(2, { minWidth: 72 }), renderCell: (r: Loose) => (r.followUp ? <Link href={`/issues/${r.followUp}`}>{String(r.followUp)}</Link> : <Tag tone="build" label="아직 없음" />) },
      ]}
    />
  );
}

function RecordsTable({ records }: { records: Loose[] }) {
  const misses = (r: Loose): number => ((r.metrics ?? []) as Loose[]).filter((m) => m.verdict === "미달").length;
  return (
    <Table
      data={records}
      idKey="path"
      density="compact"
      columns={[
        { key: "topic", header: "주제", width: proportional(2, { minWidth: 72 }), renderCell: (r: Loose) => <Text>{r.topic ?? recordName(r.path)}</Text> },
        { key: "period", header: "기간", width: proportional(3, { minWidth: 180 }), renderCell: (r: Loose) => <Text hasTabularNumbers>{`${dayOf(r.period?.from)} ~ ${dayOf(r.period?.to)}`}</Text> },
        { key: "miss", header: "목표 미달", width: proportional(1, { minWidth: 72 }), renderCell: (r: Loose) => <Tag tone={misses(r) ? "build" : "line"} label={`${misses(r)}건`} /> },
        { key: "n", header: "잰 지표", width: proportional(1, { minWidth: 72 }), renderCell: (r: Loose) => <Text hasTabularNumbers>{((r.metrics ?? []) as Loose[]).length}</Text> },
      ]}
    />
  );
}

function CandidatesPanel({ candidates, readOnly }: { candidates: Loose[]; readOnly: boolean }) {
  const anyOverlap = candidates.some((c) => ((c.overlaps ?? []) as string[]).length);
  const open = candidates.filter((c) => !c.intake).length;
  return (
    <Panel title="다음 요구사항 후보" aside={open ? <Muted>{`아직 접수하지 않은 후보 ${open}건`}</Muted> : undefined} flush={candidates.length > 0}>
      {candidates.length ? (
        <>
          <Table
            data={candidates}
            idKey="id"
            density="compact"
            columns={[
              { key: "title", header: "후보", width: proportional(3, { minWidth: 72 }), renderCell: (r: Loose) => <VStack gap={0}><Text weight="semibold">{r.title}</Text><Muted>{r.id}</Muted></VStack> },
              { key: "kind", header: "종류", width: proportional(1, { minWidth: 72 }), renderCell: (r: Loose) => <Tag label={r.kind || "change"} /> },
              { key: "evidence", header: "근거", width: proportional(2, { minWidth: 72 }), renderCell: (r: Loose) => <Text>{((r.evidence ?? []) as string[]).join(" · ") || "—"}</Text> },
              ...(anyOverlap ? [{ key: "overlap", header: "겹치는 Intent", width: proportional(1, { minWidth: 72 }), renderCell: (r: Loose) => ((r.overlaps as string[]).length ? <HStack gap={1} wrap="wrap">{(r.overlaps as string[]).map((k) => <Key key={k}>{k}</Key>)}</HStack> : <Muted>없음</Muted>) }] : []),
              {
                key: "go",
                header: "접수",
                width: proportional(1, { minWidth: 72 }),
                renderCell: (r: Loose) =>
                  r.intake ? (
                    <Tag tone="ops" icon="ok" label={String(r.intake)} />
                  ) : readOnly ? (
                    <Muted>아직</Muted>
                  ) : (
                    <Button label="요구사항으로" size="sm" href={`/intake?from=${encodeURIComponent(`ops:${String(r.record).replace(/^\.agents\/docs\//, "")}#${r.id}`)}`} />
                  ),
              },
            ]}
          />
          {readOnly && open ? (
            <HStack gap={1} align="center" paddingBlock={3} paddingInline={2}>
              <Muted>후보 접수는 자기 터미널에서 연 관리 페이지에서 합니다</Muted>
              <TermHelp term="readOnly" />
            </HStack>
          ) : null}
        </>
      ) : (
        <EmptyNote title="후보가 없습니다" text="운영 기록의 '다음 요구사항 후보' 칸에 적으면 여기 모입니다." />
      )}
    </Panel>
  );
}

function MetricsPanel({ delivery }: { delivery: Loose }) {
  const current = (delivery.current ?? {}) as Loose;
  const baseline = (delivery.baseline ?? {}) as Loose;
  const mismatch = new Set<string>((delivery.methodMismatch ?? []) as string[]);
  const hasValue = METRICS.some((m) => metricValue(current[m.id]) !== null || metricValue(baseline[m.id]) !== null);
  const hasBaseline = METRICS.some((m) => metricValue(baseline[m.id]) !== null);
  return (
    <Panel title="전달 지표" aside={<Muted>최근 30일</Muted>} flush={hasValue}>
      {hasValue ? (
        <>
          <Table
            data={METRICS}
            idKey="id"
            density="compact"
            columns={[
              { key: "label", header: "지표", width: proportional(2, { minWidth: 72 }), renderCell: (r: Loose) => <Text weight="semibold">{r.label}</Text> },
              ...(hasBaseline ? [{ key: "base", header: "기준", width: proportional(1, { minWidth: 72 }), align: "end" as const, renderCell: (r: Loose) => <Text hasTabularNumbers>{metricText(baseline[r.id], r.kind)}</Text> }] : []),
              { key: "now", header: "최근 30일", width: proportional(1, { minWidth: 72 }), align: "end" as const, renderCell: (r: Loose) => <Text weight="semibold" hasTabularNumbers>{metricText(current[r.id], r.kind)}</Text> },
              {
                key: "method",
                header: "어디서 셌나",
                width: proportional(1, { minWidth: 72 }),
                renderCell: (r: Loose) => (
                  <HStack gap={1} align="center" wrap="wrap">
                    <Text size="sm">{METHOD_KO[current[r.id]?.method ?? "none"] ?? current[r.id]?.method}</Text>
                    {mismatch.has(r.id) ? <Tag tone="build" icon="alert" label="기준과 다름" /> : null}
                  </HStack>
                ),
              },
            ]}
          />
          <VStack gap={2} paddingBlock={4} paddingInline={2}>
            {mismatch.size ? <Notice kind="warn" title="기준과 세는 방법이 다릅니다.">{`${METRICS.filter((m) => mismatch.has(m.id)).map((m) => m.label).join(" · ")} — 숫자만 나란히 비교하지 않습니다.`}</Notice> : null}
            <Muted>git · 승인 기록 · 배포 기록에서만 셉니다. 사람이 적은 숫자는 쓰지 않습니다.</Muted>
          </VStack>
        </>
      ) : (
        <EmptyNote title="아직 계산할 자료가 없습니다" text="병합 · 승인 · 배포 기록이 쌓이면 병합까지 걸린 시간, 배포 실패율, 복구 시간 같은 지표가 보입니다." />
      )}
    </Panel>
  );
}

function AutoPanel({ auto }: { auto: Loose }) {
  return (
    <Panel title="자동 검증 배포" aside={tag(AUTO, String(auto.status ?? "off"))}>
      {auto.enabled ? (
        <Text size="sm">{`연속 실패 ${auto.consecutiveFailures ?? 0}회 · 마지막으로 통과한 커밋 ${auto.lastPassedSha ? String(auto.lastPassedSha).slice(0, 7) : "없음"}`}</Text>
      ) : (
        <Muted>꺼져 있습니다. 켜면 검증을 통과한 커밋을 저절로 배포합니다.</Muted>
      )}
      {auto.status === "stopped" ? (
        <Notice kind="err" title="자동 배포를 멈췄습니다.">{`연속 실패 ${auto.consecutiveFailures ?? 0}회입니다. 사람이 파이프라인을 직접 다시 돌려야 이어집니다.`}</Notice>
      ) : null}
      {auto.lastRun ? <Muted>{`마지막 실행 ${dayOf(auto.lastRun)}`}</Muted> : null}
      <Details>
        <Muted>켜고 끄는 곳: .agents/deploy.json 의 autoVerify.enabled</Muted>
        {auto.status === "stopped" ? <Muted>멈춘 뒤 다시 배포하려면 파이프라인을 직접 실행하면서 KNS_DEPLOY_RESUME=true 를 넣습니다.</Muted> : null}
      </Details>
    </Panel>
  );
}

function RulesPanel({ rules }: { rules: Loose[] }) {
  const proposed = rules.filter((r) => r.status === "proposed");
  return (
    <Panel title="규칙 후보" aside={<Muted>여러 번 되풀이된 고침</Muted>} flush={rules.length > 0}>
      {rules.length ? (
        <>
          <List hasDividers>
            {rules.map((r) => (
              <ListItem
                key={r.id}
                label={<Text weight="semibold">{r.target ?? "대상을 정하는 중"}</Text>}
                description={`${r.id} · ${r.ageDays}일 전 · 근거 ${r.sources}곳`}
                endContent={<HStack gap={1} align="center">{r.status === "proposed" && r.ageDays > 14 ? <Tag tone="build" label="14일 넘음" /> : null}{tag(CANDIDATE, r.status)}</HStack>}
              />
            ))}
          </List>
          <VStack gap={2} paddingBlock={4} paddingInline={2}>
            <Muted>받아들이거나 거절하는 일은 사람이 자기 터미널에서 합니다. 규칙 파일은 병합 요청으로 바꿉니다.</Muted>
            <Details label="터미널 명령">
              {proposed.slice(0, 1).map((r) => (
                <VStack key={r.id} gap={2}>
                  <CommandBox cmd={`knots-sync rules promote ${r.id}`} label="받아들이는 명령 복사" />
                  <CommandBox cmd={`knots-sync rules reject ${r.id} --reason "…"`} label="거절하는 명령 복사" />
                </VStack>
              ))}
              <CommandBox cmd="knots-sync rules candidates" label="후보 찾는 명령 복사" />
            </Details>
          </VStack>
        </>
      ) : (
        <EmptyNote title="규칙 후보가 없습니다" text="같은 지적이 이슈 두 곳 이상에서 되풀이되거나, 승인할 때 규칙 후보로 표시하면 생깁니다." />
      )}
    </Panel>
  );
}

export default function Ops({ route: _route }: { route: Route }) {
  const readOnly = Boolean(useAppState().session?.readOnly);
  const { state, reload, at, every, stale } = useLoad<[Loose]>(() => [get("/ops")], [], { live: true });
  const title = "배포 · 운영 기록";
  const sub = "배포가 잘 됐는지, 장애와 운영하며 찾은 다음 할 일을 봅니다. 여기서는 읽기만 합니다.";
  const crumbs = [{ label: "운영" }, { label: title }];
  const live = { at, every, stale };
  if (state.status === "loading") return <Page title={title} sub={sub} crumbs={crumbs} live={live}><Loading rows={5} /></Page>;
  if (state.status === "error") return <Page title={title} sub={sub} crumbs={crumbs} live={live}><ErrorBlock error={state.error} retry={reload} /></Page>;
  const data = (state.data[0] ?? {}) as Loose;
  const deploys = (data.deploys ?? []) as Loose[];
  const records = (data.records ?? []) as Loose[];
  const incidents = (data.incidents ?? []) as Loose[];
  const candidates = (data.candidates ?? []) as Loose[];
  const rules = (data.ruleCandidates ?? []) as Loose[];
  const auto = (data.autoVerify ?? {}) as Loose;
  const waiting = deploys.filter((d) => ["planned", "approved"].includes(d.state) && d.approval !== "valid").length;
  const noFollow = incidents.filter((i) => !i.followUp).length;
  const proposed = rules.filter((r) => r.status === "proposed");
  const runbookMissing = records.length > 0 && records.every((r) => !(r.metrics as Loose[] | undefined)?.length);
  const hasHistory = deploys.length + incidents.length + records.length > 0;

  return (
    <Page title={title} sub={sub} crumbs={crumbs} live={live}>
      {data.unavailable ? <Notice kind="warn" title="이 리포의 킷이 오래되어 운영 기록을 읽지 못했습니다.">터미널에서 knots-sync update 로 킷을 올립니다.</Notice> : null}
      {hasHistory || auto.enabled ? (
        <StatRow>
          <Stat label="배포 기록" value={deploys.length} unit="건" hint={waiting ? `승인 기다리는 배포 ${waiting}건` : "승인 기다리는 배포 없음"} />
          <Stat label="장애" value={incidents.length} unit="건" hint={noFollow ? `후속 이슈가 없는 장애 ${noFollow}건` : incidents.length ? "모두 후속 이슈가 있습니다" : undefined} />
          {auto.enabled ? <Stat label="자동 검증 배포" value={AUTO[auto.status]?.[1] ?? String(auto.status ?? "—")} hint={`연속 실패 ${auto.consecutiveFailures ?? 0}회`} /> : null}
          {rules.length ? <Stat label="규칙 후보" value={proposed.length} unit="건 제안됨" hint={proposed.some((r) => r.ageDays > 14) ? "14일 넘은 후보가 있습니다" : undefined} /> : null}
        </StatRow>
      ) : null}

      <TwoCol
        main={
          <>
            {hasHistory ? (
              <Section title="기록" meta="배포 · 장애 · 운영 기록">
                <Panel title="배포 기록" flush={deploys.length > 0}>
                  {deploys.length ? <DeploysTable deploys={deploys} /> : <EmptyNote title="배포 기록이 없습니다" text="이슈를 병합해 완료까지 끝낸 뒤 배포를 계획하면 생깁니다." />}
                </Panel>
                <Panel title="장애" flush={incidents.length > 0} {...(noFollow ? { aside: <Muted>후속 이슈가 없으면 새 요구사항에서 버그로 접수합니다</Muted> } : {})}>
                  {incidents.length ? <IncidentsTable incidents={incidents} /> : <EmptyNote title="장애 기록이 없습니다" />}
                </Panel>
                <Panel title="운영 기록" flush={records.length > 0}>
                  {records.length ? <RecordsTable records={records} /> : <EmptyNote title="운영 기록이 없습니다" text="배포 뒤 1주 · 매월 · 장애가 날 때마다 씁니다." />}
                </Panel>
                {runbookMissing ? <Muted>운영 기록에 잰 지표가 없습니다. 기존 코드에 배포했다면 운영 기록의 런북 확인 칸을 채웁니다.</Muted> : null}
              </Section>
            ) : (
              <Panel title="기록">
                <EmptyNote title="아직 배포 · 장애 · 운영 기록이 없습니다" text="배포를 계획하면 배포 기록이 생기고, 배포 뒤 1주 · 매월 · 장애가 날 때 운영 기록을 씁니다. 운영 기록에 적은 다음 할 일은 요구사항 후보로 모입니다.">
                  <Details label="터미널 명령">
                    <CommandBox cmd="knots-sync deploy plan <이슈 키>" label="배포 계획 명령 복사" />
                    <CommandBox cmd="knots-sync ops new --topic <영문-주제>" label="운영 기록 명령 복사" />
                  </Details>
                </EmptyNote>
              </Panel>
            )}
            {records.length || candidates.length ? <CandidatesPanel candidates={candidates} readOnly={readOnly} /> : null}
            <MetricsPanel delivery={(data.delivery ?? {}) as Loose} />
          </>
        }
        side={
          <>
            <AutoPanel auto={auto} />
            <RulesPanel rules={rules} />
          </>
        }
      />
      <Details label="터미널에서 같은 내용 보기">
        <CommandBox cmd="knots-sync status --ops --json" />
        <Muted>배포 기록은 .agents/docs/ops/deploys/, 운영 기록은 .agents/docs/ops/records/ 에 있습니다.</Muted>
      </Details>
    </Page>
  );
}
