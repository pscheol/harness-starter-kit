#!/usr/bin/env bash
# release.sh — 버전 값 다섯 곳을 한 번에 맞추고 릴리스 커밋 · 로컬 태그를 만든다(설계 11 §3.5, MG-R8 · MG-R9).
#
#   bash scripts/release.sh <버전> [--dry-run] [--no-commit]
#   bash scripts/release.sh --check            다섯 값이 같은지만 본다(다르면 exit 1)
#
# 다섯 값(plugins/ 아래 두 매니페스트는 생성물이라, 원본 packages/plugin/ 의 같은 파일도 같이 바꾼다):
#   packages/cli/package.json                       .version
#   .claude-plugin/marketplace.json                 plugins[name = harness-kit].version
#   .agents/plugins/marketplace.json                plugins[name = harness-kit].version
#   plugins/harness-kit/.claude-plugin/plugin.json  .version   (원본 packages/plugin/.claude-plugin/plugin.json)
#   plugins/harness-kit/.codex-plugin/plugin.json   .version   (원본 packages/plugin/.codex-plugin/plugin.json)
#
# 단계: 1 인자 검사 · 2 작업 트리 · 브랜치 · 3 다섯 파일 쓰기 · 4 CHANGELOG 절 · 4a 생성물 다시 만들기 · 5 시험 · 6 점검표 · 7 커밋 + 태그.
#   --dry-run   1~4 를 보고만 한다(쓰기 0). 2 · 4 의 문제는 경고로만 낸다.
#   --no-commit 7 을 하지 않고 바뀐 파일을 작업 트리에 둔다(사람이 보고 커밋한다).
# push 는 하지 않는다. 태그를 만들어도 로컬뿐이다 — 태그 push 는 사람이 한다(MG-R9).
#
# 환경 변수(시험 · 동기화용):
#   HK_RELEASE_BUILD_CMD   4a 의 생성물 명령(기본 `pnpm -s gen`)
#   HK_RELEASE_TEST_CMD    5 의 시험 명령(기본: python 전체 · CLI · 관리 페이지 · e2e)
#   HK_RELEASE_ANY_BRANCH  1 이면 main · release/* 가 아닌 브랜치도 허용
#   HK_RELEASE_ROOT        리포 루트(기본: 이 스크립트의 상위 폴더)
#
# 종료 코드: 0 성공 · 1 검사 실패(다섯 값 불일치 · CHANGELOG 절 없음 · 시험 실패 · 쓴 줄이 version 한 줄이 아님) · 2 사용법 · 3 리포 상태(깨끗하지 않음 · 브랜치)
set -euo pipefail

ROOT="${HK_RELEASE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

die() { echo "✖ $1" >&2; exit "${2:-1}"; }

# 한 곳에서 JSON 읽기 · 쓰기 · 비교를 모두 한다(node 만 쓴다). 첫 인자: get | set | cmp | cmpn
node_json() {
  node -e '
const fs = require("fs");
const [, mode, ...rest] = process.argv;
const FILES = JSON.parse(process.env.HK_FILES);
function target(doc, name) {
  if (Array.isArray(doc.plugins)) {
    const hit = doc.plugins.filter((p) => p && p.name === name);
    if (hit.length !== 1) throw new Error(`plugins[name=${name}] 가 ${hit.length}개`);
    return hit[0];
  }
  return doc;
}
if (mode === "get") {
  const out = FILES.map((f) => {
    let v;
    try { v = target(JSON.parse(fs.readFileSync(f, "utf8")), "harness-kit").version; } catch (e) { v = `(읽지 못함: ${e.message})`; }
    return `${f}\t${v === undefined ? "(없음)" : v}`;
  });
  console.log(out.join("\n"));
} else if (mode === "set") {
  const version = rest[0];
  for (const f of FILES) {
    const text = fs.readFileSync(f, "utf8");
    const doc = JSON.parse(text);
    target(doc, "harness-kit").version = version;
    fs.writeFileSync(f, JSON.stringify(doc, null, 2) + "\n");
  }
} else if (mode === "cmp") {
  // semver 비교: a b → -1 0 1. 사전 릴리스(-alpha.N · -rc.N)는 같은 숫자의 정식 릴리스보다 작다.
  const [a, b] = rest;
  const parse = (v) => {
    const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:alpha|rc)\.(?:0|[1-9]\d*)))?$/.exec(v);
    if (!m) return null;
    return { core: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split(".") : null };
  };
  const pa = parse(a), pb = parse(b);
  if (!pa || !pb) { console.log("invalid"); process.exit(0); }
  for (let i = 0; i < 3; i += 1) if (pa.core[i] !== pb.core[i]) { console.log(pa.core[i] < pb.core[i] ? -1 : 1); process.exit(0); }
  if (!pa.pre && !pb.pre) console.log(0);
  else if (!pa.pre) console.log(1);
  else if (!pb.pre) console.log(-1);
  else if (pa.pre[0] !== pb.pre[0]) console.log(pa.pre[0] < pb.pre[0] ? -1 : 1);
  else console.log(Math.sign(+pa.pre[1] - +pb.pre[1]));
}
' "$@"
}

CLI_PKG="packages/cli/package.json"
FIVE=(
  "$CLI_PKG"
  ".claude-plugin/marketplace.json"
  ".agents/plugins/marketplace.json"
  "plugins/harness-kit/.claude-plugin/plugin.json"
  "plugins/harness-kit/.codex-plugin/plugin.json"
)
# 생성물의 원본(gen-plugins 가 packages/plugin/ → plugins/harness-kit/ 으로 복사한다). 같은 값을 쓰고 --check 에서도 본다.
SOURCES=(
  "packages/plugin/.claude-plugin/plugin.json"
  "packages/plugin/.codex-plugin/plugin.json"
)

files_json() { node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "$@"; }

read_versions() { HK_FILES="$(files_json "$@")" node_json get; }

# ── --check ──────────────────────────────────────────────────────────────────
do_check() {
  local rows distinct line
  rows="$(read_versions "${FIVE[@]}" "${SOURCES[@]}")"
  distinct="$(printf '%s\n' "$rows" | cut -f2 | sort -u | wc -l | tr -d ' ')"
  printf '%s\n' "$rows" | awk -F'\t' '{ printf "  %-52s %s\n", $1, $2 }'
  if [ "$distinct" != 1 ]; then
    echo "✖ 버전 값이 같지 않다 — bash scripts/release.sh <버전> 으로 맞춘다" >&2
    return 1
  fi
  line="$(printf '%s\n' "$rows" | head -1 | cut -f2)"
  echo "✔ 다섯 값(과 원본 매니페스트 둘)이 모두 $line"
  return 0
}

# ── 인자 ─────────────────────────────────────────────────────────────────────
VERSION="" CHECK=0 DRY=0 NO_COMMIT=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK=1 ;;
    --dry-run) DRY=1 ;;
    --no-commit) NO_COMMIT=1 ;;
    -h | --help) sed -n '2,29p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "모르는 옵션: $arg" 2 ;;
    *) [ -z "$VERSION" ] || die "버전은 하나만 준다" 2; VERSION="$arg" ;;
  esac
done

if [ "$CHECK" = 1 ]; then
  [ -z "$VERSION" ] || die "--check 는 버전을 받지 않는다" 2
  do_check
  exit $?
fi
[ -n "$VERSION" ] || die "사용법: bash scripts/release.sh <버전> [--dry-run] [--no-commit] | --check" 2

# 1 인자 · 현재 버전
CURRENT="$(read_versions "$CLI_PKG" | cut -f2)"
[ "$(HK_FILES='[]' node_json cmp "$VERSION" "$VERSION")" != invalid ] || die "버전 형식이 아니다: $VERSION (예: 2.2.0 · 2.0.0-alpha.1 · 2.1.0-rc.2)" 2
cmp="$(HK_FILES='[]' node_json cmp "$VERSION" "$CURRENT")"
[ "$cmp" != invalid ] || die "지금 버전($CURRENT)을 읽지 못했다" 1
distinct="$(read_versions "${FIVE[@]}" "${SOURCES[@]}" | cut -f2 | sort -u | wc -l | tr -d ' ')"
SYNC=0
if [ "$cmp" = 0 ] && [ "$distinct" != 1 ]; then
  SYNC=1   # 값이 갈라져 있을 때만 같은 값으로 다시 맞추는 것을 허용한다
elif [ "$cmp" != 1 ]; then
  die "새 버전($VERSION)이 지금 버전($CURRENT)보다 커야 한다" 2
fi

echo "▶ release $CURRENT → $VERSION$([ "$SYNC" = 1 ] && echo '  (갈라진 값 맞추기)')$([ "$DRY" = 1 ] && echo '  [dry-run]')"

# 2 작업 트리 · 브랜치
problems=()
if [ -n "$(git status --porcelain)" ]; then problems+=("작업 트리가 깨끗하지 않다"); fi
branch="$(git rev-parse --abbrev-ref HEAD)"
case "$branch" in
  main | release/*) ;;
  *) [ "${HK_RELEASE_ANY_BRANCH:-0}" = 1 ] || problems+=("브랜치가 main 또는 release/* 가 아니다($branch)") ;;
esac
if [ "${#problems[@]}" -gt 0 ]; then
  for p in "${problems[@]}"; do
    if [ "$DRY" = 1 ]; then echo "⚠ $p (실제 실행은 exit 3)" >&2; else echo "✖ $p" >&2; fi
  done
  [ "$DRY" = 1 ] || exit 3
fi

# 4 CHANGELOG 절(쓰기 전에 본다 — 없으면 아무것도 바꾸지 않고 멈춘다)
if ! grep -qE "^## ${VERSION//./\\.}( |\$)" CHANGELOG.md 2>/dev/null; then
  if [ "$DRY" = 1 ]; then echo "⚠ CHANGELOG.md 에 '## $VERSION' 절이 없다(실제 실행은 exit 1)" >&2
  else die "CHANGELOG.md 에 '## $VERSION' 절이 없다 — 먼저 쓴다" 1; fi
fi

# 3 다섯 파일 쓰기(+ 원본 매니페스트 둘)
ALL=("${FIVE[@]}" "${SOURCES[@]}")
if [ "$DRY" = 1 ]; then
  echo "  바꿀 계획(쓰기 0):"
  for f in "${ALL[@]}"; do echo "    $f   version → $VERSION"; done
  echo "  이어서: 생성물 다시 만들기(${HK_RELEASE_BUILD_CMD:-pnpm -s gen}) · 시험 · 커밋 + 로컬 태그 v$VERSION"
  exit 0
fi
HK_FILES="$(files_json "${ALL[@]}")" node_json set "$VERSION"
# 쓴 줄이 "version" 한 줄뿐인지 본다. 다르면 되돌리고 멈춘다.
bad="$(git diff -U0 -- "${ALL[@]}" | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -vE '^[+-]\s*"version":' || true)"
if [ -n "$bad" ]; then
  git checkout -- "${ALL[@]}"
  echo "$bad" >&2
  die "version 줄 말고 다른 줄이 바뀌어 되돌렸다(들여쓰기 · 순서가 다른 파일)" 1
fi
do_check >/dev/null || die "쓴 뒤에도 다섯 값이 다르다" 1
echo "  ✔ 다섯 파일 + 원본 매니페스트 둘의 version 을 $VERSION 으로 바꿨다"
# 사람이 읽는 문서에 이전 버전 문자열이 남았는지는 경고만 한다(스크립트가 문서를 바꾸지 않는다, §3.5 끝).
for doc in README.md packages/plugin/skills/hx-bootstrap/manifest.md; do
  [ -f "$doc" ] && [ "$CURRENT" != "$VERSION" ] && grep -qF "$CURRENT" "$doc" && echo "⚠ $doc 에 이전 버전 $CURRENT 표기가 있다 — 사람이 확인한다" >&2
done

# 4a 생성물
BUILD_CMD="${HK_RELEASE_BUILD_CMD:-pnpm -s gen}"
echo "  ▶ 생성물: $BUILD_CMD"
bash -c "$BUILD_CMD" || die "생성물 만들기 실패" 1

# 5 시험
TEST_CMD="${HK_RELEASE_TEST_CMD:-python3 -m unittest discover -s tests -p 'test_*.py' && pnpm -C packages/cli test && pnpm -C packages/dashboard test && python3 tests/e2e/two_configs.py --mode stub}"
echo "  ▶ 시험: $TEST_CMD"
bash -c "$TEST_CMD" || die "시험 실패 — 커밋 · 태그를 만들지 않았다(바뀐 파일은 작업 트리에 남아 있다)" 1

# 6 점검표(사람이 한다)
cat <<EOF

릴리스 점검표(사람이 한다 — 스크립트가 대신하지 않는다)
  [ ] Claude Code   /hx-plan 이 뜨고 계획이 나온다
  [ ] Codex         \$hx-plan
  [ ] Cursor        /hx-plan
  [ ] Kiro          스킬 목록에 hx-* 가 보인다
  [ ] e2e-real      python3 tests/e2e/two_configs.py --mode real 결과(모듈별 세션 적재량 표를 릴리스 노트에 붙인다)
EOF

# 7 커밋 + 로컬 태그
if [ "$NO_COMMIT" = 1 ]; then
  echo ""
  echo "✔ --no-commit: 커밋 · 태그를 만들지 않았다. git diff 로 보고 커밋한다."
  exit 0
fi
git add -A
git commit -q -m "chore: release v$VERSION"
git tag -a "v$VERSION" -m "v$VERSION"
echo ""
echo "✔ 커밋 + 로컬 태그 v$VERSION 을 만들었다. push 는 하지 않았다 — 사람이 확인한 뒤 직접 한다:"
echo "    git push origin $branch && git push origin v$VERSION"
