/** harness-kit CLI 진입점: Node 버전 확인 → 명령 → 출력 → 종료 코드(HK-8 design §7). */
import { bool, parseCommandArgs } from "./cli/args";
import type { CommandResult, Ctx, Io } from "./cli/context";
import { runDoctor } from "./commands/doctor";
import { runInit } from "./commands/init";
import { runList } from "./commands/list";
import { runRepair } from "./commands/repair";
import { RESERVED } from "./commands/reserved";
import { runUninstall } from "./commands/uninstall";
import { runUpdate } from "./commands/update";
import { CliError, EXIT, usageError } from "./core/errors";
import { formatJson } from "./core/json";
import { MIN_NODE_TEXT, nodeTooOld, VERSION } from "./core/version";

export type { Io } from "./cli/context";

const COMMANDS: Record<string, (ctx: Ctx) => CommandResult | Promise<CommandResult>> = {
  init: runInit,
  plan: runInit,
  update: runUpdate,
  repair: runRepair,
  uninstall: runUninstall,
  doctor: runDoctor,
  list: runList,
};

const USAGE = `harness-kit ${VERSION} — 하네스 엔지니어링 스타터 킷

사용법: harness-kit <명령> [플래그]

명령:
  init       킷을 리포에 설치한다(질문 또는 플래그)
  plan       설치할 작업 목록만 출력한다(쓰지 않는다)
  update     킷을 새 판으로 올린다. 사람이 고친 파일은 <경로>.new 로 받는다
  repair     지워진 킷 파일을 같은 판으로 되살린다. 고친 파일은 그대로 둔다
  uninstall  킷 소유이면서 고치지 않은 파일을 지운다
  doctor     설치 상태를 점검한다(읽기만). --check 면 오류가 있을 때 exit 1
  list       설치 요약. --files 면 lock 항목

공통 플래그: --cwd <폴더> --dry-run --yes --json --templates <폴더> --quiet --no-color --help
init · plan: --stack --arch --domain --lang --agents <목록|all> --modules <목록|all|none>
             --name --slug --package-ns --protected-path --token KEY=VALUE --issue-source kit|jira
             --issue-prefix --base --adopt --force
update: --accept-all --prune --forget <경로>(반복) --to <CLI 버전>
repair: --only missing,drifted,stale,merge · uninstall: --keep-state --keep-packs
종료 코드: 0 성공 · 1 검사 문제 · 2 사용법 · 3 리포 상태 · 4 사람 판단 필요 · 5 실행 환경 · 130 중단
`;

const COMMAND_HELP: Record<string, string> = {
  init: "harness-kit init [--stack S] [--arch A] [--agents claude,codex|all] [--modules m1,m2|all|none] [--yes] [--dry-run] [--json]\n",
  plan: "harness-kit plan [init 과 같은 플래그] — 작업 목록만 출력한다\n",
  doctor: "harness-kit doctor [--check] [--only 종류,…] [--json] — 종류: meta-invalid lock-invalid lock-v1 version-mismatch missing drifted gitignore entry-size\n",
  list: "harness-kit list [--files] [--json]\n",
  update: "harness-kit update [--dry-run] [--accept-all] [--prune] [--forget 경로]… [--to 버전] [--templates 폴더] [--json] — conflict 가 있으면 exit 4\n",
  repair: "harness-kit repair [--dry-run] [--only missing,drifted,stale,merge] [--json] — 되살리지 못한 missing 이 있으면 exit 4\n",
  uninstall: "harness-kit uninstall [--dry-run] [--yes] [--keep-state] [--keep-packs] [--json] — 고친 파일을 남기면 exit 4. TTY 가 아니면 --yes\n",
};

function emitError(io: Io, command: string, err: CliError, json: boolean): number {
  if (json) {
    const error: Record<string, unknown> = { code: err.code, message: err.message };
    if (err.hint) error.hint = err.hint;
    io.stdout(formatJson({ command, error }));
  } else {
    io.stderr(`✖ ${err.message}\n`);
    if (err.hint) io.stderr(`  ${err.hint}\n`);
  }
  return err.code;
}

/** 명령 이름 → 실행 함수. 없는 이름 · 예약 이름은 exit 2. 프로토타입 키(constructor 등)는 모르는 명령이다. */
function commandOf(argv: string[], first: string, command: string): (ctx: Ctx) => CommandResult | Promise<CommandResult> {
  if (argv.length === 0) throw usageError("명령이 없다", USAGE.trimEnd());
  if (command === "") throw usageError(`명령이 먼저 온다: ${first}`, "harness-kit --help");
  if (Object.hasOwn(RESERVED, command)) {
    throw usageError(`'${command}' 는 아직 없다 — ${RESERVED[command]}에서 제공한다`, "지금 있는 명령: init · plan · update · repair · uninstall · doctor · list");
  }
  if (!Object.hasOwn(COMMANDS, command)) throw usageError(`모르는 명령: ${command}`, "harness-kit --help");
  return COMMANDS[command] as (ctx: Ctx) => CommandResult | Promise<CommandResult>;
}

export async function main(argv: string[], io: Io): Promise<number> {
  const json = argv.includes("--json");
  const first = argv[0] ?? "";
  const command = first.startsWith("-") ? "" : first;
  if (nodeTooOld(io.nodeVersion)) {
    return emitError(io, command, new CliError(EXIT.ENV, `Node ${MIN_NODE_TEXT} 이상이 필요하다(지금 v${io.nodeVersion.replace(/^v/, "")})`, "Node 가 없으면 플러그인의 setup.sh 로 설치한다"), json);
  }
  if (first === "--version" || first === "-v") {
    io.stdout(`${VERSION}\n`);
    return EXIT.OK;
  }
  if (first === "--help" || first === "-h") {
    io.stdout(USAGE);
    return EXIT.OK;
  }
  try {
    const run = commandOf(argv, first, command);
    const values = parseCommandArgs(command, argv.slice(1));
    if (bool(values, "help")) {
      io.stdout(Object.hasOwn(COMMAND_HELP, command) ? (COMMAND_HELP[command] as string) : USAGE);
      return EXIT.OK;
    }
    const ctx: Ctx = { io, command, values, json, quiet: bool(values, "quiet") };
    const result = await run(ctx);
    if (json) io.stdout(formatJson(result.data));
    else io.stdout(`${result.lines.join("\n")}\n`);
    return result.code;
  } catch (err) {
    if (err instanceof CliError) return emitError(io, command, err, json);
    const message = err instanceof Error ? err.message : String(err);
    emitError(io, command, new CliError(1, `내부 오류: ${message}`), json);
    if (!json && err instanceof Error && err.stack) io.stderr(`${err.stack}\n`);
    return 1;
  }
}
