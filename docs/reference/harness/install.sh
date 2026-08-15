#!/usr/bin/env bash
#
# base-agent-harness 설치 스크립트.
#
# 대상 저장소에 하네스 골격을 복사하고 플레이스홀더를 치환한다.
# 기존 파일은 덮어쓰지 않고 .bak-<timestamp> 로 백업한다.
#
# 사용:
#   bash install.sh --target /path/to/repo --name "Acme Client" --key ACME
#   bash install.sh --target ../other-repo --preset python-uv --modules core,platform-guards
#   bash install.sh --target . --dry-run
#
# 옵션:
#   --target <path>        설치 대상 저장소 (필수)
#   --name <string>        프로젝트 이름 (PROJECT_NAME)
#   --key <string>         프로젝트 키 (PROJECT_KEY)
#   --preset <name>        node-npm | node-pnpm | python-uv | go   (기본 node-npm)
#   --modules <list>       쉼표 구분. core 는 항상 포함  (기본 core)
#   --adapters <list>      claude,codex 중 선택          (기본 claude,codex)
#   --set KEY=VALUE        개별 플레이스홀더 오버라이드 (반복 가능)
#   --dry-run              무엇이 설치될지 출력만 하고 파일을 쓰지 않는다
#   --force                백업 없이 덮어쓴다 (권장하지 않음)

set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="${HARNESS_DIR}/template"
MANIFEST="${HARNESS_DIR}/manifest.json"

TARGET=""
PRESET="node-npm"
MODULES="core"
ADAPTERS="claude,codex"
DRY_RUN=0
FORCE=0
OVERRIDES=()

die() {
  echo "error: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)   TARGET="${2:-}"; shift 2 ;;
    --name)     OVERRIDES+=("PROJECT_NAME=${2:-}"); shift 2 ;;
    --key)      OVERRIDES+=("PROJECT_KEY=${2:-}"); shift 2 ;;
    --preset)   PRESET="${2:-}"; shift 2 ;;
    --modules)  MODULES="${2:-}"; shift 2 ;;
    --adapters) ADAPTERS="${2:-}"; shift 2 ;;
    --set)      OVERRIDES+=("${2:-}"); shift 2 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    --force)    FORCE=1; shift ;;
    -h|--help)  sed -n '3,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          die "unknown option: $1" ;;
  esac
done

[[ -n "$TARGET" ]] || die "--target is required"
command -v node >/dev/null 2>&1 || die "node is required (하네스 스크립트가 Node 로 동작합니다)"
[[ -d "$TEMPLATE_DIR" ]] || die "template directory not found: $TEMPLATE_DIR"

TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || die "target directory not found: $TARGET"
[[ "$TARGET" != "$HARNESS_DIR"* ]] || die "target must not be inside the harness directory"

# core 는 항상 포함
case ",${MODULES}," in
  *,core,*) ;;
  *) MODULES="core,${MODULES}" ;;
esac

echo "=== base-agent-harness install ==="
echo "  target   : $TARGET"
echo "  preset   : $PRESET"
echo "  modules  : $MODULES"
echo "  adapters : $ADAPTERS"
echo "  mode     : $([[ $DRY_RUN -eq 1 ]] && echo 'dry-run' || echo 'write')"
echo ""

STAMP="$(date +%Y%m%d-%H%M%S)"

# 치환·복사 엔진. bash 의 sed 는 값에 포함된 / & | 를 다루기 까다로우므로
# 파일 처리 전체를 Node 로 넘긴다.
HARNESS_DIR="$HARNESS_DIR" \
TEMPLATE_DIR="$TEMPLATE_DIR" \
MANIFEST="$MANIFEST" \
TARGET="$TARGET" \
PRESET="$PRESET" \
MODULES="$MODULES" \
ADAPTERS="$ADAPTERS" \
DRY_RUN="$DRY_RUN" \
FORCE="$FORCE" \
STAMP="$STAMP" \
OVERRIDES="$(printf '%s\n' "${OVERRIDES[@]+"${OVERRIDES[@]}"}")" \
node - <<'NODE'
'use strict';

const fs = require('fs');
const path = require('path');

const {
  TEMPLATE_DIR,
  MANIFEST,
  TARGET,
  PRESET,
  MODULES,
  ADAPTERS,
  DRY_RUN,
  FORCE,
  STAMP,
  OVERRIDES,
} = process.env;

const dryRun = DRY_RUN === '1';
const force = FORCE === '1';
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const modules = MODULES.split(',').map((s) => s.trim()).filter(Boolean);
const adapters = ADAPTERS.split(',').map((s) => s.trim()).filter(Boolean);

// ---------- 플레이스홀더 값 결정 ----------

const preset = manifest.presets[PRESET];
if (!preset) {
  console.error(`error: unknown preset "${PRESET}". available: ${Object.keys(manifest.presets).join(', ')}`);
  process.exit(1);
}

const values = {};
for (const [key, spec] of Object.entries(manifest.placeholders)) {
  if (spec.default !== undefined) values[key] = spec.default;
}
Object.assign(values, preset.values);

values.TODAY = new Date().toISOString().slice(0, 10);

for (const line of OVERRIDES.split('\n')) {
  if (!line.trim()) continue;
  const index = line.indexOf('=');
  if (index === -1) {
    console.error(`error: --set expects KEY=VALUE, got "${line}"`);
    process.exit(1);
  }
  values[line.slice(0, index).trim()] = line.slice(index + 1);
}

const targetName = path.basename(TARGET);
if (!values.PROJECT_NAME) values.PROJECT_NAME = targetName;
if (!values.PROJECT_KEY) values.PROJECT_KEY = targetName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'PRJ';

console.log('placeholder values:');
for (const [key, value] of Object.entries(values)) {
  console.log(`  ${key.padEnd(20)} ${value === '' ? '(empty)' : value}`);
}
console.log('');

const PLACEHOLDER = /\{\{([A-Z0-9_]+)\}\}/g;

function render(text) {
  return text.replace(PLACEHOLDER, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.ico', '.woff', '.woff2']);

// ---------- 복사 ----------

const stats = { written: 0, backedUp: 0, skipped: 0, dirs: 0 };
const conflicts = [];

function copyFile(sourcePath, destPath) {
  const ext = path.extname(sourcePath).toLowerCase();

  if (fs.existsSync(destPath)) {
    const existing = fs.readFileSync(destPath);
    const incoming = BINARY_EXT.has(ext)
      ? fs.readFileSync(sourcePath)
      : Buffer.from(render(fs.readFileSync(sourcePath, 'utf8')));

    if (existing.equals(incoming)) {
      stats.skipped += 1;
      return;
    }

    conflicts.push(path.relative(TARGET, destPath));

    if (!force) {
      if (!dryRun) fs.copyFileSync(destPath, `${destPath}.bak-${STAMP}`);
      stats.backedUp += 1;
    }
  }

  if (dryRun) {
    stats.written += 1;
    return;
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  if (BINARY_EXT.has(ext)) {
    fs.copyFileSync(sourcePath, destPath);
  } else {
    fs.writeFileSync(destPath, render(fs.readFileSync(sourcePath, 'utf8')));
    // 스크립트 실행 권한 보존
    if (['.sh'].includes(ext)) fs.chmodSync(destPath, 0o755);
  }

  stats.written += 1;
}

function copyTree(sourceDir, destDir) {
  if (!fs.existsSync(sourceDir)) return;

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      if (!dryRun) fs.mkdirSync(destPath, { recursive: true });
      stats.dirs += 1;
      copyTree(sourcePath, destPath);
    } else if (entry.isFile()) {
      copyFile(sourcePath, destPath);
    }
  }
}

// 모듈 루트의 README.md 는 "이 모듈이 무엇인가"를 설명하는 하네스 문서다.
// 대상 저장소의 README.md 가 아니므로 절대 복사하지 않는다.
const MODULE_ROOT_EXCLUDE = new Set(['README.md']);

for (const moduleName of modules) {
  const spec = manifest.modules[moduleName];
  if (!spec) {
    console.error(`error: unknown module "${moduleName}". available: ${Object.keys(manifest.modules).join(', ')}`);
    process.exit(1);
  }

  const moduleDir = path.join(path.dirname(TEMPLATE_DIR), spec.source);
  console.log(`module: ${moduleName}`);

  for (const entry of fs.readdirSync(moduleDir, { withFileTypes: true })) {
    if (entry.isFile() && MODULE_ROOT_EXCLUDE.has(entry.name)) continue;

    // adapters/ 는 선택된 도구만 저장소 루트로 옮긴다
    if (entry.name === 'adapters') {
      for (const adapter of adapters) {
        const adapterDir = path.join(moduleDir, 'adapters', `.${adapter}`);
        if (!fs.existsSync(adapterDir)) {
          console.log(`  ! adapter "${adapter}" not found in template; skipped`);
          continue;
        }
        copyTree(adapterDir, path.join(TARGET, `.${adapter}`));
      }
      continue;
    }

    const sourcePath = path.join(moduleDir, entry.name);
    const destPath = path.join(TARGET, entry.name);

    if (entry.isDirectory()) copyTree(sourcePath, destPath);
    else if (entry.isFile()) copyFile(sourcePath, destPath);
  }
}

console.log('');
console.log(`files: ${stats.written} written, ${stats.backedUp} backed up, ${stats.skipped} identical (skipped)`);

// ---------- harness.json 을 실제 설치 구성에 맞춘다 ----------
//
// 선택하지 않은 어댑터가 설정에 남아 있으면 verify-harness 가 없는 파일을 요구하고,
// bootstrap 이 쓰지 않는 심볼릭을 만든다.

if (!dryRun) {
  const configPath = path.join(TARGET, '.agents/harness.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    config.adapters = adapters;
    config.modules = modules;
    // 템플릿에서는 플레이스홀더 치환을 위해 문자열이다. 설치 후에는 숫자로 정규화한다.
    config.runtime.minNodeMajor = Number(config.runtime.minNodeMajor) || 0;
    config.symlinks = (config.symlinks || []).filter(
      (entry) => !entry.adapter || adapters.includes(entry.adapter),
    );

    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`harness.json: adapters=[${adapters.join(', ')}] modules=[${modules.join(', ')}] symlinks=${config.symlinks.length}`);
  }
}

if (conflicts.length) {
  console.log('');
  console.log(force ? 'overwritten (no backup, --force):' : 'existing files replaced (backup created):');
  for (const item of conflicts.slice(0, 40)) console.log(`  - ${item}`);
  if (conflicts.length > 40) console.log(`  ... and ${conflicts.length - 40} more`);
}

// ---------- .gitignore ----------
//
// 로컬 설정과 산출물이 커밋되면 작업자별 상태가 공유 브랜치를 오염시킨다.
// 안내만 하면 대부분 빠뜨리므로 직접 추가한다. append 만 하고 기존 줄은 건드리지 않는다.

const post = manifest.postInstall;
const gitignorePath = path.join(TARGET, '.gitignore');
const existingIgnore = fs.existsSync(gitignorePath)
  ? fs.readFileSync(gitignorePath, 'utf8')
  : '';
const existingLines = new Set(existingIgnore.split(/\r?\n/).map((s) => s.trim()));
const missingIgnores = post.gitignore.filter((item) => !existingLines.has(item));

if (missingIgnores.length) {
  const block = `${existingIgnore.trimEnd()}\n\n# agent harness (local state, not shared)\n${missingIgnores.join('\n')}\n`;
  if (!dryRun) fs.writeFileSync(gitignorePath, block.replace(/^\n+/, ''));
  console.log('');
  console.log(`.gitignore: ${missingIgnores.length} entr${missingIgnores.length === 1 ? 'y' : 'ies'} added`);
} else {
  console.log('');
  console.log('.gitignore: already covers harness local state');
}

// ---------- 설치 후 안내 ----------

console.log('');
console.log('=== next steps ===');
console.log('');
console.log('1) package.json scripts (npm/pnpm/yarn 프로젝트인 경우):');
for (const [key, value] of Object.entries(post.scripts.entries)) {
  console.log(`     "${key}": "${value}"`);
}
console.log('');
console.log('2) 부트스트랩 실행 (심볼릭 생성):');
console.log('     node scripts/bootstrap-harness.cjs');
console.log('');
console.log('3) 하네스 검증:');
console.log('     node scripts/verify-harness.cjs');
console.log('');
console.log('4) 반드시 채울 것 — 여기까지 해야 하네스가 온전히 동작한다:');
for (const item of post.mustFill) console.log(`     - ${item}`);

for (const moduleName of modules) {
  const required = manifest.modules[moduleName].postInstallRequired;
  if (!required) continue;
  console.log('');
  console.log(`   [${moduleName}]`);
  for (const item of required) console.log(`     - ${item}`);
}

if (dryRun) {
  console.log('');
  console.log('(dry-run: 아무 파일도 쓰지 않았습니다)');
}
NODE

echo ""
echo "=== done ==="
