// S11 새 요구사항. 접수 API(POST /intake)가 아직 없는 서버는 501 을 돌려주고, 화면은 "아직 받지 않습니다"와 본문 복사를 보인다.
// 접수는 승인이 아니다(PIN 없음). 화면은 모델을 부르지 않고 첨부 이미지를 설명하지 않는다. 읽기 전용 화면에는 폼을 띄우지 않는다.
import { Button } from "@astryxdesign/core/Button";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { type ReactNode, useState } from "react";
import { errorText, post } from "../lib/api";
import type { Route } from "../lib/format";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { CommandBox, copyText, Details, Ico, Muted, Notice, type NoticeKind, ReadOnlyLine, useNotify } from "../ui/common";
import { Page } from "../ui/Page";

const KINDS = [
  { value: "feature", label: "기능" },
  { value: "fix", label: "결함" },
  { value: "change", label: "변경" },
];
const MB = 1024 * 1024;
/** 폼 · 탭 폭을 한 값으로 맞춘다(탭 밑줄이 폼보다 길던 문제) */
const FORM_WIDTH = 640;

const asList = (f: File | File[] | null): File[] => {
  if (Array.isArray(f)) return f;
  return f ? [f] : [];
};

type Out = { kind: NoticeKind; title: string; text?: string; cmd?: string };

function FromOps({ from, readOnly }: { from: string; readOnly: boolean }) {
  const [out, setOut] = useState<Out | null>(null);
  /** 운영 기록의 장애 · 후보에서 접수한다 — 제목 · 본문은 운영 기록에서 가져온다. 같은 후보는 다시 만들지 않는다. */
  async function submit(): Promise<void> {
    setOut({ kind: "info", title: "접수하는 중입니다…" });
    const r = await post("/intake", { from });
    if (r.ok) {
      const d = r.data as Loose;
      setOut({ kind: "ok", title: d.existing ? "이미 접수했습니다. " : "접수했습니다. ", text: `${String(d.folder ?? d.key ?? "")} — 설계 세션에 넘기려면 세션에 요청합니다. 접수만으로는 세션에 아무것도 가지 않습니다.` });
      return;
    }
    setOut({ kind: "err", title: "접수하지 못했습니다. ", text: errorText(r.error) });
  }
  return (
    <VStack gap={3}>
      <Notice kind="info" title="운영 기록에서 접수합니다. ">{`${from} — 제목 · 본문 · 근거는 운영 기록에서 그대로 옮기고, 접수한 뒤 운영 기록의 그 줄에 접수 표시를 남깁니다.`}</Notice>
      {readOnly ? (
        <ReadOnlyLine text="접수는 자기 터미널에서 연 관리 페이지에서 합니다" />
      ) : (
        <HStack gap={2} align="center" wrap="wrap">
          <Button label="접수" variant="primary" icon={<Ico name="send" />} onClick={() => void submit()} />
        </HStack>
      )}
      <VStack gap={2} aria-live="polite">
        {out ? (
          <Notice kind={out.kind} title={out.title}>
            {out.text}
          </Notice>
        ) : null}
      </VStack>
      <Details label="터미널에서 접수하기">
        <CommandBox cmd={`knots-sync intake --from ${from}`} label="명령 복사" />
      </Details>
    </VStack>
  );
}

function WriteForm({ email }: { email: string | null | undefined }) {
  const notify = useNotify();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("feature");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [out, setOut] = useState<Out | null>(null);

  async function submit(): Promise<void> {
    if (!title.trim() || !body.trim()) {
      setOut({ kind: "warn", title: "제목과 본문을 적습니다." });
      return;
    }
    setOut({ kind: "info", title: "접수하는 중…" });
    const attachments = files.map((f) => ({ name: f.name, size: f.size }));
    const r = await post("/intake", { kind, title: title.trim(), body, attachments });
    if (r.ok) {
      setOut({ kind: "ok", title: "접수했습니다. ", text: "설계 세션에 넘기려면 세션에 요청합니다. 접수만으로는 세션에 아무것도 가지 않습니다." });
      return;
    }
    if (r.error.code === "not_implemented") {
      setOut({ kind: "info", title: "이 판의 관리 페이지는 아직 접수를 받지 않습니다. ", text: "쓴 글은 어디에도 저장되지 않았습니다. 아래 단추로 본문을 복사해 둡니다.", cmd: `knots-sync intake --kind ${kind} --title "${title.trim().replace(/"/g, "'")}" --body-file req.md` });
      return;
    }
    setOut({ kind: "err", title: "접수하지 못했습니다. ", text: errorText(r.error) });
  }

  return (
    <VStack gap={4}>
      <TextInput label="제목" value={title} onChange={setTitle} placeholder="예: 대화 기록 보관 기간을 3일로 줄입니다" />
      <Selector label="종류" value={kind} onChange={(v) => v && setKind(v)} options={KINDS} />
      <TextArea label="본문" value={body} onChange={setBody} rows={10} placeholder="무엇을 왜 바꾸는지, 누가 쓰는지, 지킬 규칙과 이번에 하지 않을 것을 적습니다" />
      <FileInput
        label="첨부"
        value={files}
        onChange={(f) => setFiles(asList(f))}
        isMultiple
        mode="dropzone"
        maxSize={20 * MB}
        placeholder="파일을 끌어다 놓거나 눌러서 고릅니다"
        description="적지 않아도 됩니다. 파일 하나 20MB · 모두 합쳐 100MB 까지 받고, 비밀값이 들어 있으면 받지 않습니다."
      />
      <HStack gap={3} align="center" wrap="wrap">
        <Button label="접수" variant="primary" icon={<Ico name="send" />} onClick={() => void submit()} />
        <Muted>{`접수한 사람: ${email ?? "git 이메일 없음"}`}</Muted>
      </HStack>
      <VStack gap={2} aria-live="polite">
        {out ? (
          <Notice kind={out.kind} title={out.title}>
            {out.text}
          </Notice>
        ) : null}
        {out?.cmd ? (
          <VStack gap={2}>
            <HStack>
              <Button label="본문 복사" size="sm" icon={<Ico name="copy" />} onClick={() => void copyText(body).then((ok) => notify(ok ? "본문을 복사했습니다" : "복사하지 못했습니다 — 글을 직접 고릅니다"))} />
            </HStack>
            <Details label="터미널에서 접수하기">
              <CommandBox cmd={out.cmd} label="명령 복사" />
            </Details>
          </VStack>
        ) : null}
      </VStack>
    </VStack>
  );
}

export default function Intake({ route }: { route: Route }) {
  const app = useAppState();
  const readOnly = Boolean(app.session?.readOnly);
  // Jira · Notion 가져오기는 jira-workflow 모듈을 켠 리포에만 있다. 없으면 탭을 띄우지 않는다.
  const canImport = ((app.session?.modules ?? []) as string[]).includes("jira-workflow");
  const [tab, setTab] = useState(route.query.tab === "import" && canImport ? "import" : "write");
  const from = /^ops:[^#\s]+#(INC|NX)-\d+$/.test(route.query.from ?? "") ? (route.query.from as string) : null;

  let body: ReactNode = <WriteForm email={app.session?.user?.email} />;
  if (readOnly && from) body = null;
  else if (readOnly) {
    body = (
      <VStack gap={3}>
        <ReadOnlyLine text="접수는 자기 터미널에서 연 관리 페이지에서 합니다" />
        <Details label="터미널에서 접수하기">
          <CommandBox cmd={'knots-sync intake --kind feature --title "제목" --body-file req.md'} label="명령 복사" />
        </Details>
      </VStack>
    );
  } else if (tab === "import") {
    body = <Notice kind="info" title="가져오기는 아직 없습니다. ">Jira · Notion 에서 가져오는 기능은 다음 판에서 엽니다. 지금은 '직접 작성'에서 글로 적어 접수합니다.</Notice>;
  }

  return (
    <Page title="새 요구사항" sub="새 기능 · 결함 · 변경을 글로 적어 접수합니다. 접수한 뒤 설계 세션에 넘기는 것은 사람이 정합니다." crumbs={[{ label: "작업" }, { label: "새 요구사항" }]} search={false} width={FORM_WIDTH}>
      {from ? <FromOps from={from} readOnly={readOnly} /> : null}
      {canImport && !readOnly ? (
        <TabList value={tab} onChange={setTab} hasDivider aria-label="접수 방법">
          <Tab value="write" label="직접 작성" />
          <Tab value="import" label="가져오기" />
        </TabList>
      ) : null}
      {body}
    </Page>
  );
}
