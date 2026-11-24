// S01 홈 · 처리할 일. 하루의 시작 화면 맨 위에 숫자 카드, 그 아래 승인 · 리뷰 판단 · 질문 답 · 정리를 모은다(첫 화면 안에 끝난다).
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Grid } from "@astryxdesign/core/Grid";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useEffect, useMemo, useState } from "react";
import { get } from "../lib/api";
import { ago, clock, groupTodos, railSpec, ROLE_KO, stageRows, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { refreshOverview, useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { HBars, Sparkline } from "../ui/charts";
import { Empty, ErrorBlock, HarnessBadge, Key, Loading, Muted, Notice, Panel, ReadOnlyNote, Seg, Tag, type Tone } from "../ui/common";
import { GateRail } from "../ui/GateRail";
import { Page, Section, Stat, TwoCol } from "../ui/Page";

const KIND_TAG: Record<string, [Tone, string]> = {
  "review-blocker": ["gate", "리뷰 막힘"],
  "quality-blocker": ["gate", "품질 게이트"],
  "gate-mine": ["gate", "내 차례"],
  questions: ["design", "질문"],
  "verify-failed": ["gate", "검증 실패"],
  "approval-stale": ["build", "다시 승인"],
  "gate-others": ["line", "다른 사람"],
  "worktree-cleanup": ["line", "정리"],
  harness: ["build", "하네스"],
  "dispatch-stale": ["line", "대기함"],
  "deploy-stopped": ["gate", "배포 멈춤"],
  "deploy-approval": ["ops", "배포 승인"],
  "ops-metric-miss": ["build", "미달 지표"],
  "rule-candidate-stale": ["line", "규칙 후보"],
};

const ACTION: Record<string, string> = {
  "review-blocker": "리뷰 판단",
  "quality-blocker": "검증 보기",
  "gate-mine": "열어서 승인",
  "gate-others": "열기",
  questions: "답하기",
  "verify-failed": "검증 보기",
  "approval-stale": "다시 승인",
  "worktree-cleanup": "명령 보기",
  harness: "하네스 보기",
  "dispatch-stale": "대기함 보기",
  "deploy-stopped": "운영 보기",
  "deploy-approval": "운영 보기",
  "ops-metric-miss": "운영 보기",
  "rule-candidate-stale": "운영 보기",
};

const isIssueKey = (s: string): boolean => /^[A-Z][A-Z0-9]+-\d+$/.test(s);

function TodoRow({ t, issue, gates }: { t: Loose; issue: Loose | undefined; gates: string[] }) {
  const [tone, tagText] = KIND_TAG[t.kind] ?? ["line", t.kind];
  const primary = t.kind === "gate-mine" || t.kind === "approval-stale";
  return (
    <ListItem
      label={
        <HStack gap={2} align="center" wrap="wrap">
          {isIssueKey(t.target) ? <Key>{t.target}</Key> : null}
          <Text weight="semibold">{t.title}</Text>
          <Tag tone={tone} label={tagText} />
        </HStack>
      }
      description={`${t.reason} · ${ago(t.since)}`}
      href={t.link}
      endContent={
        <HStack gap={3} align="center" wrap="wrap">
          {issue ? <GateRail spec={railSpec(gates, issue)} /> : null}
          <Button label={ACTION[t.kind] ?? "열기"} size="sm" {...(primary ? { variant: "primary" as const } : {})} href={t.link} />
        </HStack>
      }
    />
  );
}

export default function Home({ route: _route }: { route: Route }) {
  const app = useAppState();
  const s = app.session;
  const gates: string[] = s?.flow.gates ?? [];
  const [onlyMine, setOnlyMine] = useState(false);
  const { state } = useLoad<[Loose, Loose, Loose]>(() => [get("/issues"), get("/sessions"), get("/intents")], []);
  useEffect(() => {
    void refreshOverview();
  }, []);

  const intentsRaw = state.status === "ready" ? (state.data[2].intents as Loose[]) : [];
  const active = intentsRaw.filter((i) => i.status !== "completed");
  const burnKey: string | undefined = active[0]?.key;
  const burn = useLoad<[Loose]>(() => [burnKey ? get(`/intents/${encodeURIComponent(burnKey)}/burn`, { query: { days: "14" } }) : Promise.resolve({ ok: true as const, status: 200, data: null, meta: {} })], [burnKey], { tolerate: ["not_found"] });

  const o = app.overview;
  const groups = useMemo(() => groupTodos(o?.todo ?? [], onlyMine), [o, onlyMine]);
  const issues = useMemo(() => new Map<string, Loose>(state.status === "ready" ? (state.data[0].issues as Loose[]).map((i) => [i.key, i]) : []), [state]);
  const openQuestions = intentsRaw.reduce((n, i) => n + (i.questions?.open ?? 0), 0);
  const waiting = (o?.todo ?? []).filter((t: Loose) => t.rank === 2 || t.rank === 6).length + (o?.more?.["2"] ?? 0) + (o?.more?.["6"] ?? 0);
  const burnData = burn.state.status === "ready" ? (burn.state.data[0] as Loose | null) : null;
  const bar = o?.stages ? stageRows(o.stages, gates) : [];
  const doctor = o?.doctor;

  const tools = (
    <>
      {doctor && doctor.status !== "ok" && doctor.status !== "unavailable" ? <Tag tone="build" icon="alert" label={`doctor 경고 ${doctor.problems?.length ?? ""}`} /> : <Tag tone="ops" icon="ok" label="doctor 통과" />}
      <Tag label={`kit ${s?.version ?? "?"}`} />
    </>
  );

  return (
    <Page title="홈" sub={`${s?.repo ?? ""}${app.readAt ? ` · ${clock(app.readAt.toISOString())}에 다시 읽었습니다` : ""}`} tools={tools}>
      {s?.readOnly ? (
        <HStack gap={2} align="center" wrap="wrap">
          <ReadOnlyNote text="읽기 전용(에이전트 세션에서 연 서버)" />
          <Muted>보기만 됩니다. 승인 · 답 · 저장은 사람이 자기 터미널에서 연 서버에서 합니다.</Muted>
        </HStack>
      ) : null}
      <Grid columns={{ minWidth: 220, max: 4, repeat: "fit" }} gap={4}>
        <Stat label="처리할 일" value={o?.total ?? "-"} unit="건" badge={o?.total ? <Tag tone="gate" label="사람이 할 것" /> : <Tag tone="ops" icon="ok" label="없음" />} />
        <Stat label="승인 대기" value={o ? waiting : "-"} unit="건" hint="내 차례와 다른 사람 차례를 합한 수" />
        <Stat label="열린 질문" value={state.status === "ready" ? openQuestions : "-"} unit="개" hint={`Intent ${active.length}개`} />
        <Stat
          label="남은 Bolt"
          value={burnData ? burnData.now.remaining : "-"}
          unit="개"
          hint={burnData ? `${burnKey} · 끝난 Unit ${burnData.now.units.done}/${burnData.now.units.total}` : "진행 중 Intent 없음"}
          extra={burnData ? <Sparkline values={burnData.series.map((x: Loose) => x.remaining as number)} label={`남은 Bolt ${burnData.series.length}일 추이`} /> : undefined}
        />
      </Grid>
      {state.status === "error" ? <ErrorBlock error={state.error} /> : null}
      <TwoCol
        main={
          <Section title="처리할 일" meta="승인 · 질문 · 정리" action={<Seg label="보기" items={[{ id: "all", label: "모두" }, { id: "mine", label: "내가 할 것" }]} value={onlyMine ? "mine" : "all"} onChange={(v) => setOnlyMine(v === "mine")} />}>
            {!o || state.status === "loading" ? (
              <Loading rows={5} />
            ) : groups.length ? (
              <VStack gap={4} aria-live="polite">
                {groups.map((g) => (
                  <Panel key={g.id} title={g.title} aside={<Badge variant="neutral" label={String(g.items.length)} />} flush>
                    <VStack gap={0}>
                      <VStack paddingInline={4} paddingBlock={2}>
                        <Muted size="xsm">{g.hint}</Muted>
                      </VStack>
                      <List hasDividers edge="padded">
                        {g.items.map((t: Loose, i: number) => (
                          <TodoRow key={`${t.target}${t.kind}${i}`} t={t} issue={issues.get(t.target)} gates={gates} />
                        ))}
                      </List>
                    </VStack>
                  </Panel>
                ))}
                {Object.keys(o.more ?? {}).length ? <Muted>{`50건을 넘어 건수만 보입니다: ${Object.entries(o.more as Record<string, number>).map(([r, n]) => `rank ${r} ${n}건`).join(" · ")}`}</Muted> : null}
                {o.errors?.length ? <Notice kind="warn" title="일부를 읽지 못했습니다: ">{(o.errors as string[]).slice(0, 3).join(" · ")}</Notice> : null}
              </VStack>
            ) : (
              <Empty title={onlyMine ? "내가 할 것이 없습니다" : "처리할 일이 없습니다"} text={onlyMine ? "'모두'에서 다른 사람이 할 것을 볼 수 있습니다." : "승인 · 질문 · 정리할 것이 없습니다. 새 요구사항을 접수하거나 진행 화면에서 이슈를 봅니다."} actions={<Button label="진행 보기" href="/progress" />} />
            )}
          </Section>
        }
        side={
          <>
            <Panel title="켜 둔 세션" aside={<Muted>{`${o?.sessions?.alive ?? 0}개 · 같은 컴퓨터`}</Muted>} flush>
              {state.status !== "ready" ? (
                <Loading rows={2} />
              ) : state.data[1].sessions.length ? (
                <List hasDividers>
                  {(state.data[1].sessions as Loose[]).map((x) => (
                    <ListItem
                      key={x.id}
                      label={x.name ?? String(x.id).slice(0, 12)}
                      description={`${x.issue ?? "이슈 없음"}${x.role ? ` · ${ROLE_KO[x.role] ?? x.role}` : ""}`}
                      startContent={<HarnessBadge name={x.harness} />}
                      endContent={<Tag tone={x.state === "gone" ? "line" : x.turn === "working" ? "build" : "ops"} label={x.state === "gone" ? "끊김" : x.turn === "working" ? "일하는 중" : x.state === "alive" ? "쉬는 중" : "수신함 없음"} />}
                    />
                  ))}
                </List>
              ) : (
                <Empty title="켜 둔 세션이 없습니다" text="세션이 시작되면 훅이 이 목록에 등록합니다." />
              )}
            </Panel>
            <Panel title="진행 중 Intent" aside={<Button label="흐름" size="sm" href="/progress?view=flow" />} flush>
              {state.status !== "ready" ? (
                <Loading rows={2} />
              ) : active.length ? (
                <List hasDividers>
                  {active.map((i) => (
                    <ListItem
                      key={i.key}
                      label={<HStack gap={2} align="center" wrap="wrap"><Text weight="semibold">{i.title ?? i.name}</Text><Key>{i.key}</Key></HStack>}
                      description={`Unit ${i.units.length} · 열린 질문 ${i.questions.open}${i.proposal ? " · 변경 제안 있음" : ""}`}
                      href={`/progress?view=flow&intent=${i.key}`}
                      endContent={i.questions.open ? <Tag tone="design" label={`질문 ${i.questions.open}`} /> : undefined}
                    />
                  ))}
                </List>
              ) : (
                <Empty title="Intent 가 없습니다" text="새 요구사항을 접수하면 Intent 가 생깁니다." />
              )}
            </Panel>
            {bar.length ? (
              <Panel title="단계별 이슈" aside={<Muted>{`이슈 ${o?.issues ?? 0}개`}</Muted>}>
                <HBars rows={bar} label="단계별 이슈 수" />
              </Panel>
            ) : null}
          </>
        }
      />
      {app.loadError ? <Notice kind="err" title="서버와 연결이 끊겼습니다.">서버를 연 터미널이 켜져 있는지 봅니다.</Notice> : null}
    </Page>
  );
}
