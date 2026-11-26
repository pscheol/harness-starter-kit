// S09 하네스: 설치 점검 · 단계별 승인 · 켠 하네스와 모듈 · 역할 배정 · 킷 판. 설정은 읽기만 한다(고치는 명령은 '자세히' 안에서 복사한다).
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useState } from "react";
import { errorText, get, post } from "../lib/api";
import { GATE_KO, HARNESS_KO, ROLE_KO, type Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { CommandBox, Details, ErrorBlock, HarnessBadge, Ico, Key, Loading, Muted, Notice, Panel, Tag, TermHelp, type NoticeKind } from "../ui/common";
import { Page, TwoCol } from "../ui/Page";

interface DoctorItem {
  kind: string;
  severity?: string;
  path?: string;
  message?: string;
  label?: string;
  help?: string;
}

interface DoctorGroup {
  kind: string;
  label: string;
  help: string;
  isError: boolean;
  n: number;
  paths: string[];
}

/** 옛 서버는 사람이 고친 킷 파일(drifted)도 problems 에 실었다. 그 경우에도 같은 말로 보인다. */
const OLD_NOTES: Record<string, { label: string; help: string }> = {
  drifted: { label: "내가 고친 킷 파일", help: "정상입니다. 팀이 고친 파일은 킷을 올려도 덮어쓰지 않고, 새 판을 옆에 <파일>.new 로 따로 받습니다." },
};

function groupItems(items: DoctorItem[], counts: Record<string, number> | undefined): DoctorGroup[] {
  const order: string[] = [];
  const byKind = new Map<string, DoctorItem[]>();
  for (const it of items) {
    if (!byKind.has(it.kind)) order.push(it.kind);
    byKind.set(it.kind, [...(byKind.get(it.kind) ?? []), it]);
  }
  return order.map((kind) => {
    const xs = byKind.get(kind) ?? [];
    const first = xs[0] ?? { kind };
    const fallback = OLD_NOTES[kind];
    return {
      kind,
      label: first.label ?? fallback?.label ?? kind,
      help: first.help ?? fallback?.help ?? first.message ?? "",
      isError: xs.some((x) => x.severity === "error"),
      n: Math.max(counts?.[kind] ?? 0, xs.length),
      paths: xs.map((x) => x.path).filter((p): p is string => Boolean(p)),
    };
  });
}

/** 설치 점검 요약을 손볼 것 · 참고로 나눈다(옛 서버 응답도 같은 모양으로) */
function splitDoctor(d: Loose): { problems: DoctorGroup[]; notes: DoctorGroup[] } {
  const all = (d.problems ?? []) as DoctorItem[];
  const hasNotes = Array.isArray(d.notes);
  const problems = hasNotes ? all : all.filter((x) => !OLD_NOTES[x.kind]);
  const notes = hasNotes ? (d.notes as DoctorItem[]) : all.filter((x) => OLD_NOTES[x.kind]);
  return { problems: groupItems(problems, hasNotes ? d.counts : undefined), notes: groupItems(notes, d.noteCounts) };
}

function PathList({ paths, total }: { paths: string[]; total: number }) {
  return (
    <VStack gap={1}>
      {paths.map((p) => (
        <Text key={p} type="code" size="sm" wordBreak="break-all">
          {p}
        </Text>
      ))}
      {total > paths.length ? <Muted>{`외 ${total - paths.length}개는 터미널의 knots-sync doctor 에서 봅니다`}</Muted> : null}
    </VStack>
  );
}

function DoctorPanel({ d }: { d: Loose | null }) {
  if (!d) {
    return (
      <Panel title="설치 점검" lift aside={<TermHelp term="doctor" />}>
        <Text>설치 점검 결과가 아직 없습니다.</Text>
        <Details label="터미널에서 점검하기">
          <CommandBox cmd="knots-sync doctor" />
        </Details>
      </Panel>
    );
  }
  if (d.status === "unavailable") {
    return (
      <Panel title="설치 점검" lift aside={<><TermHelp term="doctor" /><Tag label="점검하지 못함" /></>}>
        <Text>이 서버에서는 설치 점검을 돌리지 못했습니다. 터미널에서 직접 점검합니다.</Text>
        <Details label="터미널에서 점검하기">
          <CommandBox cmd="knots-sync doctor" />
        </Details>
      </Panel>
    );
  }
  const { problems, notes } = splitDoctor(d);
  const total = problems.reduce((s, g) => s + g.n, 0);
  const hasError = problems.some((g) => g.isError);
  const status = total ? <Tag tone={hasError ? "gate" : "build"} icon="alert" label={`손볼 것 ${total}건`} /> : <Tag tone="ops" icon="ok" label="손볼 것 없음" />;
  return (
    <Panel title="설치 점검" lift aside={<><TermHelp term="doctor" />{status}</>}>
      {problems.length ? (
        <VStack gap={4}>
          {problems.map((g) => (
            <VStack key={g.kind} gap={1}>
              <HStack gap={2} align="center" wrap="wrap">
                <Ico name={g.isError ? "fail" : "alert"} />
                <Text weight="semibold">{g.label}</Text>
                <Tag tone={g.isError ? "gate" : "build"} label={`${g.n}건`} />
              </HStack>
              {g.help ? <Muted>{g.help}</Muted> : null}
              {g.paths.length ? (
                <Details label={`파일 ${g.n}개 보기`}>
                  <PathList paths={g.paths} total={g.n} />
                </Details>
              ) : null}
            </VStack>
          ))}
        </VStack>
      ) : (
        <Text>킷 파일이 모두 제자리에 있습니다. 손볼 것이 없습니다.</Text>
      )}
      {notes.length ? (
        <VStack gap={1}>
          <HStack gap={2} align="center" wrap="wrap">
            <Ico name="ok" size={14} />
            <Muted>{`참고: ${notes.map((g) => `${g.label} ${g.n}개`).join(" · ")} — 고칠 것이 아닙니다`}</Muted>
          </HStack>
          <Details label="참고 항목과 파일 보기">
            <VStack gap={3}>
              {notes.map((g) => (
                <VStack key={g.kind} gap={1}>
                  <Text weight="semibold">{`${g.label} ${g.n}개`}</Text>
                  {g.help ? <Muted>{g.help}</Muted> : null}
                  <PathList paths={g.paths} total={g.n} />
                </VStack>
              ))}
            </VStack>
          </Details>
        </VStack>
      ) : null}
      <Details label="터미널에서 같은 점검 돌리기">
        <CommandBox cmd="knots-sync doctor" />
      </Details>
    </Panel>
  );
}

function ApprovalPanel({ hr, approvers, s }: { hr: Loose; approvers: Record<string, string[]>; s: Loose | null }) {
  const gates = (hr.gates ?? []) as string[];
  const floor = new Set<string>((hr.floor ?? []) as string[]);
  const anyApprover = gates.some((g) => approvers[g]?.length);
  return (
    <Panel title="단계별 승인" aside={<TermHelp term="gate" />} flush>
      <Table
        data={gates.map((g) => ({ g }))}
        idKey="g"
        density="compact"
        columns={[
          { key: "g", header: "단계", width: proportional(1), renderCell: (r: Loose) => <Tag tone={floor.has(r.g) ? "design" : "line"} label={GATE_KO[r.g] ?? r.g} /> },
          { key: "kind", header: "구분", width: proportional(1), renderCell: (r: Loose) => <Text>{floor.has(r.g) ? "꼭 거치는 단계" : "팀이 넣은 단계"}</Text> },
          ...(anyApprover
            ? [
                {
                  key: "who",
                  header: "승인하는 사람",
                  width: proportional(2),
                  renderCell: (r: Loose) =>
                    approvers[r.g]?.length ? (
                      <HStack gap={1} wrap="wrap">
                        {(approvers[r.g] as string[]).map((a) => (
                          <Key key={a}>{a}</Key>
                        ))}
                      </HStack>
                    ) : (
                      <Muted>누구나</Muted>
                    ),
                },
              ]
            : []),
        ]}
      />
      <VStack gap={3} paddingBlock={4} paddingInline={2}>
        <Text size="sm">
          {anyApprover
            ? "승인하는 사람을 정하지 않은 단계는 이 리포의 git 사용자 누구나 승인합니다. 꼭 거치는 단계는 흐름에서 뺄 수 없습니다."
            : "승인하는 사람을 따로 정하지 않아, 이 리포의 git 사용자 누구나 승인합니다. 꼭 거치는 단계는 흐름에서 뺄 수 없습니다."}
        </Text>
        <HStack gap={1} align="center" wrap="wrap">
          <Ico name="commit" size={14} />
          <Muted>{`승인할 때 내 이름: ${s?.user?.email ?? "git user.email 이 없습니다"}${s?.user?.groups?.length ? ` · 그룹 ${(s.user.groups as string[]).join(", ")}` : ""}`}</Muted>
        </HStack>
        <Details label="승인하는 사람 · 단계 바꾸기">
          <Muted>승인하는 사람은 설치 정보(.agents/knots-sync.json)의 approvers 에 단계마다 적고 병합 요청으로 바꿉니다. 단계는 터미널에서 넣고 뺍니다.</Muted>
          <CommandBox cmd="knots-sync flow gates --add <단계> --after <단계>" />
        </Details>
      </VStack>
    </Panel>
  );
}

type OutdatedNote = { kind: NoticeKind; title: string; text?: string; cmd?: string };

/** 최신 판 조회 결과를 한 줄로 */
function outdatedNote(o: Loose): OutdatedNote {
  const latest = (o.latest ?? {}) as Loose;
  if (o.newer) return { kind: "warn", title: `새 판 ${String(o.newest)} 이 있습니다.`, text: `지금 설치된 킷은 ${String(o.installed)} 입니다.`, ...(o.upgrade ? { cmd: String(o.upgrade) } : {}) };
  if (latest.status !== "ok") return { kind: "info", title: "최신 판을 확인하지 못했습니다.", text: latest.reason ? String(latest.reason) : undefined };
  return { kind: "ok", title: "최신 판입니다.", text: `설치된 킷 ${String(o.installed)} · 화면 · CLI ${String(o.cli)}` };
}

function VersionPanel({ hr, s }: { hr: Loose; s: Loose | null }) {
  const [out, setOut] = useState<OutdatedNote | null>(null);
  const [busy, setBusy] = useState(false);
  async function check(): Promise<void> {
    setBusy(true);
    const r = await post("/harness/outdated", {});
    setBusy(false);
    setOut(r.ok ? outdatedNote(r.data) : { kind: "warn", title: errorText(r.error) });
  }
  const agents = (hr.agents ?? []) as string[];
  const modules = (hr.modules ?? []) as string[];
  return (
    <Panel title="킷 판 · 켠 것">
      <VStack gap={2}>
        <HStack justify="between" gap={3}>
          <Muted>킷 판</Muted>
          <Text>{hr.kit?.version ?? "모름"}</Text>
        </HStack>
        <HStack justify="between" gap={3}>
          <Muted>화면 · CLI 판</Muted>
          <Text>{s?.version ?? "모름"}</Text>
        </HStack>
        <HStack justify="between" gap={3} align="center">
          <HStack gap={0.5} align="center">
            <Muted>하네스</Muted>
            <TermHelp term="harness" />
          </HStack>
          <HStack gap={1} wrap="wrap">
            {agents.length ? agents.map((a) => <HarnessBadge key={a} name={a} />) : <Text>없음</Text>}
          </HStack>
        </HStack>
        <HStack justify="between" gap={3}>
          <Muted>선택 모듈</Muted>
          <Text>{modules.length ? modules.join(" · ") : "없음"}</Text>
        </HStack>
      </VStack>
      <HStack gap={2} align="center" wrap="wrap">
        <Button label={busy ? "조회하는 중…" : "최신 판 조회"} icon={<Ico name="refresh" />} isDisabled={busy} onClick={() => void check()} />
        <Muted>누를 때만 인터넷에 묻습니다</Muted>
      </HStack>
      {out ? (
        <Notice kind={out.kind} title={out.title}>
          {out.text}
          {out.cmd ? <CommandBox cmd={out.cmd} label="올리는 명령 복사" /> : null}
        </Notice>
      ) : null}
      <Details>
        <Muted>{`킷이 지원하는 하네스: ${Object.values(HARNESS_KO).join(" · ")}`}</Muted>
        <CommandBox cmd="knots-sync outdated" />
      </Details>
    </Panel>
  );
}

function RolePanel({ roles }: { roles: Record<string, Loose> }) {
  const entries = Object.entries(roles);
  return (
    <Panel title="역할 배정" flush={entries.length > 0}>
      {entries.length ? (
        <List hasDividers>
          {entries.map(([role, v]) => (
            <ListItem key={role} label={ROLE_KO[role] ?? role} description={v?.model ?? undefined} endContent={<HarnessBadge name={v?.harness ?? v} />} />
          ))}
        </List>
      ) : (
        <>
          <Muted>설계 · 구현 · 리뷰를 맡을 하네스를 역할마다 따로 정하지 않았습니다.</Muted>
          <Details>
            <Muted>설치 정보(.agents/knots-sync.json)의 roles 에 역할마다 하네스 · 모델을 적으면 여기 보입니다.</Muted>
          </Details>
        </>
      )}
    </Panel>
  );
}

export default function Harness({ route: _route }: { route: Route }) {
  const app = useAppState();
  const s = app.session;
  const { state, reload, at, every, stale } = useLoad<[Loose, Loose]>(() => [get("/harness"), get("/usage/kit")], [], { live: true });
  const sub = "킷이 제대로 깔렸는지, 단계마다 누가 승인하는지, 킷 판을 봅니다. 여기서는 설정을 바꾸지 않습니다.";
  const crumbs = [{ label: "품질" }, { label: "하네스" }];
  const live = { at, every, stale };
  if (state.status === "loading") return <Page title="하네스" sub={sub} crumbs={crumbs} live={live}><Loading rows={6} /></Page>;
  if (state.status === "error") return <Page title="하네스" sub={sub} crumbs={crumbs} live={live}><ErrorBlock error={state.error} retry={reload} /></Page>;
  const [hr, kit] = state.data;
  const start = (kit?.sessionStart ?? null) as Loose | null;

  return (
    <Page title="하네스" sub={sub} crumbs={crumbs} live={live}>
      <TwoCol
        main={
          <>
            <DoctorPanel d={(hr.doctor ?? null) as Loose | null} />
            <ApprovalPanel hr={hr} approvers={(s?.approvers ?? {}) as Record<string, string[]>} s={s} />
          </>
        }
        side={
          <>
            <VersionPanel hr={hr} s={s} />
            <RolePanel roles={(hr.roles ?? {}) as Record<string, Loose>} />
            {start ? (
              <Panel title="킷이 세션에 덧붙이는 양" aside={<Link href="/usage">사용량에서 보기</Link>}>
                <HStack gap={2} align="center" wrap="wrap">
                  <Text size="sm" hasTabularNumbers>{`세션을 열 때 평균 약 ${Number(start.estTokens).toLocaleString()} 토큰`}</Text>
                  <Tag tone={start.within ? "ops" : "gate"} icon={start.within ? "ok" : "alert"} label={start.within ? "상한 안" : "상한 넘음"} />
                </HStack>
                <Muted>{`${Number(start.avgBytes).toLocaleString()} / ${Number(start.limit).toLocaleString()}바이트. 상한을 넘으면 세션 시작 안내를 줄입니다.`}</Muted>
              </Panel>
            ) : null}
          </>
        }
      />
    </Page>
  );
}
