/**
 * 미해결 질문 표지 `[NEEDS CLARIFICATION: <질문>]` 세기(HK-22b). 콜론이 있고 코드(백틱) 밖에 있는 것만 표지다.
 * 템플릿 안내문의 `[NEEDS CLARIFICATION]`(콜론 없음) · 백틱 안 예시는 세지 않는다 — sdd_commands.py(analyze) · sdd_gates.py 와 같은 규칙.
 */
const MARKER = /\[NEEDS CLARIFICATION:[^\]\n]*\]/g;
const CODE_SPAN = /`[^`\n]*`/g;

export function clarifyCount(text: string): number {
  let n = 0;
  for (const line of text.split("\n")) n += (line.replace(CODE_SPAN, "").match(MARKER) ?? []).length;
  return n;
}

export function hasClarify(text: string): boolean {
  return clarifyCount(text) > 0;
}
