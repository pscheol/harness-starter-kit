// S03 승인 패널 · 리뷰 판단. 승인 · 수정 요청 · 리뷰 판단은 승인 PIN 이 필요하고(탭마다 한 번) 세션에는 아무것도 보내지 않는다.
// 읽기 전용 화면에는 칸을 띄우지 않고 한 줄 안내만 둔다. 이미 지난 게이트에는 승인 칸을 띄우지 않는다(사용자 결정 2026-11-26).
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { type ReactNode, useState } from "react";
import { errorText, post } from "../lib/api";
import { GATE_KO } from "../lib/format";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { Code, Ico, Muted, Notice, type NoticeKind, Panel, ReadOnlyLine, Tag, useNotify } from "../ui/common";
import { useDispatch } from "../ui/Dispatch";
import { usePin } from "../ui/Pin";

interface Msg {
  kind: NoticeKind;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
}

/** 읽기 전용 화면의 한 줄 안내(승인 · 답 · 접수 칸 대신) */
function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <HStack gap={2} align="center">
      <Ico name={ok ? "ok" : "fail"} />
      <Text size="sm">{text}</Text>
      <Text size="sm" color="secondary">
        {ok ? "됐음" : "아직"}
      </Text>
    </HStack>
  );
}

/** 게이트 하나의 승인 패널. issue: 이슈 모델, gate: 게이트 이름, doc: {sha256, path}|null */
export function ApprovePanel({ issue, gate, doc, onDone }: { issue: Loose; gate: string; doc: Loose | null; onDone?: () => void }) {
  const app = useAppState();
  const withPin = usePin();
  const dispatch = useDispatch();
  const notify = useNotify();
  const s = app.session;
  const readOnly = Boolean(s?.readOnly);
  const result = (issue.gates as Loose[]).find((g) => g.gate === gate);
  const approvers: string[] = s?.approvers?.[gate] ?? [];
  const waiting = issue.waitingOn?.gate === gate ? issue.waitingOn : null;
  const docInfo = issue.docs[gate] ?? null;
  const passed = Boolean(result?.passed);
  const unmet: string[] = result?.preconditions ?? [];
  const clarify: number = docInfo?.clarify ?? 0;
  const mine = waiting ? waiting.mine : true;
  const stale = docInfo?.approval === "stale";
  const [phrase, setPhrase] = useState("");
  const [rule, setRule] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const reviewOpen = (issue.review?.open.CRITICAL ?? 0) + (issue.review?.open.HIGH ?? 0);
  const name = GATE_KO[gate] ?? gate;

  // 이미 지난 게이트 · 끝난 이슈에는 칸을 띄우지 않는다
  if (passed || issue.stage === "completed") return null;
  if (readOnly) {
    return (
      <Panel title={`${name} 승인 대기`}>
        <ReadOnlyLine />
      </Panel>
    );
  }

  async function act(decision: "approved" | "changes-requested"): Promise<void> {
    const text = phrase.trim();
    if (!text) {
      setMsg({ kind: "warn", title: "승인 문구가 필요합니다. ", text: "무엇을 보고 승인(또는 수정 요청)하는지 한 줄 적습니다." });
      return;
    }
    setMsg({ kind: "info", title: "기록하는 중…" });
    const target = gate === "intent" ? { intent: issue.intent } : { issue: issue.key };
    const r = await withPin((pin) => post("/approvals", { target, gate, decision, phrase: text, ...(doc && !["mr", "done"].includes(gate) ? { docSha256: doc.sha256 } : {}), ...(decision === "changes-requested" && rule ? { ruleCandidate: true } : {}), pin }));
    if (!r.ok) {
      const reasons: string[] = (r.error.details as Loose)?.reasons ?? [];
      setMsg({
        kind: "err",
        title: "기록하지 못했습니다. ",
        text: (
          <>
            {errorText(r.error)}
            {reasons.length ? (
              <ul>
                {reasons.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            ) : null}
          </>
        ),
      });
      return;
    }
    const d = r.data;
    notify(decision === "approved" ? "승인을 기록했습니다" : "수정 요청을 기록했습니다");
    const live = (d.sessions ?? []).length;
    setMsg({
      kind: "ok",
      title: decision === "approved" ? "승인을 기록했습니다. " : "수정 요청을 기록했습니다. ",
      text: `${d.approver}${d.group ? `(${d.group})` : ""} 이름으로 승인 기록에 남겼습니다. 세션에는 아무것도 보내지 않았습니다.`,
      action: live ? <Button label={`세션에 요청(켜 둔 세션 ${live}개)`} variant="primary" icon={<Ico name="send" />} onClick={() => dispatch({ issue: issue.key, kind: decision === "approved" ? "approved" : "changes-requested", paths: [`${issue.dir}/approvals.md`] })} /> : undefined,
    });
    setTimeout(() => onDone?.(), 600);
  }

  const who = approvers.length ? approvers.join(", ") : "지정 없음 — 누구나 승인합니다";
  return (
    <Panel title={`${name} 승인`} lift aside={stale ? <Tag tone="build" icon="alert" label="다시 승인 필요" /> : <Tag tone="gate" icon="clock" label="내 차례" />}>
      <Muted>{stale ? "승인한 뒤 문서가 바뀌었습니다. 바뀐 곳을 보고 다시 승인하면 다음 단계가 열립니다." : `${name} 문서를 읽고 승인하면 다음 단계가 열립니다.`}</Muted>
      {!mine ? <Notice kind="warn" title="이 단계를 승인할 사람 목록에 내가 없습니다.">승인을 눌러도 받지 않습니다. 목록에 있는 사람에게 승인을 부탁합니다.</Notice> : null}
      <VStack gap={1}>
        <Check ok={clarify === 0} text={clarify ? `문서에 '확인 필요' 표시 ${clarify}건` : "문서에 '확인 필요' 표시 없음"} />
        <Check ok={unmet.length === 0} text={unmet.length ? `앞 단계에서 남은 것 ${unmet.length}건` : "앞 단계를 모두 지났음"} />
        {["mr", "done"].includes(gate) ? <Check ok={!reviewOpen} text={reviewOpen ? `막는 리뷰 지적(CRITICAL · HIGH) ${reviewOpen}건` : "막는 리뷰 지적 없음"} /> : null}
      </VStack>
      {unmet.length ? (
        <VStack gap={0}>
          {unmet.slice(0, 5).map((x) => (
            <Muted key={x}>{x}</Muted>
          ))}
        </VStack>
      ) : null}
      <TextArea label="승인 문구" value={phrase} onChange={setPhrase} rows={3} placeholder="예: 보관 기간을 3일로 반영했습니다. 승인합니다." description="처음 승인할 때 승인 PIN 을 한 번 묻습니다. PIN 은 이 관리 페이지를 연 터미널에 나와 있습니다." />
      <HStack gap={2} wrap="wrap">
        <Button label="승인하고 기록" variant="primary" icon={<Ico name="check" />} onClick={() => void act("approved")} />
        <Button label="수정 요청" icon={<Ico name="pencil" />} onClick={() => void act("changes-requested")} />
      </HStack>
      <CheckboxInput label="수정 요청을 팀 규칙 후보로도 남깁니다" value={rule} onChange={setRule} />
      <Muted>{`승인할 수 있는 사람: ${who} · 나: ${s?.user?.email ?? "git 이메일 없음"}`}</Muted>
      {msg ? (
        <VStack gap={2} aria-live="polite">
          <Notice kind={msg.kind} title={msg.title} {...(msg.action ? { action: msg.action } : {})}>
            {msg.text}
          </Notice>
        </VStack>
      ) : null}
    </Panel>
  );
}

function sevTone(sev: string): "gate" | "build" | "line" {
  if (sev === "CRITICAL" || sev === "HIGH") return "gate";
  return sev === "MEDIUM" ? "build" : "line";
}

const FINDING_KO: Record<string, string> = { open: "판단 전", "fix-required": "수정 필요", "risk-accepted": "위험 수용", fixed: "고침", resolved: "처리됨" };

function ReviewRow({ f, issue, onDone }: { f: Loose; issue: Loose; onDone?: () => void }) {
  const withPin = usePin();
  const notify = useNotify();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  async function decide(decision: string): Promise<void> {
    if (!reason.trim()) {
      setMsg(`${f.id}: 이유를 한 줄 적습니다.`);
      return;
    }
    const r = await withPin((pin) => post(`/reviews/${encodeURIComponent(issue.key)}/${encodeURIComponent(f.id)}/decision`, { decision, phrase: reason.trim(), pin }));
    if (!r.ok) {
      setMsg(`기록하지 못했습니다: ${errorText(r.error)}`);
      return;
    }
    notify(`${f.id} 판단을 기록했습니다`);
    onDone?.();
  }
  if (f.state !== "open") return <Muted>판단 기록됨</Muted>;
  return (
    <VStack gap={1}>
      <HStack gap={1} wrap="wrap" align="end">
        <TextInput label={`${f.id} 판단 이유`} isLabelHidden value={reason} onChange={setReason} placeholder="이유 한 줄" size="sm" />
        <Button label="수정 필요" size="sm" onClick={() => void decide("fix-required")} />
        <Button label="위험 수용" size="sm" variant="destructive" onClick={() => void decide("risk-accepted")} />
      </HStack>
      {msg ? <Notice kind="warn" title={msg} /> : null}
    </VStack>
  );
}

/** 리뷰 판단: 지적마다 위험 수용 · 수정 필요(이유 필수). 병합 요청을 승인할 수 있는 사람이 한다. 읽기 전용이면 판단 칸을 숨긴다. */
export function ReviewTable({ issue, review, onDone }: { issue: Loose; review: Loose; onDone?: () => void }) {
  const app = useAppState();
  const readOnly = Boolean(app.session?.readOnly);
  const rows: Loose[] = review.findings ?? [];
  if (!rows.length) return <Muted>이 이슈의 리뷰 지적이 없습니다.</Muted>;
  const anyOpen = rows.some((f) => f.state === "open");
  return (
    <VStack gap={3}>
      {readOnly && anyOpen ? <ReadOnlyLine text="리뷰 판단은 자기 터미널에서 연 관리 페이지에서 합니다" /> : null}
      <Table
        data={rows}
        idKey="id"
        density="compact"
        columns={[
          { key: "id", header: "지적", renderCell: (f: Loose) => <Code>{f.id}</Code> },
          { key: "severity", header: "심각도", renderCell: (f: Loose) => <Tag tone={sevTone(f.severity)} label={f.severity} /> },
          { key: "state", header: "상태", renderCell: (f: Loose) => <Text>{FINDING_KO[f.state] ?? String(f.state)}</Text> },
          ...(readOnly || !anyOpen ? [] : [{ key: "decide", header: "판단", renderCell: (f: Loose) => <ReviewRow f={f} issue={issue} {...(onDone ? { onDone } : {})} /> }]),
        ]}
      />
    </VStack>
  );
}
