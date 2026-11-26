// S07 작업 공간: 작업 폴더(worktree) 목록 · 정리해도 되는지 판정 · 세션과 고치는 중인 파일 · 대기함. 화면은 정리 명령을 보여 주기만 하고 실행하지 않는다.
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useState } from "react";
import { del, errorText, get } from "../lib/api";
import { ago, HARNESS_KO, ROLE_KO, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { CommandBox, Details, EmptyNote, ErrorBlock, HarnessBadge, Ico, Loading, Muted, Notice, Panel, Tag, TermHelp, useNotify } from "../ui/common";
import { Page, TwoCol } from "../ui/Page";

/** 조건 한 줄. unknown 이면(셀 수 없음) 실패 표시 대신 물음표를 단다 */
function Cond({ ok, yes, no, unknown = false }: { ok: boolean; yes: string; no: string; unknown?: boolean }) {
  return (
    <HStack gap={1} align="center">
      <Ico name={unknown ? "help" : ok ? "ok" : "fail"} size={14} />
      <Text size="sm">{ok ? yes : no}</Text>
    </HStack>
  );
}

/** 작업 폴더 상태 세 가지(변경 · push · 병합)를 한 칸에 */
function WorktreeState({ w }: { w: Loose }) {
  return (
    <VStack gap={1}>
      <Cond ok={!w.dirty} yes="커밋 안 된 변경 없음" no="커밋 안 된 변경 있음" />
      {/* null 은 git 이 셀 수 없을 때(올릴 원격 브랜치가 없거나 커밋이 없음)다 */}
      <Cond ok={w.unpushed === 0} unknown={w.unpushed === null || w.unpushed === undefined} yes="모두 push 함" no={w.unpushed === null || w.unpushed === undefined ? "원격 브랜치가 없어 셀 수 없습니다" : `push 안 된 커밋 ${w.unpushed}개`} />
      {w.kind === "main" ? null : <Cond ok={w.merged === true} unknown={w.merged === null || w.merged === undefined} yes="브랜치 병합됨" no={w.merged === null || w.merged === undefined ? "병합했는지 셀 수 없습니다" : "브랜치 병합 전"} />}
    </VStack>
  );
}

/** 패널 안의 빈 상태: 왼쪽 정렬 한 묶음 */
function WorktreePanel({ wt }: { wt: Loose }) {
  const all = (wt.worktrees ?? []) as Loose[];
  const extra = all.filter((w) => w.kind !== "main");
  const main = all.find((w) => w.kind === "main");
  const done = extra.filter((w) => w.done);
  const anyIssue = all.some((w) => w.issue);
  return (
    <Panel title="작업 폴더" aside={<><TermHelp term="worktree" /><Muted>{`이슈별 폴더 ${wt.count ?? extra.length}개 · 최대 ${wt.maxPerRepo}개`}</Muted></>} flush>
      {extra.length ? (
        <Table
          data={all}
          idKey="path"
          density="compact"
          columns={[
            {
              key: "name",
              header: "폴더 · 브랜치",
              width: proportional(2),
              renderCell: (w: Loose) => (
                <VStack gap={1}>
                  <HStack gap={2} align="center" wrap="wrap">
                    <Text weight="semibold">{w.kind === "main" ? "메인 폴더" : w.name}</Text>
                    {w.done ? <Tag tone="ops" icon="ok" label="정리해도 됩니다" /> : null}
                  </HStack>
                  <Muted>{w.branch ? `${w.branch} 브랜치` : "브랜치에 붙지 않은 상태"}</Muted>
                </VStack>
              ),
            },
            ...(anyIssue ? [{ key: "issue", header: "이슈", width: proportional(1), renderCell: (w: Loose) => (w.issue ? <Link href={`/issues/${w.issue}`}>{w.issue}</Link> : <Muted>없음</Muted>) }] : []),
            { key: "state", header: "상태", width: proportional(2), renderCell: (w: Loose) => <WorktreeState w={w} /> },
            { key: "used", header: "마지막으로 쓴 때", width: proportional(1), renderCell: (w: Loose) => <Text size="sm">{ago(w.lastUsed)}</Text> },
          ]}
        />
      ) : (
        <VStack gap={3} paddingBlock={4} paddingInline={2}>
          <EmptyNote title="이슈별 작업 폴더가 없습니다" text="지금은 메인 폴더 하나에서 일합니다." />
          {main ? (
            <VStack gap={1}>
              <Text size="sm" weight="semibold">{`메인 폴더${main.branch ? ` · ${main.branch} 브랜치` : ""}`}</Text>
              <WorktreeState w={main} />
            </VStack>
          ) : null}
        </VStack>
      )}
      {extra.length ? (
        <VStack gap={2} paddingBlock={4} paddingInline={2}>
          <Muted>변경을 모두 커밋하고 push 한 뒤 브랜치가 병합되면 '정리해도 됩니다'가 붙습니다. 이 화면은 아무것도 지우지 않습니다.</Muted>
          <Details label="정리 명령">
            {done.map((w) => (
              <CommandBox key={w.path} cmd={`python3 scripts/harness/worktree.py done ${w.name}`} label={`${w.name} 정리 명령 복사`} />
            ))}
            {wt.gc ? <CommandBox cmd={String(wt.gc)} label="끝난 폴더 모두 정리" /> : null}
          </Details>
        </VStack>
      ) : null}
    </Panel>
  );
}

function sessionLabel(s: Loose): string {
  if (s.name) return String(s.name);
  return `${HARNESS_KO[s.harness] ?? s.harness ?? "하네스"} 세션`;
}

function sessionText(s: Loose): string {
  const parts = [
    s.role && s.role !== "unknown" ? (ROLE_KO[s.role] ?? s.role) : null,
    s.issue ? String(s.issue) : null,
    s.branch ? `${s.branch} 브랜치` : null,
    s.startedAt ? `${ago(s.startedAt)} 시작` : null,
    (s.files as string[] | undefined)?.length ? `고치는 중: ${(s.files as string[]).join(", ")}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

function SessionsPanel({ sessions }: { sessions: Loose[] }) {
  const alive = sessions.filter((s) => s.state !== "gone").length;
  return (
    <Panel title="켜 둔 세션" aside={<Muted>{`${alive}개 켜짐`}</Muted>} flush={sessions.length > 0}>
      {sessions.length ? (
        <List hasDividers>
          {sessions.map((s) => (
            <ListItem
              key={s.id}
              label={sessionLabel(s)}
              description={sessionText(s) || undefined}
              startContent={<HarnessBadge name={s.harness} />}
              endContent={<Tag tone={s.state === "gone" ? "line" : s.turn === "working" ? "build" : "ops"} label={s.state === "gone" ? "끊김" : s.turn === "working" ? "일하는 중" : "쉬는 중"} />}
            />
          ))}
        </List>
      ) : (
        <EmptyNote title="켜 둔 세션이 없습니다" text="이 리포에서 하네스 세션을 열면 저절로 여기 보입니다." />
      )}
    </Panel>
  );
}

function QueuePanel({ items, readOnly, onGone }: { items: Loose[]; readOnly: boolean; onGone: (id: string) => void }) {
  const notify = useNotify();
  async function drop(id: string): Promise<void> {
    const r = await del(`/dispatch/queue/${encodeURIComponent(id)}`);
    if (!r.ok) {
      notify(errorText(r.error));
      return;
    }
    onGone(id);
    notify("대기함 항목을 버렸습니다");
  }
  return (
    <Panel title="대기함" aside={<Muted>{`${items.length}건`}</Muted>} flush={items.length > 0}>
      {items.length ? (
        <>
          <List hasDividers>
            {items.map((x) => (
              <ListItem
                key={x.id}
                label={String(x.message).slice(0, 160)}
                description={[x.createdBy, ago(x.createdAt), x.stale ? "하루 넘게 아무도 가져가지 않았습니다" : null].filter(Boolean).join(" · ")}
                endContent={
                  <HStack gap={1} align="center">
                    {x.stale ? <Tag tone="build" label="오래됨" /> : null}
                    {readOnly ? null : <Button label="버리기" size="sm" variant="destructive" icon={<Ico name="trash" />} onClick={() => void drop(String(x.id))} />}
                  </HStack>
                }
              />
            ))}
          </List>
          {readOnly ? (
            <HStack gap={1} align="center" paddingBlock={3} paddingInline={2}>
              <Muted>버리기는 자기 터미널에서 연 관리 페이지에서 합니다</Muted>
              <TermHelp term="readOnly" />
            </HStack>
          ) : null}
        </>
      ) : (
        <EmptyNote title="대기함이 비었습니다" text="다른 세션에 보낸 요청을 아직 아무도 가져가지 않으면 여기 쌓입니다." />
      )}
    </Panel>
  );
}

export default function Workspace({ route: _route }: { route: Route }) {
  const app = useAppState();
  const readOnly = Boolean(app.session?.readOnly);
  const { state, reload, at, every, stale } = useLoad<[Loose, Loose, Loose]>(() => [get("/worktrees"), get("/sessions"), get("/dispatch/queue")], [], { live: true });
  const [gone, setGone] = useState<string[]>([]);
  const sub = "이슈마다 나눈 작업 폴더와 켜 둔 세션, 아직 아무도 가져가지 않은 요청을 봅니다. 정리는 터미널에서 합니다.";
  const crumbs = [{ label: "운영" }, { label: "작업 공간" }];
  const live = { at, every, stale };
  if (state.status === "loading") return <Page title="작업 공간" sub={sub} crumbs={crumbs} live={live}><Loading rows={6} /></Page>;
  if (state.status === "error") return <Page title="작업 공간" sub={sub} crumbs={crumbs} live={live}><ErrorBlock error={state.error} retry={reload} /></Page>;
  const [wt, sess, q] = state.data;
  const sessions = (sess?.sessions ?? []) as Loose[];
  const queue = ((q?.items ?? []) as Loose[]).filter((x) => !gone.includes(x.id));

  return (
    <Page title="작업 공간" sub={sub} crumbs={crumbs} live={live}>
      {wt.over ? <Notice kind="warn" title={`작업 폴더가 ${wt.count}개로, 리포당 최대 ${wt.maxPerRepo}개를 넘었습니다.`}>정리해도 되는 폴더부터 정리합니다.</Notice> : null}
      <WorktreePanel wt={wt} />
      <TwoCol wide={1000} main={<SessionsPanel sessions={sessions} />} side={<QueuePanel items={queue} readOnly={readOnly} onGone={(id) => setGone((g) => [...g, id])} />} />
    </Page>
  );
}
