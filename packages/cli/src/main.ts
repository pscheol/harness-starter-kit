/** harness-kit CLI 진입점: Node 버전 확인 → 명령 → 출력 → 종료 코드(HK-8 design §7). */
import { bool, parseCommandArgs } from "./cli/args";
import type { CommandResult, Ctx, Io } from "./cli/context";
import { runAdd } from "./commands/add";
import { runDashboard } from "./commands/dashboard";
import { runAnswer, runApprove, runReview } from "./commands/decide";
import { runDoctor } from "./commands/doctor";
import { runInit } from "./commands/init";
import { runList } from "./commands/list";
import { runOutdated } from "./commands/outdated";
import { runRemove } from "./commands/remove";
import { runRepair } from "./commands/repair";
import { RESERVED } from "./commands/reserved";
import { runFlow, runHistory, runQuality, runSessions, runStatus } from "./commands/status";
import { runUninstall } from "./commands/uninstall";
import { runUpdate } from "./commands/update";
import { runPack } from "./commands/pack";
import { runDispatch, runProjects, runUnits } from "./commands/work";
import { CliError, EXIT, usageError } from "./core/errors";
import { formatJson } from "./core/json";
import { MIN_NODE_TEXT, nodeTooOld, VERSION } from "./core/version";

export type { Io } from "./cli/context";

const COMMANDS: Record<string, (ctx: Ctx) => CommandResult | Promise<CommandResult>> = {
  init: runInit,
  plan: runInit,
  add: runAdd,
  remove: runRemove,
  update: runUpdate,
  outdated: runOutdated,
  repair: runRepair,
  uninstall: runUninstall,
  doctor: runDoctor,
  list: runList,
  dashboard: runDashboard,
  status: runStatus,
  projects: runProjects,
  approve: runApprove,
  answer: runAnswer,
  review: runReview,
  sessions: runSessions,
  dispatch: runDispatch,
  units: runUnits,
  flow: runFlow,
  quality: runQuality,
  history: runHistory,
  pack: runPack,
};

const USAGE = `harness-kit ${VERSION} — 하네스 엔지니어링 스타터 킷

사용법: harness-kit <명령> [플래그]

명령:
  init       킷을 리포에 설치한다(질문 또는 플래그)
  plan       설치할 작업 목록만 출력한다(쓰지 않는다)
  add        하네스 · 모듈을 켜고 그 몫만 깐다(예: add codex jira-workflow)
  remove     하네스 · 모듈을 끄고 고치지 않은 그 몫만 지운다
  update     킷을 새 판으로 올린다. 사람이 고친 파일은 <경로>.new 로 받는다
  outdated   설치 · CLI · 소스 최신 태그 판을 비교한다. --check 면 새 판이 있을 때 exit 1
  repair     지워진 킷 파일을 같은 판으로 되살린다. 고친 파일은 그대로 둔다
  uninstall  킷 소유이면서 고치지 않은 파일을 지운다
  doctor     설치 상태를 점검한다(읽기만). --check 면 오류가 있을 때 exit 1
  list       설치 요약. --files 면 lock 항목
  dashboard  관리 페이지 서버(127.0.0.1). --export <폴더> 는 정적 HTML, --all · --root · --workspace 는 여러 프로젝트
  status     처리할 일 · 이슈 · 문서 · 검증 · 흐름(--json 은 관리 페이지 API 와 같다)
  approve    사람 터미널 승인(approvals.md 에 덧붙인다). answer 질문 답 · review show|decide 리뷰 판단
  sessions   켜 둔 세션. dispatch 세션에 작업 요청(사람이 고를 때만) · dispatch list|drop 대기함
  units      Unit 변경 제안(propose · discard). flow gates 흐름 틀 · quality 품질 결과 · projects 등록부
  pack       pack new <이름> --dir <경로> --from <파일>… — 프로젝트 파일로 회사 팩 골격을 만든다

공통 플래그: --cwd <폴더> --dry-run --yes --json --templates <폴더> --quiet --no-color --help
init · plan: --stack --arch --domain --lang --agents <목록|all> --modules <목록|all|none>
             --name --slug --package-ns --protected-path --token KEY=VALUE --issue-source kit|jira
             --issue-prefix --base --adopt --force
add · remove: <이름>…(하네스 claude codex cursor kiro · 모듈 jira-workflow multi-harness)
dashboard: --port --open --read-only --export <폴더> --all --root <dir> --workspace <file> · 관리 페이지 명령은 harness-kit <명령> --help
update: --accept-all --prune --forget <경로>(반복) --to <CLI 버전> --packs(메타 packs 의 팩만 받아 깐다) · outdated: --check --source <git 원격>
repair: --only missing,drifted,stale,merge · uninstall: --keep-state --keep-packs
종료 코드: 0 성공 · 1 검사 문제 · 2 사용법 · 3 리포 상태 · 4 사람 판단 필요 · 5 실행 환경 · 130 중단
`;

const COMMAND_HELP: Record<string, string> = {
  init: "harness-kit init [--stack S] [--arch A] [--agents claude,codex|all] [--modules m1,m2|all|none] [--yes] [--dry-run] [--json]\n",
  plan: "harness-kit plan [init 과 같은 플래그] — 작업 목록만 출력한다\n",
  doctor: "harness-kit doctor [--check] [--only 종류,…] [--json] — 종류: meta-invalid lock-invalid lock-v1 version-mismatch missing drifted gitignore entry-size\n",
  list: "harness-kit list [--files] [--json]\n",
  add: "harness-kit add <하네스|모듈>… [--dry-run] [--json] — 그 몫만 깐다. 사람이 고친 매니페스트는 .new 로 받고 exit 4\n",
  remove: "harness-kit remove <하네스|모듈>… [--dry-run] [--json] — 고치지 않은 그 몫만 지운다. 고친 파일을 남기면 exit 4\n",
  outdated: "harness-kit outdated [--check] [--source <git 원격|경로>] [--json] — 소스: --source > HARNESS_KIT_SOURCE > lock kit.source. 닿지 못하면 '확인 못 함' 과 exit 0\n",
  update: "harness-kit update [--dry-run] [--accept-all] [--prune] [--forget 경로]… [--to 버전] [--templates 폴더] [--json] — conflict 가 있으면 exit 4. update --packs 는 팩만(검사 실패 exit 3 · 팩 충돌 exit 4)\n",
  repair: "harness-kit repair [--dry-run] [--only missing,drifted,stale,merge] [--json] — 되살리지 못한 missing 이 있으면 exit 4\n",
  uninstall: "harness-kit uninstall [--dry-run] [--yes] [--keep-state] [--keep-packs] [--json] — 고친 파일을 남기면 exit 4. TTY 가 아니면 --yes\n",
  dashboard: "harness-kit dashboard [--port <n>] [--open] [--read-only] [--export <폴더>] [--all | --root <dir> | --workspace <file>] — 127.0.0.1 에만 연다. 주소는 stdout, 승인 PIN 은 stderr\n",
  status: "harness-kit status [--session | --intents | --intent <INT> | --issues [--area --stage --intent] | --issue <키> | --doc <경로> | --verify [--issue] | --worktrees | --harness | --flow <INT> | --all] [--json]\n",
  projects: "harness-kit projects list | add <폴더> | remove <이름|경로> [--json] — 등록부 ~/.config/harness-kit/projects.json\n",
  approve: 'harness-kit approve <키> --gate <게이트> --phrase "<문구>" [--changes-requested [--rule-candidate]] [--json] — 사람 터미널에서만(에이전트 세션 · TTY 아님은 exit 3)\n',
  answer: "harness-kit answer <INT|키> --list | <Q-n> --choice <A-D|other> [--text …] [--json] — 사람 터미널에서만\n",
  review: "harness-kit review show <키> | review decide <키> <F-n> --fix|--accept-risk --reason … [--json] — decide 는 사람 터미널에서만\n",
  sessions: "harness-kit sessions [--machine] [--json]\n",
  dispatch: "harness-kit dispatch --to <세션 id|키:역할|이름> --kind <종류> --path <파일>… [--text …] [--via socket|deeplink|queue] | dispatch list | dispatch drop <id>\n",
  units: "harness-kit units propose <INT> --add-dep U-a:U-b | --remove-dep U-a:U-b | --split U-n=제목1|제목2 | --merge U-a,U-b | --order U-a,U-b [--reason …] | units discard <INT>\n",
  flow: "harness-kit flow gates [--add <게이트> --after <게이트> | --remove <게이트>] [--json]\n",
  quality: "harness-kit quality [--findings [--issue <키>] [--severity S] [--new]] [--json]\n",
  history: "harness-kit history [--q …] [--json] — ~/.config/harness-kit/config.json 의 history 가 on 일 때만(HK-18)\n",
  pack: "harness-kit pack new <이름> --dir <경로> [--from <파일|폴더>[#훅·검사 id]]… [--kit-range \">=2.0.0 <3.0.0\"] [--json] — --dir 은 빈 폴더나 없는 경로\n",
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
    throw usageError(`'${command}' 는 아직 없다 — ${RESERVED[command]}에서 제공한다`, `지금 있는 명령: ${Object.keys(COMMANDS).join(" · ")}`);
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
    const { values, positionals } = parseCommandArgs(command, argv.slice(1));
    if (bool(values, "help")) {
      io.stdout(Object.hasOwn(COMMAND_HELP, command) ? (COMMAND_HELP[command] as string) : USAGE);
      return EXIT.OK;
    }
    const ctx: Ctx = { io, command, values, positionals, json, quiet: bool(values, "quiet") };
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
