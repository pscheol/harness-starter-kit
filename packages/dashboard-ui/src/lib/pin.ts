// 승인 PIN 입력 다듬기.
/** 입력한 PIN 을 서버가 받는 모양(숫자 · 영문 대문자)으로 고른다 */
export function normalizePin(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
}
