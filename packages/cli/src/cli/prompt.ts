/** TTY 질문. 한 명령 안에서 readline 하나를 쓴다(앞서 들어온 입력을 잃지 않는다). */
import readline from "node:readline";

export interface Prompter {
  ask(question: string, fallback: string): Promise<string>;
  confirm(question: string): Promise<boolean>;
  close(): void;
}

export function createPrompter(input: NodeJS.ReadableStream, write: (s: string) => void): Prompter {
  const rl = readline.createInterface({ input, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const next = async (): Promise<string | null> => {
    const r = await lines.next();
    return r.done ? null : String(r.value);
  };
  return {
    async ask(question, fallback) {
      write(`${question}${fallback ? ` (${fallback})` : ""}: `);
      const a = await next();
      const v = (a ?? "").trim();
      return v === "" ? fallback : v;
    },
    async confirm(question) {
      write(`${question} [Y/n]: `);
      const a = await next();
      if (a === null) return false;
      return !/^(n|no|아니오|아니)$/i.test(a.trim());
    },
    close() {
      rl.close();
    },
  };
}
