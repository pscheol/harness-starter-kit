// S11 새 요구사항. 접수 API(POST /intake)는 HK-19(설계 08)가 만든다. 지금 서버는 501 이라 접수하면 "제공 예정" 상태를 보인다.
// 접수는 승인이 아니다(PIN 없음). 화면은 모델을 부르지 않고 첨부 이미지를 설명하지 않는다.
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useRef, useState } from "react";
import { errorText, post } from "../lib/api";
import type { Route } from "../lib/format";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { CommandBox, copyText, Ico, Muted, Notice, Tag, type NoticeKind } from "../ui/common";
import { Page } from "../ui/Page";

const KINDS = [
  { value: "feature", label: "기능" },
  { value: "fix", label: "결함" },
  { value: "change", label: "변경" },
];

export default function Intake({ route }: { route: Route }) {
  const app = useAppState();
  const readOnly = Boolean(app.session?.readOnly);
  const [tab, setTab] = useState(route.query.tab === "import" ? "import" : "write");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("feature");
  const [body, setBody] = useState("");
  const files = useRef<HTMLInputElement | null>(null);
  const from = /^ops:[^#\s]+#(INC|NX)-\d+$/.test(route.query.from ?? "") ? (route.query.from as string) : null;
  const [out, setOut] = useState<{ kind: NoticeKind; title: string; text?: string; cmd?: string } | null>(null);

  /** 운영 기록의 장애 · 후보에서 접수한다(설계 14 §3.8 · §3.9) — 제목 · 본문은 운영 기록에서 가져온다. 같은 후보는 다시 만들지 않는다. */
  async function submitFromOps(): Promise<void> {
    if (!from) return;
    setOut({ kind: "info", title: "접수하는 중입니다…" });
    const r = await post("/intake", { from });
    if (r.ok) {
      const d = r.data as Loose;
      setOut({ kind: "ok", title: d.existing ? "이미 접수했습니다. " : "접수했습니다. ", text: `${String(d.folder ?? d.key ?? "")} — 설계 세션에 넘기려면 사람이 세션에 요청해 주세요(접수만으로는 세션에 아무것도 가지 않습니다).` });
      return;
    }
    setOut({ kind: "err", title: `${r.error.code}: `, text: errorText(r.error) });
  }

  async function submit(): Promise<void> {
    if (!title.trim() || !body.trim()) {
      setOut({ kind: "warn", title: "제목과 본문이 필요합니다." });
      return;
    }
    setOut({ kind: "info", title: "접수하는 중…" });
    const attachments = [...(files.current?.files ?? [])].map((f) => ({ name: f.name, size: f.size }));
    const r = await post("/intake", { kind, title: title.trim(), body, attachments });
    if (r.ok) {
      setOut({ kind: "ok", title: "접수했습니다. ", text: "설계 세션에 넘기려면 사람이 세션에 요청합니다(접수만으로는 세션에 아무것도 가지 않습니다)." });
      return;
    }
    if (r.error.code === "not_implemented") {
      const stage = ((r.error.details as Loose)?.stage as string | undefined) ?? "HK-19";
      setOut({ kind: "info", title: "접수 기능은 아직 제공하지 않습니다. ", text: `이 서버의 POST /intake 는 ${stage}(설계 08 §3.8.1)에서 만듭니다. 쓴 글은 어디에도 저장되지 않았습니다 — 아래 단추로 본문을 복사해 둡니다.`, cmd: `npx harness-kit intake --kind ${kind} --title "${title.trim().replace(/"/g, "'")}" --body-file req.md` });
      return;
    }
    setOut({ kind: "err", title: `${r.error.code}: `, text: errorText(r.error) });
  }

  return (
    <Page title="새 요구사항" sub="글로 적거나 Jira · Notion 에서 가져와 Intent 로 접수합니다. 접수는 승인이 아닙니다" crumbs={[{ label: "작업" }, { label: "새 요구사항" }]} search={false} width={760}>
      <VStack gap={4}>
        {from ? (
          <VStack gap={3} className="hk-form">
            <Notice kind="info" title="운영 기록에서 접수합니다. ">{`${from} — 제목 · 본문 · 근거는 운영 기록에서 그대로 옮깁니다. 접수한 뒤 운영 기록의 그 줄(후속 이슈 · 접수 칸)만 고칩니다.`}</Notice>
            {readOnly ? <Notice kind="warn" title="읽기 전용입니다. ">에이전트 세션에서 연 서버는 접수하지 않습니다.</Notice> : null}
            <HStack gap={2} align="center" wrap="wrap">
              <Button label="접수" variant="primary" icon={<Ico name="send" />} isDisabled={readOnly} onClick={() => void submitFromOps()} />
              <Tag label="PIN 없음 · 접수는 승인이 아닙니다" />
            </HStack>
            <VStack gap={2} aria-live="polite">{out ? <Notice kind={out.kind} title={out.title}>{out.text}</Notice> : null}</VStack>
            <CommandBox cmd={`npx harness-kit intake --from ${from}`} label="접수 명령 복사" />
          </VStack>
        ) : null}
        <TabList value={tab} onChange={setTab} hasDivider aria-label="접수 방법">
          <Tab value="write" label="직접 작성" />
          <Tab value="import" label="가져오기" />
        </TabList>
        {tab === "import" ? (
          <VStack gap={2}>
            <Notice kind="info" title="가져오기는 선택 모듈입니다. ">Jira · Notion 에서 가져오는 기능은 jira-workflow 모듈과 HK-19 · 설계 10 §3.6 이 만듭니다. 모듈을 켜지 않았거나 아직 제공하지 않아 이 탭은 비어 있습니다.</Notice>
            <Muted>지금은 글로 적어 접수하는 탭을 씁니다.</Muted>
          </VStack>
        ) : (
          <VStack gap={4} className="hk-form">
            {readOnly ? <Notice kind="warn" title="읽기 전용. ">에이전트 세션에서 연 서버는 접수하지 않습니다.</Notice> : null}
            <TextInput label="제목" value={title} onChange={setTitle} isDisabled={readOnly} />
            <Selector label="종류" value={kind} onChange={(v) => v && setKind(v)} options={KINDS} isDisabled={readOnly} />
            <TextArea label="본문" value={body} onChange={setBody} rows={10} isDisabled={readOnly} placeholder="무엇을 왜 바꾸는가. 사용자 · 규칙 · 범위 밖을 적습니다" />
            <VStack gap={1}>
              <label htmlFor="in-files">
                <Ico name="paperclip" size={14} /> 첨부
              </label>
              <input ref={files} type="file" id="in-files" multiple disabled={readOnly} aria-describedby="in-files-h" />
              <Muted size="xsm">파일 20MB · 합계 100MB 까지, 비밀값이 나오면 거부합니다. 이미지 설명은 만들지 않습니다(모델을 부르지 않습니다).</Muted>
            </VStack>
            <HStack gap={1} align="center">
              <Ico name="commit" size={14} />
              <Muted size="xsm">{`접수자 git user.email ${app.session?.user?.email ?? "-"}`}</Muted>
            </HStack>
            <HStack gap={2} align="center" wrap="wrap">
              <Button label="접수" variant="primary" icon={<Ico name="send" />} isDisabled={readOnly} onClick={() => void submit()} />
              <Tag label="PIN 없음 · 접수는 승인이 아닙니다" />
            </HStack>
            <VStack gap={2} aria-live="polite">
              {out ? <Notice kind={out.kind} title={out.title}>{out.text}</Notice> : null}
              {out?.cmd ? (
                <>
                  <CommandBox cmd={out.cmd} label="접수 명령 복사(HK-19 뒤)" />
                  <HStack>
                    <Button label="본문 복사" size="sm" icon={<Ico name="copy" />} onClick={() => void copyText(body)} />
                  </HStack>
                </>
              ) : null}
            </VStack>
          </VStack>
        )}
      </VStack>
    </Page>
  );
}
