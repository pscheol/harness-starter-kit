#!/usr/bin/env node
'use strict';

/**
 * scripts/harness-config.cjs
 *
 * 하네스 공용 설정 로더. 모든 하네스 스크립트가 이 모듈을 통해
 * `.agents/harness.json` 하나만 읽는다.
 *
 * 설계 의도:
 *   - 프로젝트마다 달라지는 값(명령어, 런타임 버전, 가드 목록)을 스크립트에
 *     하드코딩하지 않는다. 스택이 바뀌어도 harness.json 만 갱신하면 된다.
 *   - 저장소 루트 판별은 도구별 환경변수 → git → 스크립트 상대경로 순으로
 *     내려간다. Claude Code/Codex/CI 어디서 실행돼도 같은 루트를 얻는다.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CONFIG_RELATIVE_PATH = '.agents/harness.json';

function findRoot() {
  if (process.env.CODEX_PROJECT_DIR) {
    return path.resolve(process.env.CODEX_PROJECT_DIR);
  }
  if (process.env.CLAUDE_PROJECT_DIR) {
    return path.resolve(process.env.CLAUDE_PROJECT_DIR);
  }

  const git = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
  });

  if (git.status === 0 && git.stdout.trim()) {
    return path.resolve(git.stdout.trim());
  }

  return path.resolve(__dirname, '..');
}

const DEFAULTS = {
  schemaVersion: 1,
  project: { name: 'unknown', key: 'PRJ', defaultBranch: 'main' },
  runtime: { packageManager: 'npm', minNodeMajor: 20 },
  commands: {},
  format: {
    formatExtensions: [],
    lintExtensions: [],
    lintPathPrefixes: [],
  },
  adapters: [],
  modules: ['core'],
  requiredPaths: ['AGENTS.md', '.agents/harness.json'],
  symlinks: [],
  guards: [],
  budget: {},
};

function mergeDefaults(config) {
  return {
    ...DEFAULTS,
    ...config,
    project: { ...DEFAULTS.project, ...(config.project || {}) },
    runtime: { ...DEFAULTS.runtime, ...(config.runtime || {}) },
    commands: { ...DEFAULTS.commands, ...(config.commands || {}) },
    format: { ...DEFAULTS.format, ...(config.format || {}) },
    budget: { ...DEFAULTS.budget, ...(config.budget || {}) },
  };
}

/**
 * @param {{ optional?: boolean }} options
 *   optional: true 면 설정 파일이 없어도 null 을 반환한다. 하네스가 아직
 *   설치되지 않은 저장소에서 훅이 조용히 빠져나가야 할 때 사용한다.
 */
function loadConfig(options = {}) {
  const root = findRoot();
  const configPath = path.join(root, CONFIG_RELATIVE_PATH);

  if (!fs.existsSync(configPath)) {
    if (options.optional) return null;
    console.error(`[harness] ${CONFIG_RELATIVE_PATH} not found at ${root}`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.error(`[harness] ${CONFIG_RELATIVE_PATH} is not valid JSON.`);
    console.error(`  ${error.message}`);
    process.exit(1);
  }

  return { root, configPath, config: mergeDefaults(parsed) };
}

/**
 * 문자열 명령("npm run lint")을 spawn 인자로 분해한다.
 * Windows 에서 npm/npx/pnpm/yarn 은 셸 래퍼라 cmd.exe 경유가 필요하다.
 */
function toSpawnArgs(commandLine) {
  const parts = String(commandLine || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return null;

  const [command, ...args] = parts;

  if (
    process.platform === 'win32' &&
    ['npm', 'npx', 'pnpm', 'yarn', 'bun'].includes(command)
  ) {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', quoteWindowsCommand(parts)],
    };
  }

  return { command, args };
}

function quoteWindowsCommand(parts) {
  return parts
    .map((part) =>
      /[\s"&|<>^]/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part,
    )
    .join(' ');
}

/**
 * 명령 문자열 + 추가 인자를 실행한다.
 * @returns {import('child_process').SpawnSyncReturns<string>}
 */
function runCommand(commandLine, extraArgs = [], options = {}) {
  const spawnable = toSpawnArgs(commandLine);
  if (!spawnable) {
    return { status: 0, skipped: true };
  }

  if (spawnable.command === 'cmd.exe' && extraArgs.length) {
    const merged = `${spawnable.args[3]} ${quoteWindowsCommand(extraArgs)}`;
    return spawnSync('cmd.exe', ['/d', '/s', '/c', merged], {
      stdio: 'inherit',
      shell: false,
      ...options,
    });
  }

  return spawnSync(spawnable.command, [...spawnable.args, ...extraArgs], {
    stdio: 'inherit',
    shell: false,
    ...options,
  });
}

module.exports = {
  CONFIG_RELATIVE_PATH,
  findRoot,
  loadConfig,
  runCommand,
  toSpawnArgs,
  quoteWindowsCommand,
};
