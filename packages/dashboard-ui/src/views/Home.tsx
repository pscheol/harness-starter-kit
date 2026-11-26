// S01 홈. 맨 위는 "지금 내 차례인 것"(승인 · 막힘 · 질문 · 실패한 검증), 그 아래 한 줄 숫자로 리포 상태, 그 아래 진행 중 이슈 · 다른 사람 차례 · 켜 둔 세션.
// Intent 를 쓰지 않는 리포에는 Intent · Bolt 칸을 띄우지 않는다(사용자 결정 2026-11-26). 빨강은 사람이 할 승인 · 질문 · 실패에만 쓴다.
import { Badge } from "@astryxdesign/core/Badge";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useEffect, useMemo } from "react";
import { get } from "../lib/api";
import { ago, groupTodos, HARNESS_KO, ROLE_KO, type Route, TODO_GROUPS } from "../lib/format";
import { LIVE_MS, useLoad } from "../lib/hooks";
import { refreshOverview, useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { Sparkline } from "../ui/charts";
import { Empty, ErrorBlock, HarnessBadge, Key, Loading, Muted, Notice, Panel, ReadOnlyLine, Tag, TermHelp, type Tone } from "../ui/common";
import { byIssueKey, GateRail, issueRail, issueStatus, issueTitle } from "../ui/GateRail";
import { Page, Section, Stat, StatRow, TwoCol } from "../ui/Page";

const KIND_TAG: Record<string, [Tone, string]> = {
  "review-blocker": ["gate", "리뷰 막힘"],
  "quality-blocker": ["gate", "품질 검사 실패"],
  "gate-mine": ["gate", "내 차례"],
  questions: ["gate", "질문"],
  "verify-failed": ["gate", "검증 실패"],
  "approval-stale": ["build", "다시 승인"],
  "gate-others": ["line", "다른 사람"],
  "worktree-cleanup": ["line", "정리"],
  harness: ["build", "설치 점검"],
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
  "worktree-cleanup": "작업 공간 보기",
  harness: "설치 점검 보기",
  "dispatch-stale": "대기함 보기",
  "deploy-stopped": "운영 보기",
  "deploy-approval": "운영 보기",
  "ops-metric-miss": "운영 보기",
  "rule-candidate-stale": "운영 보기",
};

/** 내 차례인 묶음(막힘 · 내 승인 · 질문 · 검증 · 다시 승인). 나머지(다른 사람 승인 · 정리)는 아래로 내린다. */
const MINE_GROUPS = new Set(["blocked", "mine", "questions", "verify"]);
/** 묶음 풀이(합니다체, 내부 표기 없이) */
const GROUP_HINT: Record<string, string> = {
  blocked: "리뷰에서 막는 지적이 나왔거나 품질 검사가 실패했습니다.",
  mine: "내가 승인할 차례입니다.",
  questions: "문서에 남은 '확인 필요' 표시와 아직 답하지 않은 질문입니다.",
  verify: "검증이 통과하지 않았거나, 승인한 뒤 문서가 바뀌었습니다.",
  others: "다른 사람이 승인할 차례입니다. 내가 할 일은 없습니다.",
  cleanup: "끝난 작업 공간 · 설치 점검 · 오래 기다린 요청입니다.",
};

/** 서버 글에 섞인 내부 문서 번호(예: "(DB-R13)")는 화면에서 뺀다 */
const clean = (s: unknown): string => (typeof s === "string" ? s.replace(/ ?\((?:DB|MD|HK)-R?\d+[^)]*\)/g, "").trim() : "");

function TodoRow({ t, issue, gates }: { t: Loose; issue: Loose | undefined; gates: string[] }) {
  const [tone, tagText] = KIND_TAG[t.kind] ?? ["line", t.kind];
  const primary = t.kind === "gate-mine" || t.kind === "approval-stale" || t.kind === "questions";
  const when = ago(t.since);
  // 좁은 화면에서는 레일을 빼서 제목이 여러 줄로 꺾이지 않게 한다(상태는 태그 글이 말한다)
  const wide = useMediaQuery("(min-width: 48rem)");
  const spec = issue && wide ? issueRail(gates, issue) : [];
  return (
    <ListItem
      label={
        <HStack gap={2} align="center" wrap="wrap">
          <Text weight="semibold">{t.title}</Text>
          <Tag tone={tone} label={tagText} />
        </HStack>
      }
      description={[clean(t.reason), when === "-" ? null : when].filter(Boolean).join(" · ")}
      href={t.link}
      endContent={
        <HStack gap={3} align="center" wrap="wrap">
          {spec.length ? <GateRail spec={spec} /> : null}
          <Button label={ACTION[t.kind] ?? "열기"} size="sm" {...(primary ? { variant: "primary" as const } : {})} href={t.link} />
        </HStack>
      }
    />
  );
}

function TodoGroups({ groups, issues, gates }: { groups: Array<{ id: string; title: string; items: Loose[] }>; issues: Map<string, Loose>; gates: string[] }) {
  return (
    <VStack gap={4}>
      {groups.map((g) => (
        <Panel key={g.id} title={g.title} aside={<Badge variant="neutral" label={String(g.items.length)} />} flush>
          <VStack gap={0}>
            <VStack paddingInline={2} paddingBlock={2}>
              <Muted>{GROUP_HINT[g.id] ?? ""}</Muted>
            </VStack>
            <List hasDividers edge="padded">
              {g.items.map((t: Loose) => (
                <TodoRow key={`${t.target}${t.kind}${t.title}`} t={t} issue={issues.get(t.target)} gates={gates} />
              ))}
            </List>
          </VStack>
        </Panel>
      ))}
    </VStack>
  );
}

const sum = (o: Record<string, number> | null | undefined): number => Object.values(o ?? {}).reduce((a, n) => a + (Number(n) || 0), 0);

/** 머리의 설치 점검 표시: 손볼 것(오류 · 주의)과 참고(사람이 고친 킷 파일 등)를 나눈다. 참고는 경고가 아니다. */
function DoctorTag({ doctor }: { doctor: Loose | null | undefined }) {
  if (!doctor || doctor.status === "unavailable") return null;
  const problems = sum(doctor.counts) || (doctor.problems?.length ?? 0);
  const notes = sum(doctor.noteCounts) || (doctor.notes?.length ?? 0);
  const label = problems ? `설치 점검 · 손볼 것 ${problems}` : `설치 점검 이상 없음${notes ? ` · 참고 ${notes}` : ""}`;
  return (
    <HStack gap={0.5} align="center">
      <Link href="/harness" label={`${label} — 하네스 화면에서 봅니다`}>
        <Tag tone={problems ? "build" : "ops"} icon={problems ? "alert" : "ok"} label={label} />
      </Link>
      <TermHelp term="doctor" />
    </HStack>
  );
}

function SessionTag({ x }: { x: Loose }) {
  if (x.state === "gone") return <Tag label="끊김" />;
  if (x.turn === "working") return <Tag tone="build" label="일하는 중" />;
  return <Tag tone="ops" label={x.state === "alive" ? "쉬는 중" : "수신함 없음"} />;
}

function SessionsPanel({ sessions, alive, ready }: { sessions: Loose[]; alive: number; ready: boolean }) {
  return (
    <Panel title="켜 둔 세션" aside={<Muted>{`${alive}개 · 이 컴퓨터`}</Muted>} flush>
      {!ready ? (
        <VStack paddingBlock={4} paddingInline={2}>
          <Loading rows={2} />
        </VStack>
      ) : sessions.length ? (
        <List hasDividers edge="padded">
          {sessions.map((x) => (
            <ListItem
              key={x.id}
              label={x.name ?? `${HARNESS_KO[x.harness] ?? "AI"} 세션`}
              description={[x.issue, x.role && x.role !== "unknown" ? (ROLE_KO[x.role] ?? x.role) : null, x.branch ? `${x.branch} 브랜치` : null, x.startedAt ? `${ago(x.startedAt)} 시작` : null].filter(Boolean).join(" · ") || "맡은 이슈 없음"}
              startContent={<HarnessBadge name={x.harness} />}
              endContent={<SessionTag x={x} />}
            />
          ))}
        </List>
      ) : (
        <VStack paddingBlock={4} paddingInline={2}>
          <Empty title="켜 둔 세션이 없습니다" text="이 리포에서 AI 세션을 켜면 여기 나옵니다." />
        </VStack>
      )}
    </Panel>
  );
}

function ActiveIssues({ issues, total, gates }: { issues: Loose[]; total: number; gates: string[] }) {
  if (!issues.length) {
    return total ? (
      <Empty title="진행 중인 이슈가 없습니다" text={`이슈 ${total}개를 모두 마쳤습니다. 새 요구사항을 접수하면 여기 나옵니다.`} actions={<Button label="새 요구사항" size="sm" href="/intake" />} />
    ) : (
      <Empty title="이슈가 아직 없습니다" text="새 요구사항을 접수하면 이슈가 생기고 여기 나옵니다." actions={<Button label="새 요구사항" size="sm" href="/intake" />} />
    );
  }
  const shown = issues.slice(0, 8);
  return (
    <Panel title="진행 중 이슈" aside={<Link href="/progress">{`모두 보기 · ${issues.length}개`}</Link>} flush>
      <List hasDividers edge="padded">
        {shown.map((i) => {
          const st = issueStatus(i);
          const spec = issueRail(gates, i);
          return (
            <ListItem
              key={i.key}
              label={<Key>{i.key}</Key>}
              {...(issueTitle(i) ? { description: issueTitle(i) } : {})}
              href={`/issues/${i.key}`}
              endContent={
                <HStack gap={3} align="center">
                  {spec.length ? <GateRail spec={spec} /> : null}
                  <Tag tone={st.tone} label={st.label} />
                </HStack>
              }
            />
          );
        })}
      </List>
    </Panel>
  );
}

export default function Home({ route: _route }: { route: Route }) {
  const app = useAppState();
  const s = app.session;
  const gates: string[] = s?.flow.gates ?? [];
  const { state } = useLoad<[Loose, Loose, Loose]>(() => [get("/issues"), get("/sessions"), get("/intents")], [], { live: true });
  useEffect(() => {
    void refreshOverview();
  }, []);

  const ready = state.status === "ready";
  const intentsRaw: Loose[] = ready ? (state.data[2].intents as Loose[]) : [];
  const active = intentsRaw.filter((i) => i.status !== "completed");
  const burnKey: string | undefined = active[0]?.key;
  const burn = useLoad<[Loose]>(() => [burnKey ? get(`/intents/${encodeURIComponent(burnKey)}/burn`, { query: { days: "14" } }) : Promise.resolve({ ok: true as const, status: 200, data: null, meta: {} })], [burnKey], { tolerate: ["not_found"], live: Boolean(burnKey) });

  const o = app.overview;
  const groups = useMemo(() => groupTodos(o?.todo ?? []), [o]);
  const mineGroups = groups.filter((g) => MINE_GROUPS.has(g.id));
  const otherGroups = groups.filter((g) => !MINE_GROUPS.has(g.id));
  const mineCount = mineGroups.reduce((n, g) => n + g.items.length, 0);
  const issueList: Loose[] = useMemo(() => (ready ? [...(state.data[0].issues as Loose[])].sort(byIssueKey) : []), [ready, state]);
  const issues = useMemo(() => new Map<string, Loose>(issueList.map((i) => [i.key, i])), [issueList]);
  const doing = issueList.filter((i) => i.stage !== "completed");
  const done = issueList.length - doing.length;
  const sessions: Loose[] = ready ? (state.data[1].sessions as Loose[]) : [];
  const alive = o?.sessions?.alive ?? sessions.filter((x) => x.state === "alive").length;
  const openQuestions = intentsRaw.reduce((n, i) => n + (i.questions?.open ?? 0), 0);
  const othersWaiting = (o?.todo ?? []).filter((t: Loose) => t.rank === 6).length + (o?.more?.["6"] ?? 0);
  const burnData = burn.state.status === "ready" ? (burn.state.data[0] as Loose | null) : null;
  const byStage = new Map<string, number>();
  for (const i of doing) byStage.set(issueStatus(i).label, (byStage.get(issueStatus(i).label) ?? 0) + 1);
  const breakdown = [...byStage].map(([k, n]) => `${k} ${n}`).join(" · ");

  // 숫자 카드는 0 이 아닌 것만(0 · '-' 가 화면에서 가장 큰 글이 되지 않게)
  const cards = [
    issueList.length ? <Stat key="doing" label="진행 중 이슈" value={doing.length} unit="개" hint={breakdown || "모두 마쳤습니다"} /> : null,
    done ? <Stat key="done" label="마친 이슈" value={done} unit="개" hint={`전체 ${issueList.length}개`} /> : null,
    alive ? <Stat key="alive" label="켜 둔 세션" value={alive} unit="개" hint="이 컴퓨터에서 켠 AI 세션" /> : null,
    othersWaiting ? <Stat key="others" label="다른 사람 승인 대기" value={othersWaiting} unit="건" hint="내가 할 일은 없습니다" /> : null,
    openQuestions ? <Stat key="q" label="답할 질문" value={openQuestions} unit="개" hint={`Intent ${active.length}개에서`} /> : null,
    burnData ? (
      <Stat
        key="bolt"
        label="남은 Bolt"
        value={burnData.now.remaining}
        unit="개"
        hint={`${burnKey} · 끝난 Unit ${burnData.now.units.done}/${burnData.now.units.total}`}
        extra={<Sparkline values={burnData.series.map((x: Loose) => x.remaining as number)} label={`남은 Bolt ${burnData.series.length}일 추이`} />}
      />
    ) : null,
  ].filter(Boolean);
  const more = Object.entries((o?.more ?? {}) as Record<string, number>);

  const tools = (
    <>
      <DoctorTag doctor={o?.doctor} />
      <Tag label={`킷 ${s?.version ?? "?"}`} />
    </>
  );

  return (
    <Page title="홈" sub="지금 내 차례인 일을 먼저 보고, 아래에서 이 리포의 이슈 · 세션 상태를 봅니다." tools={tools} live={{ at: app.readAt ? app.readAt.getTime() : null, every: LIVE_MS, stale: app.loadError }}>
      {s?.readOnly ? <ReadOnlyLine text="보기만 하는 화면입니다. 승인 · 답은 자기 터미널에서 연 관리 페이지에서 합니다" /> : null}
      {app.loadError ? <Notice kind="err" title="서버와 연결이 끊겼습니다.">관리 페이지를 연 터미널이 켜져 있는지 봅니다. 다시 연결되면 저절로 새로 읽습니다.</Notice> : null}
      <Section title="지금 내 차례" {...(mineCount ? { meta: `${mineCount}건` } : {})}>
        {!o ? (
          <Loading rows={3} />
        ) : mineGroups.length ? (
          <TodoGroups groups={mineGroups} issues={issues} gates={gates} />
        ) : (
          <Notice kind="ok" title="지금 내 차례인 일이 없습니다.">
            승인할 문서 · 답할 질문 · 실패한 검증이 생기면 여기에 먼저 나옵니다.
          </Notice>
        )}
      </Section>
      {cards.length ? <StatRow>{cards}</StatRow> : null}
      {state.status === "error" ? <ErrorBlock error={state.error} /> : null}
      <TwoCol
        main={
          <>
            {ready ? <ActiveIssues issues={doing} total={issueList.length} gates={gates} /> : <Loading rows={4} />}
            {otherGroups.length ? (
              <Section title="다른 사람 차례 · 정리">
                <TodoGroups groups={otherGroups} issues={issues} gates={gates} />
              </Section>
            ) : null}
            {more.length ? <Muted>{`50건이 넘어 나머지는 건수만 보입니다: ${more.map(([r, n]) => `${TODO_GROUPS.find((g) => g.match({ rank: Number(r) }))?.title ?? "기타"} ${n}건`).join(" · ")}`}</Muted> : null}
            {o?.errors?.length ? <Notice kind="warn" title="일부를 읽지 못했습니다.">{(o.errors as string[]).slice(0, 3).map(clean).join(" · ")}</Notice> : null}
          </>
        }
        side={
          <>
            <SessionsPanel sessions={sessions} alive={alive} ready={ready} />
            {active.length ? (
              <Panel title="진행 중 Intent" aside={<Button label="흐름" size="sm" href="/progress?view=flow" />} flush>
                <List hasDividers edge="padded">
                  {active.map((i) => (
                    <ListItem
                      key={i.key}
                      label={
                        <HStack gap={2} align="center" wrap="wrap">
                          <Text weight="semibold">{i.title ?? i.name}</Text>
                          <Key>{i.key}</Key>
                        </HStack>
                      }
                      description={`Unit ${i.units.length}개 · 답할 질문 ${i.questions.open}개${i.proposal ? " · 변경 제안 있음" : ""}`}
                      href={`/progress?view=flow&intent=${i.key}`}
                      endContent={i.questions.open ? <Tag tone="gate" label={`질문 ${i.questions.open}`} /> : undefined}
                    />
                  ))}
                </List>
              </Panel>
            ) : null}
          </>
        }
      />
    </Page>
  );
}
