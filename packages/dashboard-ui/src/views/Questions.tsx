// S04 질문 답하기. 선택지를 고르고 메모를 남긴다. 답은 승인 PIN 이 필요하고(탭마다 한 번) 마지막 질문에 답해도 세션에 아무것도 보내지 않는다.
// 읽기 전용 화면에는 답 칸을 띄우지 않고 질문 · 선택지 · 권장안만 읽게 한다(사용자 결정 2026-11-26).
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { useEffect, useState } from "react";
import { errorText, get, post } from "../lib/api";
import { GATE_KO, ROLE_KO, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { Code, Details, Empty, ErrorBlock, Ico, Key, Loading, Muted, Notice, type NoticeKind, Panel, ReadOnlyLine, Tag, useNotify } from "../ui/common";
import { useDispatch } from "../ui/Dispatch";
import { docState } from "../ui/GateRail";
import { Page } from "../ui/Page";
import { usePin } from "../ui/Pin";

const SUB = "권장안을 보고 선택지를 고릅니다. 답이 모이면 설계 세션에 이어서 하라고 요청합니다.";

/** 읽기 전용: 선택지를 글로만 보인다(고르는 칸 없음) */
function ChoiceList({ choices, recommended }: { choices: Loose[]; recommended: string | null | undefined }) {
  return (
    <List hasDividers>
      {choices.map((c) => (
        <ListItem key={c.id} label={`${c.id}. ${c.text}`} {...(c.impact ? { description: `영향: ${c.impact}` } : {})} {...(c.id === recommended ? { endContent: <Tag tone="design" label="권장" /> } : {})} />
      ))}
    </List>
  );
}

function QuestionCard({ q, target, sha, reload, onAllAnswered, readOnly }: { q: Loose; target: string; sha: string; reload: () => void; onAllAnswered: () => void; readOnly: boolean }) {
  const app = useAppState();
  const withPin = usePin();
  const notify = useNotify();
  const [picked, setPicked] = useState("");
  const [memo, setMemo] = useState("");
  const [out, setOut] = useState<{ kind: NoticeKind; title: string; text?: string } | null>(null);
  const canAnswer = Boolean(q.open) && !readOnly;
  const choices = [...(q.choices as Loose[]), ...(canAnswer ? [{ id: "other", text: "다른 답", impact: "메모에 적습니다" }] : [])];

  async function answer(): Promise<void> {
    if (!picked) {
      setOut({ kind: "warn", title: "선택지를 하나 고릅니다." });
      return;
    }
    if (picked === "other" && !memo.trim()) {
      setOut({ kind: "warn", title: "'다른 답'을 고르면 메모에 답을 적습니다." });
      return;
    }
    const res = await withPin((pin) => post(`/questions/${encodeURIComponent(target)}/${encodeURIComponent(q.id)}/answer`, { choice: picked, ...(memo.trim() ? { text: memo.trim() } : {}), baseSha256: sha, pin }));
    if (!res.ok) {
      setOut({ kind: "err", title: res.error.code === "conflict" ? "그사이 질문 문서가 바뀌었습니다. " : "답을 저장하지 못했습니다. ", text: errorText(res.error) });
      if (res.error.code === "conflict") reload();
      return;
    }
    notify(res.data.kind === "opinion" ? "의견으로 남겼습니다(질문은 열려 있습니다)" : "답을 저장했습니다");
    reload();
    if (res.data.open === 0) onAllAnswered();
  }

  return (
    <Panel
      title={
        <HStack gap={2} align="center" wrap="wrap">
          <Key>{q.id}</Key>
          <Text>{q.text || q.category}</Text>
        </HStack>
      }
      aside={
        <>
          {q.category ? <Tag label={q.category} /> : null}
          {q.blocks ? <Tag tone={q.open ? "gate" : "line"} icon="alert" label={`${GATE_KO[q.blocks] ?? q.blocks} 단계를 막습니다`} /> : null}
          {q.role ? <Muted>{`답할 사람: ${ROLE_KO[q.role] ?? q.role}`}</Muted> : null}
          {q.open ? null : <Tag tone="ops" icon="ok" label="답함" />}
        </>
      }
    >
      {canAnswer ? (
        <RadioList label="선택지" isLabelHidden value={picked} onChange={setPicked}>
          {choices.map((c) => (
            <RadioListItem key={c.id} value={c.id} label={`${c.id}. ${c.text}`} {...(c.impact ? { description: `영향: ${c.impact}` } : {})} {...(c.id === q.recommended ? { endContent: <Tag tone="design" label="권장" /> } : {})} />
          ))}
        </RadioList>
      ) : (
        <ChoiceList choices={choices} recommended={q.recommended} />
      )}
      {canAnswer ? <TextArea label="메모" value={memo} onChange={setMemo} rows={2} maxLength={500} placeholder="적지 않아도 됩니다(500자까지). '다른 답'을 고르면 여기에 답을 적습니다" /> : null}
      {q.answer ? (
        <HStack gap={1} align="center">
          <Ico name="ok" size={14} />
          <Text>{`답: ${q.answer}`}</Text>
        </HStack>
      ) : null}
      {(q.notes as string[]).map((n) => (
        <Muted key={n}>{`메모: ${n}`}</Muted>
      ))}
      {(q.opinions as string[]).map((n) => (
        <Muted key={n}>{`의견: ${n}`}</Muted>
      ))}
      {canAnswer ? (
        <VStack gap={2}>
          <HStack>
            <Button label="답 저장" variant="primary" icon={<Ico name="check" />} onClick={() => void answer()} />
          </HStack>
          <Muted>{`답은 ${app.session?.user?.email ?? "내 git 이메일"} 이름으로 질문 문서에 남습니다.`}</Muted>
        </VStack>
      ) : null}
      {out ? (
        <Notice kind={out.kind} title={out.title}>
          {out.text}
        </Notice>
      ) : null}
    </Panel>
  );
}

function Detail({ target }: { target: string }) {
  const app = useAppState();
  const dispatch = useDispatch();
  const readOnly = Boolean(app.session?.readOnly);
  const [answering, setAnswering] = useState(false);
  // 답 칸이 보이는 동안은 새로 읽지 않는다(고르는 중에 바뀌지 않게). 읽기 전용이면 늘 새로 읽는다.
  const load = useLoad<[Loose]>(() => [get("/questions", { query: { target } })], [target], { live: readOnly || !answering });
  const { state, reload } = load;
  const [done, setDone] = useState(false);
  const crumbs = [{ label: "작업" }, { label: "문서", path: "/docs" }, { label: `질문 ${target}` }];
  const openCount = state.status === "ready" ? (state.data[0].questions as Loose[]).filter((q) => q.open).length : 0;
  const formVisible = !readOnly && openCount > 0;
  useEffect(() => {
    if (state.status === "ready") setAnswering(formVisible);
  }, [formVisible, state.status]);
  if (state.status === "loading") {
    return (
      <Page title={`질문 · ${target}`} sub={SUB} crumbs={crumbs}>
        <Loading rows={5} />
      </Page>
    );
  }
  if (state.status === "error") {
    return (
      <Page title={`질문 · ${target}`} sub={SUB} crumbs={crumbs} live={load}>
        <ErrorBlock error={state.error} retry={reload} />
      </Page>
    );
  }
  const doc = state.data[0];
  const questions = doc.questions as Loose[];
  const st = doc.status ? docState("questions", { status: doc.status }) : null;
  const isIssue = /^[A-Z]+-\d+$/.test(target) && !target.startsWith("INT-");
  return (
    <Page title={`질문 · ${target}`} sub={SUB} crumbs={crumbs} width={960} live={load}>
      <HStack gap={3} wrap="wrap" align="center" justify="between">
        <HStack gap={2} wrap="wrap" align="center">
          <Tag tone={openCount ? "gate" : "ops"} label={openCount ? `답할 질문 ${openCount}개` : "모두 답했습니다"} />
          {st ? <Muted>{`질문 문서 ${st.label}${doc.round ? ` · ${doc.round}차` : ""}`}</Muted> : null}
        </HStack>
        {readOnly ? null : <Button label="세션에 요청" icon={<Ico name="send" />} onClick={() => dispatch({ issue: isIssue ? target : undefined, paths: [doc.path], kind: "answers-ready", title: "설계 세션에 요청" })} />}
      </HStack>
      {readOnly && openCount ? <ReadOnlyLine /> : null}
      <VStack gap={4} aria-live="polite">
        {done ? <Notice kind="ok" title="모든 질문에 답했습니다. ">세션에는 아무것도 보내지 않았습니다. 설계 세션이 이어서 하게 하려면 위의 '세션에 요청'을 누릅니다.</Notice> : null}
        {questions.length ? null : <Empty title="질문이 없습니다" text={doc.sha256 ? "이 질문 문서에는 아직 질문이 없습니다." : "설계 세션이 질문을 만들면 여기 나옵니다."} />}
        {questions.map((q) => (
          <QuestionCard key={q.id} q={q} target={target} sha={doc.sha256} reload={reload} onAllAnswered={() => setDone(true)} readOnly={readOnly} />
        ))}
      </VStack>
      {doc.path ? (
        <Details label="파일">
          <Code>{doc.path}</Code>
        </Details>
      ) : null}
    </Page>
  );
}

function Index() {
  const load = useLoad<[Loose]>(() => [get("/intents")], [], { live: true });
  const { state, reload } = load;
  const crumbs = [{ label: "작업" }, { label: "문서", path: "/docs" }, { label: "질문" }];
  if (state.status === "loading") {
    return (
      <Page title="질문 답하기" sub={SUB} crumbs={crumbs}>
        <Loading rows={4} />
      </Page>
    );
  }
  if (state.status === "error") {
    return (
      <Page title="질문 답하기" sub={SUB} crumbs={crumbs} live={load}>
        <ErrorBlock error={state.error} retry={reload} />
      </Page>
    );
  }
  const withQuestions = (state.data[0].intents as Loose[]).filter((i) => i.questions.total > 0);
  return (
    <Page title="질문 답하기" sub={SUB} crumbs={crumbs} live={load}>
      {withQuestions.length ? (
        <Panel title="Intent 별 질문" flush>
          <List hasDividers edge="padded">
            {withQuestions.map((i) => (
              <ListItem
                key={i.key}
                label={
                  <HStack gap={2}>
                    <Link href={`/intents/${i.key}/questions`}>{i.key}</Link>
                    <Text>{i.title ?? i.name}</Text>
                  </HStack>
                }
                description={i.questions.open ? `답할 질문 ${i.questions.open}개 · 전체 ${i.questions.total}개` : `모두 답했습니다 · 전체 ${i.questions.total}개`}
                {...(i.questions.open ? { endContent: <Tag tone="gate" label={`질문 ${i.questions.open}`} /> } : {})}
              />
            ))}
          </List>
        </Panel>
      ) : (
        <Empty title="답할 질문이 없습니다" text="설계 세션이 질문을 만들면 여기 나옵니다." />
      )}
    </Page>
  );
}

export default function Questions({ route }: { route: Route }) {
  const target = route.params.target ?? route.params.key;
  return target ? <Detail target={target} /> : <Index />;
}
