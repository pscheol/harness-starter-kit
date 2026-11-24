// S10 운영 기록(선택 화면). 서버의 /ops 는 HK-21(배포 · 운영, 설계 14)이 채운다. 지금은 501 이면 "제공 예정" 상태를 보인다.
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { get } from "../lib/api";
import type { Route } from "../lib/format";
import { useLoad } from "../lib/hooks";
import type { Loose } from "../lib/types";
import { CommandBox, Empty, ErrorBlock, IconNote, Loading, Muted, Notice, Panel } from "../ui/common";
import { Page } from "../ui/Page";

export default function Ops({ route: _route }: { route: Route }) {
  const { state, reload } = useLoad<[Loose]>(() => [get("/ops")], [], { tolerate: ["not_implemented"] });
  const sub = "배포 · 운영 기록 · 전달 지표 · 규칙 후보(선택 화면)";
  const crumbs = [{ label: "운영" }, { label: "운영" }];
  if (state.status === "loading") return <Page title="운영" sub={sub} crumbs={crumbs}><Loading rows={4} /></Page>;
  if (state.status === "error") return <Page title="운영" sub={sub} crumbs={crumbs}><ErrorBlock error={state.error} retry={reload} /></Page>;
  const data = state.data[0];
  if (data === null) {
    return (
      <Page title="운영" sub={sub} crumbs={crumbs}>
        <Notice kind="info" title="운영 기록은 아직 제공하지 않습니다. ">이 화면의 데이터(배포 기록 · 운영 기록 · 장애 · 다음 요구사항 후보 · 전달 지표 · 자동 검증 배포 · 규칙 후보)는 HK-21(설계 14)이 만듭니다.</Notice>
        <Empty title="제공 예정" text="운영 기록이 생기면 이 화면에서 읽습니다. 읽기만 하고, 접수는 새 요구사항(S11)에서 합니다." actions={<IconNote icon="terminal" size="xsm">콘솔: npx harness-kit status --ops (같은 이슈에서 제공)</IconNote>} />
        <CommandBox cmd="npx harness-kit status --ops" />
      </Page>
    );
  }
  // 서버가 채워지면 최상위 목록을 그대로 보인다(형식은 설계 14 §3.12).
  return (
    <Page title="운영" sub={sub} crumbs={crumbs}>
      {Object.entries(data as Record<string, unknown>).map(([k, v]) => (
        <Panel key={k} title={k}>
          {Array.isArray(v) && v.length ? (
            <VStack gap={1}>
              {v.map((x, i) => (
                <Text key={i}>{typeof x === "string" ? x : JSON.stringify(x)}</Text>
              ))}
            </VStack>
          ) : (
            <Muted>{Array.isArray(v) ? "없음" : String(JSON.stringify(v))}</Muted>
          )}
        </Panel>
      ))}
    </Page>
  );
}
