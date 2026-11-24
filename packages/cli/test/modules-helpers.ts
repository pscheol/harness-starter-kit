// 모듈 엔진 시험 도구: 가짜 aidlc · entire · gh · brew 를 PATH 에 두고 main() 을 부른다. 실제 도구를 부르지 않는다.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { main, type Io } from "../src/main";
import { CLI_DIR, FIXTURE_ENV, REAL_TEMPLATES, tmpDir, writeTree } from "./helpers";

const NODE = process.execPath;

/** 가짜 도구가 하네스 설정 파일에 훅을 더하는 스크립트(bin 폴더에 addhook.js 로 둔다) */
const ADDHOOK_JS = `const fs=require("fs"),path=require("path");const [f,event,command]=process.argv.slice(2);let d={};try{d=JSON.parse(fs.readFileSync(f,"utf8"))}catch{}
d.hooks=d.hooks||{};(d.hooks[event]=d.hooks[event]||[]).push({matcher:"",hooks:[{type:"command",command}]});fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(d,null,2)+"\\n");`;
const ADD_HOOK = (file: string, event: string, command: string): string => `${NODE} "$FAKE_BIN/addhook.js" ${JSON.stringify(file)} ${event} ${JSON.stringify(command)}`;

export const FAKE_AIDLC = `#!/bin/bash
echo "aidlc $*" >> "$FAKE_LOG"
case "$1" in
  --version) echo "aidlc \${FAKE_AIDLC_VERSION:-2.11.4} (runtime 2.11.4)" ;;
  config)
    harness=claude; [ "$2" = "--harness" ] && harness="$3"
    mkdir -p .claude/aidlc-common/stages .claude/skills/aidlc .claude/rules .claude/agents aidlc/spaces/default/memory
    printf '@.claude/rules/aidlc.md\\n\\n# AI-DLC\\n' > .claude/CLAUDE.md
    printf '# aidlc 규칙\\n본문\\n' > .claude/rules/aidlc.md
    printf -- '---\\nname: aidlc\\ndescription: >\\n  AI-DLC 시작 · 재개.\\n---\\n본문 아주 길다\\n' > .claude/skills/aidlc/SKILL.md
    printf -- '---\\nname: aidlc-architect-agent\\ndescription: 아키텍트\\n---\\n' > .claude/agents/aidlc-architect-agent.md
    echo "stage" > .claude/aidlc-common/stages/x.md
    echo "# memory" > aidlc/spaces/default/memory/project.md
    ${ADD_HOOK(".claude/settings.json", "SessionStart", "aidlc engine hook session-start")}
    ${ADD_HOOK(".claude/settings.json", "PreToolUse", "aidlc engine hook guard-tool-call")}
    echo "configured for $harness"
    ;;
  doctor) echo "0 problems"; exit 0 ;;
  update) if [ "$2" = "--check" ]; then echo "{\\"data\\":{\\"latestVersion\\":\\"\${FAKE_AIDLC_LATEST:-2.11.4}\\"}}"; fi ;;
esac
`;

export const FAKE_ENTIRE = `#!/bin/bash
echo "entire $*" >> "$FAKE_LOG"
case "$1" in
  --version) echo "Entire CLI \${FAKE_ENTIRE_VERSION:-0.13.4}" ;;
  enable)
    agent=""; while [ $# -gt 0 ]; do [ "$1" = "--agent" ] && agent="$2"; shift; done
    mkdir -p .entire
    echo '{"enabled": true, "checkpoints": {"primary": {"type": "git-refs"}}}' > .entire/settings.json
    echo "tmp/" > .entire/.gitignore
    case "$agent" in
      claude-code) ${ADD_HOOK(".claude/settings.json", "Stop", "exec entire hooks claude-code stop")} ;;
      codex) ${ADD_HOOK(".codex/hooks.json", "Stop", "exec entire hooks codex stop")} ;;
    esac
    ;;
  configure)
    echo '{"enabled": true, "strategy_options": {"push_sessions": false}, "checkpoints": {"primary": {"type": "git-refs"}}}' > .entire/settings.json ;;
  checkpoint) echo "체크포인트 설명 $3 \\$(printf '\\033[31m')빨강" ;;
esac
`;

export const FAKE_GH = `#!/bin/bash
echo "gh $*" >> "$FAKE_LOG"
case "\${FAKE_VIS:-PRIVATE}" in
  FAIL) exit 1 ;;
  *) echo "{\\"visibility\\":\\"\${FAKE_VIS:-PRIVATE}\\"}" ;;
esac
`;

/** brew install --cask entireio/tap/entire → 가짜 entire 를 bin 에 만든다 */
export const FAKE_BREW = (bin: string): string => `#!/bin/bash
echo "brew $*" >> "$FAKE_LOG"
cat > "${bin}/entire" <<'EOS'
${FAKE_ENTIRE}
EOS
chmod +x "${bin}/entire"
`;

export interface Bin {
  dir: string;
  log: string;
  env: Record<string, string>;
}

export function whichDir(cmd: string): string {
  return path.dirname(execFileSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" }).trim());
}

/** 가짜 도구 폴더. tools 에 이름 → 스크립트를 준다. PATH 는 그 폴더 + git · node 폴더뿐이다(진짜 aidlc · entire 가 보이지 않는다). */
export function makeBin(tools: Record<string, string>, extraEnv: Record<string, string> = {}): Bin {
  const dir = tmpDir("hk-bin-");
  const log = path.join(dir, "calls.log");
  fs.writeFileSync(log, "");
  fs.writeFileSync(path.join(dir, "addhook.js"), ADDHOOK_JS);
  for (const [name, body] of Object.entries(tools)) {
    fs.writeFileSync(path.join(dir, name), body, { mode: 0o755 });
  }
  const sys = [...new Set([whichDir("git"), whichDir("node"), "/usr/bin", "/bin"])];
  return { dir, log, env: { PATH: [dir, ...sys].join(":"), FAKE_LOG: log, FAKE_BIN: dir, HARNESS_KIT_PLATFORM: "darwin", ...extraEnv } };
}

export const calls = (b: Bin): string[] => fs.readFileSync(b.log, "utf8").split("\n").filter(Boolean);

export interface RunOpts {
  env?: Record<string, string>;
  tty?: boolean;
  answers?: string[];
  agent?: string | null;
}

export interface Out {
  code: number;
  stdout: string;
  stderr: string;
  json: Record<string, any>;
}

export async function cli(target: string, argv: string[], bin: Bin | null, o: RunOpts = {}): Promise<Out> {
  let stdout = "";
  let stderr = "";
  const stdin = new PassThrough();
  for (const a of o.answers ?? []) stdin.write(`${a}\n`);
  const io: Io = {
    stdout: (s) => {
      stdout += s;
    },
    stderr: (s) => {
      stderr += s;
    },
    env: { ...FIXTURE_ENV, ...(bin?.env ?? { PATH: `${whichDir("git")}:/usr/bin:/bin` }), HARNESS_KIT_CONFIG_DIR: path.join(target, "..", "cfg"), ...(o.env ?? {}) },
    cwd: target,
    cliFile: path.join(CLI_DIR, "dist", "cli.js"),
    isTTY: o.tty ?? false,
    nodeVersion: process.versions.node,
    stdin,
    today: "2026-11-24",
    agentSession: () => (o.agent === undefined ? null : o.agent),
  };
  const code = await main(argv, io);
  stdin.end();
  let json: Record<string, any> = {};
  try {
    json = JSON.parse(stdout) as Record<string, any>;
  } catch {
    json = {};
  }
  return { code, stdout, stderr, json };
}

/** 실제 템플릿으로 킷을 설치한 리포(git 초기화 · 하네스 claude · python 스택) */
export async function installedRepo(agents = "claude"): Promise<string> {
  const target = path.join(tmpDir("hk-mod-"), "acme");
  fs.mkdirSync(target, { recursive: true });
  const git = (...a: string[]): void => {
    execFileSync("git", a, { cwd: target, stdio: "ignore", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com", GIT_CONFIG_GLOBAL: "/dev/null" } });
  };
  git("init", "-q", "-b", "develop");
  git("commit", "-q", "--allow-empty", "-m", "init");
  git("remote", "add", "origin", "https://github.com/example-org/example-repo.git");
  const r = await cli(target, ["init", "--yes", "--templates", REAL_TEMPLATES, "--stack", "python", "--agents", agents, "--no-register"], null);
  if (r.code !== 0) throw new Error(`init 실패: ${r.stdout}${r.stderr}`);
  return target;
}

export { writeTree };
