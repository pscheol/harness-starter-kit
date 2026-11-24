// S02 진행 보드: Intent → Unit → 이슈, 단계 · 맡은 하네스 · 세션. area · 단계로 거른다. 이슈를 누르면 오른쪽 시트로 상세(S03)가 열리고, 전체 화면 주소도 그대로 있다.
import { Button } from "@astryxdesign/core/Button";
import { Drawer } from "@astryxdesign/core/Drawer";
import { Link } from "@astryxdesign/core/Link";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useMemo, useState } from "react";
import { get } from "../lib/api";
import { GATE_KO, railSpec, stageText, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { Empty, ErrorBlock, HarnessBadge, Ico, Key, Loading, Muted, Panel, Seg, Tag } from "../ui/common";
import { GateRail } from "../ui/GateRail";
import { Page } from "../ui/Page";
import { IssueDetail } from "./IssueDetail";

export const STAGE_FILTERS: Array<{ id: string; label: string; test: (i: Loose) => boolean }> = [
  { id: "all", label: "모두", test: () => true },
  { id: "wait", label: "승인 대기", test: (i) => Boolean(i.waitingOn) },
  { id: "blocked", label: "막힘", test: (i) => (i.review?.open.CRITICAL ?? 0) + (i.review?.open.HIGH ?? 0) > 0 || ["failed", "incomplete"].includes(i.verify?.status ?? "") },
  { id: "doing", label: "진행 중", test: (i) => i.stage !== "completed" && !i.waitingOn },
  { id: "done", label: "완료", test: (i) => i.stage === "completed" },
];

/** 보드 · 흐름 전환 */
export function ViewSwitch({ active, intent }: { active: "board" | "flow"; intent?: string | null | undefined }) {
  const q = intent ? `&intent=${encodeURIComponent(intent)}` : "";
  return (
    <HStack gap={1}>
      <Button label="보드" size="sm" variant={active === "board" ? "primary" : "secondary"} href="/progress" />
      <Button label="흐름" size="sm" variant={active === "flow" ? "primary" : "secondary"} href={`/progress?view=flow${q}`} />
    </HStack>
  );
}

function statusTag(i: Loose) {
  if (i.waitingOn) return <Tag tone="gate" icon="clock" label={`${GATE_KO[i.waitingOn.gate] ?? i.waitingOn.gate} 승인 대기`} />;
  return <Tag tone={i.stage === "completed" ? "ops" : i.stage === "design" || i.stage === "requirements" ? "design" : "build"} label={stageText(i)} />;
}

function flagsOf(i: Loose): string[] {
  const f: string[] = [];
  if (i.review?.open.CRITICAL) f.push(`CRITICAL ${i.review.open.CRITICAL}`);
  if (i.review?.open.HIGH) f.push(`HIGH ${i.review.open.HIGH}`);
  if (i.verify && ["failed", "incomplete"].includes(i.verify.status ?? "")) f.push(`검증 ${i.verify.status}`);
  return f;
}

function IssueTable({ rows, gates, sessions, onOpen }: { rows: Loose[]; gates: string[]; sessions: Loose[]; onOpen: (key: string) => void }) {
  return (
    <Table
      data={rows}
      idKey="key"
      density="compact"
      hasHover
      columns={[
        { key: "key", header: "이슈", renderCell: (i: Loose) => <Button label={i.key} variant="ghost" size="sm" onClick={() => onOpen(i.key)} /> },
        {
          key: "title",
          header: "제목 · area",
          renderCell: (i: Loose) => (
            <VStack gap={0}>
              <Text weight="semibold">{i.title ?? i.name}</Text>
              <Muted size="xsm">{i.area ?? "area 없음"}</Muted>
            </VStack>
          ),
        },
        {
          key: "status",
          header: "상태",
          renderCell: (i: Loose) => (
            <HStack gap={1} wrap="wrap">
              {statusTag(i)}
              {flagsOf(i).map((f) => (
                <Tag key={f} tone="gate" icon="alert" label={f} />
              ))}
            </HStack>
          ),
        },
        { key: "rail", header: "게이트", renderCell: (i: Loose) => <GateRail spec={railSpec(gates, i)} /> },
        {
          key: "bolt",
          header: "Bolt",
          renderCell: (i: Loose) => {
            const b = i.docs.tasks?.bolts;
            return b && b.total ? (
              <VStack gap={1}>
                <ProgressBar label={`Bolt ${b.done}/${b.total}`} isLabelHidden value={b.done} max={b.total} />
                <Muted size="xsm">{`${b.done}/${b.total}`}</Muted>
              </VStack>
            ) : (
              <Muted size="xsm">-</Muted>
            );
          },
        },
        {
          key: "sessions",
          header: "세션",
          renderCell: (i: Loose) => {
            const sess = sessions.filter((s) => i.sessions.includes(s.id));
            return sess.length ? (
              <VStack gap={1}>
                {sess.map((s) => (
                  <HStack key={s.id} gap={1} align="center">
                    <HarnessBadge name={s.harness} />
                    <Muted size="xsm">{s.name ?? String(s.id).slice(0, 8)}</Muted>
                  </HStack>
                ))}
              </VStack>
            ) : (
              <Muted size="xsm">세션 없음</Muted>
            );
          },
        },
      ]}
      emptyState={false}
    />
  );
}

export default function Progress({ route }: { route: Route }) {
  const app = useAppState();
  const only = route.name === "intent" ? (route.params.key ?? null) : null;
  const gates: string[] = app.session?.flow.gates ?? [];
  const { state, reload } = useLoad<[Loose, Loose, Loose]>(() => [get("/intents"), get("/issues"), get("/sessions")], []);
  const [area, setArea] = useState("all");
  const [stage, setStage] = useState("all");
  const [open, setOpen] = useState<string | null>(null);

  const data = state.status === "ready" ? state.data : null;
  const issues: Loose[] = data?.[1].issues ?? [];
  const sessions: Loose[] = data?.[2].sessions ?? [];
  const intents: Loose[] = (data?.[0].intents ?? []).filter((i: Loose) => !only || i.key === only);
  const areas = useMemo(() => [...new Set(issues.map((i) => i.area).filter(Boolean))].sort() as string[], [issues]);
  const test = STAGE_FILTERS.find((f) => f.id === stage)?.test ?? (() => true);
  const pass = (i: Loose): boolean => (area === "all" || i.area === area) && test(i);

  const sections = intents.map((it) => {
    const rows = (it.units as Loose[]).filter((u) => u.planned).map((u) => ({ u, i: issues.find((x) => x.key === u.issue) })).filter(({ i }) => (i ? pass(i) : area === "all" && stage === "all"));
    return { it, linked: rows.filter(({ i }) => i).map(({ i }) => i as Loose), planned: rows.filter(({ i }) => !i).map(({ u }) => u) };
  }).filter((s) => s.linked.length || s.planned.length);
  const inIntent = new Set(intents.flatMap((it) => (it.units as Loose[]).map((u) => u.issue).filter(Boolean)));
  const loose = only ? [] : issues.filter((i) => !inIntent.has(i.key) && pass(i));
  const shown = sections.reduce((n, s) => n + s.linked.length + s.planned.length, 0) + loose.length;

  return (
    <Page title={only ? `${only} 진행` : "진행"} sub="Intent → Unit → 이슈 · 단계는 board.sh 와 같은 원본입니다" crumbs={[{ label: "작업" }, { label: "진행" }]} tools={<ViewSwitch active="board" intent={only} />}>
      {state.status === "loading" ? <Loading rows={6} /> : null}
      {state.status === "error" ? <ErrorBlock error={state.error} retry={reload} /> : null}
      {data ? (
        <VStack gap={4}>
          <HStack gap={3} wrap="wrap" align="center">
            <Muted>영역</Muted>
            <Seg label="영역" items={[{ id: "all", label: "모두", n: issues.length }, ...areas.map((a) => ({ id: a, label: a, n: issues.filter((i) => i.area === a).length }))]} value={area} onChange={setArea} />
            <Muted>상태</Muted>
            <Seg label="상태" items={STAGE_FILTERS.map((f) => ({ id: f.id, label: f.label, n: issues.filter(f.test).length }))} value={stage} onChange={setStage} />
          </HStack>
          <VStack gap={4} aria-live="polite">
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
                    <Tag tone={it.approvals.intent === "valid" ? "ops" : "gate"} label={`Intent ${it.approvals.intent === "valid" ? "승인됨" : "승인 전"}`} />
                    {it.questions.open ? <Button label={`질문 ${it.questions.open}`} size="sm" href={`/intents/${it.key}/questions`} /> : null}
                    <Muted>{`Unit ${it.units.length}`}</Muted>
                    <Button label="흐름" size="sm" icon={<Ico name="board" />} href={`/progress?view=flow&intent=${it.key}`} />
                  </>
                }
                flush
              >
                {linked.length ? <IssueTable rows={linked} gates={gates} sessions={sessions} onOpen={setOpen} /> : null}
                {planned.length ? (
                  <VStack gap={1} padding={4}>
                    {planned.map((u: Loose) => (
                      <HStack key={u.id} gap={2} align="center" wrap="wrap">
                        <Key>{u.id}</Key>
                        <Text>{u.title}</Text>
                        <Tag label={u.kind === "contract" ? "계약" : "이슈 아직 없음"} />
                        {u.dependsOn.length ? <Muted size="xsm">{`의존 ${u.dependsOn.join(", ")}`}</Muted> : null}
                      </HStack>
                    ))}
                  </VStack>
                ) : null}
              </Panel>
            ))}
            {loose.length ? (
              <Panel title="Intent 폴더에 연결되지 않은 이슈" aside={<Muted>{`${loose.length}개`}</Muted>} flush>
                <IssueTable rows={loose} gates={gates} sessions={sessions} onOpen={setOpen} />
              </Panel>
            ) : null}
            {!shown ? <Empty title={issues.length || intents.length ? "조건에 맞는 이슈가 없습니다" : "이슈가 아직 없습니다"} text={issues.length || intents.length ? "영역 · 상태 거름을 '모두'로 돌립니다." : "새 요구사항을 접수하거나 이슈 폴더(.agents/docs/issues/)를 만들면 여기 나옵니다."} actions={<Link href="/intake">새 요구사항</Link>} /> : null}
          </VStack>
        </VStack>
      ) : null}
      <Drawer isOpen={open !== null} onOpenChange={(o) => !o && setOpen(null)} label={open ? `${open} 상세` : "이슈 상세"} width={680}>
        {open ? <IssueDetail issueKey={open} variant="drawer" tab={null} onClose={() => setOpen(null)} /> : null}
      </Drawer>
    </Page>
  );
}
