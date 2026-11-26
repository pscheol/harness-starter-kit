// S00 전체 프로젝트. 이 컴퓨터에 등록한 킷 리포의 처리할 일 · 진행 · 킷 판을 한 화면에 모은다. 이 화면은 아무것도 쓰지 않는다(DB-R27).
// 프로젝트로 들어가는 링크는 같은 문서 안이 아니라 새로 읽는다(세션 · 프로젝트 목록이 모드마다 달라서).
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { List, ListItem } from "@astryxdesign/core/List";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useMemo, useState } from "react";
import { get } from "../lib/api";
import { ago, HARNESS_KO, KIND_KO, STEP_KO, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { SegBar } from "../ui/charts";
import { CommandBox, Details, ErrorBlock, HarnessBadge, Ico, Key, Loading, Muted, Notice, Panel, Seg, Tag } from "../ui/common";
import { Page, TwoCol } from "../ui/Page";

const STAGE_COLOR: Record<string, string> = {
  design: "var(--hk-design)",
  requirements: "var(--hk-design)",
  tasks: "var(--hk-build)",
  impl: "var(--hk-build)",
  verify: "var(--hk-build)",
  mr: "var(--hk-build)",
  done: "var(--hk-ops)",
  completed: "var(--hk-ops)",
  deploy: "var(--hk-ops)",
};
const stageName = (k: string): string => (k === "completed" ? "완료" : (STEP_KO[k] ?? k));

export function StageSeg({ stages }: { stages: Record<string, number> | undefined }) {
  const entries = Object.entries(stages ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  const desc = entries.map(([k, n]) => `${stageName(k)} ${n}`).join(", ");
  return (
    <VStack gap={1}>
      <SegBar label={`단계별 이슈: ${desc || "없음"}`} parts={entries.map(([k, n]) => ({ key: k, n, color: STAGE_COLOR[k] ?? "var(--hk-todo)", title: `${stageName(k)} ${n}` }))} />
      <Muted>{desc || "이슈 없음"}</Muted>
    </VStack>
  );
}

/** 새 문서로 읽는 링크(모드가 바뀐다) */
function Hard({ href, label, size = "sm" }: { href: string; label: string; size?: "sm" | "md" }) {
  return <Button label={label} size={size} href={href} />;
}

export default function Projects({ route: _route }: { route: Route }) {
  const app = useAppState();
  const multi = app.mode === "multi-root";
  const { state, reload, at, every, stale } = useLoad<[Loose, Loose, Loose]>(
    () => (multi ? [get("/projects", { scope: "top" }), get("/projects/overview", { scope: "top" }), get("/sessions", { scope: "top", query: { scope: "machine" } })] : [Promise.resolve({ ok: true as const, status: 200, data: null, meta: {} }), Promise.resolve({ ok: true as const, status: 200, data: null, meta: {} }), Promise.resolve({ ok: true as const, status: 200, data: null, meta: {} })]),
    [multi],
    { tolerate: ["not_found", "not_implemented"], live: multi },
  );
  const live = multi ? { at, every, stale } : undefined;
  const [group, setGroup] = useState("project");
  const [only, setOnly] = useState("all");
  const sub = "이 컴퓨터에 등록한 킷 리포들의 처리할 일과 진행을 한곳에서 봅니다. 승인 · 저장은 각 리포 화면에 들어가서 합니다.";
  const crumbs = [{ label: "프로젝트" }, { label: "전체 프로젝트" }];
  const tools = <Tag icon="eye" label="보기만 하는 화면" />;

  const data = state.status === "ready" ? state.data : null;
  const projects: Loose[] = data?.[0]?.projects ?? [];
  const over: Loose[] = data?.[1]?.projects ?? [];
  const sessions: Loose[] = data?.[2]?.sessions ?? [];
  const byId = useMemo(() => new Map(over.map((o) => [o.id, o])), [over]);
  const okOver = over.filter((o) => o.state === "ok");
  const total = over.reduce((s, o) => s + (o.total ?? 0), 0);

  if (!multi) {
    return (
      <Page title="전체 프로젝트" sub={sub} crumbs={crumbs} search={false}>
        <Panel title="여러 리포 함께 보기">
          <VStack gap={1}>
            <Text weight="semibold">지금은 이 리포 하나만 보는 관리 페이지입니다</Text>
            <Muted>킷을 깐 리포 여러 곳의 처리할 일을 한 화면에서 보려면, 리포를 등록한 뒤 관리 페이지를 모든 프로젝트 보기로 다시 엽니다.</Muted>
          </VStack>
          <HStack gap={2} align="center" wrap="wrap">
            <Hard href="/" label="이 리포 홈으로" />
          </HStack>
          <Details label="터미널 명령">
            <CommandBox cmd="knots-sync projects add <폴더>" label="리포 등록 명령 복사" />
            <CommandBox cmd="knots-sync dashboard --all" label="등록한 리포 모두 보기 명령 복사" />
            <CommandBox cmd="knots-sync dashboard --root ~/work" label="한 폴더 아래 리포 모두 보기 명령 복사" />
            <Muted>등록한 리포 목록은 ~/.config/knots-sync/projects.json 에 둡니다(경로 · 이름 · 더한 날만).</Muted>
          </Details>
        </Panel>
      </Page>
    );
  }
  if (state.status === "loading") return <Page title="전체 프로젝트" sub={sub} crumbs={crumbs} tools={tools} live={live}><Loading rows={5} /></Page>;
  if (state.status === "error") return <Page title="전체 프로젝트" sub={sub} crumbs={crumbs} tools={tools} live={live}><ErrorBlock error={state.error} retry={reload} /></Page>;
  if (!projects.length) {
    return (
      <Page title="전체 프로젝트" sub={sub} crumbs={crumbs} tools={tools} live={live}>
        <Panel title="등록한 리포">
          <VStack gap={1}>
            <Text weight="semibold">등록한 리포가 없습니다</Text>
            <Muted>킷을 깐 리포를 등록하면 처리할 일과 진행을 여기서 한꺼번에 봅니다.</Muted>
          </VStack>
          <Details label="터미널 명령">
            <CommandBox cmd="knots-sync projects add <폴더>" label="리포 등록 명령 복사" />
          </Details>
        </Panel>
      </Page>
    );
  }

  const rows = okOver.filter((o) => only === "all" || o.id === only);
  const todoRow = (o: Loose, t: Loose, i: number) => (
    <ListItem
      key={`${o.id}${t.target}${i}`}
      label={<HStack gap={2} align="center" wrap="wrap">{/^[A-Z][A-Z0-9]+-\d+$/.test(t.target) ? <Key>{t.target}</Key> : null}<Text weight="semibold">{t.title}</Text><Tag label={o.name} /></HStack>}
      description={`${t.reason} · ${ago(t.since)}`}
      href={`/p/${o.id}${t.link}`}
      endContent={<Hard href={`/p/${o.id}${t.link}`} label="열기" />}
    />
  );
  const todoList =
    group === "project"
      ? rows.filter((o) => o.todo.length).map((o) => (
          <Panel key={o.id} title={o.name} aside={<><Badge variant="neutral" label={String(o.total)} /><Hard href={`/p/${o.id}/`} label="홈 열기" /></>} flush>
            <List hasDividers>{(o.todo as Loose[]).map((t, i) => todoRow(o, t, i))}</List>
          </Panel>
        ))
      : [...new Set(rows.flatMap((o) => (o.todo as Loose[]).map((t) => t.kind as string)))].map((k) => {
          const items = rows.flatMap((o) => (o.todo as Loose[]).filter((t) => t.kind === k).map((t) => ({ o, t })));
          return (
            <Panel key={k} title={KIND_KO[k] ?? k} aside={<Badge variant="neutral" label={String(items.length)} />} flush>
              <List hasDividers>{items.map(({ o, t }, i) => todoRow(o, t, i))}</List>
            </Panel>
          );
        });

  return (
    <Page title="전체 프로젝트" sub={sub} crumbs={crumbs} tools={tools} search={false} live={live}>
      <TwoCol
        main={
          <Panel title="처리할 일" aside={<><Badge variant={total ? "red" : "neutral"} label={String(total)} /><Muted>{`리포 ${okOver.length}곳 · 리포마다 내 git 사용자 기준`}</Muted></>}>
            <HStack gap={3} wrap="wrap" align="center">
              <Seg label="묶기" items={[{ id: "project", label: "프로젝트별" }, { id: "kind", label: "종류별" }]} value={group} onChange={setGroup} />
              <Selector label="프로젝트" isLabelHidden size="sm" value={only} onChange={(v) => v && setOnly(v)} options={[{ value: "all", label: `모두 ${total}` }, ...okOver.map((o) => ({ value: o.id as string, label: `${o.name} ${o.total}` }))]} />
            </HStack>
            {state.data[1] === null ? <Notice kind="err" title="처리할 일을 모으지 못했습니다." /> : null}
            <VStack gap={4} aria-live="polite">
              {todoList.length ? todoList : <Text>등록한 리포 모두 지금 처리할 일이 없습니다.</Text>}
            </VStack>
          </Panel>
        }
        side={
          <>
            <VStack gap={3}>
              {projects.map((p) => {
                const o = byId.get(p.id);
                if (p.state !== "ok") {
                  return (
                    <Card key={p.id} padding={4}>
                      <VStack gap={2}>
                        <HStack gap={2} align="center" wrap="wrap"><Ico name="folder" /><Text weight="semibold">{p.name}</Text><Tag label={p.state === "missing" ? "폴더 없음" : "킷 리포 아님"} /></HStack>
                        <Muted>{p.state === "missing" ? "등록한 폴더가 없습니다. 옮겼거나 지운 것 같습니다. 목록에서 저절로 빼지 않습니다." : "이 폴더에는 킷이 깔려 있지 않습니다."}</Muted>
                        <Details label="위치 · 목록에서 빼는 명령">
                          <Text type="code" size="sm" wordBreak="break-all">{p.path}</Text>
                          <CommandBox cmd={p.remove ?? `knots-sync projects remove ${p.name}`} label="빼는 명령 복사" />
                        </Details>
                      </VStack>
                    </Card>
                  );
                }
                return (
                  <Card key={p.id} padding={4}>
                    <VStack gap={3}>
                      <HStack gap={2} align="center" justify="between" wrap="wrap">
                        <HStack gap={2} align="center"><Ico name="folder" /><Text weight="semibold">{p.name}</Text>{o && o.state === "ok" ? <Tag tone={o.total ? "gate" : "ops"} label={`처리할 일 ${o.total}`} /> : <Tag tone="gate" icon="alert" label="읽기 실패" />}</HStack>
                        <Hard href={`/p/${p.id}/`} label="열기" />
                      </HStack>
                      {o && o.state === "ok" ? (
                        <VStack gap={2}>
                          <StageSeg stages={o.stages} />
                          <HStack gap={4} wrap="wrap"><Muted>{`이슈 ${o.issues}개`}</Muted><Muted>{`킷 ${p.version ?? "판 모름"}`}</Muted><Muted>{`켜 둔 세션 ${o.sessions?.alive ?? 0}개`}</Muted></HStack>
                        </VStack>
                      ) : (
                        <Text color="secondary">{o?.error ?? "읽지 못했습니다"}</Text>
                      )}
                      <Details label="위치">
                        <Text type="code" size="sm" wordBreak="break-all">{p.path}</Text>
                        {p.addedAt ? <Muted>{`${p.addedAt}에 등록`}</Muted> : null}
                      </Details>
                      {(o?.children ?? []).length ? (
                        <Collapsible defaultIsOpen={false} chevronPosition="start" trigger={<Text size="sm" color="secondary">{`하위 리포 ${o.children.length}개`}</Text>}>
                          <VStack gap={1}>{(o.children as Loose[]).map((c) => (<HStack key={c.name} gap={2}><Text size="sm">{c.name}</Text><Tag label={c.state} /></HStack>))}</VStack>
                        </Collapsible>
                      ) : null}
                    </VStack>
                  </Card>
                );
              })}
            </VStack>
            <Panel title="켜 둔 세션" aside={<Muted>{`${sessions.filter((s) => s.state !== "gone").length}개 · 이 컴퓨터 전체`}</Muted>} flush>
              {sessions.length ? (
                <List hasDividers>
                  {sessions.map((s) => (
                    <ListItem key={s.id} label={s.name ?? `${HARNESS_KO[s.harness] ?? s.harness ?? "하네스"} 세션`} description={`${s.project}${s.issue ? ` · ${s.issue}` : ""}${s.startedAt ? ` · ${ago(s.startedAt)} 시작` : ""}`} startContent={<HarnessBadge name={s.harness} />} endContent={<Tag tone={s.state === "gone" ? "line" : s.turn === "working" ? "build" : "ops"} label={s.state === "gone" ? "끊김" : s.turn === "working" ? "일하는 중" : "쉬는 중"} />} />
                  ))}
                </List>
              ) : (
                <VStack paddingBlock={4} paddingInline={2}><Muted>이 컴퓨터에 켜 둔 세션이 없습니다</Muted></VStack>
              )}
            </Panel>
          </>
        }
      />
    </Page>
  );
}
