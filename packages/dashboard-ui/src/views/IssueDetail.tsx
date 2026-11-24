// S03 이슈 상세 · 문서. 문서 보기 · 고치기 · 저장(충돌 · 점유 처리) · 승인 · 리뷰 판단. 저장만으로 세션에 아무것도 보내지 않는다(DB-R25).
// 전체 화면(/issues/<키>)과 진행 보드의 오른쪽 시트가 같은 이 컴포넌트를 쓴다.
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { TextArea } from "@astryxdesign/core/TextArea";
import { useCallback, useEffect, useState } from "react";
import { errorText, get, put } from "../lib/api";
import { GATE_KO, railSpec, ROLE_KO, stageText } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { Code, Empty, ErrorBlock, HarnessBadge, Ico, Loading, Muted, Notice, Panel, ReadOnlyNote, Tag, useNotify, type Tone } from "../ui/common";
import { useDispatch } from "../ui/Dispatch";
import { GateRail } from "../ui/GateRail";
import { Page, StatStrip, TwoCol } from "../ui/Page";
import { ServerHtml } from "../ui/ServerHtml";
import { ApprovePanel, ReviewTable } from "./Approve";

const DOC_TABS = ["requirements", "design", "tasks"];
const APPROVAL: Record<string, [Tone, string]> = { valid: ["ops", "승인됨"], stale: ["build", "승인 뒤 바뀜"], invalid: ["gate", "승인자 아님"], none: ["line", "승인 전"] };

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

export function IssueDetail({ issueKey, variant, tab: routeTab, onClose }: IssueDetailProps) {
  const app = useAppState();
  const { state, reload } = useLoad<[Loose, Loose]>(() => [get(`/issues/${encodeURIComponent(issueKey)}`), get("/sessions")], [issueKey], { tolerate: [] });
  const [tab, setTab] = useState<string | null>(null);
  useEffect(() => setTab(null), [issueKey]);

  if (state.status === "loading") {
    return variant === "page" ? (
      <Page title={issueKey} crumbs={[{ label: "진행", path: "/progress" }, { label: issueKey }]}>
        <Loading rows={6} />
      </Page>
    ) : (
      <VStack padding={5}>
        <Loading rows={6} />
      </VStack>
    );
  }
  if (state.status === "error") {
    const err = <ErrorBlock error={state.error} retry={reload} />;
    return variant === "page" ? (
      <Page title={issueKey} crumbs={[{ label: "진행", path: "/progress" }, { label: issueKey }]}>
        {err}
      </Page>
    ) : (
      <VStack padding={5}>{err}</VStack>
    );
  }
  const issue = state.data[0];
  const sessions = ((state.data[1]?.sessions ?? []) as Loose[]).filter((x) => (issue.sessions as string[]).includes(x.id));
  const current = tab ?? initialTab(issue, routeTab);
  const body = <Body issue={issue} sessions={sessions} tab={current} setTab={setTab} variant={variant} reload={reload} gates={app.session?.flow.gates ?? []} />;
  if (variant === "page") {
    const intent = issue.intent as string | null;
    return (
      <Page
        title={`${issue.key} ${issue.title ?? issue.name}`}
        crumbs={[{ label: "진행", path: "/progress" }, ...(intent ? [{ label: `${intent}`, path: `/progress?view=flow&intent=${intent}` }] : []), ...(issue.unit ? [{ label: issue.unit as string }] : []), { label: issue.key as string }]}
      >
        {body}
      </Page>
    );
  }
  return (
    <VStack gap={4} padding={5}>
      <HStack justify="between" align="start" gap={3} wrap="wrap">
        <VStack gap={1}>
          <Muted size="xsm">{issue.intent ? `${issue.intent}${issue.unit ? ` · ${issue.unit}` : ""}` : "Intent 없음"}</Muted>
          <Heading level={2}>{`${issue.key} ${issue.title ?? issue.name}`}</Heading>
        </VStack>
        <HStack gap={2}>
          <Button label="전체 화면" size="sm" icon={<Ico name="ext" />} href={`/issues/${issue.key}`} />
          {onClose ? <Button label="닫기" size="sm" onClick={onClose} /> : null}
        </HStack>
      </HStack>
      {body}
    </VStack>
  );
}

function Body({ issue, sessions, tab, setTab, variant, reload, gates }: { issue: Loose; sessions: Loose[]; tab: string; setTab: (t: string) => void; variant: "page" | "drawer"; reload: () => void; gates: string[] }) {
  const intent = issue.intent as string | null;
  const bolts = issue.docs.tasks?.bolts;
  const open = issue.review?.open ?? {};
  const spec = railSpec(gates, issue);
  const approveGate = DOC_TABS.includes(tab) ? tab : (issue.waitingOn?.gate ?? "mr");
  const [doc, setDoc] = useState<Loose | null>(null);
  const onDoc = useCallback((d: Loose | null) => setDoc(d), []);

  const main = (
    <VStack gap={4}>
      <VStack gap={3}>
        <HStack gap={2} align="center" wrap="wrap">
          {issue.waitingOn ? <Tag tone="gate" icon="clock" label={`${GATE_KO[issue.waitingOn.gate] ?? issue.waitingOn.gate} 승인 대기`} /> : <Tag tone={issue.stage === "completed" ? "ops" : "design"} label={stageText(issue)} />}
          {issue.area ? <Tag label={`area: ${issue.area}`} /> : null}
          {intent ? <Link href={`/progress?view=flow&intent=${intent}`}>{`${intent}${issue.unit ? ` · ${issue.unit}` : ""}`}</Link> : null}
          {sessions.length ? (
            <HStack gap={2} align="center" wrap="wrap">
              <Muted>맡은 세션</Muted>
              {sessions.map((x) => (
                <HStack key={x.id} gap={1} align="center">
                  <HarnessBadge name={x.harness} />
                  <Muted>{`${x.name ?? String(x.id).slice(0, 8)} · ${ROLE_KO[x.role] ?? x.role ?? ""}`}</Muted>
                </HStack>
              ))}
            </HStack>
          ) : (
            <Muted>맡은 세션 없음</Muted>
          )}
        </HStack>
        <GateRail spec={spec} labels />
        <StatStrip
          items={[
            { label: "현재 게이트", value: issue.waitingOn ? (GATE_KO[issue.waitingOn.gate] ?? issue.waitingOn.gate) : stageText(issue) },
            { label: "남은 Bolt", value: bolts && bolts.total ? bolts.total - bolts.done : "-", unit: bolts?.total ? `/ ${bolts.total}` : "" },
            { label: "리뷰 지적", value: (open.CRITICAL ?? 0) + (open.HIGH ?? 0), unit: "CRITICAL·HIGH" },
            { label: "검증", value: issue.verify?.status ?? "-" },
          ]}
        />
        <HStack gap={1} align="center" wrap="wrap">
          <Ico name="branch" size={14} />
          <Code>{issue.branch ?? "브랜치 없음"}</Code>
          <Muted size="xsm">
            {issue.checkout ? `· ${issue.checkout.kind === "main" ? "메인 폴더" : "worktree"}${issue.checkout.dirty ? " · 커밋 안 된 변경" : ""}` : "· 체크아웃 안 됨(git 객체로 읽습니다)"} · 출처 {issue.source}
          </Muted>
        </HStack>
      </VStack>
      <TabList value={tab} onChange={setTab} hasDivider aria-label="이슈 문서">
        {DOC_TABS.map((d) => (
          <Tab key={d} value={d} label={d} endContent={<Muted size="xsm">{issue.docs[d] ? (issue.docs[d].status ?? issue.docs[d].state ?? "") : "없음"}</Muted>} />
        ))}
        <Tab value="review" label="review" />
        <Tab value="approvals" label="approvals" />
      </TabList>
      <Panelled issue={issue} tab={tab} onDoc={onDoc} reload={reload} />
    </VStack>
  );
  const side = <ApprovePanel issue={issue} gate={approveGate} doc={DOC_TABS.includes(tab) ? doc : null} onDone={reload} />;
  return variant === "page" ? <TwoCol main={main} side={side} wide={1180} /> : (
    <VStack gap={4}>
      {main}
      {side}
    </VStack>
  );
}

function Panelled({ issue, tab, onDoc, reload }: { issue: Loose; tab: string; onDoc: (d: Loose | null) => void; reload: () => void }) {
  if (tab === "review") return <ReviewPanel issue={issue} reload={reload} onDoc={onDoc} />;
  if (tab === "approvals") return <ApprovalsPanel issue={issue} onDoc={onDoc} />;
  return <DocPanel key={tab} issue={issue} name={tab} onDoc={onDoc} reload={reload} />;
}

function ApprovalsPanel({ issue, onDoc }: { issue: Loose; onDoc: (d: Loose | null) => void }) {
  const { state, reload } = useLoad<[Loose]>(() => [get("/docs", { query: { path: `${issue.dir}/approvals.md` } })], [issue.key], { tolerate: ["not_found"] });
  useEffect(() => onDoc(null), [onDoc]);
  if (state.status === "loading") return <Loading rows={4} />;
  if (state.status === "error") return <ErrorBlock error={state.error} retry={reload} />;
  const d = state.data[0];
  if (!d) return <Muted>아직 승인 기록이 없습니다. 게이트를 승인하면 approvals.md 가 생깁니다.</Muted>;
  return (
    <VStack gap={2}>
      <Code>{d.path}</Code>
      <ServerHtml html={d.html} />
    </VStack>
  );
}

function ReviewPanel({ issue, reload, onDoc }: { issue: Loose; reload: () => void; onDoc: (d: Loose | null) => void }) {
  const { state, reload: again } = useLoad<[Loose]>(() => [get(`/reviews/${encodeURIComponent(issue.key)}`)], [issue.key]);
  useEffect(() => onDoc(null), [onDoc]);
  if (state.status === "loading") return <Loading rows={4} />;
  if (state.status === "error") return <ErrorBlock error={state.error} retry={again} />;
  const r = state.data[0];
  const open = r.open ?? {};
  return (
    <VStack gap={3}>
      <Muted>{`리뷰 보고서 ${r.report ?? "없음"}${r.head ? ` · head ${String(r.head).slice(0, 7)}` : ""}${r.stale ? " · 보고서가 오래됐습니다(head 가 바뀜)" : ""}`}</Muted>
      <HStack gap={2} wrap="wrap">
        {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((sv) => (
          <Tag key={sv} tone={sv === "CRITICAL" || sv === "HIGH" ? ((open[sv] ?? 0) > 0 ? "gate" : "line") : sv === "MEDIUM" ? "build" : "line"} label={`${sv} ${open[sv] ?? 0}`} />
        ))}
      </HStack>
      <ReviewTable issue={issue} review={r} onDone={() => { again(); reload(); }} />
    </VStack>
  );
}

function DocPanel({ issue, name, onDoc, reload }: { issue: Loose; name: string; onDoc: (d: Loose | null) => void; reload: () => void }) {
  const app = useAppState();
  const dispatch = useDispatch();
  const notify = useNotify();
  const path = `${issue.dir}/${name}.md`;
  const { state, reload: again } = useLoad<[Loose]>(() => [get("/docs", { query: { path } })], [path], { tolerate: ["not_found"] });
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [base, setBase] = useState("");
  const [force, setForce] = useState(false);
  const [out, setOut] = useState<{ kind: "info" | "ok" | "warn" | "err"; title: string; text?: string; conflict?: Loose; lease?: boolean; saved?: Loose; code?: string } | null>(null);
  const d: Loose | null = state.status === "ready" ? state.data[0] : null;
  useEffect(() => onDoc(d), [d, onDoc]);

  if (state.status === "loading") return <Loading rows={5} />;
  if (state.status === "error") return <ErrorBlock error={state.error} retry={again} />;
  if (!d) return <Empty title={`${name}.md 가 아직 없습니다`} text="이 문서는 설계 · 구현 세션이 만듭니다. 화면은 새 문서를 만들지 않습니다(plans · decisions · ops 기록만 새 파일이 됩니다)." />;

  const readOnly = Boolean(app.session?.readOnly);
  const writable = Boolean(d.writable) && !readOnly;
  const [tone, label] = APPROVAL[issue.docs[name]?.approval] ?? (["line", issue.docs[name]?.approval ?? "-"] as [Tone, string]);

  async function save(then: boolean): Promise<void> {
    setOut({ kind: "info", title: "저장하는 중…" });
    const r = await put("/docs", { path: d?.path, baseSha256: base, markdown: text, force });
    setForce(false);
    if (!r.ok) {
      const e = r.error;
      if (e.code === "conflict") setOut({ kind: "err", title: "충돌: 다른 곳에서 먼저 저장했습니다. ", text: "아래가 지금 저장된 내용입니다. 내 내용과 비교해 고릅니다.", conflict: e.details });
      else if (e.code === "lease_held") setOut({ kind: "warn", title: "다른 세션이 이 파일을 점유 중입니다. ", text: errorText(e), lease: true });
      else setOut({ kind: "err", title: `${e.code}: `, text: errorText(e), code: e.code });
      return;
    }
    const s = r.data;
    notify("저장했습니다");
    setBase(s.sha256);
    const summary = s.changeSummary ? { ...s.changeSummary, sha256: s.sha256 } : null;
    setOut({ kind: "ok", title: "저장했습니다. ", text: `${s.savedTo ?? "메인 폴더"}의 ${s.branch ?? ""}에 썼습니다${s.statusChanged ? ` · status ${s.statusChanged}(승인된 문서를 고쳐 검토 중으로 돌아갔습니다)` : ""}. 커밋은 그 이슈의 세션이 합니다. 세션에는 아무것도 보내지 않았습니다.`, saved: s });
    if (then) dispatch({ issue: issue.key, paths: [d?.path as string], kind: "doc-changed", changeSummary: summary });
  }

  if (editing) {
    const c = out?.conflict;
    return (
      <VStack gap={3}>
        <HStack gap={2} align="center" wrap="wrap">
          <Ico name="pencil" size={14} />
          <Code>{d.path}</Code>
          <Muted size="xsm">status 를 approved 로 바꾸는 저장은 서버가 거부합니다</Muted>
        </HStack>
        <TextArea label={`${name}.md 원문`} isLabelHidden value={text} onChange={setText} rows={22} />
        <HStack gap={2} wrap="wrap">
          <Button label="저장" variant="primary" icon={<Ico name="save" />} onClick={() => void save(false)} />
          <Button label="저장하고 세션에 요청" icon={<Ico name="send" />} onClick={() => void save(true)} />
          <Button label="취소" onClick={() => { setEditing(false); setOut(null); again(); }} />
        </HStack>
        <VStack gap={2} aria-live="polite">
          {out ? <Notice kind={out.kind} title={out.title}>{out.text}</Notice> : null}
          {c ? (
            <VStack gap={2}>
              <TextArea label="지금 저장된 내용" value={String(c.currentMarkdown ?? "")} rows={10} isReadOnly />
              <HStack gap={2} wrap="wrap">
                <Button label="지금 내용으로 바꾸기" onClick={() => { setText(String(c.currentMarkdown ?? "")); setBase(String(c.currentSha256)); setOut(null); }} />
                <Button label="내 내용으로 덮어쓰기" variant="destructive" onClick={() => { setBase(String(c.currentSha256)); void save(false); }} />
              </HStack>
            </VStack>
          ) : null}
          {out?.lease ? <Button label="그래도 저장(요청은 보내지 않습니다)" variant="destructive" onClick={() => { setForce(true); void save(false); }} /> : null}
          {out?.code === "branch_not_checked_out" ? <Muted>worktree 가 없습니다. 터미널에서 <Code>{`python3 scripts/harness/worktree.py new ${issue.key}`}</Code> 뒤 다시 저장합니다.</Muted> : null}
          {out?.saved ? (
            <HStack gap={2} wrap="wrap">
              <Button label="세션에 요청" variant="primary" icon={<Ico name="send" />} isDisabled={readOnly} onClick={() => dispatch({ issue: issue.key, paths: [d.path], kind: "doc-changed", changeSummary: out.saved?.changeSummary ? { ...out.saved.changeSummary, sha256: out.saved.sha256 } : null })} />
              <Button label="보기로 돌아가기" onClick={() => { setEditing(false); setOut(null); again(); reload(); }} />
            </HStack>
          ) : null}
        </VStack>
      </VStack>
    );
  }

  const fm = Object.entries((d.frontmatter ?? {}) as Record<string, unknown>).filter(([k]) => ["status", "state", "area", "intent", "unit", "jira"].includes(k));
  return (
    <Panel
      title={name}
      flush
      aside={
        <>
          <Muted size="xsm">{`sha ${String(d.sha256).slice(0, 7)}`}</Muted>
          <Tag tone={tone} label={label} />
          {writable ? <Button label="편집" size="sm" icon={<Ico name="pencil" />} onClick={() => { setText(d.markdown); setBase(d.sha256); setOut(null); setEditing(true); }} /> : <ReadOnlyNote text={readOnly ? "읽기 전용" : "고칠 수 없음"} />}
        </>
      }
    >
      <VStack gap={3} padding={4}>
        <HStack gap={2} align="center" wrap="wrap">
          <Ico name="doc" size={14} />
          <Code>{d.path}</Code>
          {fm.map(([k, v]) => (
            <Tag key={k} label={`${k}: ${String(v)}`} />
          ))}
        </HStack>
        {d.checkout?.branch ? (
          <Muted size="xsm">
            저장하면 {d.checkout.kind === "branch" ? "(체크아웃 없음 — 저장할 수 없습니다)" : `${!d.checkout.path || d.checkout.path === "." ? "메인 폴더" : d.checkout.path} 의`} <Code>{d.checkout.branch}</Code> 에 씁니다. 커밋은 그 이슈의 세션이 합니다.
          </Muted>
        ) : null}
        <ServerHtml html={d.html} />
      </VStack>
    </Panel>
  );
}
