#!/usr/bin/env node
'use strict';

/**
 * scripts/bootstrap-harness.cjs
 *
 * 하네스 심볼릭 링크 부트스트랩. 패키지 매니저의 postinstall 에서 실행한다.
 *
 * 왜 심볼릭인가:
 *   도구마다 진입점 파일명이 다르다(CLAUDE.md, AGENTS.md, .claude/skills).
 *   사본을 두면 반드시 드리프트가 생기므로, 원본은 하나로 두고 나머지는
 *   전부 심볼릭으로 비춘다.
 *
 * 동작:
 *   - macOS/Linux: 표준 symlink. 정상이면 아무것도 하지 않는다(idempotent).
 *   - Windows + 권한 OK: symlink 생성.
 *   - Windows + 권한 없음: hard copy 폴백. 매 실행마다 새로 복사해 드리프트를 막는다.
 *
 * 단일 진실(직접 수정하지 말 것):
 *   - AGENTS.md
 *   - .agents/skills/_project/<name>/SKILL.md
 */

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./harness-config.cjs');

const { root, config } = loadConfig();

/**
 * 일부 도구의 스킬 탐색 글롭은 "<한 단계>/SKILL.md" 로 한 단계뿐이다.
 * 도메인 스킬 원본은 `_project/<name>/SKILL.md` 라 글롭이 닿지 않으므로
 * 평면 별칭을 자동 생성한다. 스킬을 추가할 때 이 스크립트를 고칠 필요는 없다.
 */
function discoverProjectSkillLinks() {
  const projectSkillsDir = path.join(root, '.agents/skills/_project');
  if (!fs.existsSync(projectSkillsDir)) return [];

  return fs
    .readdirSync(projectSkillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .filter((entry) =>
      fs.existsSync(path.join(projectSkillsDir, entry.name, 'SKILL.md')),
    )
    .map((entry) => ({
      link: `.agents/skills/${entry.name}`,
      target: `_project/${entry.name}`,
      type: 'dir',
    }));
}

function abs(relativePath) {
  return path.join(root, relativePath);
}

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function isCorrectSymlink(entry) {
  const linkPath = abs(entry.link);
  const stat = lstatOrNull(linkPath);
  if (!stat || !stat.isSymbolicLink()) return false;

  let read;
  try {
    read = fs.readlinkSync(linkPath);
  } catch {
    return false;
  }

  const normalize = (value) => value.replace(/\\/g, '/').replace(/\/$/, '');
  if (normalize(read) !== normalize(entry.target)) return false;

  try {
    fs.statSync(linkPath); // 타겟 존재 여부(심볼릭 추적)
  } catch {
    return false;
  }

  return true;
}

function removeIfExists(target) {
  const stat = lstatOrNull(target);
  if (!stat) return;

  if (stat.isSymbolicLink() || stat.isFile()) {
    fs.unlinkSync(target);
  } else if (stat.isDirectory()) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function hardCopy(entry) {
  const linkPath = abs(entry.link);
  const targetAbs = path.resolve(path.dirname(linkPath), entry.target);

  if (entry.type === 'file') {
    fs.copyFileSync(targetAbs, linkPath);
    return;
  }

  // dereference: 타겟 안의 심볼릭도 따라가 실파일로 복사한다.
  fs.cpSync(targetAbs, linkPath, { recursive: true, dereference: true });
}

function processEntry(entry, summary) {
  if (isCorrectSymlink(entry)) {
    summary.ok.push(entry.link);
    return;
  }

  const linkPath = abs(entry.link);
  const targetAbs = path.resolve(path.dirname(linkPath), entry.target);

  if (!fs.existsSync(targetAbs)) {
    summary.failed.push({
      link: entry.link,
      reason: `target missing: ${entry.target}`,
    });
    return;
  }

  removeIfExists(linkPath);
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });

  try {
    fs.symlinkSync(
      entry.target,
      linkPath,
      entry.type === 'dir' ? 'dir' : 'file',
    );
    summary.created.push(entry.link);
  } catch (error) {
    try {
      hardCopy(entry);
      summary.fallback.push(entry.link);
    } catch (copyError) {
      summary.failed.push({
        link: entry.link,
        reason: `${error.code || error.message} -> copy failed: ${copyError.message}`,
      });
    }
  }
}

function main() {
  const entries = [...config.symlinks, ...discoverProjectSkillLinks()];
  const summary = { ok: [], created: [], fallback: [], failed: [] };

  for (const entry of entries) {
    try {
      processEntry(entry, summary);
    } catch (error) {
      summary.failed.push({ link: entry.link, reason: error.message });
    }
  }

  console.log(
    `[bootstrap-harness] ${entries.length} entries — ok:${summary.ok.length} created:${summary.created.length} fallback:${summary.fallback.length} failed:${summary.failed.length}`,
  );

  if (summary.created.length) {
    console.log(`  created: ${summary.created.join(', ')}`);
  }

  if (summary.fallback.length) {
    console.log(`  fallback (hard copy): ${summary.fallback.join(', ')}`);
    console.log(
      '  note: symlink 권한 부족으로 추정 — 원본 변경 시 bootstrap 재실행으로 동기화.',
    );
  }

  if (summary.failed.length) {
    console.error('  failures:');
    for (const item of summary.failed) {
      console.error(`    - ${item.link}: ${item.reason}`);
    }
    process.exit(1);
  }
}

main();
