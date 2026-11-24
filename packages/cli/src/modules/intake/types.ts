/** 외부 출처에서 가져온 접수 자료(설계 10 §3.6). intake.py 가 같은 형식 · 제한 · 비밀값 검사 · 신뢰하지 않는 입력 표시로 저장한다. */
export interface Imported {
  title: string;
  /** product · feature · change · refactor · bug */
  kind: string;
  /** Markdown 본문(속성 표 포함) */
  text: string;
  attachments: { name: string; data: Buffer }[];
  links: string[];
  source: { type: "jira" | "notion"; ref: string; url: string; version: string };
  warnings: string[];
  /** 출처가 정한 Intent 키(Jira 에픽 키 · Notion 의 키 속성) */
  key: string | null;
}
