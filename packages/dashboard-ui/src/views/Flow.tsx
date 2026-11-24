// S12 진행 · 흐름. Unit 의존을 캔버스(React Flow, 이 화면을 열 때만 받는 조각)로 보고 변경 제안을 남긴다. 제안은 승인이 아니고 units.json 을 바꾸지 않는다(DB-R29).
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { lazy, Suspense, useMemo, useState } from "react";
import { del, errorText, get, post } from "../lib/api";
import { clock, dayLabel, GATE_KO, STEP_KO, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { buildChange, describeChange } from "../lib/proposal";
import { navigate } from "../lib/router";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { LineChart } from "../ui/charts";
import { CommandBox, Empty, ErrorBlock, Ico, Key, Loading, Muted, Notice, Panel, Tag, useNotify } from "../ui/common";
import { useDispatch } from "../ui/Dispatch";
import { Page } from "../ui/Page";
import { ViewSwitch } from "./Progress";

const FlowCanvas = lazy(() => import("@flow-view/FlowView").then((m) => ({ default: m.FlowView })));

const LABELS = {
  canvas: "Unit 의존 흐름",
  controls: "확대 · 축소 · 맞춤",
  minimap: "전체 미니맵",
  contract: "계약",
  contractTag: "계약",
  noSession: "세션 없음",
  bolt: "Bolt",
  estimated: "추정",
  steps: STEP_KO,
  state: { done: "지남", active: "진행 중", todo: "아직" },
  flags: { critical: "CRITICAL", high: "HIGH", verify: "검증" },
  area: "영역",
};

const OPS = [
  { value: "add-dep", label: "의존 더하기" },
  { value: "remove-dep", label: "의존 빼기" },
  { value: "split", label: "나누기" },
  { value: "merge", label: "합치기" },
  { value: "order", label: "순서" },
];

export default function Flow({ route }: { route: Route }) {
  const intentsLoad = useLoad<[Loose]>(() => [get("/intents")], []);
  const intents: Loose[] = intentsLoad.state.status === "ready" ? intentsLoad.state.data[0].intents : [];
  const key: string | undefined = route.query.intent && intents.some((i) => i.key === route.query.intent) ? route.query.intent : intents[0]?.key;
  const subtitle = "Intent → Unit 의존 흐름 · 자리는 units.json 의 dependsOn 에서 계산";
  const crumbs = [{ label: "작업" }, { label: "진행", path: "/progress" }, { label: "흐름" }];

  if (intentsLoad.state.status === "loading") return <Page title="진행" sub={subtitle} crumbs={crumbs} tools={<ViewSwitch active="flow" />}><Loading rows={6} /></Page>;
  if (intentsLoad.state.status === "error") return <Page title="진행" sub={subtitle} crumbs={crumbs}><ErrorBlock error={intentsLoad.state.error} retry={intentsLoad.reload} /></Page>;
  if (!key) return <Page title="진행" sub={subtitle} crumbs={crumbs} tools={<ViewSwitch active="flow" />}><Empty title="Intent 가 없습니다" text="새 요구사항을 접수하면 Intent 와 Unit 이 생기고 흐름이 그려집니다." actions={<Link href="/intake">새 요구사항</Link>} /></Page>;
  return <FlowBody key={key} intentKey={key} intents={intents} route={route} subtitle={subtitle} crumbs={crumbs} />;
}

function FlowBody({ intentKey: key, intents, route, subtitle, crumbs }: { intentKey: string; intents: Loose[]; route: Route; subtitle: string; crumbs: Array<{ label: string; path?: string }> }) {
  const app = useAppState();
  const notify = useNotify();
  const dispatch = useDispatch();
  const readOnly = Boolean(app.session?.readOnly);
  const { state, reload } = useLoad<[Loose, Loose, Loose, Loose]>(() => [get("/flow", { query: { intent: key } }), get(`/intents/${encodeURIComponent(key)}/burn`, { query: { days: "14" } }), get(`/intents/${encodeURIComponent(key)}`), get("/overview")], [key]);
  const [selected, setSelected] = useState<string | null>(route.query.sel ?? null);

  const tools = <ViewSwitch active="flow" intent={key} />;
  if (state.status === "loading") return <Page title="진행" sub={subtitle} crumbs={crumbs} tools={tools}><Loading rows={6} /></Page>;
  if (state.status === "error") return <Page title="진행" sub={subtitle} crumbs={crumbs} tools={tools}><ErrorBlock error={state.error} retry={reload} /></Page>;
  const [flow, burn, intent, over] = state.data;

  const select = (id: string | null): void => {
    setSelected(id);
    const url = new URL(location.href);
    if (id) url.searchParams.set("sel", id);
    else url.searchParams.delete("sel");
    history.replaceState(null, "", url.pathname + url.search);
  };
  const node = selected ? (flow.nodes as Loose[]).find((n) => n.id === selected) : null;
  const todo = ((over.todo ?? []) as Loose[]).filter((t) => (selected ? node?.data.issue === t.target : (flow.nodes as Loose[]).some((n) => n.data.issue === t.target)));
  const planned = (intent.units as Loose[]).filter((u) => u.planned);

  return (
    <Page
      title="진행"
      sub={subtitle}
      crumbs={crumbs}
      tools={
        <>
          <Selector label="Intent 고르기" isLabelHidden size="sm" value={key} onChange={(v) => v && navigate(`/progress?view=flow&intent=${v}`)} options={intents.map((i) => ({ value: i.key as string, label: `${i.key} ${i.title ?? i.name}` }))} />
          {tools}
        </>
      }
    >
      <VStack gap={5}>
        <FlowLayout
          left={
            <VStack gap={4}>
              <Panel title="Unit 의존 흐름" aside={<Muted size="xsm">{`${clock(flow.readAt)}에 읽음`}</Muted>} flush>
                <div className="hk-flow-canvas">
                  <Suspense fallback={<VStack padding={4}><Loading rows={4} /></VStack>}>
                    <FlowCanvas data={flow} selectedId={selected} labels={LABELS} onSelect={select} />
                  </Suspense>
                </div>
                <VStack gap={1} padding={3}>
                  <Muted size="xsm">{`단계 ${Object.values(STEP_KO).join(" · ")} — 속 찬 마름모 = 지난 단계 · 속 빈 굵은 테두리 = 진행 중 · 옅은 테두리 = 아직 · 실선 = 의존(앞 → 뒤) · 점선 = 계약`}</Muted>
                </VStack>
              </Panel>
              <Collapsible defaultIsOpen={false} trigger={<Text weight="semibold">표로 보기(같은 데이터)</Text>}>
                <Table
                  data={planned}
                  idKey="id"
                  density="compact"
                  columns={[
                    { key: "id", header: "Unit", renderCell: (u: Loose) => <Button label={u.id} size="sm" variant={selected === u.id ? "primary" : "ghost"} onClick={() => select(u.id)} /> },
                    { key: "title", header: "제목" },
                    { key: "kind", header: "종류", renderCell: (u: Loose) => <Text>{u.kind === "contract" ? "계약" : "기능"}</Text> },
                    { key: "issue", header: "이슈", renderCell: (u: Loose) => (u.issue ? <Link href={`/issues/${u.issue}`}>{u.issue}</Link> : <Text>—</Text>) },
                    {
                      key: "step",
                      header: "단계",
                      renderCell: (u: Loose) => {
                        const n = (flow.nodes as Loose[]).find((x) => x.id === u.id);
                        const steps: string[] = n?.data.steps ?? [];
                        const active = steps.find((s) => s.endsWith(":active"));
                        const done = steps.filter((s) => s.endsWith(":done"));
                        const sid = (active ?? done[done.length - 1] ?? "").split(":")[0] as string;
                        return <Text>{sid ? `${STEP_KO[sid] ?? sid}${active ? " 진행 중" : " 지남"}` : "-"}</Text>;
                      },
                    },
                    { key: "dep", header: "의존", renderCell: (u: Loose) => <Text>{(u.dependsOn as string[]).join(", ") || "-"}</Text> },
                  ]}
                />
              </Collapsible>
            </VStack>
          }
          right={
            <>
              <Panel title={intent.title ?? intent.name}>
                <HStack gap={2} wrap="wrap" align="center">
                  <Key>{intent.key}</Key>
                  <Tag tone={intent.approvals.intent === "valid" ? "ops" : "gate"} label={`intent ${intent.approvals.intent === "valid" ? "승인됨" : "승인 전"}`} />
                  <Tag tone={intent.approvals.plans === "valid" ? "ops" : "line"} label={`기획물 ${intent.approvals.plans === "valid" ? "승인됨" : "승인 전"}`} />
                </HStack>
                <Muted>{`Unit ${intent.units.length}${flow.intent?.approved ? ` · ${String(flow.intent.approved.at).slice(0, 10)} ${flow.intent.approved.by} 승인` : ""}`}</Muted>
                {intent.questions.open ? <Button label={`열린 질문 ${intent.questions.open}`} size="sm" icon={<Ico name="question" />} href={`/intents/${intent.key}/questions`} /> : null}
                {node ? (
                  <VStack gap={2}>
                    <Text weight="semibold">{`${node.id} ${node.data.title ?? ""}`}</Text>
                    <HStack gap={2} wrap="wrap">
                      {node.data.issue ? <Button label="이슈 열기" size="sm" href={`/issues/${node.data.issue}`} /> : <Muted>이슈 아직 없음</Muted>}
                      <Button label="고름 풀기(Esc)" size="sm" variant="ghost" onClick={() => select(null)} />
                    </HStack>
                  </VStack>
                ) : (
                  <Muted>Unit 을 고르면(Tab · Enter) 그 Unit 의 할 일과 변경 제안을 씁니다.</Muted>
                )}
              </Panel>
              <Panel title="처리할 일" aside={<Muted>{String(todo.length)}</Muted>} flush>
                {todo.length ? (
                  <List hasDividers>
                    {todo.map((t, i) => (
                      <ListItem key={`${t.target}${i}`} label={t.title} description={t.reason} href={t.link} />
                    ))}
                  </List>
                ) : (
                  <VStack padding={4}><Muted>이 Intent 에 처리할 일이 없습니다.</Muted></VStack>
                )}
              </Panel>
              <Panel title="남은 일" aside={<Muted size="xsm">{`Bolt ${burn.now.remaining} 남음 · 끝난 Unit ${burn.now.units.done}/${burn.now.units.total}`}</Muted>}>
                <BurnChart burn={burn} />
              </Panel>
              <Panel title="의존 순서" flush>
                <List hasDividers>
                  {planned.map((u) => (
                    <ListItem key={u.id} label={<HStack gap={2}><Key>{u.id}</Key><Text>{u.title}</Text></HStack>} description={u.dependsOn.length ? `${(u.dependsOn as string[]).join(", ")} 뒤` : "먼저 시작할 수 있습니다"} />
                  ))}
                </List>
              </Panel>
              <ProposalPanel flow={flow} intentKey={key} planned={planned} selected={selected} readOnly={readOnly} reload={reload} notify={notify} dispatch={dispatch} />
            </>
          }
        />
      </VStack>
    </Page>
  );
}

function FlowLayout({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <HStack gap={5} align="start" wrap="wrap">
      <VStack gap={4} className="hk-flow-main">
        {left}
      </VStack>
      <VStack gap={4} className="hk-flow-side">
        {right}
      </VStack>
    </HStack>
  );
}

function BurnChart({ burn }: { burn: Loose }) {
  const series = burn.series as Loose[];
  const labels = series.map((s) => dayLabel(s.date).short);
  const last = series[series.length - 1] as Loose;
  const summary = `남은 Bolt ${last.remaining}개(전체 ${last.total}, 끝 ${last.done}). ${series.length}일 추이: ${series.map((s) => `${dayLabel(s.date).short} ${s.remaining}`).join(", ")}`;
  const first = series[0] as Loose;
  const ideal = series.map((_, i) => Math.round((first.remaining * (series.length - 1 - i)) / Math.max(1, series.length - 1)));
  return (
    <VStack gap={2}>
      <LineChart labels={labels} series={[{ name: "남은 Bolt", kind: "main", values: series.map((s) => s.remaining as number) }, { name: "이상선", kind: "ref", values: ideal }]} step summary={summary} readout={`남은 Bolt ${last.remaining}개 · 전체 ${last.total} · 끝 ${last.done}`} height={150} fmt={(v) => `${v}개`} />
      {burn.estimated ? <Muted size="xsm">tasks 가 없는 Unit 은 units.json 의 스토리 수로 센 추정 Bolt 다.</Muted> : null}
      <Collapsible defaultIsOpen={false} trigger={<Text size="sm" weight="semibold">표로 보기</Text>}>
        <Table data={series} idKey="date" density="compact" columns={[{ key: "date", header: "날짜", renderCell: (s: Loose) => <Text>{dayLabel(s.date).text}</Text> }, { key: "remaining", header: "남음", align: "end" }, { key: "done", header: "끝/전체", align: "end", renderCell: (s: Loose) => <Text>{`${s.done}/${s.total}`}</Text> }]} />
      </Collapsible>
    </VStack>
  );
}

function ProposalPanel({ flow, intentKey, planned, selected, readOnly, reload, notify, dispatch }: { flow: Loose; intentKey: string; planned: Loose[]; selected: string | null; readOnly: boolean; reload: () => void; notify: (t: string) => void; dispatch: ReturnType<typeof useDispatch> }) {
  const [draft, setDraft] = useState<Loose[]>(() => ((flow.proposal?.changes ?? []) as Loose[]).map((c) => ({ ...c })));
  const [op, setOp] = useState("add-dep");
  const [unit, setUnit] = useState(selected && planned.some((u) => u.id === selected) ? selected : (planned[0]?.id ?? ""));
  const [other, setOther] = useState(planned[0]?.id ?? "");
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [out, setOut] = useState<{ kind: "info" | "ok" | "err"; title: string; text?: string; path?: string; conflict?: boolean } | null>(null);
  const [gatesOpen, setGatesOpen] = useState(false);
  const opts = useMemo(() => planned.map((u) => ({ value: u.id as string, label: `${u.id} ${u.title}` })), [planned]);

  async function save(): Promise<void> {
    setOut({ kind: "info", title: "저장하는 중…" });
    const r = await post("/units/proposals", { intent: intentKey, baseSha256: flow.unitsSha256, changes: draft });
    if (!r.ok) {
      const e = r.error;
      const hint = e.code === "cycle" ? "의존이 고리를 만듭니다" : e.code === "conflict" ? "units.json 이 바뀌었습니다. 다시 읽고 제안합니다" : e.code === "contract_merge" ? "계약 Unit 은 합치지 않습니다" : e.code === "unknown_unit" ? "없는 Unit 입니다" : "";
      setOut({ kind: "err", title: `${e.code}: `, text: `${errorText(e)}${hint ? ` (${hint})` : ""}`, conflict: e.code === "conflict" });
      return;
    }
    notify("변경 제안을 저장했습니다(승인이 아닙니다)");
    setOut({ kind: "ok", title: "제안을 저장했습니다. ", text: "units.json 은 그대로이고 세션에는 아무것도 보내지 않았습니다. 반영은 intent 게이트 승인 때 합니다. 설계 세션에 알리려면 '세션에 요청'을 누릅니다.", path: r.data.path });
  }
  async function discard(): Promise<void> {
    const r = await del(`/units/proposals/${encodeURIComponent(intentKey)}`);
    if (!r.ok) {
      setOut({ kind: "err", title: errorText(r.error) });
      return;
    }
    notify("제안을 버렸습니다");
    reload();
  }

  return (
    <Panel title="변경 제안" aside={flow.proposal ? <Tag tone="build" label="저장된 제안 있음" /> : <Tag label="없음" />}>
      <Muted>제안은 승인이 아닙니다. units.json 은 바뀌지 않고, intent 게이트 승인 때만 반영됩니다. 팀 흐름 틀(flow.gates)은 여기서 바꾸지 않습니다.</Muted>
      {flow.proposal ? <Notice kind="warn" title={`저장된 제안 ${flow.proposal.changes?.length ?? 0}건 · ${flow.proposal.createdBy ?? ""} · ${clock(flow.proposal.createdAt)}`}>다시 저장하면 바뀝니다.</Notice> : null}
      {readOnly ? (
        <Notice kind="warn" title="읽기 전용. ">제안을 저장하지 않습니다. 사람이 자기 터미널에서 연 서버나 <code>{`npx knots-sync units propose ${intentKey} …`}</code> 로 합니다.</Notice>
      ) : (
        <VStack gap={3}>
          <Selector label="종류" value={op} onChange={(v) => v && setOp(v)} options={OPS} />
          <Selector label="Unit" value={unit} onChange={(v) => v && setUnit(v)} options={opts} />
          <Selector label="상대 Unit(의존 · 합치기)" value={other} onChange={(v) => v && setOther(v)} options={opts} />
          <TextArea label="나누기 · 순서 입력" value={text} onChange={setText} rows={2} placeholder="나누기: 새 Unit 제목을 한 줄에 하나(2개 이상) · 순서: Unit id 를 쉼표로" />
          <TextInput label="이유" value={reason} onChange={setReason} placeholder="이유 한 줄" />
          <HStack gap={2} wrap="wrap">
            <Button label="목록에 더하기" icon={<Ico name="plus" />} onClick={() => { setDraft((d) => [...d, buildChange(op, unit, other, text, reason)]); setReason(""); }} />
            <Button label="제안 저장" variant="primary" icon={<Ico name="save" />} onClick={() => void save()} />
            {flow.proposal ? <Button label="제안 버리기" variant="destructive" icon={<Ico name="trash" />} onClick={() => void discard()} /> : null}
          </HStack>
        </VStack>
      )}
      <VStack gap={1} role="list" aria-label="제안 목록">
        {draft.length ? (
          draft.map((c, i) => (
            <HStack key={`${describeChange(c)}${i}`} gap={2} align="center" wrap="wrap" role="listitem">
              <Text type="code">{describeChange(c)}</Text>
              {c.reason ? <Muted size="xsm">{`— ${c.reason}`}</Muted> : null}
              <Button label="빼기" size="sm" variant="ghost" isDisabled={readOnly} onClick={() => setDraft((d) => d.filter((_, k) => k !== i))} />
            </HStack>
          ))
        ) : (
          <Muted>아직 없습니다</Muted>
        )}
      </VStack>
      <VStack gap={2} aria-live="polite">
        {out ? (
          <Notice kind={out.kind} title={out.title} {...(out.conflict ? { action: <Button label="다시 읽기" size="sm" onClick={reload} /> } : {})}>
            {out.text}
          </Notice>
        ) : null}
        {out?.path ? <Button label="세션에 요청" variant="primary" icon={<Ico name="send" />} isDisabled={readOnly} onClick={() => dispatch({ paths: [out.path as string], kind: "custom", text: `${intentKey} Unit 변경 제안을 저장했습니다`, title: "설계 세션에 요청" })} /> : null}
      </VStack>
      <Button label="흐름 틀 보기" size="sm" variant="ghost" onClick={() => setGatesOpen(true)} />
      <GatesDialog isOpen={gatesOpen} onClose={() => setGatesOpen(false)} />
    </Panel>
  );
}

function GatesDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { state } = useLoad<[Loose]>(() => [isOpen ? get("/flow/gates") : Promise.resolve({ ok: true as const, status: 200, data: null, meta: {} })], [isOpen], { tolerate: [] });
  const g = state.status === "ready" ? state.data[0] : null;
  return (
    <Dialog isOpen={isOpen} onOpenChange={(o) => !o && onClose()} width={520}>
      <VStack gap={3} padding={5}>
        <Heading level={2}>흐름 틀</Heading>
        {state.status === "error" ? <Muted>{errorText(state.error)}</Muted> : null}
        {g ? (
          <>
            <HStack gap={1} wrap="wrap" align="center">
              <Text>지금 게이트:</Text>
              {(g.gates as string[]).map((x) => (
                <Tag key={x} tone={(g.floor as string[]).includes(x) ? "design" : "line"} label={GATE_KO[x] ?? x} />
              ))}
            </HStack>
            <Muted>바닥(requirements · design · mr · done)은 줄일 수 없습니다. 팀 설정이라 터미널에서 바꾸고 MR 로 올립니다.</Muted>
            <CommandBox cmd={g.command} />
          </>
        ) : null}
        <HStack justify="end">
          <Button label="닫기" onClick={onClose} />
        </HStack>
      </VStack>
    </Dialog>
  );
}
