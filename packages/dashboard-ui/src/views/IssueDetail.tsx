// S03 이슈 상세 · 문서. 문서 보기 · 고치기 · 저장(충돌 · 점유 처리) · 승인 · 리뷰 판단. 저장만으로 세션에 아무것도 보내지 않는다.
// 전체 화면(/issues/<키>)과 진행 보드의 오른쪽 시트가 같은 이 컴포넌트를 쓴다.
// 승인 칸은 사람 승인을 기다리는 게이트에만 띄운다. 끝난 이슈 · 이미 지난 게이트 · 읽기 전용 화면에는 띄우지 않는다(사용자 결정 2026-11-26).
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { TextArea } from "@astryxdesign/core/TextArea";
import { useCallback, useEffect, useState } from "react";
import { type ApiResult, errorText, get, put } from "../lib/api";
import { GATE_KO, ROLE_KO } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { Code, Details, Empty, ErrorBlock, HarnessBadge, Ico, Loading, Muted, Notice, Panel, ReadOnlyLine, Tag, useNotify } from "../ui/common";
import { useDispatch } from "../ui/Dispatch";
import { docState, GateRail, issueRail, issueStatus, issueTitle, verifyText } from "../ui/GateRail";
import { LiveStatus, Page, StatStrip, TwoCol } from "../ui/Page";
import { ServerHtml } from "../ui/ServerHtml";
import { ApprovePanel, ReviewTable } from "./Approve";

const DOC_TABS = ["requirements", "design", "tasks"];
const TAB_KO: Record<string, string> = { requirements: "요구사항", design: "설계", tasks: "작업 목록", review: "리뷰", approvals: "승인 기록" };

export interface IssueDetailProps {
  issueKey: string;
  variant: "page" | "drawer";
  /** 주소에서 온 탭(requirements · design · tasks · review · approve) */
  tab: string | null;
  onClose?: () => void;
}

export function initialTab(issue: Loose, routeTab: string | null): string {
  const waitingDoc = issue.waitingOn && DOC_TABS.includes(issue.waitingOn.gate) ? (issue.waitingOn.gate as string) : "requirements";
  if (routeTab === "approve") return waitingDoc;
  return routeTab ?? waitingDoc;
}

/**
 * 사람 승인을 기다리는 게이트(없으면 null). 끝난 이슈 · 게이트 판정이 없는 이슈(예전 배치) · 이미 지난 게이트는 null 이다.
 * 승인 뒤 바뀐 문서(다시 승인)도 여기에 든다.
 */
export function pendingGate(issue: Loose): string | null {
  if (issue.stage === "completed" || !Array.isArray(issue.gates) || !issue.gates.length) return null;
  const passed = (g: string): boolean => Boolean((issue.gates as Loose[]).find((r) => r.gate === g)?.passed);
  if (issue.waitingOn && !passed(issue.waitingOn.gate)) return issue.waitingOn.gate as string;
  return DOC_TABS.find((g) => g !== "tasks" && issue.docs[g]?.approval === "stale" && !passed(g)) ?? null;
}

/** 문서 파일 자리. 예전 배치(한 폴더에 여러 이슈)는 서버가 경로를 주지 않아 알려진 두 배치를 차례로 찾는다. */
export function docPaths(issue: Loose, name: string): string[] {
  const dir = issue.dir as string;
  const key = issue.key as string;
  if (!issue.legacy) return [`${dir}/${name}.md`];
  if (name === "tasks") {
    const st = (issue.docs.tasks?.state as string | undefined) ?? "active";
    return [`${dir}/issues/${key}/tasks.md`, `${dir}/issues/${key}/tasks/${st}.md`, `${dir}/tasks/${st}/${key}.md`, `${dir}/tasks/${key}.md`];
  }
  return [`${dir}/issues/${key}/${name}.md`, `${dir}/${name}/${key}.md`];
}

/** 후보 경로를 차례로 읽어 처음 있는 문서를 돌려준다. 모두 없으면 마지막 not_found 를 돌려준다. */
async function firstDoc(paths: string[]): Promise<ApiResult<Loose>> {
  let last: ApiResult<Loose> = { ok: false, status: 404, error: { code: "not_found", message: "문서가 없습니다" } };
  for (const path of paths) {
    const r = await get("/docs", { query: { path } });
    if (r.ok || r.error.code !== "not_found") return r;
    last = r;
  }
  return last;
}

function crumbsOf(key: string, intent?: string | null): Array<{ label: string; path?: string }> {
  return [{ label: "작업" }, { label: "진행", path: "/progress" }, ...(intent ? [{ label: intent, path: `/progress?view=flow&intent=${intent}` }] : []), { label: key }];
}

export function IssueDetail({ issueKey, variant, tab: routeTab, onClose }: IssueDetailProps) {
  const app = useAppState();
  const readOnly = Boolean(app.session?.readOnly);
  const [formOpen, setFormOpen] = useState(false);
  // 승인 칸이 보이는 동안은 바탕 값을 새로 읽지 않는다(적는 중에 바뀌지 않게)
  const load = useLoad<[Loose, Loose]>(() => [get(`/issues/${encodeURIComponent(issueKey)}`), get("/sessions")], [issueKey], { tolerate: [], live: !formOpen });
  const { state, reload } = load;
  const [tab, setTab] = useState<string | null>(null);
  useEffect(() => setTab(null), [issueKey]);
  const issue = state.status === "ready" ? (state.data[0] as Loose) : null;
  const hasForm = Boolean(issue && !readOnly && pendingGate(issue));
  useEffect(() => setFormOpen(hasForm), [hasForm]);

  if (state.status === "loading" || state.status === "error") {
    const inner = state.status === "loading" ? <Loading rows={6} /> : <ErrorBlock error={state.error} retry={reload} />;
    return variant === "page" ? (
      <Page title={issueKey} crumbs={crumbsOf(issueKey)}>
        {inner}
      </Page>
    ) : (
      <VStack padding={5}>{inner}</VStack>
    );
  }
  const it = state.data[0] as Loose;
  const sessions = ((state.data[1]?.sessions ?? []) as Loose[]).filter((x) => (it.sessions as string[]).includes(x.id));
  const current = tab ?? initialTab(it, routeTab);
  const title = issueTitle(it);
  const body = <Body issue={it} sessions={sessions} tab={current} setTab={setTab} variant={variant} reload={reload} gates={app.session?.flow.gates ?? []} readOnly={readOnly} />;
  if (variant === "page") {
    return (
      <Page title={title ? `${it.key} ${title}` : (it.key as string)} sub="문서를 읽고, 내 차례인 승인을 합니다." crumbs={crumbsOf(it.key as string, it.intent as string | null)} live={load}>
        {body}
      </Page>
    );
  }
  return (
    <VStack gap={4} padding={5}>
      <HStack justify="between" align="start" gap={3} wrap="wrap">
        <VStack gap={1}>
          {it.intent ? <Muted>{`${it.intent}${it.unit ? ` · ${it.unit}` : ""}`}</Muted> : null}
          <Heading level={2}>{it.key as string}</Heading>
          {title ? <Muted>{title}</Muted> : null}
          <LiveStatus at={load.at} every={load.every} stale={load.stale} />
        </VStack>
        <HStack gap={2}>
          <Button label="전체 화면" size="sm" icon={<Ico name="ext" />} href={`/issues/${it.key}`} />
          {onClose ? <Button label="닫기" size="sm" onClick={onClose} /> : null}
        </HStack>
      </HStack>
      {body}
    </VStack>
  );
}

function Summary({ issue, sessions, gates }: { issue: Loose; sessions: Loose[]; gates: string[] }) {
  const intent = issue.intent as string | null;
  const bolts = issue.docs.tasks?.bolts;
  const open = issue.review?.open ?? {};
  const st = issueStatus(issue);
  const spec = issueRail(gates, issue);
  const items: Array<{ label: string; value: string | number; unit?: string }> = [{ label: "지금 단계", value: st.label }];
  if (bolts?.total) items.push({ label: "남은 Bolt", value: bolts.total - bolts.done, unit: `/ ${bolts.total}` });
  if (issue.review) items.push({ label: "막는 리뷰 지적", value: (open.CRITICAL ?? 0) + (open.HIGH ?? 0), unit: "건" });
  if (issue.verify) items.push({ label: "마지막 검증", value: verifyText(issue.verify.status) });
  const checkout = issue.checkout as Loose | null;
  return (
    <VStack gap={3}>
      <HStack gap={2} align="center" wrap="wrap">
        <Tag tone={st.tone} {...(st.tone === "gate" ? { icon: "clock" as const } : {})} label={st.label} />
        {issue.area ? <Tag label={`영역 ${issue.area}`} /> : null}
        {intent ? <Link href={`/progress?view=flow&intent=${intent}`}>{`${intent}${issue.unit ? ` · ${issue.unit}` : ""}`}</Link> : null}
        {sessions.length ? (
          <HStack gap={2} align="center" wrap="wrap">
            <Muted>맡은 세션</Muted>
            {sessions.map((x) => (
              <HStack key={x.id} gap={1} align="center">
                <HarnessBadge name={x.harness} />
                <Muted>{[x.name, x.role && x.role !== "unknown" ? (ROLE_KO[x.role] ?? x.role) : null].filter(Boolean).join(" · ") || "이름 없는 세션"}</Muted>
              </HStack>
            ))}
          </HStack>
        ) : (
          <Muted>맡은 세션 없음</Muted>
        )}
      </HStack>
      {spec.length ? <GateRail spec={spec} labels /> : null}
      {items.length > 1 ? <StatStrip items={items} /> : null}
      <Details label="브랜치 · 폴더">
        <HStack gap={1} align="center" wrap="wrap">
          <Ico name="branch" size={14} />
          <Code>{issue.branch ?? "브랜치 없음"}</Code>
          <Muted>{checkout ? `${checkout.kind === "main" ? "메인 폴더" : "작업 공간"}${checkout.dirty ? " · 커밋 안 된 변경 있음" : ""}` : "체크아웃 안 됨(git 기록에서 읽습니다)"}</Muted>
        </HStack>
        <HStack gap={1} align="center" wrap="wrap">
          <Ico name="folder" size={14} />
          <Code>{issue.dir}</Code>
        </HStack>
      </Details>
    </VStack>
  );
}

interface BodyProps {
  issue: Loose;
  sessions: Loose[];
  tab: string;
  setTab: (t: string) => void;
  variant: "page" | "drawer";
  reload: () => void;
  gates: string[];
  readOnly: boolean;
}

function Body({ issue, sessions, tab, setTab, variant, reload, gates, readOnly }: BodyProps) {
  const [doc, setDoc] = useState<Loose | null>(null);
  const onDoc = useCallback((d: Loose | null) => setDoc(d), []);
  // 예전 배치에서 읽은 이슈는 리뷰 보고서 · 승인 기록 자리가 없다
  const tabs = [...DOC_TABS, ...(issue.legacy ? [] : ["review", "approvals"])];
  const shown = tabs.includes(tab) ? tab : "requirements";
  const main = (
    <VStack gap={4}>
      <Summary issue={issue} sessions={sessions} gates={gates} />
      <TabList value={shown} onChange={setTab} hasDivider aria-label="이슈 문서">
        {tabs.map((d) => {
          const st = DOC_TABS.includes(d) ? docState(d, issue.docs[d]) : null;
          return <Tab key={d} value={d} label={TAB_KO[d] ?? d} {...(DOC_TABS.includes(d) ? { endContent: <Muted>{st ? st.label : "없음"}</Muted> } : {})} />;
        })}
      </TabList>
      <Panelled issue={issue} tab={shown} onDoc={onDoc} reload={reload} readOnly={readOnly} />
    </VStack>
  );
  const side = <Side issue={issue} tab={shown} doc={doc} setTab={setTab} reload={reload} readOnly={readOnly} />;
  if (!pendingGate(issue)) return main;
  return variant === "page" ? (
    <TwoCol main={main} side={side} wide={1180} />
  ) : (
    <VStack gap={4}>
      {side}
      {main}
    </VStack>
  );
}

/** 곁 칸: 사람 승인을 기다리는 게이트가 있을 때만. 읽기 전용이면 한 줄 안내, 다른 문서를 보고 있으면 그 문서로 가는 단추. */
function Side({ issue, tab, doc, setTab, reload, readOnly }: { issue: Loose; tab: string; doc: Loose | null; setTab: (t: string) => void; reload: () => void; readOnly: boolean }) {
  const gate = pendingGate(issue);
  if (!gate) return null;
  const name = GATE_KO[gate] ?? gate;
  if (readOnly) {
    return (
      <Panel title={`${name} 승인 대기`}>
        <ReadOnlyLine />
        <Details label="터미널에서 승인하기">
          <Code>{`knots-sync approve ${issue.key} --gate ${gate}`}</Code>
        </Details>
      </Panel>
    );
  }
  if (DOC_TABS.includes(gate) && tab !== gate) {
    return (
      <Panel title={`${name} 승인 대기`}>
        <Muted>{`${name} 문서를 읽고 승인합니다.`}</Muted>
        <HStack>
          <Button label={`${name} 문서 열기`} variant="primary" size="sm" onClick={() => setTab(gate)} />
        </HStack>
      </Panel>
    );
  }
  return <ApprovePanel issue={issue} gate={gate} doc={tab === gate ? doc : null} onDone={reload} />;
}

function Panelled({ issue, tab, onDoc, reload, readOnly }: { issue: Loose; tab: string; onDoc: (d: Loose | null) => void; reload: () => void; readOnly: boolean }) {
  if (tab === "review") return <ReviewPanel issue={issue} reload={reload} onDoc={onDoc} readOnly={readOnly} />;
  if (tab === "approvals") return <ApprovalsPanel issue={issue} onDoc={onDoc} />;
  return <DocPanel key={tab} issue={issue} name={tab} onDoc={onDoc} reload={reload} />;
}

function ApprovalsPanel({ issue, onDoc }: { issue: Loose; onDoc: (d: Loose | null) => void }) {
  const load = useLoad<[Loose]>(() => [get("/docs", { query: { path: `${issue.dir}/approvals.md` } })], [issue.key], { tolerate: ["not_found"], live: true });
  const { state, reload } = load;
  useEffect(() => onDoc(null), [onDoc]);
  if (state.status === "loading") return <Loading rows={4} />;
  if (state.status === "error") return <ErrorBlock error={state.error} retry={reload} />;
  const d = state.data[0];
  if (!d) return <Empty title="아직 승인 기록이 없습니다" text="승인하면 누가 언제 무엇을 승인했는지 여기에 남습니다." />;
  return (
    <Panel title="승인 기록" flush>
      <VStack gap={3} paddingBlock={4} paddingInline={2}>
        <ServerHtml html={d.html} />
        <Details label="파일">
          <Code>{d.path}</Code>
        </Details>
      </VStack>
    </Panel>
  );
}

function ReviewPanel({ issue, reload, onDoc, readOnly }: { issue: Loose; reload: () => void; onDoc: (d: Loose | null) => void; readOnly: boolean }) {
  // 판단 칸(이유 · 단추)이 보이는 동안은 새로 읽지 않는다
  const [hasOpen, setHasOpen] = useState(false);
  const load = useLoad<[Loose]>(() => [get(`/reviews/${encodeURIComponent(issue.key)}`)], [issue.key], { tolerate: ["not_found"], live: readOnly || !hasOpen });
  const { state, reload: again } = load;
  useEffect(() => onDoc(null), [onDoc]);
  const openCount = state.status === "ready" ? ((state.data[0]?.findings ?? []) as Loose[]).filter((f) => f.state === "open").length : 0;
  useEffect(() => setHasOpen(openCount > 0), [openCount]);
  if (state.status === "loading") return <Loading rows={4} />;
  if (state.status === "error") return <ErrorBlock error={state.error} retry={again} />;
  const r = state.data[0];
  if (!r || !r.report) return <Empty title="리뷰 보고서가 아직 없습니다" text="리뷰 세션이 보고서를 쓰면 지적과 판단이 여기 나옵니다." />;
  const open = r.open ?? {};
  return (
    <VStack gap={3}>
      {r.stale ? <Notice kind="warn" title="리뷰 보고서가 오래됐습니다.">보고서를 쓴 뒤에 새 커밋이 생겼습니다. 리뷰를 다시 돌리면 지적이 바뀔 수 있습니다.</Notice> : null}
      <HStack gap={2} wrap="wrap">
        {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((sv) => (
          <Tag key={sv} tone={(sv === "CRITICAL" || sv === "HIGH") && (open[sv] ?? 0) > 0 ? "gate" : "line"} label={`${sv} ${open[sv] ?? 0}`} />
        ))}
      </HStack>
      <ReviewTable
        issue={issue}
        review={r}
        onDone={() => {
          again();
          reload();
        }}
      />
      <Details label="보고서 파일">
        <Code>{`${r.report}${r.head ? ` · ${String(r.head).slice(0, 7)}` : ""}`}</Code>
      </Details>
    </VStack>
  );
}

type SaveOut = { kind: "info" | "ok" | "warn" | "err"; title: string; text?: string; conflict?: Loose; lease?: boolean; saved?: Loose; code?: string };

function DocPanel({ issue, name, onDoc, reload }: { issue: Loose; name: string; onDoc: (d: Loose | null) => void; reload: () => void }) {
  const app = useAppState();
  const dispatch = useDispatch();
  const notify = useNotify();
  const paths = docPaths(issue, name);
  const [editing, setEditing] = useState(false);
  const load = useLoad<[Loose]>(() => [firstDoc(paths)], [paths.join("|")], { tolerate: ["not_found"], live: !editing });
  const { state, reload: again } = load;
  const [text, setText] = useState("");
  const [base, setBase] = useState("");
  const [force, setForce] = useState(false);
  const [out, setOut] = useState<SaveOut | null>(null);
  const d: Loose | null = state.status === "ready" ? state.data[0] : null;
  useEffect(() => onDoc(d), [d, onDoc]);
  const label = TAB_KO[name] ?? name;

  if (state.status === "loading") return <Loading rows={5} />;
  if (state.status === "error") return <ErrorBlock error={state.error} retry={again} />;
  if (!d) {
    const done = issue.stage === "completed";
    return <Empty title={`${label} 문서가 없습니다`} text={done ? "이 문서 없이 마친 이슈입니다." : "설계 · 구현 세션이 이 문서를 쓰면 여기 나옵니다. 이 화면은 새 문서를 만들지 않습니다."} />;
  }

  const readOnly = Boolean(app.session?.readOnly);
  const writable = Boolean(d.writable) && !readOnly;
  const st = docState(name, issue.docs[name]);

  async function save(then: boolean): Promise<void> {
    setOut({ kind: "info", title: "저장하는 중…" });
    const r = await put("/docs", { path: d?.path, baseSha256: base, markdown: text, force });
    setForce(false);
    if (!r.ok) {
      const e = r.error;
      if (e.code === "conflict") setOut({ kind: "err", title: "다른 곳에서 먼저 저장했습니다. ", text: "아래가 지금 저장된 내용입니다. 내 내용과 비교해 고릅니다.", conflict: e.details as Loose });
      else if (e.code === "lease_held") setOut({ kind: "warn", title: "다른 세션이 이 파일을 고치는 중입니다. ", text: errorText(e), lease: true });
      else setOut({ kind: "err", title: "저장하지 못했습니다. ", text: errorText(e), code: e.code });
      return;
    }
    const s = r.data;
    notify("저장했습니다");
    setBase(s.sha256);
    const summary = s.changeSummary ? { ...s.changeSummary, sha256: s.sha256 } : null;
    setOut({ kind: "ok", title: "저장했습니다. ", text: `${s.savedTo ?? "메인 폴더"}에 썼습니다${s.statusChanged ? " · 승인된 문서를 고쳐 다시 검토 중으로 돌아갔습니다" : ""}. 커밋은 그 이슈의 세션이 합니다. 세션에는 아무것도 보내지 않았습니다.`, saved: s });
    if (then) dispatch({ issue: issue.key, paths: [d?.path as string], kind: "doc-changed", changeSummary: summary });
  }

  if (editing) {
    const c = out?.conflict;
    return (
      <VStack gap={3}>
        <HStack gap={2} align="center" wrap="wrap">
          <Ico name="pencil" size={14} />
          <Muted>{`${label} 문서를 고칩니다. 문서 상태를 '승인됨'으로 바꾸는 저장은 받지 않습니다 — 승인은 승인 칸에서 합니다.`}</Muted>
        </HStack>
        <TextArea label={`${label} 원문`} isLabelHidden value={text} onChange={setText} rows={22} />
        <HStack gap={2} wrap="wrap">
          <Button label="저장" variant="primary" icon={<Ico name="save" />} onClick={() => void save(false)} />
          <Button label="저장하고 세션에 요청" icon={<Ico name="send" />} onClick={() => void save(true)} />
          <Button
            label="취소"
            onClick={() => {
              setEditing(false);
              setOut(null);
              again();
            }}
          />
        </HStack>
        <VStack gap={2} aria-live="polite">
          {out ? (
            <Notice kind={out.kind} title={out.title}>
              {out.text}
            </Notice>
          ) : null}
          {c ? (
            <VStack gap={2}>
              <TextArea label="지금 저장된 내용" value={String(c.currentMarkdown ?? "")} rows={10} isReadOnly />
              <HStack gap={2} wrap="wrap">
                <Button
                  label="지금 내용으로 바꾸기"
                  onClick={() => {
                    setText(String(c.currentMarkdown ?? ""));
                    setBase(String(c.currentSha256));
                    setOut(null);
                  }}
                />
                <Button
                  label="내 내용으로 덮어쓰기"
                  variant="destructive"
                  onClick={() => {
                    setBase(String(c.currentSha256));
                    void save(false);
                  }}
                />
              </HStack>
            </VStack>
          ) : null}
          {out?.lease ? (
            <Button
              label="그래도 저장(요청은 보내지 않습니다)"
              variant="destructive"
              onClick={() => {
                setForce(true);
                void save(false);
              }}
            />
          ) : null}
          {out?.code === "branch_not_checked_out" ? (
            <VStack gap={1}>
              <Muted>이 이슈의 작업 공간이 없어 저장할 곳이 없습니다. 작업 공간을 만든 뒤 다시 저장합니다.</Muted>
              <Details label="터미널 명령">
                <Code>{`python3 scripts/harness/worktree.py new ${issue.key}`}</Code>
              </Details>
            </VStack>
          ) : null}
          {out?.saved ? (
            <HStack gap={2} wrap="wrap">
              <Button
                label="세션에 요청"
                variant="primary"
                icon={<Ico name="send" />}
                isDisabled={readOnly}
                onClick={() => dispatch({ issue: issue.key, paths: [d.path], kind: "doc-changed", changeSummary: out.saved?.changeSummary ? { ...out.saved.changeSummary, sha256: out.saved.sha256 } : null })}
              />
              <Button
                label="보기로 돌아가기"
                onClick={() => {
                  setEditing(false);
                  setOut(null);
                  again();
                  reload();
                }}
              />
            </HStack>
          ) : null}
        </VStack>
      </VStack>
    );
  }

  const where = !d.checkout?.path || d.checkout.path === "." ? "메인 폴더" : (d.checkout.path as string);
  let target: string | null = null;
  if (d.checkout?.branch) target = d.checkout.kind === "branch" ? "체크아웃한 폴더가 없어 저장할 수 없습니다." : `저장하면 ${where}의 ${d.checkout.branch} 브랜치에 씁니다. 커밋은 그 이슈의 세션이 합니다.`;
  return (
    <Panel
      title={label}
      flush
      aside={
        <>
          {st ? <Tag tone={st.tone} label={st.label} /> : null}
          {writable ? (
            <Button
              label="편집"
              size="sm"
              icon={<Ico name="pencil" />}
              onClick={() => {
                setText(d.markdown);
                setBase(d.sha256);
                setOut(null);
                setEditing(true);
              }}
            />
          ) : null}
        </>
      }
    >
      <VStack gap={3} paddingBlock={4} paddingInline={2}>
        <ServerHtml html={d.html} />
        <Details label="파일">
          <HStack gap={1} align="center" wrap="wrap">
            <Ico name="doc" size={14} />
            <Code>{d.path}</Code>
            <Muted>{`sha ${String(d.sha256).slice(0, 7)}`}</Muted>
          </HStack>
          {target && writable ? <Muted>{target}</Muted> : null}
        </Details>
      </VStack>
    </Panel>
  );
}
