// S02 진행 보드: 이슈마다 지금 단계 · 막힌 것 · 맡은 세션. Intent 를 쓰는 리포는 Intent → Unit → 이슈로 묶어 보이고, 아니면 이슈만 보인다.
// 이슈 키는 링크다: 그냥 누르면 오른쪽 시트로 상세(S03)가 열리고, 새 탭(⌘ · Ctrl · 가운데 단추)으로 열면 전체 화면이 열린다.
import { Button } from "@astryxdesign/core/Button";
import { Drawer } from "@astryxdesign/core/Drawer";
import { Link } from "@astryxdesign/core/Link";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { pixel, proportional, Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import { get } from "../lib/api";
import type { Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { Empty, ErrorBlock, HarnessBadge, Ico, Key, Loading, Muted, Panel, Seg, Tag, TermHelp } from "../ui/common";
import { byIssueKey, issueFlags, IssueStage, issueTitle } from "../ui/GateRail";
import { Page } from "../ui/Page";
import { IssueDetail } from "./IssueDetail";

export const STAGE_FILTERS: Array<{ id: string; label: string; test: (i: Loose) => boolean }> = [
  { id: "all", label: "모두", test: () => true },
  { id: "wait", label: "승인 대기", test: (i) => Boolean(i.waitingOn) },
  { id: "blocked", label: "막힘", test: (i) => issueFlags(i).length > 0 },
  { id: "doing", label: "진행 중", test: (i) => i.stage !== "completed" && !i.waitingOn },
  { id: "done", label: "완료", test: (i) => i.stage === "completed" },
];

/** 보드 · 흐름 전환. 흐름은 Intent 가 있을 때만 있다(사용자 결정 2026-11-26) — 부르는 쪽이 Intent 수를 보고 띄운다. */
export function ViewSwitch({ active, intent }: { active: "board" | "flow"; intent?: string | null | undefined }) {
  const q = intent ? `&intent=${encodeURIComponent(intent)}` : "";
  return (
    <HStack gap={1}>
      <Button label="보드" size="sm" variant={active === "board" ? "primary" : "secondary"} href="/progress" />
      <Button label="흐름" size="sm" variant={active === "flow" ? "primary" : "secondary"} href={`/progress?view=flow${q}`} />
    </HStack>
  );
}

/** 새 탭 · 새 창으로 여는 클릭(수정 키 · 가운데 단추)은 브라우저에 맡긴다 */
const isPlainClick = (e: MouseEvent): boolean => !(e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

function IssueCell({ i, showArea, onOpen }: { i: Loose; showArea: boolean; onOpen: (key: string) => void }) {
  const title = issueTitle(i);
  const sub = [title, showArea ? i.area : null].filter(Boolean).join(" · ");
  return (
    <VStack gap={0.5}>
      <Link
        href={`/issues/${i.key}`}
        weight="semibold"
        onClick={(e) => {
          if (!isPlainClick(e)) return;
          e.preventDefault();
          onOpen(i.key);
        }}
      >
        {i.key}
      </Link>
      {sub ? <Muted>{sub}</Muted> : null}
    </VStack>
  );
}

function SessionCell({ i, sessions }: { i: Loose; sessions: Loose[] }) {
  const mine = sessions.filter((s) => (i.sessions as string[]).includes(s.id));
  if (!mine.length) return <Muted>없음</Muted>;
  return (
    <VStack gap={1}>
      {mine.map((s) => (
        <HStack key={s.id} gap={1} align="center">
          <HarnessBadge name={s.harness} />
          {s.name ? <Muted>{s.name}</Muted> : null}
        </HStack>
      ))}
    </VStack>
  );
}

function IssueTable({ rows, gates, sessions, showArea, onOpen }: { rows: Loose[]; gates: string[]; sessions: Loose[]; showArea: boolean; onOpen: (key: string) => void }) {
  // 모든 줄이 비어 있는 열(Bolt · 세션)은 숨긴다
  const hasBolts = rows.some((i) => (i.docs.tasks?.bolts?.total ?? 0) > 0);
  const hasSessions = rows.some((i) => (i.sessions as string[]).length > 0);
  const hasFlags = rows.some((i) => issueFlags(i).length > 0);
  return (
    <Table
      data={rows}
      idKey="key"
      density="compact"
      hasHover
      verticalAlign="top"
      columns={[
        { key: "key", header: "이슈", width: proportional(3, { minWidth: 240 }), renderCell: (i: Loose) => <IssueCell i={i} showArea={showArea} onOpen={onOpen} /> },
        { key: "stage", header: "단계", width: proportional(2, { minWidth: 160 }), renderCell: (i: Loose) => <IssueStage issue={i} gates={gates} /> },
        ...(hasFlags
          ? [
              {
                key: "flags",
                header: "막힌 것",
                width: proportional(1, { minWidth: 120 }),
                renderCell: (i: Loose) => {
                  const f = issueFlags(i);
                  return f.length ? (
                    <HStack gap={1} wrap="wrap">
                      {f.map((x) => (
                        <Tag key={x} tone="gate" icon="alert" label={x} />
                      ))}
                    </HStack>
                  ) : (
                    <Muted>없음</Muted>
                  );
                },
              },
            ]
          : []),
        ...(hasBolts
          ? [
              {
                key: "bolt",
                header: "Bolt",
                width: pixel(120),
                renderCell: (i: Loose) => {
                  const b = i.docs.tasks?.bolts;
                  return b && b.total ? (
                    <VStack gap={1}>
                      <ProgressBar label={`Bolt ${b.done}/${b.total}`} isLabelHidden value={b.done} max={b.total} />
                      <Muted>{`${b.done}/${b.total}`}</Muted>
                    </VStack>
                  ) : (
                    <Muted>-</Muted>
                  );
                },
              },
            ]
          : []),
        ...(hasSessions ? [{ key: "sessions", header: "맡은 세션", width: proportional(1, { minWidth: 140 }), renderCell: (i: Loose) => <SessionCell i={i} sessions={sessions} /> }] : []),
      ]}
      emptyState={false}
    />
  );
}

export default function Progress({ route }: { route: Route }) {
  const app = useAppState();
  const only = route.name === "intent" ? (route.params.key ?? null) : null;
  const gates: string[] = app.session?.flow.gates ?? [];
  const [area, setArea] = useState("all");
  const [stage, setStage] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  // 시트(승인 · 편집 칸이 있을 수 있다)가 열려 있는 동안은 뒤의 보드를 새로 읽지 않는다
  const load = useLoad<[Loose, Loose, Loose]>(() => [get("/intents"), get("/issues"), get("/sessions")], [], { live: open === null });
  const { state, reload } = load;

  const data = state.status === "ready" ? state.data : null;
  const issues: Loose[] = useMemo(() => [...((data?.[1].issues ?? []) as Loose[])].sort(byIssueKey), [data]);
  const sessions: Loose[] = data?.[2].sessions ?? [];
  const allIntents: Loose[] = data?.[0].intents ?? [];
  const hasIntents = allIntents.length > 0;
  const intents = allIntents.filter((i: Loose) => !only || i.key === only);
  const areas = useMemo(() => [...new Set(issues.map((i) => i.area).filter(Boolean))].sort() as string[], [issues]);
  const showArea = areas.length > 1;
  const test = STAGE_FILTERS.find((f) => f.id === stage)?.test ?? (() => true);
  const pass = (i: Loose): boolean => (area === "all" || i.area === area) && test(i);

  const sections = intents
    .map((it) => {
      const rows = (it.units as Loose[]).filter((u) => u.planned).map((u) => ({ u, i: issues.find((x) => x.key === u.issue) })).filter(({ i }) => (i ? pass(i) : area === "all" && stage === "all"));
      return { it, linked: rows.filter(({ i }) => i).map(({ i }) => i as Loose), planned: rows.filter(({ i }) => !i).map(({ u }) => u) };
    })
    .filter((s) => s.linked.length || s.planned.length);
  const inIntent = new Set(intents.flatMap((it) => (it.units as Loose[]).map((u) => u.issue).filter(Boolean)));
  const loose = only ? [] : issues.filter((i) => !inIntent.has(i.key) && pass(i));
  const shown = sections.reduce((n, s) => n + s.linked.length + s.planned.length, 0) + loose.length;
  // 0건인 거름은 숨긴다(고른 것과 '모두'는 남긴다)
  const stageItems = STAGE_FILTERS.map((f) => ({ id: f.id, label: f.label, n: issues.filter(f.test).length })).filter((f) => f.id === "all" || f.id === stage || f.n > 0);

  return (
    <Page
      title={only ? `${only} 진행` : "진행"}
      sub="이슈마다 지금 어느 단계인지 봅니다. 이슈를 누르면 문서와 승인을 엽니다."
      crumbs={[{ label: "작업" }, { label: "진행" }]}
      {...(hasIntents ? { tools: <ViewSwitch active="board" intent={only} /> } : {})}
      live={load}
    >
      {state.status === "loading" ? <Loading rows={6} /> : null}
      {state.status === "error" ? <ErrorBlock error={state.error} retry={reload} /> : null}
      {data ? (
        <VStack gap={4}>
          {issues.length ? (
            <HStack gap={3} wrap="wrap" align="center">
              {showArea ? (
                <>
                  <Muted>영역</Muted>
                  <Seg label="영역" items={[{ id: "all", label: "모두", n: issues.length }, ...areas.map((a) => ({ id: a, label: a, n: issues.filter((i) => i.area === a).length }))]} value={area} onChange={setArea} />
                </>
              ) : null}
              <Muted>상태</Muted>
              <Seg label="상태" items={stageItems} value={stage} onChange={setStage} />
            </HStack>
          ) : null}
          <VStack gap={4}>
            {sections.map(({ it, linked, planned }) => (
              <Panel
                key={it.key}
                title={
                  <HStack gap={2} align="center" wrap="wrap">
                    <Key>{it.key}</Key>
                    <Text>{it.title ?? it.name}</Text>
                  </HStack>
                }
                aside={
                  <>
                    <Tag tone={it.approvals.intent === "valid" ? "ops" : "line"} label={it.approvals.intent === "valid" ? "Intent 승인됨" : "Intent 승인 전"} />
                    {it.questions.open ? <Button label={`답할 질문 ${it.questions.open}`} size="sm" href={`/intents/${it.key}/questions`} /> : null}
                    <Muted>{`Unit ${it.units.length}개`}</Muted>
                    <TermHelp term="unit" />
                    <Button label="흐름" size="sm" icon={<Ico name="board" />} href={`/progress?view=flow&intent=${it.key}`} />
                  </>
                }
                flush
              >
                {linked.length ? <IssueTable rows={linked} gates={gates} sessions={sessions} showArea={showArea} onOpen={setOpen} /> : null}
                {planned.length ? (
                  <VStack gap={2} paddingBlock={4} paddingInline={2}>
                    {planned.map((u: Loose) => (
                      <HStack key={u.id} gap={2} align="center" wrap="wrap">
                        <Key>{u.id}</Key>
                        <Text>{u.title}</Text>
                        <Tag label={u.kind === "contract" ? "계약" : "이슈 아직 없음"} />
                        {u.dependsOn.length ? <Muted>{`먼저 끝낼 Unit ${u.dependsOn.join(", ")}`}</Muted> : null}
                      </HStack>
                    ))}
                  </VStack>
                ) : null}
              </Panel>
            ))}
            {loose.length ? (
              <Panel title={hasIntents ? "Intent 에 묶이지 않은 이슈" : "이슈"} aside={<Muted>{`${loose.length}개`}</Muted>} flush>
                <IssueTable rows={loose} gates={gates} sessions={sessions} showArea={showArea} onOpen={setOpen} />
              </Panel>
            ) : null}
            {!shown ? (
              <Empty
                title={issues.length || intents.length ? "조건에 맞는 이슈가 없습니다" : "이슈가 아직 없습니다"}
                text={issues.length || intents.length ? "상태 거름을 '모두'로 돌리면 다 보입니다." : "새 요구사항을 접수하면 여기 이슈가 나옵니다."}
                actions={issues.length || intents.length ? <Button label="모두 보기" size="sm" onClick={() => { setArea("all"); setStage("all"); }} /> : <Link href="/intake">새 요구사항</Link>}
              />
            ) : null}
          </VStack>
        </VStack>
      ) : null}
      <Drawer isOpen={open !== null} onOpenChange={(o) => !o && setOpen(null)} label={open ? `${open} 상세` : "이슈 상세"} width={680}>
        {open ? <IssueDetail issueKey={open} variant="drawer" tab={null} onClose={() => setOpen(null)} /> : null}
      </Drawer>
    </Page>
  );
}
