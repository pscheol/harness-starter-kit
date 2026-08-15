#!/usr/bin/env node
'use strict';

/**
 * scripts/precommit.cjs
 *
 * 단일 검증 게이트. 사람과 에이전트가 같은 명령 하나로 커밋 전 검증을 끝낸다.
 *
 * 순서에는 이유가 있다.
 *   1. 런타임 확인   — 버전이 틀리면 아래 결과가 전부 신뢰할 수 없다.
 *   2. 포맷          — 이후 단계의 diff 잡음을 없앤다.
 *   3. 하네스 계약   — 규칙 문서 자체가 깨졌는지 먼저 본다.
 *   4. lint          — 가장 싸고 가장 많이 잡는다.
 *   5. typecheck     — lint 보다 느리고 더 정확하다.
 *   6. 도메인 가드   — 프로젝트 고유 불변 조건.
 *   7. test          — 가장 느리므로 마지막.
 *
 * 모든 단계는 SKIP_* 환경변수로 우회 가능하다. 우회를 막으면 사람이
 * 게이트 자체를 건너뛰기 때문에, 우회는 허용하되 눈에 보이게 한다.
 */

const path = require('path');
const { loadConfig, runCommand } = require('./harness-config.cjs');
const { spawnSync } = require('child_process');

const { root, config } = loadConfig();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function runRequired(label, commandLine, extraArgs = []) {
  if (!commandLine) {
    console.log(`[precommit] ${label} command not configured; skipped`);
    return;
  }

  console.log(`[precommit] ${label}`);
  const result = runCommand(commandLine, extraArgs, { cwd: root });

  if (result.error) {
    fail(`[precommit] failed to run ${label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function capture(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
}

function getMajor(versionText) {
  const match = String(versionText).match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function checkRuntime() {
  const required = Number(config.runtime.minNodeMajor) || 0;
  const nodeMajor = getMajor(process.versions.node);

  if (required && nodeMajor < required) {
    fail(
      `[precommit] Node ${process.versions.node} is too old. Requires Node ${required}+.`,
    );
  }
}

const FORMATTABLE = new RegExp(
  `\\.(${config.format.formatExtensions.join('|')})$`,
  'i',
);

function getStagedFiles() {
  const result = capture('git', [
    'diff',
    '--cached',
    '--name-only',
    '--diff-filter=ACMR',
  ]);

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  return result.stdout
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter((file) => file && FORMATTABLE.test(file));
}

/**
 * Windows 는 명령줄 길이 제한이 있어 스테이지 파일이 많으면 한 번에 못 넘긴다.
 */
function chunk(items, maxCharacters = 6000) {
  const chunks = [];
  let current = [];
  let length = 0;

  for (const item of items) {
    const itemLength = item.length + 3;
    if (current.length && length + itemLength > maxCharacters) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(item);
    length += itemLength;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

function formatStagedFiles() {
  const formatCommand = config.format.formatCommand;
  if (!formatCommand) return;

  console.log('[precommit] format staged files');
  const staged = getStagedFiles();

  if (!staged.length) {
    console.log('  no staged formatted files');
    return;
  }

  for (const group of chunk(staged)) {
    const formatted = runCommand(formatCommand, group, { cwd: root });
    if (formatted.status !== 0) process.exit(formatted.status || 1);

    const added = spawnSync('git', ['add', ...group], {
      cwd: root,
      stdio: 'inherit',
      shell: false,
    });
    if (added.status !== 0) process.exit(added.status || 1);
  }
}

/**
 * 도메인 가드는 기본이 경고다. 새 가드를 도입하는 순간 전원의 커밋을
 * 막아버리면 가드가 미움받고 제거된다. 안정화된 가드만 enforceEnv 로
 * 승격한다.
 */
function runGuards() {
  for (const guard of config.guards) {
    if (guard.skipEnv && process.env[guard.skipEnv] === '1') continue;

    console.log(`[precommit] guard: ${guard.name}`);
    const result = runCommand(guard.command, [], { cwd: root });

    if (result.status !== 0) {
      const enforced =
        guard.enforceEnv && process.env[guard.enforceEnv] === '1';
      if (enforced) {
        process.exit(result.status || 1);
      }
      console.log(
        `  ${guard.name} warning. Set ${guard.enforceEnv || 'the guard enforce flag'}=1 to fail on this check.`,
      );
    }
    console.log('');
  }
}

function main() {
  checkRuntime();
  formatStagedFiles();

  if (process.env.SKIP_HARNESS !== '1') {
    console.log('[precommit] harness contract');
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts', 'verify-harness.cjs')],
      { cwd: root, stdio: 'inherit', shell: false },
    );
    if (result.status !== 0) process.exit(result.status || 1);
  }

  if (process.env.SKIP_LINT !== '1') {
    runRequired('lint', config.commands.lint);
  }

  if (process.env.SKIP_TC !== '1') {
    runRequired('typecheck', config.commands.typecheck);
  }

  if (process.env.SKIP_GUARDS !== '1') {
    runGuards();
  }

  if (process.env.SKIP_TEST !== '1') {
    runRequired('test', config.commands.test);
  } else {
    console.log('[precommit] tests skipped by SKIP_TEST=1');
  }

  console.log('[precommit] passed');
}

main();
