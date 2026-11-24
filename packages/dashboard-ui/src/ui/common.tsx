// 공용 부품: astryx 컴포넌트만 조합한다(raw div/span · 하드코딩 색 · px 없음). 간격은 토큰(gap · padding 단계)으로만 준다.
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import type { ReactNode } from "react";
import { errorText, type ApiError } from "../lib/api";
import { HARNESS_KO } from "../lib/format";
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

/** 패널: 제목줄(제목 + 곁 정보) · 구분선 · 본문. 본문 간격은 한 군데(gap 3)에서만 정한다. */
export function Panel({ title, aside, children, flush = false, headingId, lift = false }: { title: ReactNode; aside?: ReactNode; children: ReactNode; flush?: boolean; headingId?: string; lift?: boolean }) {
  return (
    <Card padding={0} elevation={lift ? "low" : "none"} {...(headingId ? { "aria-labelledby": headingId } : {})}>
      <VStack gap={0}>
        <HStack padding={3} paddingInline={4} gap={3} wrap="wrap" align="center" justify="between">
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
        {flush ? children : <VStack gap={3} padding={4}>{children}</VStack>}
      </VStack>
    </Card>
  );
}

/** 읽기 쉬운 보조 글 */
export function Muted({ children, size = "sm" }: { children: ReactNode; size?: "xsm" | "sm" }) {
  return (
    <Text color="secondary" size={size}>
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
