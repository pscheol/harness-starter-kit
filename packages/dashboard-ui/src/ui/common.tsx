// 공용 부품: astryx 컴포넌트만 조합한다(raw div/span · 하드코딩 색 · px 없음). 간격은 토큰(gap · padding 단계)으로만 준다.
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { IconButton } from "@astryxdesign/core/IconButton";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import type { ReactNode } from "react";
import { errorText, type ApiError } from "../lib/api";
import { HARNESS_KO, TERMS } from "../lib/format";
import { ICONS, type IconName } from "./icons";

type BadgeVariant = "neutral" | "info" | "success" | "warning" | "error" | "blue" | "yellow" | "teal" | "red";
/** 화면의 의미 색(설계 · 구현 · 반영 · 처리할 일)을 Badge 변형으로 */
export type Tone = "design" | "build" | "ops" | "gate" | "line";
const TONE: Record<Tone, BadgeVariant> = { design: "blue", build: "yellow", ops: "teal", gate: "red", line: "neutral" };

export function Ico({ name, size = 16 }: { name: IconName; size?: number }) {
  const C = ICONS[name];
  return <C aria-hidden="true" size={size} strokeWidth={2} />;
}

export function Tag({ label, tone = "line", icon }: { label: ReactNode; tone?: Tone; icon?: IconName }) {
  return <Badge variant={TONE[tone]} label={label} {...(icon ? { icon: <Ico name={icon} size={12} /> } : {})} />;
}

const HARNESS_TONE: Record<string, BadgeVariant> = { claude: "yellow", codex: "neutral", kiro: "info", cursor: "neutral", gemini: "blue" };
export function HarnessBadge({ name }: { name: string | null | undefined }) {
  return <Badge variant={HARNESS_TONE[name ?? ""] ?? "neutral"} label={HARNESS_KO[name ?? ""] ?? name ?? "-"} />;
}

export type NoticeKind = "info" | "warn" | "err" | "ok";
const NOTICE: Record<NoticeKind, "info" | "warning" | "error" | "success"> = { info: "info", warn: "warning", err: "error", ok: "success" };

/** 알림 띠. title 은 굵게, description 은 풀이. 안내(info · ok)는 조용한 카드로, 경고 · 오류는 띠로 보인다 */
export function Notice({ kind, title, children, action }: { kind: NoticeKind; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  if (kind === "info" || kind === "ok") {
    return (
      <Card padding={3} variant="muted" role="status">
        <HStack gap={3} align="start" wrap="wrap">
          <Ico name={kind === "ok" ? "ok" : "help"} />
          <VStack gap={1} className="hk-notice-body">
            <Text weight="semibold" size="sm">
              {title}
            </Text>
            {children ? (
              <Text color="secondary" size="sm" as="div">
                {children}
              </Text>
            ) : null}
          </VStack>
          {action}
        </HStack>
      </Card>
    );
  }
  return <Banner status={NOTICE[kind]} title={title} {...(children ? { description: children } : {})} collapsible={false} {...(action ? { endContent: action } : {})} />;
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <VStack gap={3} aria-busy="true" role="status" aria-label="불러오는 중">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={20} width={i % 3 === 0 ? "100%" : i % 3 === 1 ? "82%" : "64%"} index={i} />
      ))}
    </VStack>
  );
}

export function Empty({ title, text, actions }: { title: string; text?: string; actions?: ReactNode }) {
  return <EmptyState title={title} {...(text ? { description: text } : {})} isCompact {...(actions ? { actions } : {})} />;
}

export function ErrorBlock({ error, retry }: { error: ApiError | null | undefined; retry?: () => void }) {
  return (
    <EmptyState
      title={error?.code === "unauthorized" ? "접속 토큰을 확인하지 못했습니다" : "불러오지 못했습니다"}
      description={`${errorText(error)}${error?.code ? ` (${error.code})` : ""}`}
      icon={<Ico name="alert" size={24} />}
      isCompact
      {...(retry ? { actions: <Button label="다시 시도" icon={<Ico name="refresh" />} onClick={retry} /> } : {})}
    />
  );
}

export function ReadOnlyNote({ text = "읽기 전용 — 저장 · 승인 · 답 · 작업 요청을 끕니다" }: { text?: string }) {
  return <Tag tone="line" icon="lock" label={text} />;
}

/** 구분 선택(한 번에 하나). 좁은 폭(40rem 미만)에서는 같은 선택지를 드롭다운으로 바꿔 줄이 넘치지 않게 한다. */
export function Seg({ label, items, value, onChange }: { label: string; items: Array<{ id: string; label: string; n?: number }>; value: string; onChange: (v: string) => void }) {
  const narrow = useMediaQuery("(max-width: 40rem)");
  const text = (it: { label: string; n?: number }): string => (it.n === undefined ? it.label : `${it.label} ${it.n}`);
  if (narrow) {
    return <Selector label={label} isLabelHidden size="sm" value={value} onChange={(v) => v && onChange(v)} options={items.map((it) => ({ value: it.id, label: text(it) }))} />;
  }
  return (
    <SegmentedControl value={value} onChange={onChange} label={label} size="sm">
      {items.map((it) => (
        <SegmentedControlItem key={it.id} value={it.id} label={text(it)} />
      ))}
    </SegmentedControl>
  );
}

/**
 * 패널: 제목줄(제목 + 곁 정보) · 구분선 · 본문. 안쪽 좌우 여백(5)과 본문 간격(4)은 이 한 곳에서만 정한다.
 * flush 는 표 · 목록을 가장자리까지 붙일 때 쓴다(표 칸이 자기 여백을 가진다).
 */
export function Panel({ title, aside, children, flush = false, headingId, lift = false }: { title: ReactNode; aside?: ReactNode; children: ReactNode; flush?: boolean; headingId?: string; lift?: boolean }) {
  return (
    <Card padding={0} elevation={lift ? "low" : "none"} {...(headingId ? { "aria-labelledby": headingId } : {})}>
      <VStack gap={0}>
        <HStack paddingBlock={3} paddingInline={5} gap={3} wrap="wrap" align="center" justify="between">
          <Text as="h2" size="base" weight="bold" {...(headingId ? { id: headingId } : {})}>
            {title}
          </Text>
          {aside ? (
            <HStack gap={2} align="center" wrap="wrap">
              {aside}
            </HStack>
          ) : null}
        </HStack>
        <Divider />
        {/* flush: 표 칸 · 목록 줄은 스스로 2(8px) 만큼 들이므로 3(12px)을 더해 제목줄 글과 같은 세로줄(5 = 20px)에 맞춘다 */}
        {flush ? <VStack paddingInline={3}>{children}</VStack> : <VStack gap={4} paddingBlock={4} paddingInline={5}>{children}</VStack>}
      </VStack>
    </Card>
  );
}

/** 읽기 쉬운 보조 글 */
export function Muted({ children }: { children: ReactNode; /** 옛 호출 호환: 가장 작은 글자(10px)는 쓰지 않는다 */ size?: "xsm" | "sm" }) {
  return (
    <Text color="secondary" size="sm">
      {children}
    </Text>
  );
}

/** 복사한 뒤 알려 주는 토스트 */
export function useNotify(): (text: string) => void {
  const show = useToast();
  return (text) => {
    show({ body: text, isAutoHide: true });
  };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 권한이 없으면 임시 입력 칸으로 복사한다
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const notify = useNotify();
  return <Button label={label} size="sm" icon={<Ico name="copy" />} onClick={() => void copyText(text).then((ok) => notify(ok ? "복사했습니다" : "복사하지 못했습니다 — 글을 직접 고릅니다"))} />;
}

/** 명령 한 줄 + 복사. 화면은 셸 명령을 실행하지 않고 보여 주기만 한다. */
export function CommandBox({ cmd, label = "명령 복사" }: { cmd: string; label?: string }) {
  return (
    <HStack gap={2} align="center" wrap="wrap">
      <HStack gap={2} align="center">
        <Ico name="terminal" />
        <Text type="code" wordBreak="break-all">
          {cmd}
        </Text>
      </HStack>
      <CopyButton text={cmd} label={label} />
    </HStack>
  );
}

export function Key({ children }: { children: ReactNode }) {
  return (
    <Text type="code" weight="semibold">
      {children}
    </Text>
  );
}
export { Code } from "@astryxdesign/core/Code";

/** 아이콘 + 흐린 글 한 줄(아이콘이 글과 다른 줄로 떨어지지 않게 한 묶음으로) */
export function IconNote({ icon, children, size = "sm" }: { icon: IconName; children: ReactNode; size?: "xsm" | "sm" }) {
  return (
    <HStack gap={1} align="center">
      <Ico name={icon} size={size === "xsm" ? 12 : 14} />
      <Muted size={size}>{children}</Muted>
    </HStack>
  );
}

/**
 * '자세히' 접기: 파일 경로 · 터미널 명령 · 데이터 출처처럼 자주 보지 않는 것을 넣는다(사용자 결정 2026-11-26).
 * 기본은 접혀 있고, 화면의 첫 글은 무엇을 하면 되는지만 말한다.
 */
export function Details({ label = "자세히", children }: { label?: string; children: ReactNode }) {
  return (
    <Collapsible defaultIsOpen={false} chevronPosition="start" trigger={<Text size="sm" color="secondary">{label}</Text>}>
      <VStack gap={2} paddingBlockStart={2}>
        {children}
      </VStack>
    </Collapsible>
  );
}

/** 용어 옆의 작은 ? 단추. 마우스를 올리거나 초점을 주면 한 줄 풀이(TERMS)가 뜬다. */
export function TermHelp({ term }: { term: keyof typeof TERMS & string }) {
  const t = TERMS[term];
  if (!t) return null;
  return <IconButton label={`${t.label} 풀이`} tooltip={t.help} icon={<Ico name="help" size={14} />} variant="ghost" size="sm" />;
}

/** 용어 이름 + ? 풀이를 한 묶음으로 */
export function Term({ term, children }: { term: keyof typeof TERMS & string; children?: ReactNode }) {
  return (
    <HStack gap={0.5} align="center">
      <Text>{children ?? TERMS[term]?.label ?? term}</Text>
      <TermHelp term={term} />
    </HStack>
  );
}

/** 패널 안 빈 상태(왼쪽 정렬): 굵은 제목 + 왜 비었는지 · 다음에 할 일 + (접힌 명령). 가운데 정렬 EmptyState 와 섞지 않는다. */
export function EmptyNote({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <VStack gap={1}>
      <Text weight="semibold">{title}</Text>
      {text ? <Muted>{text}</Muted> : null}
      {children}
    </VStack>
  );
}

/** 읽기 전용 화면에서 승인 · 답 칸 대신 보이는 한 줄(사용자 결정 2026-11-26) */
export function ReadOnlyLine({ text = "승인 · 답은 자기 터미널에서 연 관리 페이지에서 합니다" }: { text?: string }) {
  return (
    // 줄이 넘쳐도 아이콘 · 글 · ? 가 흩어지지 않게 한 줄 묶음으로 두고 글만 꺾는다
    <HStack gap={1} align="center" role="note">
      <Ico name="lock" size={14} />
      <Muted>{text}</Muted>
      <TermHelp term="readOnly" />
    </HStack>
  );
}
