#!/usr/bin/env node
'use strict';

/**
 * scripts/assert-harness-context.cjs
 *
 * SessionStart 훅. 에이전트 세션이 하네스 없이 시작되는 것을 막는다.
 *
 * 실패하면 세션은 "규칙 없는 상태"로 진행되고, 그때 나온 산출물은
 * 정책을 하나도 반영하지 못한다. 그래서 이 검사는 경고가 아니라 exit 1 이다.
 */

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./harness-config.cjs');

const { root, config } = loadConfig();

const missing = config.requiredPaths.filter(
  (item) => !fs.existsSync(path.join(root, item)),
);

if (missing.length) {
  console.error('[assert-harness-context] missing required harness paths:');
  for (const item of missing) {
    console.error(`  - ${item}`);
  }
  console.error(
    '  restore these paths before continuing — the session has no policy loaded.',
  );
  process.exit(1);
}

const agentsMdPath = path.join(root, 'AGENTS.md');
const agentsMd = fs.readFileSync(agentsMdPath, 'utf8');

if (!agentsMd.includes('.agents/')) {
  console.error(
    '[assert-harness-context] AGENTS.md does not reference .agents/ harness assets.',
  );
  process.exit(1);
}

const adapterPaths = {
  claude: '.claude/settings.json',
  codex: '.codex/hooks.json',
};

const missingAdapters = config.adapters
  .filter((name) => adapterPaths[name])
  .filter((name) => !fs.existsSync(path.join(root, adapterPaths[name])));

if (missingAdapters.length) {
  console.error(
    `[assert-harness-context] declared adapters missing: ${missingAdapters.join(', ')}`,
  );
  process.exit(1);
}

const label = config.project.name || 'project';
console.log(
  `[assert-harness-context] ok: ${label} -> AGENTS.md + .agents harness available`,
);
