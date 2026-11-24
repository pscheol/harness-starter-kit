// S00 전체 프로젝트. 이 컴퓨터에 등록한 킷 리포의 처리할 일 · 진행 · 킷 버전을 한 화면에 모은다. 이 화면은 아무것도 쓰지 않는다(DB-R27).
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
import { ago, KIND_KO, STEP_KO, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { SegBar } from "../ui/charts";
import { CommandBox, Empty, ErrorBlock, HarnessBadge, Ico, IconNote, Key, Loading, Muted, Notice, Panel, Seg, Tag } from "../ui/common";
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
      <Muted size="xsm">{desc || "이슈 없음"}</Muted>
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
  const { state, reload } = useLoad<[Loose, Loose, Loose]>(
    () => (multi ? [get("/projects", { scope: "top" }), get("/projects/overview", { scope: "top" }), get("/sessions", { scope: "top", query: { scope: "machine" } })] : [Promise.resolve({ ok: true as const, status: 200, data: null, meta: {} }), Promise.resolve({ ok: true as const, status: 200, data: null, meta: {} }), Promise.resolve({ ok: true as const, status: 200, data: null, meta: {} })]),
    [multi],
    { tolerate: ["not_found", "not_implemented"] },
  );
  const [group, setGroup] = useState("project");
  const [only, setOnly] = useState("all");
  const sub = "이 컴퓨터에 등록한 킷 리포 · 쓰기는 들어간 리포 안에서만 됩니다";
  const crumbs = [{ label: "프로젝트" }, { label: "전체 프로젝트" }];
  const tools = <Tag icon="eye" label="쓰기 없음 · 쓰기는 프로젝트 안에서" />;

  const data = state.status === "ready" ? state.data : null;
  const projects: Loose[] = data?.[0]?.projects ?? [];
  const over: Loose[] = data?.[1]?.projects ?? [];
  const sessions: Loose[] = data?.[2]?.sessions ?? [];
  const byId = useMemo(() => new Map(over.map((o) => [o.id, o])), [over]);
  const okOver = over.filter((o) => o.state === "ok");
  const total = over.reduce((s, o) => s + (o.total ?? 0), 0);

  if (!multi) {
    return (
      <Page title="전체 프로젝트" sub={sub} crumbs={crumbs} tools={tools}>
        <Notice kind="info" title="지금은 한 리포만 연 서버입니다. ">여러 리포를 한 화면에서 보려면 등록부(~/.config/knots-sync/projects.json)나 폴더를 가리켜 서버를 다시 엽니다.</Notice>
        <VStack gap={2}>
          <CommandBox cmd="npx knots-sync dashboard --all" label="--all 복사" />
          <CommandBox cmd="npx knots-sync dashboard --root ~/work" label="--root 복사" />
          <CommandBox cmd="npx knots-sync projects add <폴더>" label="등록 명령 복사" />
        </VStack>
      </Page>
    );
  }
  if (state.status === "loading") return <Page title="전체 프로젝트" sub={sub} crumbs={crumbs} tools={tools}><Loading rows={5} /></Page>;
  if (state.status === "error") return <Page title="전체 프로젝트" sub={sub} crumbs={crumbs} tools={tools}><ErrorBlock error={state.error} retry={reload} /></Page>;
  if (!projects.length) {
    return (
      <Page title="전체 프로젝트" sub={sub} crumbs={crumbs} tools={tools}>
        <Empty title="등록된 프로젝트가 없습니다" text="킷을 설치한 리포를 등록하면 여기서 한꺼번에 봅니다." actions={<CommandBox cmd="npx knots-sync projects add <폴더>" label="명령 복사" />} />
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
    <Page title="전체 프로젝트" sub={sub} crumbs={crumbs} tools={tools} search={false}>
      <IconNote icon="folder" size="xsm">{`등록된 프로젝트 ${projects.length} · ~/.config/knots-sync/projects.json · 경로 · 이름 · 더한 날만 둡니다. 리포 안 파일은 그 리포에서 읽습니다.`}</IconNote>
      <TwoCol
        main={
          <Panel title="처리할 일" aside={<><Badge variant="red" label={String(total)} /><Muted size="xsm">{`프로젝트 ${okOver.length}곳 · 각 체크아웃의 git 사용자 기준`}</Muted></>}>
            <HStack gap={3} wrap="wrap" align="center">
              <Seg label="묶기" items={[{ id: "project", label: "프로젝트별" }, { id: "kind", label: "종류별" }]} value={group} onChange={setGroup} />
              <Selector label="프로젝트" isLabelHidden size="sm" value={only} onChange={(v) => v && setOnly(v)} options={[{ value: "all", label: `모두 ${total}` }, ...okOver.map((o) => ({ value: o.id as string, label: `${o.name} ${o.total}` }))]} />
            </HStack>
            {state.data[1] === null ? <Notice kind="err" title="처리할 일을 모으지 못했습니다." /> : null}
            <VStack gap={4} aria-live="polite">
              {todoList.length ? todoList : <Empty title="처리할 일이 없습니다" text="등록한 프로젝트 모두 조용합니다." />}
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
                        <HStack gap={2} align="center" wrap="wrap"><Ico name="folder" /><Text weight="semibold">{p.name}</Text><Tag label={p.state === "missing" ? "없음" : "킷 리포 아님"} /></HStack>
                        <Muted size="xsm">{p.path}</Muted>
                        <Muted>폴더가 없습니다. 옮겼거나 지웠습니다. 등록부에서 저절로 지우지 않습니다.</Muted>
                        <CommandBox cmd={p.remove ?? `npx knots-sync projects remove ${p.name}`} label="복사" />
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
                      <Muted size="xsm">{`${p.path}${p.addedAt ? ` · ${p.addedAt} 더함` : ""}`}</Muted>
                      {o && o.state === "ok" ? (
                        <VStack gap={2}>
                          <StageSeg stages={o.stages} />
                          <HStack gap={4} wrap="wrap"><Muted size="xsm">{`이슈 ${o.issues}`}</Muted><Muted size="xsm">{`킷 ${p.version ?? "?"}`}</Muted><Muted size="xsm">{`세션 ${o.sessions?.alive ?? 0}개`}</Muted></HStack>
                        </VStack>
                      ) : (
                        <Text color="secondary">{o?.error ?? "읽지 못했습니다"}</Text>
                      )}
                      {(o?.children ?? []).length ? (
                        <Collapsible defaultIsOpen={false} trigger={<Text size="sm">{`하위 리포 ${o.children.length}개`}</Text>}>
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
                    <ListItem key={s.id} label={s.name ?? String(s.id).slice(0, 10)} description={`${s.project}${s.issue ? ` · ${s.issue}` : ""}`} startContent={<HarnessBadge name={s.harness} />} endContent={<Tag tone={s.state === "gone" ? "line" : s.turn === "working" ? "build" : "ops"} label={s.state === "gone" ? "끊김" : s.turn === "working" ? "일하는 중" : "쉬는 중"} />} />
                  ))}
                </List>
              ) : (
                <VStack padding={4}><Muted>켜 둔 세션이 없습니다</Muted></VStack>
              )}
            </Panel>
          </>
        }
      />
    </Page>
  );
}
