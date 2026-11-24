// S04 질문 답하기. 선택지를 고르고 메모를 남긴다. 답은 PIN 이 필요하고(탭마다 한 번) 마지막 질문에 답해도 세션에 아무것도 보내지 않는다(DB-R25).
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { useState } from "react";
import { errorText, get, post } from "../lib/api";
import type { Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { Code, Empty, ErrorBlock, Ico, Key, Loading, Muted, Notice, Panel, ReadOnlyNote, Tag, useNotify, type NoticeKind } from "../ui/common";
import { useDispatch } from "../ui/Dispatch";
import { Page } from "../ui/Page";
import { usePin } from "../ui/Pin";

function QuestionCard({ q, target, sha, reload, onAllAnswered }: { q: Loose; target: string; sha: string; reload: () => void; onAllAnswered: () => void }) {
  const app = useAppState();
  const withPin = usePin();
  const notify = useNotify();
  const readOnly = Boolean(app.session?.readOnly);
  const [picked, setPicked] = useState("");
  const [memo, setMemo] = useState("");
  const [out, setOut] = useState<{ kind: NoticeKind; title: string; text?: string } | null>(null);
  const choices = [...(q.choices as Loose[]), { id: "other", text: "다른 답", impact: "메모에 쓴다" }];

  async function answer(): Promise<void> {
    if (!picked) {
      setOut({ kind: "warn", title: "선택지를 고른다." });
      return;
    }
    if (picked === "other" && !memo.trim()) {
      setOut({ kind: "warn", title: "'다른 답' 은 메모가 필요하다." });
      return;
    }
    const res = await withPin((pin) => post(`/questions/${encodeURIComponent(target)}/${encodeURIComponent(q.id)}/answer`, { choice: picked, ...(memo.trim() ? { text: memo.trim() } : {}), baseSha256: sha, pin }));
    if (!res.ok) {
      setOut({ kind: "err", title: `${res.error.code}: `, text: errorText(res.error) });
      if (res.error.code === "conflict") reload();
      return;
    }
    notify(res.data.kind === "opinion" ? "의견으로 남겼다(질문은 열려 있다)" : "답을 저장했다");
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
          <Tag label={q.category} />
          {q.blocks ? <Tag tone="gate" icon="alert" label={`막는 게이트 ${q.blocks}`} /> : null}
          <Muted size="xsm">{`답할 직무 ${q.role}`}</Muted>
        </>
      }
    >
      <RadioList label="선택지" isLabelHidden value={picked} onChange={setPicked} isDisabled={readOnly || !q.open}>
        {choices.map((c) => (
          <RadioListItem
            key={c.id}
            value={c.id}
            label={`${c.id}. ${c.text}`}
            {...(c.impact ? { description: `영향: ${c.impact}` } : {})}
            {...(c.id === q.recommended ? { endContent: <Tag tone="design" label="권장" /> } : {})}
          />
        ))}
      </RadioList>
      {q.open ? <TextArea label="메모" value={memo} onChange={setMemo} rows={2} isDisabled={readOnly} maxLength={500} placeholder="메모(선택, 500자 이하). 'other' 는 필수" /> : null}
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
      {q.open && !readOnly ? (
        <VStack gap={2}>
          <HStack gap={1} align="center">
            <Ico name="commit" size={14} />
            <Muted size="xsm">{`git user.email ${app.session?.user?.email ?? "-"} 로 questions.md 에 기록`}</Muted>
          </HStack>
          <HStack>
            <Button label="답 저장" variant="primary" icon={<Ico name="check" />} onClick={() => void answer()} />
          </HStack>
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
  const { state, reload } = useLoad<[Loose]>(() => [get("/questions", { query: { target } })], [target]);
  const [done, setDone] = useState(false);
  const crumbs = [{ label: "작업" }, { label: "문서", path: "/docs" }, { label: `질문 ${target}` }];
  const sub = "권장안을 보고 선택지를 고른다. 답이 모이면 설계 세션에 사람이 요청한다";
  if (state.status === "loading") return <Page title={`질문 · ${target}`} sub={sub} crumbs={crumbs}><Loading rows={5} /></Page>;
  if (state.status === "error") return <Page title={`질문 · ${target}`} sub={sub} crumbs={crumbs}><ErrorBlock error={state.error} retry={reload} /></Page>;
  const doc = state.data[0];
  const open = (doc.questions as Loose[]).filter((q) => q.open).length;
  return (
    <Page title={`질문 · ${target}`} sub={sub} crumbs={crumbs} width={960}>
      <HStack gap={3} wrap="wrap" align="center" justify="between">
        <HStack gap={2} wrap="wrap" align="center">
          <Tag tone={open ? "gate" : "ops"} label={`열린 질문 ${open}`} />
          <Code>{doc.path}</Code>
          <Muted size="xsm">{`status ${doc.status ?? "-"}${doc.round ? ` · ${doc.round}차` : ""}`}</Muted>
        </HStack>
        {readOnly ? <ReadOnlyNote /> : <Button label="세션에 요청" icon={<Ico name="send" />} onClick={() => dispatch({ issue: /^[A-Z]+-\d+$/.test(target) && !target.startsWith("INT-") ? target : undefined, paths: [doc.path], kind: "answers-ready", title: "설계 세션에 요청" })} />}
      </HStack>
      <VStack gap={4} aria-live="polite">
        {done ? <Notice kind="ok" title="모든 질문에 답이 찼다. ">세션에는 아무것도 보내지 않았다. 설계 세션에 알리려면 위의 '세션에 요청'을 누른다.</Notice> : null}
        {readOnly ? <Notice kind="warn" title="읽기 전용. ">에이전트 세션에서 연 서버는 답을 받지 않는다. 사람이 자기 터미널에서 연 서버에서 한다.</Notice> : null}
        {!(doc.questions as Loose[]).length ? <Empty title="질문이 없다" text={doc.sha256 ? "questions.md 에 질문이 없다." : "아직 questions.md 가 없다."} /> : null}
        {(doc.questions as Loose[]).map((q) => (
          <QuestionCard key={q.id} q={q} target={target} sha={doc.sha256} reload={reload} onAllAnswered={() => setDone(true)} />
        ))}
      </VStack>
    </Page>
  );
}

function Index() {
  const { state, reload } = useLoad<[Loose]>(() => [get("/intents")], []);
  const crumbs = [{ label: "작업" }, { label: "문서", path: "/docs" }, { label: "질문" }];
  const sub = "권장안을 보고 선택지를 고른다. 답이 모이면 설계 세션에 사람이 요청한다";
  if (state.status === "loading") return <Page title="질문 답하기" sub={sub} crumbs={crumbs}><Loading rows={4} /></Page>;
  if (state.status === "error") return <Page title="질문 답하기" sub={sub} crumbs={crumbs}><ErrorBlock error={state.error} retry={reload} /></Page>;
  const open = (state.data[0].intents as Loose[]).filter((i) => i.questions.total > 0);
  return (
    <Page title="질문 답하기" sub={sub} crumbs={crumbs}>
      {open.length ? (
        <Panel title="Intent 별 질문" flush>
          <List hasDividers>
            {open.map((i) => (
              <ListItem key={i.key} label={<HStack gap={2}><Link href={`/intents/${i.key}/questions`}>{i.key}</Link><Text>{i.title ?? i.name}</Text></HStack>} description={`열린 질문 ${i.questions.open}/${i.questions.total}`} />
            ))}
          </List>
        </Panel>
      ) : (
        <Empty title="질문이 없다" text="설계 세션이 질문을 만들면 여기 나온다." />
      )}
    </Page>
  );
}

export default function Questions({ route }: { route: Route }) {
  const target = route.params.target ?? route.params.key;
  return target ? <Detail target={target} /> : <Index />;
}
