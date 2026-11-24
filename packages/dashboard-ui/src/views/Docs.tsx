// 문서 메뉴: 이슈 문서(requirements · design · tasks)와 승인 상태, Intent 와 질문. 기획물 · 기능 문서 · ADR 목록은 다음 판에서 정의한다(화면기획서 3장).
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack } from "@astryxdesign/core/Stack";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { get } from "../lib/api";
import { GATE_KO, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import type { Loose } from "../lib/types";
import { Empty, ErrorBlock, Key, Loading, Muted, Panel, Tag, type Tone } from "../ui/common";
import { Page } from "../ui/Page";

const APPROVAL: Record<string, [Tone, string]> = { valid: ["ops", "승인됨"], stale: ["build", "승인 뒤 바뀜"], invalid: ["gate", "승인자 아님"], none: ["line", "승인 전"] };
const DOCS = ["requirements", "design", "tasks"];

export default function Docs({ route }: { route: Route }) {
  const { state, reload } = useLoad<[Loose, Loose]>(() => [get("/issues"), get("/intents")], []);
  const sub = "이슈 문서 · 승인 상태 · 질문. 찾기는 이슈 키나 문서 경로를 받는다";
  const crumbs = [{ label: "작업" }, { label: "문서" }];
  if (state.status === "loading") return <Page title="문서" sub={sub} crumbs={crumbs}><Loading rows={6} /></Page>;
  if (state.status === "error") return <Page title="문서" sub={sub} crumbs={crumbs}><ErrorBlock error={state.error} retry={reload} /></Page>;
  const q = (route.query.q ?? "").toLowerCase();
  const issues = (state.data[0].issues as Loose[]).filter((i) => !q || `${i.key} ${i.name} ${i.title ?? ""} ${i.dir}`.toLowerCase().includes(q));
  const intents = (state.data[1].intents as Loose[]).filter((i) => !q || `${i.key} ${i.name} ${i.title ?? ""}`.toLowerCase().includes(q));
  return (
    <Page title="문서" sub={sub} crumbs={crumbs}>
      {q ? <Muted>{`"${route.query.q}" 로 거른 결과 — 이슈 ${issues.length} · Intent ${intents.length}`}</Muted> : null}
      <Panel title="이슈 문서" aside={<Muted>{`${issues.length}개`}</Muted>} flush>
        {issues.length ? (
          <Table
            data={issues}
            idKey="key"
            density="compact"
            hasHover
            columns={[
              { key: "key", header: "이슈", renderCell: (i: Loose) => <Link href={`/issues/${i.key}`}>{i.key}</Link> },
              { key: "title", header: "제목", renderCell: (i: Loose) => <Text>{i.title ?? i.name}</Text> },
              ...DOCS.map((d) => ({
                key: d,
                header: d,
                renderCell: (i: Loose) => {
                  const doc = i.docs[d];
                  if (!doc) return <Muted size="xsm">없음</Muted>;
                  const [tone, text] = APPROVAL[doc.approval] ?? (["line", doc.approval] as [Tone, string]);
                  return (
                    <HStack gap={1} align="center" wrap="wrap">
                      <Link href={`/issues/${i.key}/docs/${d}`}>{doc.status ?? doc.state ?? "-"}</Link>
                      {d === "tasks" ? null : <Tag tone={tone} label={text} />}
                      {doc.clarify ? <Tag tone="gate" icon="alert" label={`CLARIFY ${doc.clarify}`} /> : null}
                    </HStack>
                  );
                },
              })),
              { key: "wait", header: "승인 대기", renderCell: (i: Loose) => (i.waitingOn ? <Tag tone="gate" icon="clock" label={`${GATE_KO[i.waitingOn.gate] ?? i.waitingOn.gate} 승인 대기`} /> : <Muted size="xsm">-</Muted>) },
            ]}
          />
        ) : (
          <Empty title="이슈 문서가 없다" text={q ? "찾는 말을 바꿔 본다." : "이슈를 만들면 requirements · design · tasks 가 여기 나온다."} />
        )}
      </Panel>
      <Panel title="Intent · 질문" aside={<Muted>{`${intents.length}개`}</Muted>} flush>
        {intents.length ? (
          <List hasDividers>
            {intents.map((i) => (
              <ListItem
                key={i.key}
                label={<HStack gap={2} align="center"><Key>{i.key}</Key><Text weight="semibold">{i.title ?? i.name}</Text></HStack>}
                description={`status ${i.status ?? "-"} · 기획물 ${i.plans.length}개 · 열린 질문 ${i.questions.open}/${i.questions.total}`}
                endContent={
                  <HStack gap={1}>
                    <Button label="질문" size="sm" href={`/intents/${i.key}/questions`} />
                    <Button label="흐름" size="sm" href={`/progress?view=flow&intent=${i.key}`} />
                  </HStack>
                }
              />
            ))}
          </List>
        ) : (
          <Empty title="Intent 가 없다" text="새 요구사항을 접수하면 만들어진다." />
        )}
      </Panel>
    </Page>
  );
}
