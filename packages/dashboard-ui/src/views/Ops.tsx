// S10 운영(설계 14 §3.12): 배포 기록 · 장애 · 운영 기록 · 다음 요구사항 후보 · 전달 지표 · 자동 검증 배포 · 규칙 후보. 읽기만 한다.
// 장애 → bug 이슈와 후보 → Intent 는 새 요구사항(S11) 접수로 보낸다. 규칙 승격 · 거절은 명령을 복사해 사람이 터미널에서 한다.
import { Button } from "@astryxdesign/core/Button";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { get } from "../lib/api";
import type { Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import type { Loose } from "../lib/types";
import { CommandBox, Empty, ErrorBlock, Key, Loading, Muted, Notice, Panel, Tag, type Tone } from "../ui/common";
import { Page, Section, Stat, TwoCol } from "../ui/Page";

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
  partial: ["build", "2명 필요"],
  invalid: ["gate", "승인자 밖"],
};
const AUTO: Record<string, [Tone, string]> = {
  off: ["line", "꺼짐"],
  none: ["line", "실행 없음"],
  passed: ["ops", "통과"],
  failed: ["gate", "실패"],
  stopped: ["gate", "멈춤"],
};
const CANDIDATE: Record<string, [Tone, string]> = { proposed: ["build", "제안됨"], accepted: ["ops", "수용됨"], rejected: ["line", "거절됨"] };
const METRICS: Array<{ id: string; label: string; kind: "hours" | "rate" }> = [
  { id: "leadTimeHours", label: "리드 타임", kind: "hours" },
  { id: "changeFailureRate", label: "배포 실패율", kind: "rate" },
  { id: "mttrHours", label: "복구 시간", kind: "hours" },
  { id: "approvalWaitHours", label: "승인 대기 시간", kind: "hours" },
  { id: "reworkRate", label: "재작업 비율", kind: "rate" },
];
const METHOD_KO: Record<string, string> = { kit: "킷 기록", git: "git 만", merge: "병합까지", unavailable: "읽지 못함", none: "자료 없음" };

const metricText = (m: Loose | null | undefined, kind: "hours" | "rate"): string => {
  const v = m ? (m.median ?? m.value ?? null) : null;
  if (v === null || v === undefined) return "—";
  return kind === "rate" ? `${Math.round(Number(v) * 100)}%` : `${v}시간`;
};

const tag = (map: Record<string, [Tone, string]>, key: string) => {
  const [tone, label] = map[key] ?? ["line", key];
  return <Tag tone={tone} label={label} />;
};

const dayOf = (iso: unknown): string => (typeof iso === "string" && iso ? iso.slice(0, 10) : "—");
const recordName = (path: string): string => path.split("/").pop()?.replace(/\.md$/, "") ?? path;

export default function Ops({ route: _route }: { route: Route }) {
  const { state, reload } = useLoad<[Loose]>(() => [get("/ops")], []);
  const sub = "배포 기록 · 운영 기록 · 전달 지표 · 규칙 후보. 읽기만 한다";
  const crumbs = [{ label: "운영" }, { label: "운영" }];
  if (state.status === "loading") return <Page title="운영" sub={sub} crumbs={crumbs}><Loading rows={5} /></Page>;
  if (state.status === "error") return <Page title="운영" sub={sub} crumbs={crumbs}><ErrorBlock error={state.error} retry={reload} /></Page>;
  const data = (state.data[0] ?? {}) as Loose;
  const deploys = (data.deploys ?? []) as Loose[];
  const records = (data.records ?? []) as Loose[];
  const incidents = (data.incidents ?? []) as Loose[];
  const candidates = (data.candidates ?? []) as Loose[];
  const rules = (data.ruleCandidates ?? []) as Loose[];
  const delivery = (data.delivery ?? {}) as Loose;
  const auto = (data.autoVerify ?? {}) as Loose;
  const current = (delivery.current ?? {}) as Loose;
  const baseline = (delivery.baseline ?? {}) as Loose;
  const mismatch = new Set<string>((delivery.methodMismatch ?? []) as string[]);
  const waiting = deploys.filter((d) => ["planned", "approved"].includes(d.state) && d.approval !== "valid").length;
  const openCandidates = candidates.filter((c) => !c.intake);
  const runbookMissing = records.length > 0 && records.every((r) => !(r.metrics as Loose[] | undefined)?.length);

  return (
    <Page title="운영" sub={sub} crumbs={crumbs} tools={<Button label="새 요구사항" size="sm" href="/intake" />}>
      <VStack gap={5}>
        {data.unavailable ? <Notice kind="warn" title="이 프로젝트의 킷이 오래됐다. ">{String(data.unavailable)}</Notice> : null}
        <HStack gap={4} wrap="wrap" align="stretch">
          <Stat label="배포 기록" value={deploys.length} unit="건" hint={waiting ? `승인 대기 ${waiting}건` : "승인 대기 없음"} />
          <Stat label="장애" value={incidents.length} unit="건" hint={incidents.filter((i) => !i.followUp).length ? `후속 이슈 없는 장애 ${incidents.filter((i) => !i.followUp).length}건` : "모두 후속 이슈가 있다"} />
          <Stat label="자동 검증 배포" value={AUTO[auto.status]?.[1] ?? String(auto.status ?? "—")} hint={auto.enabled ? `연속 실패 ${auto.consecutiveFailures ?? 0}회` : "deploy.json autoVerify 꺼짐"} />
          <Stat label="규칙 후보" value={rules.filter((r) => r.status === "proposed").length} unit="건 제안됨" hint={rules.some((r) => r.status === "proposed" && r.ageDays > 14) ? "14일 넘은 후보가 있다" : undefined} />
        </HStack>

        <TwoCol
          main={
            <>
              <Section title="기록" meta="배포 · 장애 · 운영 기록을 시간순으로">
                <Panel title="배포 기록" flush aside={<Muted size="xsm">.agents/docs/ops/deploys/</Muted>}>
                  {deploys.length ? (
                    <Table
                      data={deploys}
                      idKey="path"
                      density="compact"
                      columns={[
                        { key: "key", header: "묶음", renderCell: (r: Loose) => <Key>{recordName(r.path)}</Key> },
                        { key: "env", header: "환경", renderCell: (r: Loose) => <Text>{r.env}</Text> },
                        { key: "state", header: "상태", renderCell: (r: Loose) => tag(STATE, r.state) },
                        { key: "risk", header: "risk", renderCell: (r: Loose) => <Tag tone={r.risk === "high" ? "gate" : "line"} label={r.risk} /> },
                        { key: "approval", header: "deploy 승인", renderCell: (r: Loose) => tag(APPROVAL, r.approval) },
                        { key: "test", header: "롤백 시험", renderCell: (r: Loose) => <Tag tone={r.rollbackTest === "passed" ? "ops" : "line"} label={r.rollbackTest === "passed" ? "통과" : "없음"} /> },
                        { key: "at", header: "끝난 날", renderCell: (r: Loose) => <Text>{dayOf(r.finishedAt)}</Text> },
                      ]}
                    />
                  ) : (
                    <Empty title="배포 기록이 없다" text="배포할 이슈를 병합하고 done 까지 끝내면 plan 으로 만든다." actions={<CommandBox cmd="npx harness-kit deploy plan <이슈 · Intent 키>" />} />
                  )}
                </Panel>
                <Panel title="장애" flush>
                  {incidents.length ? (
                    <Table
                      data={incidents}
                      idKey="id"
                      density="compact"
                      columns={[
                        { key: "id", header: "ID", renderCell: (r: Loose) => <Key>{r.id}</Key> },
                        { key: "grade", header: "등급", renderCell: (r: Loose) => <Tag tone={r.grade <= 2 ? "gate" : "build"} label={`등급 ${r.grade}`} /> },
                        { key: "date", header: "날짜", renderCell: (r: Loose) => <Text>{r.date}</Text> },
                        { key: "cause", header: "원인 배포", renderCell: (r: Loose) => <Text>{r.cause ? recordName(String(r.cause)) : "—"}</Text> },
                        { key: "follow", header: "후속 이슈", renderCell: (r: Loose) => (r.followUp ? <Button label={String(r.followUp)} size="sm" href={`/issues/${r.followUp}`} /> : <Muted>없음 — bug 로 접수한다</Muted>) },
                      ]}
                    />
                  ) : (
                    <Empty title="장애 기록이 없다" />
                  )}
                </Panel>
                <Panel title="운영 기록" flush aside={<Muted size="xsm">.agents/docs/ops/records/</Muted>}>
                  {records.length ? (
                    <Table
                      data={records}
                      idKey="path"
                      density="compact"
                      columns={[
                        { key: "topic", header: "주제", renderCell: (r: Loose) => <Text>{r.topic ?? recordName(r.path)}</Text> },
                        { key: "period", header: "기간", renderCell: (r: Loose) => <Text>{`${dayOf(r.period?.from)} ~ ${dayOf(r.period?.to)}`}</Text> },
                        { key: "miss", header: "미달", renderCell: (r: Loose) => <Tag tone={(r.metrics as Loose[]).some((m) => m.verdict === "미달") ? "build" : "line"} label={`${(r.metrics as Loose[]).filter((m) => m.verdict === "미달").length}건`} /> },
                        { key: "n", header: "실측 행", renderCell: (r: Loose) => <Text>{(r.metrics as Loose[]).length}</Text> },
                      ]}
                    />
                  ) : (
                    <Empty title="운영 기록이 없다" text="배포 뒤 1주 · 매월 · 장애마다 만든다. 목표 값은 ops new 가 채운다." actions={<CommandBox cmd="npx harness-kit ops new --topic <영문-주제>" />} />
                  )}
                </Panel>
                {runbookMissing ? <Muted>런북 확인 없음 — 기존 코드에 배포했다면 운영 기록 §4 를 채운다.</Muted> : null}
              </Section>

              <Section title="다음 요구사항 후보" meta="운영 기록 §5 — 접수는 새 요구사항(S11)에서">
                <Panel title="후보" flush aside={<Button label="새 요구사항" size="sm" href="/intake" />}>
                  {candidates.length ? (
                    <Table
                      data={candidates}
                      idKey="id"
                      density="compact"
                      columns={[
                        { key: "id", header: "ID", renderCell: (r: Loose) => <Key>{r.id}</Key> },
                        { key: "title", header: "후보", renderCell: (r: Loose) => <Text weight="semibold">{r.title}</Text> },
                        { key: "kind", header: "종류", renderCell: (r: Loose) => <Tag label={r.kind || "change"} /> },
                        { key: "evidence", header: "근거", renderCell: (r: Loose) => <Text>{(r.evidence as string[]).join(" · ") || "—"}</Text> },
                        { key: "overlap", header: "겹치는 Intent", renderCell: (r: Loose) => ((r.overlaps as string[]).length ? <HStack gap={1} wrap="wrap">{(r.overlaps as string[]).map((k) => <Key key={k}>{k}</Key>)}</HStack> : <Muted>없음</Muted>) },
                        {
                          key: "go",
                          header: "접수",
                          renderCell: (r: Loose) =>
                            r.intake ? <Tag tone="ops" icon="ok" label={String(r.intake)} /> : <Button label="요구사항으로" size="sm" href={`/intake?from=${encodeURIComponent(`ops:${String(r.record).replace(/^\.agents\/docs\//, "")}#${r.id}`)}`} />,
                        },
                      ]}
                    />
                  ) : (
                    <Empty title="후보가 없다" text="목표에 못 미친 지표나 배운 것에서 운영 기록 §5 에 적는다." />
                  )}
                </Panel>
                {openCandidates.length ? <Muted>{`접수하지 않은 후보 ${openCandidates.length}건`}</Muted> : null}
              </Section>
            </>
          }
          side={
            <>
              <Panel title="전달 지표" aside={<Muted size="xsm">최근 30일 · 기준선</Muted>} flush>
                <Table
                  data={METRICS}
                  idKey="id"
                  density="compact"
                  columns={[
                    { key: "label", header: "지표", renderCell: (r: Loose) => <Text weight="semibold">{r.label}</Text> },
                    { key: "base", header: "기준선", renderCell: (r: Loose) => <Text>{metricText(baseline[r.id], r.kind)}</Text> },
                    { key: "now", header: "30일", renderCell: (r: Loose) => <Text weight="semibold">{metricText(current[r.id], r.kind)}</Text> },
                    {
                      key: "method",
                      header: "계산 방법",
                      renderCell: (r: Loose) => (
                        <VStack gap={1}>
                          <Text size="sm">{METHOD_KO[current[r.id]?.method ?? "none"] ?? current[r.id]?.method}</Text>
                          {mismatch.has(r.id) ? <Tag tone="build" icon="alert" label="다름" /> : null}
                        </VStack>
                      ),
                    },
                  ]}
                />
                <VStack gap={2} padding={4}>
                  {mismatch.size ? <Notice kind="warn" title="계산 방법 다름. ">{`${METRICS.filter((m) => mismatch.has(m.id)).map((m) => m.label).join(" · ")} — 기준선과 계산 방법이 달라 숫자만 나란히 비교하지 않는다.`}</Notice> : null}
                  <Muted size="xsm">git · 승인 기록 · 배포 기록에서만 계산한다. 사람이 적은 숫자는 쓰지 않는다.</Muted>
                  <CommandBox cmd="npx harness-kit metrics" />
                </VStack>
              </Panel>

              <Panel title="자동 검증 배포" aside={tag(AUTO, String(auto.status ?? "off"))}>
                <VStack gap={2}>
                  <Text size="sm">{auto.enabled ? `연속 실패 ${auto.consecutiveFailures ?? 0}회 · 마지막 통과 ${auto.lastPassedSha ?? "없음"}` : "꺼져 있다. .agents/deploy.json 의 autoVerify.enabled 로 켠다."}</Text>
                  {auto.status === "stopped" ? (
                    <Notice kind="err" title="멈췄다. ">{String(auto.reason ?? auto.resume ?? "")}</Notice>
                  ) : null}
                  {auto.resume ? <Muted>{String(auto.resume)}</Muted> : null}
                  {auto.lastRun ? <Muted size="xsm">{`마지막 실행 ${dayOf(auto.lastRun)}`}</Muted> : null}
                </VStack>
              </Panel>

              <Panel title="규칙 후보" aside={<Muted size="xsm">반복된 고침</Muted>} flush>
                {rules.length ? (
                  <Table
                    data={rules}
                    idKey="id"
                    density="compact"
                    columns={[
                      { key: "id", header: "ID", renderCell: (r: Loose) => <Key>{r.id}</Key> },
                      { key: "status", header: "상태", renderCell: (r: Loose) => tag(CANDIDATE, r.status) },
                      { key: "target", header: "대상", renderCell: (r: Loose) => <Text>{r.target ?? "정하는 중"}</Text> },
                      { key: "age", header: "경과", renderCell: (r: Loose) => <Tag tone={r.status === "proposed" && r.ageDays > 14 ? "build" : "line"} label={`${r.ageDays}일 · 출처 ${r.sources}`} /> },
                    ]}
                  />
                ) : (
                  <Empty title="규칙 후보가 없다" text="승인 때 '규칙 후보'로 표시하거나, 같은 점검의 수용 지적이 이슈 2개 이상에서 반복되면 생긴다." />
                )}
                <VStack gap={2} padding={4}>
                  {rules.filter((r) => r.status === "proposed").slice(0, 1).map((r) => (
                    <VStack key={r.id} gap={2}>
                      <CommandBox cmd={`npx harness-kit rules promote ${r.id}`} label="승격 명령 복사" />
                      <CommandBox cmd={`npx harness-kit rules reject ${r.id} --reason "…"`} label="거절 명령 복사" />
                    </VStack>
                  ))}
                  <CommandBox cmd="npx harness-kit rules candidates" label="후보 찾기 명령 복사" />
                  <Muted size="xsm">승격 · 거절은 사람이 자기 터미널에서 한다. 규칙 파일은 MR 로 바꾼다.</Muted>
                </VStack>
              </Panel>
            </>
          }
        />
        <CommandBox cmd="npx harness-kit status --ops --json" label="이 화면과 같은 데이터(명령 복사)" />
      </VStack>
    </Page>
  );
}
