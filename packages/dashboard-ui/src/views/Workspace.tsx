// S07 작업 공간: worktree 목록 · 끝의 정의 판정 · 세션과 점유 파일 · 대기함. 화면은 정리 명령을 보여 주기만 하고 실행하지 않는다(DB-R10).
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useState } from "react";
import { del, errorText, get } from "../lib/api";
import { ago, ROLE_KO, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { Code, CommandBox, Empty, ErrorBlock, HarnessBadge, Ico, Loading, Muted, Notice, Panel, Tag, useNotify } from "../ui/common";
import { Page, TwoCol } from "../ui/Page";

function Cond({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <HStack gap={1} align="center">
      <Ico name={ok ? "ok" : "fail"} size={14} />
      <Text size="sm">{ok ? yes : no}</Text>
    </HStack>
  );
}

export default function Workspace({ route: _route }: { route: Route }) {
  const app = useAppState();
  const notify = useNotify();
  const readOnly = Boolean(app.session?.readOnly);
  const { state, reload } = useLoad<[Loose, Loose, Loose]>(() => [get("/worktrees"), get("/sessions"), get("/dispatch/queue")], []);
  const [gone, setGone] = useState<string[]>([]);
  const sub = "worktree · 끝의 정의 · 세션 · 대기함. 정리는 터미널에서";
  const crumbs = [{ label: "운영" }, { label: "작업 공간" }];
  if (state.status === "loading") return <Page title="작업 공간" sub={sub} crumbs={crumbs}><Loading rows={6} /></Page>;
  if (state.status === "error") return <Page title="작업 공간" sub={sub} crumbs={crumbs}><ErrorBlock error={state.error} retry={reload} /></Page>;
  const [wt, sess, q] = state.data;
  const sessions = sess.sessions as Loose[];
  const queue = (q.items as Loose[]).filter((x) => !gone.includes(x.id));

  return (
    <Page title="작업 공간" sub={sub} crumbs={crumbs}>
      {wt.over ? <Notice kind="warn" title={`worktree ${wt.count}개 — 리포당 상한 ${wt.maxPerRepo}개를 넘었습니다. `}>끝난 것부터 정리합니다.</Notice> : null}
      <Panel title="worktree" aside={<Muted>{`${wt.count}개 / 상한 ${wt.maxPerRepo}`}</Muted>} flush>
        <Table
          data={wt.worktrees as Loose[]}
          idKey="path"
          density="compact"
          columns={[
            { key: "name", header: "폴더", renderCell: (w: Loose) => (<VStack gap={0}><Text weight="semibold">{w.name}</Text><Muted size="xsm">{w.path}</Muted></VStack>) },
            { key: "kind", header: "종류 · 브랜치", renderCell: (w: Loose) => (<VStack gap={1}><Tag tone={w.kind === "main" ? "line" : "design"} label={w.kind === "main" ? "메인" : "worktree"} /><Muted size="xsm">{w.branch ?? "분리된 HEAD"}</Muted></VStack>) },
            { key: "issue", header: "이슈", renderCell: (w: Loose) => (w.issue ? <Link href={`/issues/${w.issue}`}>{w.issue}</Link> : <Text>—</Text>) },
            { key: "dirty", header: "변경", renderCell: (w: Loose) => <Cond ok={!w.dirty} yes="변경 없음" no="커밋 안 된 변경" /> },
            { key: "unpushed", header: "push", renderCell: (w: Loose) => <Cond ok={w.unpushed === 0} yes="push 안 된 커밋 0" no={`push 안 된 커밋 ${w.unpushed}`} /> },
            { key: "merged", header: "병합", renderCell: (w: Loose) => (w.kind === "main" ? <Muted size="xsm">-</Muted> : <Cond ok={w.merged === true} yes="병합됨" no="병합 전" />) },
            { key: "done", header: "끝", renderCell: (w: Loose) => (<VStack gap={1}>{w.done ? <Tag tone="ops" label="정리 가능" /> : <Muted size="xsm">{w.kind === "main" ? "-" : "아직"}</Muted>}<Muted size="xsm">{ago(w.lastUsed)}</Muted></VStack>) },
            { key: "cmd", header: "정리 명령", renderCell: (w: Loose) => (w.done ? <CommandBox cmd={`python3 scripts/harness/worktree.py done ${w.name}`} label="복사" /> : <Text> </Text>) },
          ]}
        />
        <VStack padding={4}>
          <Muted>
            끝의 정의 = 변경 없음 + push 안 된 커밋 0 + 브랜치 병합됨. 화면은 아무것도 지우지 않습니다. 사람이 터미널에서: <Code>{wt.gc}</Code>
          </Muted>
        </VStack>
      </Panel>
      <TwoCol
        wide={1000}
        main={
          <Panel title="세션 · 점유 파일" aside={<Muted>{`${sessions.filter((s) => s.state !== "gone").length}개 살아 있음`}</Muted>} flush>
            {sessions.length ? (
              <List hasDividers>
                {sessions.map((s) => (
                  <ListItem
                    key={s.id}
                    label={s.name ?? String(s.id).slice(0, 12)}
                    description={`${ROLE_KO[s.role] ?? s.role ?? "역할 모름"}${s.issue ? ` · ${s.issue}` : ""} · ${s.state === "gone" ? "끊김" : s.state === "alive" ? "수신함 있음" : "수신함 없음"}${(s.files as string[]).length ? ` · 점유: ${(s.files as string[]).join(", ")}` : ""}`}
                    startContent={<HarnessBadge name={s.harness} />}
                    endContent={<Tag tone={s.state === "gone" ? "line" : s.turn === "working" ? "build" : "ops"} label={s.state === "gone" ? "끊김" : s.turn === "working" ? "일하는 중" : "쉬는 중"} />}
                  />
                ))}
              </List>
            ) : (
              <Empty title="등록된 세션이 없습니다" text="세션 시작 훅이 등록합니다." />
            )}
          </Panel>
        }
        side={
          <Panel title="대기함" aside={<Muted>{`${queue.length}건`}</Muted>} flush>
            {queue.length ? (
              <List hasDividers>
                {queue.map((x) => (
                  <ListItem
                    key={x.id}
                    label={String(x.message).slice(0, 160)}
                    description={`${x.kind ?? ""} · ${x.createdBy ?? ""} · ${ago(x.createdAt)}${x.stale ? " · 24시간 넘게 가져가지 않았습니다" : ""} · ${x.id}`}
                    endContent={
                      <HStack gap={1} align="center">
                        {x.stale ? <Tag tone="build" label="오래됨" /> : null}
                        <Button
                          label="버리기"
                          size="sm"
                          variant="destructive"
                          icon={<Ico name="trash" />}
                          isDisabled={readOnly}
                          onClick={() => {
                            void (async () => {
                              const r = await del(`/dispatch/queue/${encodeURIComponent(x.id)}`);
                              if (!r.ok) {
                                notify(errorText(r.error));
                                return;
                              }
                              setGone((g) => [...g, x.id]);
                              notify("대기함 항목을 버렸습니다");
                            })();
                          }}
                        />
                      </HStack>
                    }
                  />
                ))}
              </List>
            ) : (
              <Empty title="대기함이 비었습니다" text="Codex · Kiro 세션이나 사람이 대기함을 고른 요청이 여기 쌓입니다. 훅이 다음 세션 시작 때 건수와 첫 요청 한 줄만 보여 줍니다." />
            )}
          </Panel>
        }
      />
    </Page>
  );
}
