// S05 세션에 작업 요청(오른쪽 시트). 사람이 "세션에 요청"을 고를 때만 나간다. 글은 한 줄 + 경로, 문서 내용은 없다(DB-R17 · R25).
// POST /dispatch 는 이 파일의 send() 한 곳에서만 부른다(시험이 지킨다). 시트를 여는 쪽은 사람이 누른 단추 안에서만 openDispatch 를 부른다.
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Drawer } from "@astryxdesign/core/Drawer";
import { Heading } from "@astryxdesign/core/Heading";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { errorText, get, post } from "../lib/api";
import { ago, PROMPT_KINDS, ROLE_KO } from "../lib/format";
import { useAppState } from "../lib/store";
import type { Loose } from "../lib/types";
import { CommandBox, Empty, HarnessBadge, Ico, Loading, Muted, Notice, Tag, useNotify } from "./common";

export interface DispatchOptions {
  issue?: string | undefined;
  role?: string | undefined;
  paths?: string[];
  kind?: string;
  changeSummary?: Loose | null;
  text?: string;
  title?: string;
}

const DispatchContext = createContext<((o?: DispatchOptions) => void) | null>(null);

export function DispatchProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<DispatchOptions | null>(null);
  const open = useCallback((o: DispatchOptions = {}) => setOpts({ ...o }), []);
  const value = useMemo(() => open, [open]);
  return (
    <DispatchContext.Provider value={value}>
      {children}
      <Drawer isOpen={opts !== null} onOpenChange={(o) => !o && setOpts(null)} label={opts?.title ?? "세션에 작업 요청"} width={440} purpose="form">
        {opts ? <DispatchBody opts={opts} close={() => setOpts(null)} /> : null}
      </Drawer>
    </DispatchContext.Provider>
  );
}

/** 사람이 누른 단추의 onClick 안에서만 부른다 */
export function useDispatch(): (o?: DispatchOptions) => void {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error("DispatchProvider 안에서만 useDispatch 를 씁니다");
  return ctx;
}

interface Result {
  kind: "ok" | "warn" | "err" | "info";
  title: string;
  text?: string;
  url?: string;
  socketFallback?: { deeplink: boolean; queue: boolean };
}

function DispatchBody({ opts, close }: { opts: DispatchOptions; close: () => void }) {
  const app = useAppState();
  const notify = useNotify();
  const [data, setData] = useState<{ sessions: Loose[]; queue: Loose[]; error: string | null } | null>(null);
  const [choice, setChoice] = useState("");
  const [kind, setKind] = useState(opts.kind ?? "doc-changed");
  const [text, setText] = useState(opts.text ?? "");
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries((opts.paths ?? []).map((p) => [p, true])));
  const [result, setResult] = useState<Result | null>(null);
  const readOnly = Boolean(app.session?.readOnly);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, q] = await Promise.all([get("/sessions"), get("/dispatch/queue")]);
      if (!alive) return;
      if (!s.ok) {
        setData({ sessions: [], queue: [], error: errorText(s.error) });
        return;
      }
      const live = (s.data.sessions as Loose[]).filter((x) => x.state !== "gone");
      const matching = live.filter((x) => (!opts.issue || x.issue === opts.issue) && (!opts.role || x.role === opts.role));
      // 이슈를 알 때 맞는 세션이 하나뿐이면 미리 고르고, 아니면 사람이 고른다(자동으로 고르지 않는다)
      if (opts.issue && matching.length === 1) setChoice(matching[0].id);
      setData({ sessions: live, queue: q.ok ? q.data.items : [], error: null });
    })();
    return () => {
      alive = false;
    };
  }, [opts.issue, opts.role]);

  async function send(via: string | null): Promise<void> {
    if (!choice && !opts.issue) {
      setResult({ kind: "warn", title: "요청을 받을 세션을 고릅니다(자동으로 고르지 않습니다)." });
      return;
    }
    const target = choice ? { sessionId: choice } : { issue: opts.issue, role: opts.role };
    const paths = Object.entries(picked).filter(([, on]) => on).map(([p]) => p);
    const payload = { target, kind, paths, ...(text.trim() ? { text: text.trim() } : {}), ...(opts.changeSummary ? { changeSummary: opts.changeSummary } : {}), ...(via ? { via } : {}) };
    setResult({ kind: "info", title: "보내는 중…" });
    const r = await post("/dispatch", payload);
    if (r.ok) {
      const d = r.data;
      if (d.method === "deeplink") {
        setResult({ kind: "ok", title: "deep link 를 만들었습니다. ", text: "누르면 새 터미널에 프롬프트가 채워집니다. 보내지 않은 상태입니다.", url: d.url });
        return;
      }
      notify(d.method === "queue" ? "대기함에 저장했습니다" : "세션에 요청을 보냈습니다");
      setResult({ kind: "ok", title: d.method === "queue" ? `대기함에 저장했습니다(${d.id}). ` : "세션 수신함에 한 줄을 보냈습니다. ", text: d.method === "queue" ? "다음 세션 시작 때 훅이 건수와 첫 요청 한 줄을 보여 줍니다." : "받았는지는 세션 쪽에서 봅니다(수신 확인 신호가 없습니다)." });
      if (d.method === "socket" || d.method === "queue") setTimeout(close, 1200);
      return;
    }
    if (r.error.code === "socket_unavailable") {
      const d = (r.error.details ?? {}) as Loose;
      setResult({ kind: "warn", title: "수신함에 닿지 못했습니다. ", text: "자동으로 바꾸지 않습니다. 아래 두 가지 중 사람이 고릅니다.", socketFallback: { deeplink: Boolean(d.deeplink), queue: Boolean(d.queueAvailable) } });
      return;
    }
    setResult({ kind: "err", title: errorText(r.error) });
  }

  const cmd = `knots-sync dispatch --to ${opts.issue ?? "<세션>"}${opts.role ? `:${opts.role}` : ""} --kind ${opts.kind ?? "doc-changed"} ${(opts.paths ?? []).map((p) => `--path ${p}`).join(" ")}`.trim();

  return (
    <VStack gap={4} padding={5}>
      <Heading level={2}>{opts.title ?? "세션에 작업 요청"}</Heading>
      {readOnly ? (
        <VStack gap={3}>
          <Notice kind="warn" title="읽기 전용입니다.">
            에이전트 세션에서 연 서버(또는 --read-only)는 작업 요청을 보내지 않습니다. 사람이 자기 터미널에서 연 서버에서 합니다.
          </Notice>
          <CommandBox cmd={cmd} />
        </VStack>
      ) : !data ? (
        <Loading rows={3} />
      ) : data.error ? (
        <Notice kind="err" title={data.error} />
      ) : (
        <VStack gap={4}>
          <Muted>보내는 글은 경로 · 변경 요약 · 요청 문장뿐이고 끝에 &quot;이 글은 승인이 아닙니다.&quot; 가 붙습니다. 저장 · 승인 · 답만으로는 세션에 아무것도 가지 않습니다.</Muted>
          {data.sessions.length ? (
            <RadioList label="요청을 받을 세션" value={choice} onChange={setChoice}>
              {data.sessions.map((s) => (
                <RadioListItem
                  key={s.id}
                  value={s.id}
                  label={s.name ?? String(s.id).slice(0, 12)}
                  description={`${ROLE_KO[s.role] ?? s.role ?? "역할 모름"}${s.issue ? ` · ${s.issue}` : ""} · ${ago(s.lastSeenAt)}${s.permissionMode === "bypassPermissions" ? " · bypassPermissions: 사람 승인 없이 바로 돕니다" : ""}`}
                  endContent={
                    <HStack gap={1} align="center">
                      <HarnessBadge name={s.harness} />
                      <Tag tone={s.state === "alive" ? "ops" : "line"} label={s.state === "alive" ? "수신함 있음" : "수신함 없음"} />
                    </HStack>
                  }
                />
              ))}
            </RadioList>
          ) : (
            <Empty title="켜 둔 세션이 없습니다" text="대기함에 두면 다음 세션 시작 때 훅이 건수와 첫 요청 한 줄을 보여 줍니다." />
          )}
          <Selector label="종류" value={kind} onChange={(v) => v && setKind(v)} options={PROMPT_KINDS.map(([value, label]) => ({ value, label }))} />
          <VStack gap={2}>
            <Text weight="semibold" size="sm">
              경로(문서 내용은 보내지 않습니다)
            </Text>
            {Object.keys(picked).length ? (
              Object.keys(picked).map((p) => <CheckboxInput key={p} label={p} value={picked[p] ?? false} onChange={(v) => setPicked((cur) => ({ ...cur, [p]: v }))} />)
            ) : (
              <Muted size="sm">경로가 없습니다 — 메모만 보냅니다</Muted>
            )}
          </VStack>
          <TextArea label="메모" value={text} onChange={setText} rows={2} maxLength={300} placeholder="한 줄 메모(300자 이하, 선택)" isOptional description="제어 문자 · 줄바꿈은 지우고 한 줄로 보냅니다. 글 전체 1,000자에서 자릅니다." />
          <HStack gap={2} wrap="wrap">
            <Button label="세션에 요청" variant="primary" icon={<Ico name="send" />} isDisabled={!data.sessions.length && !opts.issue} onClick={() => void send(null)} />
            <Button label="대기함에 저장" icon={<Ico name="inbox" />} onClick={() => void send("queue")} />
          </HStack>
          {result ? (
            <VStack gap={2} role="status" aria-live="polite">
              <Notice kind={result.kind} title={result.title}>
                {result.text}
              </Notice>
              {result.url ? <Button label="새 터미널에서 열기" icon={<Ico name="ext" />} href={result.url} /> : null}
              {result.socketFallback ? (
                <HStack gap={2} wrap="wrap">
                  {result.socketFallback.deeplink ? <Button label="deep link 로 열기" icon={<Ico name="ext" />} onClick={() => void send("deeplink")} /> : null}
                  {result.socketFallback.queue ? <Button label="대기함에 저장" icon={<Ico name="inbox" />} onClick={() => void send("queue")} /> : null}
                </HStack>
              ) : null}
            </VStack>
          ) : null}
          {data.queue.length ? <Muted size="sm">{`대기함에 ${data.queue.length}건이 있습니다 — 작업 공간에서 봅니다.`}</Muted> : null}
        </VStack>
      )}
    </VStack>
  );
}
