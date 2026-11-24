// S09 하네스: doctor · 켠 하네스와 모듈 · 역할 배정 · 흐름 틀 · 승인 권한 · 버전. 설정은 읽기만 한다(고치는 명령을 복사하게 한다).
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useState } from "react";
import { errorText, get, post } from "../lib/api";
import { fmtBytes, GATE_KO, HARNESS_KO, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { CommandBox, Empty, ErrorBlock, HarnessBadge, Ico, Key, Loading, Muted, Notice, Panel, Tag, type NoticeKind } from "../ui/common";
import { Page, TwoCol } from "../ui/Page";

const problemText = (p: Loose): string => (typeof p === "string" ? p : [p.kind ?? p.id, p.path, p.message].filter(Boolean).join(" · "));

export default function Harness({ route: _route }: { route: Route }) {
  const app = useAppState();
  const s = app.session;
  const { state, reload } = useLoad<[Loose, Loose]>(() => [get("/harness"), get("/usage/kit")], []);
  const [out, setOut] = useState<{ kind: NoticeKind; title: string; text?: string } | null>(null);
  const sub = "doctor · 층 · 역할 · 승인 권한 · 버전. 설정은 읽기만 합니다";
  const crumbs = [{ label: "품질" }, { label: "하네스" }];
  if (state.status === "loading") return <Page title="하네스" sub={sub} crumbs={crumbs}><Loading rows={6} /></Page>;
  if (state.status === "error") return <Page title="하네스" sub={sub} crumbs={crumbs}><ErrorBlock error={state.error} retry={reload} /></Page>;
  const [hr, kit] = state.data;
  const d = hr.doctor as Loose | null;
  const problems = (d?.problems ?? []) as Loose[];
  const approvers: Record<string, string[]> = s?.approvers ?? {};

  async function outdated(): Promise<void> {
    setOut({ kind: "info", title: "최신 판을 조회하는 중…(네트워크를 씁니다)" });
    const r = await post("/harness/outdated", {});
    if (!r.ok) {
      setOut({ kind: "warn", title: errorText(r.error) });
      return;
    }
    const o = r.data;
    setOut({ kind: o.outdated || o.newer ? "warn" : "ok", title: "조회했습니다. ", text: typeof o.message === "string" ? o.message : JSON.stringify(o).slice(0, 300) });
  }

  return (
    <Page title="하네스" sub={sub} crumbs={crumbs}>
      <TwoCol
        main={
          <>
            <Panel title="doctor" lift aside={d ? <Tag tone={problems.length ? "build" : d.status === "unavailable" ? "line" : "ops"} icon={problems.length ? "alert" : "ok"} label={problems.length ? `문제 ${problems.length}건` : d.status === "unavailable" ? "점검 도구 없음" : "통과"} /> : <Tag label="없음" />}>
              {d ? (
                problems.length ? (
                  <VStack gap={1}>
                    {problems.map((p, i) => (
                      <HStack key={i} gap={2} align="start">
                        <Ico name="alert" size={14} />
                        <Text size="sm">{problemText(p)}</Text>
                      </HStack>
                    ))}
                  </VStack>
                ) : (
                  <Text size="sm">{d.status === "unavailable" ? "이 서버에서는 doctor 를 부를 수 없습니다. 터미널에서 돌립니다." : "설치 상태에 문제가 없습니다."}</Text>
                )
              ) : (
                <Muted>doctor 결과가 없습니다.</Muted>
              )}
              {d?.counts && Object.keys(d.counts).length ? <Muted>{Object.entries(d.counts as Record<string, number>).map(([k, n]) => `${k} ${n}`).join(" · ")}</Muted> : null}
              <CommandBox cmd="npx knots-sync doctor" />
            </Panel>
            <Panel title="흐름 · 승인 권한" aside={<Muted size="xsm">flow.gates · approvers</Muted>} flush>
              <Table
                data={(hr.gates as string[]).map((g) => ({ g }))}
                idKey="g"
                density="compact"
                columns={[
                  { key: "g", header: "게이트", renderCell: (r: Loose) => <Tag tone={(hr.floor as string[]).includes(r.g) ? "design" : "line"} label={GATE_KO[r.g] ?? r.g} /> },
                  { key: "kind", header: "구분", renderCell: (r: Loose) => <Text>{(hr.floor as string[]).includes(r.g) ? "바닥(줄일 수 없습니다)" : "팀 설정"}</Text> },
                  { key: "who", header: "승인자", renderCell: (r: Loose) => (approvers[r.g]?.length ? <HStack gap={1} wrap="wrap">{(approvers[r.g] as string[]).map((a) => <Key key={a}>{a}</Key>)}</HStack> : <Muted>비어 있음 → git 사용자 누구나</Muted>) },
                ]}
              />
              <VStack gap={3} padding={4}>
                <Muted>approvers 는 선택입니다. 게이트가 비어 있으면 이 리포의 git 사용자 누구나 승인합니다. 신원은 이 체크아웃의 git user.email 입니다.</Muted>
                <HStack gap={1} align="center" wrap="wrap">
                  <Ico name="commit" size={14} />
                  <Text size="sm">지금 <b>{s?.user?.email ?? "git user.email 없음"}</b>{s?.user?.groups?.length ? ` · 그룹 ${(s.user.groups as string[]).join(", ")}` : ""}</Text>
                </HStack>
                <CommandBox cmd="npx knots-sync flow gates --add <게이트> --after <게이트>" label="흐름 틀 명령 복사" />
              </VStack>
            </Panel>
          </>
        }
        side={
          <>
            <Panel title="버전 · 켠 것" aside={<Muted size="xsm">{hr.kit.version ? `킷 ${hr.kit.version}` : ""}</Muted>}>
              <VStack gap={2}>
                <HStack justify="between" gap={3}><Muted>킷 판</Muted><Text>{hr.kit.version ?? "?"}</Text></HStack>
                <HStack justify="between" gap={3}><Muted>화면 · CLI</Muted><Text>{s?.version ?? "?"}</Text></HStack>
                <HStack justify="between" gap={3} align="start"><Muted>하네스</Muted><HStack gap={1} wrap="wrap">{(hr.agents as string[]).length ? (hr.agents as string[]).map((a) => <HarnessBadge key={a} name={a} />) : <Text>-</Text>}</HStack></HStack>
                <HStack justify="between" gap={3}><Muted>선택 모듈</Muted><Text>{(hr.modules as string[]).length ? (hr.modules as string[]).join(" · ") : "없음"}</Text></HStack>
              </VStack>
              <HStack gap={2} align="center" wrap="wrap">
                <Button label="최신 판 조회" icon={<Ico name="refresh" />} onClick={() => void outdated()} />
                <Muted size="xsm">버튼을 눌렀을 때만 네트워크를 씁니다</Muted>
              </HStack>
              {out ? <Notice kind={out.kind} title={out.title}>{out.text}</Notice> : null}
              <CommandBox cmd="npx knots-sync outdated" />
            </Panel>
            <Panel title="역할 배정" flush>
              {Object.keys(hr.roles).length ? (
                <List hasDividers>
                  {Object.entries(hr.roles as Record<string, Loose>).map(([role, v]) => (
                    <ListItem key={role} label={role} description={v?.model ?? undefined} endContent={<HarnessBadge name={v?.harness ?? v} />} />
                  ))}
                </List>
              ) : (
                <Empty title="역할 배정이 없습니다" text="knots-sync.json 의 roles 가 비었습니다." />
              )}
            </Panel>
            <Panel title="킷이 덧붙인 토큰" aside={<Link href="/usage">자세히</Link>}>
              <HStack gap={2} align="center" wrap="wrap">
                <Text size="sm">{`세션 시작 평균 ${kit.sessionStart.avgBytes} / ${kit.sessionStart.limit}바이트(약 ${kit.sessionStart.estTokens} 토큰)`}</Text>
                <Tag tone={kit.sessionStart.within ? "ops" : "gate"} icon={kit.sessionStart.within ? "ok" : "alert"} label={kit.sessionStart.within ? "상한 안" : "상한 넘음"} />
              </HStack>
              <Muted size="xsm">{`소유자별 세션마다 실리는 파일: ${(kit.modules as Loose[]).map((m) => `${m.owner} ${m.files}개 ${fmtBytes(m.bytes)}`).join(" · ") || "-"}`}</Muted>
            </Panel>
            <Muted size="xsm">{`지원 하네스: ${Object.values(HARNESS_KO).join(" · ")}`}</Muted>
          </>
        }
      />
    </Page>
  );
}
