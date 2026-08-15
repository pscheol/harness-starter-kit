#!/usr/bin/env node
'use strict';

/**
 * scripts/verify-harness.cjs
 *
 * 하네스 자체의 회귀 검사. 하네스는 문서 더미가 아니라 **계약**이므로,
 * 계약이 깨졌는지 코드와 같은 방식으로 검사한다.
 *
 * 검사 항목:
 *   1. 필수 경로 존재
 *   2. 심볼릭/미러 정합성 (드리프트 검출)
 *   3. 진입점 토큰 예산 (AGENTS.md 가 비대해지면 아무도 안 읽는다)
 *   4. 규칙 파일 frontmatter 유효성
 *   5. SDD 색인 정합성 (spec 폴더 ↔ index.md)
 *   6. tasks.md 체크박스 형식
 *   7. 어댑터 ↔ 스크립트 배선 일치
 *   8. .gitignore 의 로컬/산출물 제외 항목
 *   9. 문서 내부 링크의 대상 파일 존재
 *
 * failures 는 exit 1, warnings 는 통과시키되 출력한다.
 */

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./harness-config.cjs');

const { root, config } = loadConfig();

const failures = [];
const warnings = [];

const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);

const abs = (relativePath) => path.join(root, relativePath);
const exists = (relativePath) => fs.existsSync(abs(relativePath));
const read = (relativePath) => fs.readFileSync(abs(relativePath), 'utf8');

function checkRequiredPaths() {
  for (const item of config.requiredPaths) {
    if (!exists(item)) fail(`required path missing: ${item}`);
  }
}

function checkMirrors() {
  for (const entry of config.symlinks) {
    if (!exists(entry.link)) {
      fail(`mirror missing: ${entry.link} -> ${entry.target}`);
      continue;
    }

    const linkPath = abs(entry.link);
    const stat = fs.lstatSync(linkPath);

    if (stat.isSymbolicLink()) continue;

    // Windows 하드카피 폴백. 사본이 원본과 어긋났는지만 확인한다.
    if (entry.type !== 'file') continue;

    const targetPath = path.resolve(path.dirname(linkPath), entry.target);
    if (!fs.existsSync(targetPath)) {
      fail(`mirror target missing: ${entry.target}`);
      continue;
    }

    if (
      fs.readFileSync(linkPath, 'utf8') !== fs.readFileSync(targetPath, 'utf8')
    ) {
      fail(
        `mirror drift: ${entry.link} differs from ${entry.target}. run the bootstrap script.`,
      );
    }
  }
}

function countLines(relativePath) {
  return read(relativePath).split(/\r?\n/).length;
}

function checkBudget() {
  const { agentsMdMaxLines, claudeMdMaxLines } = config.budget;

  if (agentsMdMaxLines && exists('AGENTS.md')) {
    const lines = countLines('AGENTS.md');
    if (lines > agentsMdMaxLines) {
      warn(
        `AGENTS.md is ${lines} lines (budget ${agentsMdMaxLines}). Move detail into .agents/ and keep the entry point a table of contents.`,
      );
    }
  }

  if (claudeMdMaxLines && exists('.claude/CLAUDE.md')) {
    const lines = countLines('.claude/CLAUDE.md');
    if (lines > claudeMdMaxLines) {
      warn(`.claude/CLAUDE.md is ${lines} lines (budget ${claudeMdMaxLines}).`);
    }
  }
}

function checkRuleFrontmatter() {
  const rulesDir = abs('.agents/rules');
  if (!fs.existsSync(rulesDir)) {
    fail('.agents/rules is missing');
    return;
  }

  const ruleFiles = fs
    .readdirSync(rulesDir)
    .filter((name) => name.endsWith('.md') && name !== 'README.md');

  if (!ruleFiles.length) fail('.agents/rules has no rule files');

  for (const name of ruleFiles) {
    if (name === '_TEMPLATE.md') continue;

    const content = fs.readFileSync(path.join(rulesDir, name), 'utf8');
    if (!content.startsWith('---')) {
      warn(`.agents/rules/${name} has no frontmatter block`);
      continue;
    }

    const end = content.indexOf('\n---', 3);
    const frontmatter = end === -1 ? '' : content.slice(0, end);

    for (const key of ['name:', 'description:', 'applies_to:']) {
      if (!frontmatter.includes(key)) {
        warn(`.agents/rules/${name} frontmatter is missing "${key}"`);
      }
    }
  }
}

function listSpecUnits() {
  const specsDir = abs('.agents/docs/product-specs');
  if (!fs.existsSync(specsDir)) return [];

  return fs
    .readdirSync(specsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name);
}

function checkSpecIndex() {
  const indexPath = '.agents/docs/product-specs/index.md';
  if (!exists(indexPath)) {
    fail(`${indexPath} missing — the SDD index is the single catalogue`);
    return;
  }

  const index = read(indexPath);
  for (const unit of listSpecUnits()) {
    if (!index.includes(unit)) {
      fail(`product-specs/${unit} is not listed in ${indexPath}`);
    }
  }
}

function checkTaskCheckboxes() {
  for (const unit of listSpecUnits()) {
    const relativePath = `.agents/docs/product-specs/${unit}/tasks.md`;
    if (!exists(relativePath)) continue;

    const lines = read(relativePath).split(/\r?\n/);
    lines.forEach((line, position) => {
      const match = line.match(/^\s*[-*]\s\[(.)\]/);
      if (match && !['x', ' ', 'X'].includes(match[1])) {
        fail(
          `${relativePath}:${position + 1} uses "[${match[1]}]". Only "[ ]" and "[x]" are portable across tools.`,
        );
      }
    });
  }
}

/**
 * 어댑터 설정이 서로 다른 스크립트를 부르기 시작하면, 도구에 따라 정책이
 * 달라진다. 하네스가 조용히 깨지는 가장 흔한 경로라 별도로 검사한다.
 */
function checkAdapterWiring() {
  const scriptRefs = new Map();

  const sources = [
    ['claude', '.claude/settings.json'],
    ['codex', '.codex/hooks.json'],
  ].filter(([name]) => config.adapters.includes(name));

  for (const [name, relativePath] of sources) {
    if (!exists(relativePath)) {
      fail(`adapter config missing: ${relativePath}`);
      continue;
    }

    const content = read(relativePath);
    const referenced = [
      ...content.matchAll(/scripts\/[\w.-]+\.(?:cjs|sh|mjs|js)/g),
    ]
      .map((match) => match[0])
      .sort();

    scriptRefs.set(name, [...new Set(referenced)]);

    for (const script of new Set(referenced)) {
      if (!exists(script)) {
        fail(`${relativePath} references missing script: ${script}`);
      }
    }
  }

  const signatures = [...scriptRefs.entries()];
  if (signatures.length === 2) {
    const [[nameA, listA], [nameB, listB]] = signatures;
    const onlyA = listA.filter((item) => !listB.includes(item));
    const onlyB = listB.filter((item) => !listA.includes(item));

    if (onlyA.length || onlyB.length) {
      warn(
        `adapter drift: ${nameA} only [${onlyA.join(', ') || '-'}], ${nameB} only [${onlyB.join(', ') || '-'}]. Adapters should call the same scripts.`,
      );
    }
  }
}

function checkGitignore() {
  if (!exists('.gitignore')) {
    warn('.gitignore missing — local harness state may be committed');
    return;
  }

  const gitignore = read('.gitignore');
  const required = ['.agents/local.yml', '.agents/artifacts/', '.agents/tmp/'];

  for (const item of required) {
    if (!gitignore.includes(item)) {
      warn(`.gitignore does not exclude ${item}`);
    }
  }
}

/**
 * 죽은 링크는 에이전트를 존재하지 않는 규칙으로 보낸다.
 * 상대 링크만 검사하고 외부 URL 과 앵커는 건너뛴다.
 */
function checkDocLinks() {
  const scanRoots = ['.agents/rules', '.agents/docs', 'AGENTS.md'];
  const markdownFiles = [];

  const collect = (relativePath) => {
    const absolute = abs(relativePath);
    if (!fs.existsSync(absolute)) return;

    const stat = fs.statSync(absolute);
    if (stat.isFile()) {
      if (relativePath.endsWith('.md')) markdownFiles.push(relativePath);
      return;
    }

    for (const entry of fs.readdirSync(absolute)) {
      collect(path.join(relativePath, entry));
    }
  };

  scanRoots.forEach(collect);

  let broken = 0;
  for (const file of markdownFiles) {
    const content = fs.readFileSync(abs(file), 'utf8');
    const links = [...content.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);

    for (const link of links) {
      if (/^(https?:|mailto:|#)/.test(link)) continue;

      const cleaned = decodeURI(link.split('#')[0]);
      if (!cleaned) continue;

      const resolved = cleaned.startsWith('/')
        ? path.join(root, cleaned.slice(1))
        : path.resolve(path.dirname(abs(file)), cleaned);

      if (!fs.existsSync(resolved)) {
        warn(`${file} links to a missing path: ${link}`);
        broken += 1;
      }

      if (broken > 20) return;
    }
  }
}

function main() {
  checkRequiredPaths();
  checkMirrors();
  checkBudget();
  checkRuleFrontmatter();
  checkSpecIndex();
  checkTaskCheckboxes();
  checkAdapterWiring();
  checkGitignore();
  checkDocLinks();

  if (warnings.length) {
    console.log('[verify-harness] warnings:');
    for (const message of warnings) console.log(`  - ${message}`);
  }

  if (failures.length) {
    console.error('[verify-harness] failures:');
    for (const message of failures) console.error(`  - ${message}`);
    process.exit(1);
  }

  console.log(
    `[verify-harness] passed (${warnings.length} warning${warnings.length === 1 ? '' : 's'})`,
  );
}

main();
