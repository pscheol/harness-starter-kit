#!/usr/bin/env node
'use strict';

/**
 * scripts/format-and-lint-hook.cjs
 *
 * PostToolUse(Write|Edit) 훅. 편집된 파일 하나에만 포매터와 린터를 건다.
 *
 * 목적은 코드 품질이 아니라 **모델 어텐션 절약**이다. 포맷·import 순서·미사용
 * 변수를 자동화가 처리하면, 에이전트도 리뷰어도 그 항목에 토큰을 쓰지 않는다.
 *
 * 실패해도 절대 편집을 막지 않는다(항상 exit 0). 훅이 개발 흐름을
 * 끊는 순간 사람이 훅을 꺼버리기 때문이다.
 */

const fs = require('fs');
const path = require('path');
const { loadConfig, runCommand } = require('./harness-config.cjs');

function readStdin() {
  return new Promise((resolve) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => resolve(input));
    process.stdin.resume();
  });
}

/**
 * 저장소 밖 경로를 걸러낸다. 훅 입력은 신뢰 경계 밖이라
 * `../../etc/...` 같은 경로가 들어올 수 있다.
 */
function normalizeFilePath(root, filePath) {
  if (!filePath) return null;

  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.join(root, filePath);
  const normalizedRoot = `${path.resolve(root)}${path.sep}`;
  const normalizedFile = path.resolve(absolute);

  if (!normalizedFile.startsWith(normalizedRoot)) return null;

  return path.relative(root, normalizedFile);
}

function matchesPrefix(relativeFile, prefixes) {
  if (!prefixes.length) return true;
  const normalized = relativeFile.split(path.sep).join('/');
  return prefixes.some((prefix) => normalized.startsWith(prefix));
}

async function main() {
  const loaded = loadConfig({ optional: true });
  if (!loaded) return;

  const { root, config } = loaded;
  const input = await readStdin();

  let payload = {};
  try {
    payload = input ? JSON.parse(input) : {};
  } catch {
    return;
  }

  const relativeFile = normalizeFilePath(root, payload.tool_input?.file_path);
  if (!relativeFile) return;

  const absoluteFile = path.join(root, relativeFile);
  if (!fs.existsSync(absoluteFile) || !fs.statSync(absoluteFile).isFile()) {
    return;
  }

  const ext = path.extname(relativeFile).slice(1);
  const { formatCommand, lintFixCommand } = config.format;

  if (formatCommand && config.format.formatExtensions.includes(ext)) {
    runCommand(formatCommand, [relativeFile], { cwd: root, stdio: 'ignore' });
  }

  const shouldLint =
    lintFixCommand &&
    config.format.lintExtensions.includes(ext) &&
    matchesPrefix(relativeFile, config.format.lintPathPrefixes);

  if (shouldLint) {
    runCommand(lintFixCommand, [relativeFile], { cwd: root, stdio: 'ignore' });
  }
}

main().catch(() => {
  process.exit(0);
});
