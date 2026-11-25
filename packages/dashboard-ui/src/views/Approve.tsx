// S03 승인 패널 · 리뷰 판단. 승인 · 수정 요청 · 리뷰 판단은 PIN 이 필요하고(탭마다 한 번) 세션에는 아무것도 보내지 않는다(DB-R12 · R25).
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useState, type ReactNode } from "react";
import { errorText, post } from "../lib/api";
import { GATE_KO } from "../lib/format";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { Code, Ico, IconNote, Muted, Notice, Panel, Tag, useNotify, type NoticeKind } from "../ui/common";
import { useDispatch } from "../ui/Dispatch";
import { usePin } from "../ui/Pin";

interface Msg {
  kind: NoticeKind;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <HStack gap={2} align="center">
      <Ico name={ok ? "ok" : "fail"} />
      <Text size="sm">{text}</Text>
      <Text size="xsm" color="secondary">
        {ok ? "충족" : "미충족"}
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
  const [phrase, setPhrase] = useState("");
  const [rule, setRule] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const reviewOpen = (issue.review?.open.CRITICAL ?? 0) + (issue.review?.open.HIGH ?? 0);

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
      setMsg({ kind: "err", title: `${r.error.code}: `, text: <>{errorText(r.error)}{reasons.length ? <ul>{reasons.map((x) => <li key={x}>{x}</li>)}</ul> : null}</> });
      return;
    }
    const d = r.data;
    notify(decision === "approved" ? "승인을 기록했습니다" : "수정 요청을 기록했습니다");
    const live = (d.sessions ?? []).length;
    setMsg({
      kind: "ok",
      title: decision === "approved" ? "승인을 기록했습니다. " : "수정 요청을 기록했습니다. ",
      text: `approvals.md 에 ${d.approver}${d.group ? `(${d.group})` : ""} 로 덧붙였습니다${d.statusChanged ? ` · status ${d.statusChanged}` : ""}. 세션에는 아무것도 보내지 않았습니다.`,
      action: live && !readOnly ? <Button label={`세션에 요청(살아 있는 세션 ${live}개)`} variant="primary" icon={<Ico name="send" />} onClick={() => dispatch({ issue: issue.key, kind: decision === "approved" ? "approved" : "changes-requested", paths: [`${issue.dir}/approvals.md`] })} /> : undefined,
    });
    setTimeout(() => onDone?.(), 600);
  }

  return (
    <Panel
      title={`${GATE_KO[gate] ?? gate} 승인`}
      lift
      aside={passed ? <Tag tone="ops" icon="ok" label="승인됨" /> : docInfo?.approval === "stale" ? <Tag tone="build" icon="alert" label="다시 승인 필요" /> : <Tag label="대기" icon="clock" />}
    >
      <Muted>{passed ? "이 게이트는 지금 문서 그대로 승인돼 있습니다." : docInfo?.approval === "stale" ? "승인 뒤 문서가 바뀌었습니다. 바뀐 곳을 보고 다시 승인하면 status 가 approved 가 되고 다음 단계가 열립니다." : "승인하면 approvals.md 에 기록되고 문서 status 가 approved 가 되어 다음 단계가 열립니다."}</Muted>
      <IconNote icon="users" size="xsm">
        {`approvers · ${approvers.length ? approvers.join(", ") : "비어 있음 → 사용자 누구나"} · ${s?.user?.email ?? "이메일 없음"}${s?.user?.groups?.length ? ` (${(s.user.groups as string[]).join(", ")})` : ""}`}
      </IconNote>
      {!mine ? <Notice kind="warn" title="내 git 사용자는 이 게이트의 approvers 에 없습니다.">승인 요청은 서버가 403 으로 거부합니다.</Notice> : null}
      <VStack gap={1}>
        <Check ok={clarify === 0} text={`[NEEDS CLARIFICATION] ${clarify}건`} />
        <Check ok={unmet.length === 0} text={unmet.length ? `앞 조건 미충족 ${unmet.length}건` : "앞 게이트 · 조건 충족"} />
        {["mr", "done"].includes(gate) ? <Check ok={!reviewOpen} text={`열린 CRITICAL·HIGH ${reviewOpen}`} /> : null}
      </VStack>
      {unmet.length ? (
        <VStack gap={0}>
          {unmet.slice(0, 5).map((x) => (
            <Muted key={x} size="xsm">
              {x}
            </Muted>
          ))}
        </VStack>
      ) : null}
      {readOnly ? (
        <Notice kind="warn" title="읽기 전용. ">
          에이전트 세션에서 연 서버는 승인을 받지 않습니다. 사람이 자기 터미널에서 연 관리 페이지(또는 <Code>{`knots-sync approve ${issue.key} --gate ${gate}`}</Code>)에서 합니다.
        </Notice>
      ) : null}
      <TextArea label="승인 문구" value={phrase} onChange={setPhrase} rows={3} isDisabled={readOnly} placeholder="예: R2.3 보관 기간 3일로 반영해. 승인합니다." description="승인 PIN 은 처음 승인할 때 한 번 묻습니다(서버를 연 터미널에만 나온 값). 승인 기록은 이 화면에서 남긴 approvals.md 로만 인정합니다." />
      <HStack gap={1} align="center">
        <Ico name="commit" size={14} />
        <Muted size="xsm">{`git user.email ${s?.user?.email ?? "-"} 로 approvals.md 에 기록`}</Muted>
      </HStack>
      <HStack gap={2} wrap="wrap">
        <Button label="승인하고 기록" variant="primary" icon={<Ico name="check" />} isDisabled={readOnly || passed} onClick={() => void act("approved")} />
        <Button label="수정 요청" icon={<Ico name="pencil" />} isDisabled={readOnly} onClick={() => void act("changes-requested")} />
      </HStack>
      <CheckboxInput label="수정 요청을 규칙 후보로 남깁니다" value={rule} onChange={setRule} isDisabled={readOnly} />
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
  return sev === "CRITICAL" || sev === "HIGH" ? "gate" : sev === "MEDIUM" ? "build" : "line";
}

function ReviewRow({ f, issue, onDone }: { f: Loose; issue: Loose; onDone?: () => void }) {
  const app = useAppState();
  const withPin = usePin();
  const notify = useNotify();
  const readOnly = Boolean(app.session?.readOnly);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  async function decide(decision: string): Promise<void> {
    if (!reason.trim()) {
      setMsg(`${f.id}: 이유 문구가 필요합니다.`);
      return;
    }
    const r = await withPin((pin) => post(`/reviews/${encodeURIComponent(issue.key)}/${encodeURIComponent(f.id)}/decision`, { decision, phrase: reason.trim(), pin }));
    if (!r.ok) {
      setMsg(`${r.error.code}: ${errorText(r.error)}`);
      return;
    }
    notify(`${f.id} 판단을 기록했습니다`);
    onDone?.();
  }
  if (f.state !== "open") return <Muted size="xsm">판단 기록됨</Muted>;
  return (
    <VStack gap={1}>
      <HStack gap={1} wrap="wrap" align="end">
        <TextInput label={`${f.id} 판단 이유`} isLabelHidden value={reason} onChange={setReason} placeholder="이유 한 줄" size="sm" isDisabled={readOnly} />
        <Button label="수정 필요" size="sm" isDisabled={readOnly} onClick={() => void decide("fix-required")} />
        <Button label="위험 수용" size="sm" variant="destructive" isDisabled={readOnly} onClick={() => void decide("risk-accepted")} />
      </HStack>
      {msg ? <Notice kind="warn" title={msg} /> : null}
    </VStack>
  );
}

/** 리뷰 판단: 지적마다 위험 수용 · 수정 필요(이유 필수). mr 게이트 approvers 가 한다. */
export function ReviewTable({ issue, review, onDone }: { issue: Loose; review: Loose; onDone?: () => void }) {
  const app = useAppState();
  const rows: Loose[] = review.findings ?? [];
  if (!rows.length) return <Muted>이 이슈의 리뷰 지적이 없습니다. 리뷰 보고서가 없거나 모두 처리됐습니다.</Muted>;
  return (
    <VStack gap={3}>
      <Table
        data={rows}
        idKey="id"
        density="compact"
        columns={[
          { key: "id", header: "ID", renderCell: (f: Loose) => <Code>{f.id}</Code> },
          { key: "severity", header: "심각도", renderCell: (f: Loose) => <Tag tone={sevTone(f.severity)} label={f.severity} /> },
          { key: "state", header: "상태", renderCell: (f: Loose) => <Text>{f.state === "open" ? "열림" : String(f.state)}</Text> },
          { key: "decide", header: "판단", renderCell: (f: Loose) => <ReviewRow f={f} issue={issue} {...(onDone ? { onDone } : {})} /> },
        ]}
      />
      {app.session?.readOnly ? <Notice kind="warn" title="읽기 전용 — 리뷰 판단은 사람 터미널에서 한 서버에서만 됩니다." /> : null}
    </VStack>
  );
}
