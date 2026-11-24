/**
 * 업그레이드 공지(설계 03 §3.11, HK-24 design §7). `update` 가 판을 올릴 때 킷 `UPGRADE.md` 의 절을 모아
 * `.agents/harness-upgrade-notice.md` 를 쓴다. Python `scripts/harness/upgrade_notice.py`(update.sh)와 같은 바이트를 낸다.
 * 모을 절이 있으면 킷이 쓴 공지(머리에 kitFrom · kitTo)를 새로 쓰고, 없으면 만료된 킷 공지만 지운다. 사람이 만든 공지는 둔다.
 */
export const NOTICE_REL = ".agents/harness-upgrade-notice.md";
export const UPGRADE_FILE = "UPGRADE.md";
export const NOTICE_DAYS = 30;
export const SECTION_LIMIT = 800;

export type NoticeAction = "write" | "delete" | "keep-human" | "none";
export interface NoticePlan {
  action: NoticeAction;
  text?: string;
}

/** `x.y.z` 정수 셋. `-` · `+` 뒤 꼬리는 뗀다. 못 읽으면 null. */
export function coreVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function cmp(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** `## <판>` 절(판 · 본문 줄). 첫 절 앞 글은 버린다. */
export function upgradeSections(text: string): { version: string; body: string[] }[] {
  const out: { version: string; body: string[] }[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const h = /^## +(\S+)\s*$/.exec(line);
    if (h) out.push({ version: h[1], body: [] });
    else if (out.length) out[out.length - 1].body.push(line);
  }
  return out.map((s) => ({ version: s.version, body: trimBlank(s.body) }));
}

function trimBlank(lines: string[]): string[] {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim() === "") a += 1;
  while (b > a && lines[b - 1].trim() === "") b -= 1;
  return lines.slice(a, b);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 머리에 kitFrom · kitTo 가 있으면 킷이 쓴 공지다. */
export function isKitNotice(text: string): boolean {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return false;
  const end = lines.indexOf("---", 1);
  const head = lines.slice(1, end < 0 ? 1 : end);
  return head.some((l) => l.startsWith("kitFrom:")) && head.some((l) => l.startsWith("kitTo:"));
}

/** 이번 update 의 공지 쓰기 계획. existing: 지금 공지 내용(없으면 null). */
export function planNotice(args: { upgradeText: string | null; from: string; to: string; today: string; existing: string | null }): NoticePlan {
  const from = coreVersion(args.from);
  const to = coreVersion(args.to);
  const sections =
    args.upgradeText !== null && from && to
      ? upgradeSections(args.upgradeText)
          .map((s) => ({ ...s, core: coreVersion(s.version) }))
          .filter((s): s is { version: string; body: string[]; core: [number, number, number] } => s.core !== null && cmp(s.core, from) > 0 && cmp(s.core, to) <= 0)
          .sort((a, b) => cmp(a.core, b.core))
      : [];
  const kit = args.existing !== null && isKitNotice(args.existing);
  if (!sections.length) return { action: kit && noticeExpired(args.existing as string, args.today) ? "delete" : "none" };
  if (args.existing !== null && !kit) return { action: "keep-human" };
  const body = sections.flatMap((s) => s.body);
  const text = ["---", `kitFrom: ${args.from}`, `kitTo: ${args.to}`, `date: ${args.today}`, `expires: ${addDays(args.today, NOTICE_DAYS)}`, "---", `# 하네스 업데이트 ${args.from} → ${args.to}`, "", ...body, ""].join("\n");
  return { action: "write", text };
}

/** 머리의 expires 가 오늘보다 앞이면 만료(doctor). */
export function noticeExpired(text: string, today: string): boolean {
  const m = /^expires:\s*(\S+)/m.exec(text);
  return Boolean(m && m[1] < today);
}
