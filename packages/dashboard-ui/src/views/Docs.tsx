// 문서 메뉴: 이슈마다 요구사항 · 설계 · 작업 목록이 어디까지 왔는지, Intent 를 쓰는 리포는 Intent 와 질문도. 기획물 · 기능 문서 · ADR 목록은 다음 판에서 정의한다.
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { pixel, proportional, Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { get } from "../lib/api";
import { GATE_KO, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import type { Loose } from "../lib/types";
import { Empty, ErrorBlock, Key, Loading, Muted, Panel, Tag, TermHelp } from "../ui/common";
import { byIssueKey, docState, issueTitle } from "../ui/GateRail";
import { Page } from "../ui/Page";

const DOCS: Array<[string, string]> = [
  ["requirements", "요구사항"],
  ["design", "설계"],
  ["tasks", "작업 목록"],
];
const SUB = "이슈마다 요구사항 · 설계 · 작업 목록이 어디까지 왔는지 보고, 눌러서 엽니다.";
const CRUMBS = [{ label: "작업" }, { label: "문서" }];

function DocCell({ issue, name, label }: { issue: Loose; name: string; label: string }) {
  const doc = issue.docs[name];
  const st = docState(name, doc);
  if (!st) return <Muted>없음</Muted>;
  return (
    <HStack gap={1} align="center" wrap="wrap">
      <Link href={`/issues/${issue.key}/docs/${name}`} label={`${issue.key} ${label} 문서 열기 — ${st.label}`}>
        <Tag tone={st.tone} label={st.label} />
      </Link>
      {doc?.clarify ? <Tag tone="gate" icon="alert" label={`확인 필요 ${doc.clarify}`} /> : null}
    </HStack>
  );
}

export default function Docs({ route }: { route: Route }) {
  const load = useLoad<[Loose, Loose]>(() => [get("/issues"), get("/intents")], [], { live: true });
  const { state, reload } = load;
  if (state.status === "loading") {
    return (
      <Page title="문서" sub={SUB} crumbs={CRUMBS}>
        <Loading rows={6} />
      </Page>
    );
  }
  if (state.status === "error") {
    return (
      <Page title="문서" sub={SUB} crumbs={CRUMBS} live={load}>
        <ErrorBlock error={state.error} retry={reload} />
      </Page>
    );
  }
  const q = (route.query.q ?? "").toLowerCase();
  const allIntents = state.data[1].intents as Loose[];
  const issues = [...(state.data[0].issues as Loose[])].filter((i) => !q || `${i.key} ${i.name} ${i.title ?? ""} ${i.dir}`.toLowerCase().includes(q)).sort(byIssueKey);
  const intents = allIntents.filter((i) => !q || `${i.key} ${i.name} ${i.title ?? ""}`.toLowerCase().includes(q));
  // 모든 줄이 비어 있는 열은 숨긴다(제목이 폴더 이름뿐인 리포 · 승인 대기가 없는 때)
  const hasTitle = issues.some((i) => issueTitle(i));
  const hasWait = issues.some((i) => i.waitingOn);
  return (
    <Page title="문서" sub={SUB} crumbs={CRUMBS} live={load}>
      {q ? <Muted>{`"${route.query.q}" 로 거른 결과 — 이슈 ${issues.length}개${allIntents.length ? ` · Intent ${intents.length}개` : ""}`}</Muted> : null}
      <Panel title="이슈 문서" aside={<Muted>{`${issues.length}개`}</Muted>} flush>
        {issues.length ? (
          <Table
            data={issues}
            idKey="key"
            density="compact"
            hasHover
            verticalAlign="top"
            columns={[
              {
                key: "key",
                header: "이슈",
                width: proportional(3, { minWidth: 240 }),
                renderCell: (i: Loose) => (
                  <VStack gap={0.5}>
                    <Link href={`/issues/${i.key}`} weight="semibold">
                      {i.key}
                    </Link>
                    {hasTitle && issueTitle(i) ? <Muted>{issueTitle(i)}</Muted> : null}
                  </VStack>
                ),
              },
              ...DOCS.map(([d, label]) => ({ key: d, header: label, width: pixel(132), renderCell: (i: Loose) => <DocCell issue={i} name={d} label={label} /> })),
              ...(hasWait ? [{ key: "wait", header: "승인 대기", width: pixel(160), renderCell: (i: Loose) => (i.waitingOn ? <Tag tone="gate" icon="clock" label={`${GATE_KO[i.waitingOn.gate] ?? i.waitingOn.gate} 승인 대기`} /> : <Muted>없음</Muted>) }] : []),
            ]}
          />
        ) : (
          <VStack paddingBlock={4} paddingInline={2}>
            <Empty title="이슈 문서가 없습니다" text={q ? "찾는 말을 바꿔 봅니다." : "새 요구사항을 접수하면 이슈와 문서가 여기 나옵니다."} />
          </VStack>
        )}
      </Panel>
      {allIntents.length ? (
        <Panel
          title="Intent · 질문"
          aside={
            <>
              <Muted>{`${intents.length}개`}</Muted>
              <TermHelp term="intent" />
            </>
          }
          flush
        >
          {intents.length ? (
            <List hasDividers>
              {intents.map((i) => (
                <ListItem
                  key={i.key}
                  label={
                    <HStack gap={2} align="center">
                      <Key>{i.key}</Key>
                      <Text weight="semibold">{i.title ?? i.name}</Text>
                    </HStack>
                  }
                  description={`${docState("intent", { status: i.status })?.label ?? "상태 없음"} · 기획물 ${i.plans.length}개 · 답할 질문 ${i.questions.open}/${i.questions.total}`}
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
            <VStack paddingBlock={4} paddingInline={2}>
              <Empty title="찾는 Intent 가 없습니다" text="찾는 말을 바꿔 봅니다." />
            </VStack>
          )}
        </Panel>
      ) : null}
    </Page>
  );
}
