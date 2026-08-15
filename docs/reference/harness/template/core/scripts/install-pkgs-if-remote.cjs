#!/usr/bin/env node
'use strict';

/**
 * scripts/install-pkgs-if-remote.cjs
 *
 * SessionStart 훅. 원격/클라우드 에이전트 환경에서만 의존성을 설치한다.
 *
 * 로컬에서는 아무것도 하지 않는다. 사람이 이미 설치한 상태를 훅이
 * 마음대로 되돌리면 개발 흐름이 깨지기 때문이다.
 */

const fs = require('fs');
const path = require('path');
const { loadConfig, runCommand } = require('./harness-config.cjs');

const isRemote =
  process.env.CLAUDE_CODE_REMOTE === 'true' ||
  process.env.CODEX_REMOTE === 'true';

if (!isRemote) {
  process.exit(0);
}

const loaded = loadConfig({ optional: true });
if (!loaded) process.exit(0);

const { root, config } = loaded;

const LOCKFILES = {
  npm: 'package-lock.json',
  pnpm: 'pnpm-lock.yaml',
  yarn: 'yarn.lock',
  bun: 'bun.lockb',
};

const lockfile = LOCKFILES[config.runtime.packageManager];

if (lockfile && !fs.existsSync(path.join(root, lockfile))) {
  console.log(`[install-pkgs-if-remote] ${lockfile} not found; skip.`);
  process.exit(0);
}

const command = config.runtime.remoteInstallCommand || config.commands.install;

if (!command) {
  console.log('[install-pkgs-if-remote] no install command configured; skip.');
  process.exit(0);
}

const result = runCommand(command, [], { cwd: root });
process.exit(result.status || 0);
