/** 번들 진입점(dist/cli.js). 실제 프로세스를 Io 로 넘긴다. */
import tty from "node:tty";
import { main, type Io } from "./main";

const io: Io = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  env: process.env,
  cwd: process.cwd(),
  cliFile: __filename,
  isTTY: tty.isatty(0) && tty.isatty(1),
  nodeVersion: process.versions.node,
  // 질문할 때만 stdin 을 연다(파이프 stdin 을 만들지 않는다).
  get stdin(): NodeJS.ReadableStream {
    return process.stdin;
  },
};

// `harness-kit list --files | head` 처럼 읽는 쪽이 먼저 닫히면 조용히 끝낸다.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(process.exitCode ?? 0);
  throw err;
});

main(process.argv.slice(2), io).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`✖ 내부 오류: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exitCode = 1;
  },
);
