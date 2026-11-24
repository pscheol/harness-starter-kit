/** `questions.md`(설계 08 §3.3) 파서와 답 · 의견 줄 쓰기(06 §3.8). */
import { setField, parseLoose } from "./frontmatter";

const HEAD = /^## (Q-\d+) · (범위|보안|개인정보|UX|기술|운영) · 답할 직무: ([a-z][a-z0-9-]*)(?: · 막는 게이트: ([a-z]+))?\s*$/;
const CHOICE = /^- ([A-D])\. (.+?) — 영향: (.+)$/;
const RECOMMEND = /^- 권장: ([A-D])\b/;
const ANSWER = /^- 답:\s*(.*)$/;

export interface Question {
  id: string;
  category: string;
  role: string;
  blocks: string | null;
  text: string;
  choices: { id: string; text: string; impact: string }[];
  recommended: string | null;
  answer: string | null;
  open: boolean;
  notes: string[];
  opinions: string[];
  line: number;
}

export interface QuestionsDoc {
  frontmatter: Record<string, string>;
  questions: Question[];
}

export function parseQuestions(text: string): QuestionsDoc {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const questions: Question[] = [];
  let cur: Question | null = null;
  lines.forEach((line, i) => {
    const h = HEAD.exec(line);
    if (h) {
      cur = { id: h[1] as string, category: h[2] as string, role: h[3] as string, blocks: h[4] ?? null, text: "", choices: [], recommended: null, answer: null, open: true, notes: [], opinions: [], line: i + 1 };
      questions.push(cur);
      return;
    }
    if (line.startsWith("## ") || line.startsWith("# ")) {
      cur = null;
      return;
    }
    const q = cur as Question | null;
    if (!q) return;
    const c = CHOICE.exec(line);
    const r = RECOMMEND.exec(line);
    const a = ANSWER.exec(line);
    if (c) q.choices.push({ id: c[1] as string, text: c[2] as string, impact: c[3] as string });
    else if (r) q.recommended = r[1] as string;
    else if (a) {
      q.answer = (a[1] as string).trim() || null;
      q.open = q.answer === null;
    } else if (line.startsWith("- 메모:")) q.notes.push(line.slice("- 메모:".length).trim());
    else if (line.startsWith("- 의견:")) q.opinions.push(line.slice("- 의견:".length).trim());
    else if (!line.startsWith("- ") && line.trim() && q.choices.length === 0) q.text = q.text ? `${q.text} ${line.trim()}` : line.trim();
  });
  return { frontmatter: parseLoose(text) ?? {}, questions };
}

export interface AnswerInput {
  qid: string;
  choice: string;
  text: string | null;
  email: string;
  at: string;
  /** 의견으로 남긴다(답할 직무 그룹 밖) */
  opinion: boolean;
}

/** 답 · 의견 줄을 넣은 새 내용과 모두 답했는지. 다른 줄 · 줄바꿈은 그대로 둔다. */
export function writeAnswer(text: string, input: AnswerInput): { text: string; allAnswered: boolean; statusChanged: string | null } {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const cr = eol === "\r\n" ? "\r" : "";
  const lines = text.split("\n");
  const bareOf = (i: number): string => (lines[i] as string).replace(/\r$/, "");
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const h = HEAD.exec(bareOf(i));
    if (h && h[1] === input.qid) start = i;
  }
  if (start < 0) throw new Error(`질문 없음: ${input.qid}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (bareOf(i).startsWith("## ") || bareOf(i).startsWith("# ")) {
      end = i;
      break;
    }
  }
  const memo = input.text ? input.text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 500) : "";
  const block = lines.slice(start, end);
  if (input.opinion) {
    let at = block.length;
    while (at > 1 && !(block[at - 1] as string).replace(/\r$/, "").trim()) at -= 1;
    block.splice(at, 0, `- 의견: ${input.choice} · ${input.email}${memo ? ` — ${memo}` : ""}${cr}`);
  } else {
    const ai = block.findIndex((l) => ANSWER.test(l.replace(/\r$/, "")));
    const value = `${input.choice} · ${input.email} · ${input.at}`;
    const added = [`- 답: ${value}${cr}`];
    if (memo) added.push(`- 메모: ${memo}${cr}`);
    if (ai < 0) {
      let at = block.length;
      while (at > 1 && !(block[at - 1] as string).replace(/\r$/, "").trim()) at -= 1;
      block.splice(at, 0, ...added);
    } else {
      const old = (ANSWER.exec((block[ai] as string).replace(/\r$/, ""))?.[1] ?? "").trim();
      let drop = 1;
      while (ai + drop < block.length && (block[ai + drop] as string).replace(/\r$/, "").startsWith("- 메모:")) drop += 1;
      if (old) added.push(`- 이전 답: ${old}${cr}`);
      block.splice(ai, drop, ...added);
    }
  }
  let out = [...lines.slice(0, start), ...block, ...lines.slice(end)].join("\n");
  const allAnswered = parseQuestions(out).questions.every((q) => !q.open);
  let statusChanged: string | null = null;
  const before = parseLoose(out)?.status ?? null;
  if (allAnswered && before !== null && before !== "answered") {
    out = setField(out, "status", "answered");
    statusChanged = `${before}→answered`;
  }
  return { text: out, allAnswered, statusChanged };
}
