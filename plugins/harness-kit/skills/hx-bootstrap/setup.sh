#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# harness-starter-kit / setup.sh
#
# 하네스 엔지니어링 기본 골격을 대상 프로젝트에 스캐폴딩한다.
# templates/common/(스택 무관) + templates/stacks/<STACK>/(스택 전용) 을
# 프로젝트 표준 경로로 복사하고 {{PLACEHOLDER}} 를 치환한다.
#
# 사용법:
#   STACK=python PROJECT_NAME="MyApp" PROJECT_SLUG="my-app" PACKAGE_NS="myapp" \
#     bash setup.sh [대상경로]        # 대상경로 생략 시 현재 디렉터리
#
# 옵션:
#   --stack=<jvm|python|go>  대상 스택 (기본: jvm, 환경변수 STACK 로도 지정 가능)
#   --arch=<변형>            아키텍처 변형 (기본: hexagonal, 환경변수 ARCH 로도 지정 가능)
#   --lang=<kotlin|java>     (jvm 전용) 주 언어. 생략하면 "Kotlin/Java" 로 남겨 나중에 확정한다
#                            환경변수 JVM_LANG 로도 지정 가능. 빌드 DSL·구조 테스트 도구 안내가 갈린다
#   --agents=<목록>          설치할 에이전트 (claude,codex,cursor,kiro 중 쉼표 구분 · all)
#                            생략하면 대상 리포와 실행 환경에서 감지한다
#                            (환경변수 HARNESS_AGENTS 로도 지정 가능)
#   --list-agents            감지 결과만 출력하고 종료 (설치하지 않는다)
#   --force                  기존 파일도 덮어쓴다 (기본: 존재하면 skip)
#   --dry-run                실제로 쓰지 않고 계획만 출력
#
# 에이전트별로 설치되는 것 (core 는 선택과 무관하게 항상 깔린다):
#   core   .agents/rules · .agents/docs · scripts · AGENTS.md · ARCHITECTURE.md …
#   claude .claude/(settings·hooks·commands) + CLAUDE.md
#   codex  .codex/(hooks·config) + .agents/skills/
#   cursor .cursor/commands/
#   kiro   .kiro/steering/ + .kiro/skills/
#
# 설치 후 대상 리포에 상태 파일 두 개가 남는다. 나중에 에이전트를 더 깔거나
# (hx-agent-add) 킷 새 버전을 반영할 때(hx-update) 이 파일을 읽는다:
#   .agents/harness-kit.json  킷 버전·스택·변형·에이전트·치환값
#   .agents/harness-kit.lock  파일별 설치 시점 해시(사용자 수정 여부 판별용)
#
# 스택별 아키텍처 변형(ARCH):
#   jvm    = hexagonal | hexagonal-nested | hexagonal-standalone | layered |
#            layered-multimodule | modulith | feature | multimodule
#            hexagonal(기본)      = 컨텍스트가 최상위 모듈     :<slug>-<ctx>:infra
#            hexagonal-nested     = 도메인 컨테이너 아래 중첩  :<slug>-domain:<ctx>:infra
#            hexagonal-standalone = 컨텍스트가 7모듈 자립      :<slug>-<ctx>-infra
#                                   (컨텍스트마다 core·common·bootstrap 을 따로 소유 = 실행 단위 N개)
#            (헥사고날 3종의 레이어 규칙·의존 방향은 동일. 공유 범위와 모듈 경로 표기가 다르다)
#            layered              = 단일 모듈 레이어드(ArchUnit 강제)
#            layered-multimodule  = 레이어를 모듈로 자름(컴파일 강제) + 실행 단위 1~N개
#   python = hexagonal | layered | modular | django | ai-service
#   go     = hexagonal | layered | feature | flat
#   변형이 바꾸는 파일은 4개뿐이다 — ARCHITECTURE.md · .agents/rules/structure.md ·
#   .agents/rules/tech.md · .kiro/steering/structure.md.
#   나머지 규칙·스크립트는 스택 안에서 공유한다.
#
# 스택별 {{PACKAGE_NS}} 의미:
#   jvm    = 패키지 네임스페이스      (예: com.example.myapp)
#   python = 최상위 패키지명          (예: myapp → src/myapp/)
#   go     = 모듈 경로                (예: github.com/org/my-app → go.mod 의 module)
#
# 치환 토큰(환경변수로 전달, 비우면 해당 토큰은 그대로 남겨 나중에 채움):
#   PROJECT_NAME PROJECT_SLUG PACKAGE_NS SERVICE_NAME
#   PRIMARY_LANGUAGE BUILD_TOOL TEST_CMD DOMAIN_EXAMPLE PROTECTED_PATH
#   (PRODUCT_SLUG·EPIC_ID·FEATURE_NAME 은 스펙 작성 시점에 정해지는 토큰이라 여기서 치환하지 않는다.
#    제품 폴더 <slug>-specs/ 는 설치가 아니라 scripts/new-feature.sh 가 만든다 —
#    설치되는 것은 복사 원본 한 벌인 .agents/docs/_spec-templates/ 뿐이다)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES="$SCRIPT_DIR/templates"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=lib/harness-lib.sh
. "$SCRIPT_DIR/lib/harness-lib.sh"

FORCE=0
DRY_RUN=0
LIST_AGENTS=0
TARGET=""
STACK="${STACK:-jvm}"
ARCH="${ARCH:-hexagonal}"
JVM_LANG="${JVM_LANG:-}"
AGENTS_ARG="${HARNESS_AGENTS:-}"
for arg in "$@"; do
  case "$arg" in
    --force)        FORCE=1 ;;
    --dry-run)      DRY_RUN=1 ;;
    --list-agents)  LIST_AGENTS=1 ;;
    --stack=*)      STACK="${arg#--stack=}" ;;
    --arch=*)       ARCH="${arg#--arch=}" ;;
    --lang=*)       JVM_LANG="${arg#--lang=}" ;;
    --agents=*)     AGENTS_ARG="${arg#--agents=}" ;;
    -*)             echo "알 수 없는 옵션: $arg" >&2; exit 2 ;;
    *)              TARGET="$arg" ;;
  esac
done
TARGET="${TARGET:-$PWD}"

COMMON_DIR="$TEMPLATES/common"
STACK_DIR="$TEMPLATES/stacks/$STACK"
ARCH_DIR="$STACK_DIR/arch/$ARCH"

if [ ! -d "$COMMON_DIR" ]; then
  echo "✖ templates/common/ 를 찾을 수 없다: $COMMON_DIR" >&2
  exit 1
fi
if [ ! -d "$STACK_DIR" ]; then
  echo "✖ 알 수 없는 스택: '$STACK'" >&2
  echo "  사용 가능: $(find "$TEMPLATES/stacks" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; 2>/dev/null | sort | tr '\n' ' ')" >&2
  exit 2
fi
if [ ! -d "$ARCH_DIR" ]; then
  echo "✖ 스택 '$STACK' 에 없는 아키텍처 변형: '$ARCH'" >&2
  echo "  사용 가능: $(find "$STACK_DIR/arch" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; 2>/dev/null | sort | tr '\n' ' ')" >&2
  exit 2
fi
# --lang 은 jvm 전용이다. 값 검증을 여기서 한 번만 하고 안내 문구용 변수를 확정한다
# (오타를 조용히 넘기면 "다음 단계"가 엉뚱한 빌드 도구를 안내하게 된다).
JVM_DSL=""; JVM_ARCH_TEST=""
if [ -n "$JVM_LANG" ]; then
  if [ "$STACK" != jvm ]; then
    echo "✖ --lang 은 jvm 스택 전용이다 (지정된 스택: '$STACK')" >&2
    exit 2
  fi
  case "$JVM_LANG" in
    kotlin) JVM_DSL="Kotlin DSL (build.gradle.kts)"; JVM_ARCH_TEST="Konsist (또는 ArchUnit)" ;;
    java)   JVM_DSL="Groovy DSL (build.gradle)";     JVM_ARCH_TEST="ArchUnit" ;;
    *)      echo "✖ 알 수 없는 --lang: '$JVM_LANG'   사용 가능: kotlin java" >&2; exit 2 ;;
  esac
fi

mkdir -p "$TARGET"
TARGET="$(cd "$TARGET" && pwd)"

# 한 템플릿 레이어의 파일을 나열한다. skip_arch=1 이면 arch/ 하위를 뺀다
# (변형 레이어는 선택된 하나만 따로 복사하므로).
list_layer() {
  if [ "${2:-0}" = 1 ]; then
    find "$1" -type f ! -path "*/arch/*" ! -name '.DS_Store' | sort
  else
    find "$1" -type f ! -name '.DS_Store' | sort
  fi
}

# 어떤 에이전트를 깔지 정한다. 명시가 있으면 그것이 이기고, 없으면 감지한다.
# 감지도 비면 claude 로 떨어진다 — 아무것도 안 깔면 하네스가 동작하지 않기 때문이다.
if [ -n "$AGENTS_ARG" ]; then
  AGENTS_NORM="$(harness_normalize_agents "$AGENTS_ARG")"
  AGENTS_SEL="${AGENTS_NORM%%|*}"
  AGENTS_REJECTED="${AGENTS_NORM#*|}"
  if [ -n "$AGENTS_REJECTED" ]; then
    echo "✖ 알 수 없는 에이전트: $AGENTS_REJECTED" >&2
    echo "  사용 가능: $HARNESS_ALL_AGENTS   (전체는 all)" >&2
    exit 2
  fi
  if [ -z "$AGENTS_SEL" ]; then
    echo "✖ --agents= 값이 비어 있다. 사용 가능: $HARNESS_ALL_AGENTS (전체는 all)" >&2
    exit 2
  fi
  AGENTS_ORIGIN="지정"
else
  AGENTS_SEL="$(harness_detect_agents "$TARGET")"
  AGENTS_ORIGIN="감지"
  if [ -z "$AGENTS_SEL" ]; then
    AGENTS_SEL="claude"
    AGENTS_ORIGIN="감지 결과 없음 → 기본"
  fi
fi

# 에이전트별로 설치될 파일 수를 미리 센다(core 는 'core' 이름으로 조회).
count_for() {
  local want="$1" n=0 src rel
  while IFS= read -r src; do
    rel="${src#"$COMMON_DIR"/}"
    [ "$(harness_agent_of "$rel")" = "$want" ] && n=$((n+1))
  done < <(list_layer "$COMMON_DIR")
  while IFS= read -r src; do
    rel="${src#"$STACK_DIR"/}"
    [ "$(harness_agent_of "$rel")" = "$want" ] && n=$((n+1))
  done < <(list_layer "$STACK_DIR" 1)
  while IFS= read -r src; do
    rel="${src#"$ARCH_DIR"/}"
    [ "$(harness_agent_of "$rel")" = "$want" ] && n=$((n+1))
  done < <(list_layer "$ARCH_DIR")
  echo "$n"
}

if [ "$LIST_AGENTS" = 1 ]; then
  echo "▶ 에이전트 감지 — $TARGET  ($STACK · $ARCH)"
  echo ""
  # 한글은 표시폭이 바이트 수와 달라 printf 폭 지정이 어긋난다. 그래서 정렬이 필요한
  # 두 열(이름·파일 수)만 ASCII 로 두고 설명은 마지막에 몰아 둔다.
  printf "  %-8s %4s   %s\n" name files status
  printf "  %-8s %4s   %s\n" core "$(count_for core)" "항상 설치"
  for a in $HARNESS_ALL_AGENTS; do
    note=""
    [ -d "$TARGET/.$a" ] && note="리포에 .$a/ 있음"
    if harness_agent_selected "$a" "$AGENTS_SEL"; then
      printf "  %-8s %4s   %s\n" "$a" "$(count_for "$a")" "선택${note:+ · $note}"
    else
      printf "  %-8s %4s   %s\n" "$a" "$(count_for "$a")" "${note:-—}"
    fi
  done
  echo ""
  echo "  판단 근거: $AGENTS_ORIGIN"
  echo "  바꾸려면 : --agents=claude,kiro  (전체는 --agents=all)"
  exit 0
fi

# 치환값(비어 있으면 치환하지 않음). 슬러그 기본값은 대상 디렉터리명.
PROJECT_SLUG="${PROJECT_SLUG:-$(basename "$TARGET")}"
PROJECT_NAME="${PROJECT_NAME:-$PROJECT_SLUG}"
PROTECTED_PATH="${PROTECTED_PATH:-docs/references}"
SERVICE_NAME="${SERVICE_NAME:-$PROJECT_SLUG}"
PACKAGE_NS="${PACKAGE_NS:-}"
DOMAIN_EXAMPLE="${DOMAIN_EXAMPLE:-}"

# 스택별 기본값(사용자가 환경변수로 준 값이 우선한다).
case "$STACK" in
  jvm)
    case "$JVM_LANG" in
      kotlin) PRIMARY_LANGUAGE="${PRIMARY_LANGUAGE:-Kotlin}" ;;
      java)   PRIMARY_LANGUAGE="${PRIMARY_LANGUAGE:-Java}" ;;
      *)      PRIMARY_LANGUAGE="${PRIMARY_LANGUAGE:-Kotlin/Java}" ;;
    esac
    BUILD_TOOL="${BUILD_TOOL:-Gradle}"
    TEST_CMD="${TEST_CMD:-./gradlew check}"
    PACKAGE_NS_HINT="패키지 네임스페이스 (예: com.example.myapp)"
    ;;
  python)
    PRIMARY_LANGUAGE="${PRIMARY_LANGUAGE:-Python}"
    BUILD_TOOL="${BUILD_TOOL:-uv}"
    TEST_CMD="${TEST_CMD:-pytest}"
    PACKAGE_NS_HINT="최상위 패키지명 (예: myapp → src/myapp/)"
    ;;
  go)
    PRIMARY_LANGUAGE="${PRIMARY_LANGUAGE:-Go}"
    BUILD_TOOL="${BUILD_TOOL:-go}"
    TEST_CMD="${TEST_CMD:-go test -race ./...}"
    PACKAGE_NS_HINT="모듈 경로 (예: github.com/org/$PROJECT_SLUG)"
    ;;
  *)
    PRIMARY_LANGUAGE="${PRIMARY_LANGUAGE:-}"
    BUILD_TOOL="${BUILD_TOOL:-}"
    TEST_CMD="${TEST_CMD:-}"
    PACKAGE_NS_HINT="패키지/모듈 식별자"
    ;;
esac

echo "▶ 하네스 스캐폴딩"
echo "  대상        : $TARGET"
echo "  스택        : $STACK  ($PRIMARY_LANGUAGE · $BUILD_TOOL)"
echo "  아키텍처    : $ARCH"
[ -n "$JVM_DSL" ] && echo "  언어        : $JVM_LANG  ($JVM_DSL · 구조 테스트 $JVM_ARCH_TEST)"
echo "  에이전트    : $AGENTS_SEL  ($AGENTS_ORIGIN)"
echo "                └ 나머지는 설치하지 않는다. 나중에 추가: hx-agent-add 스킬"
echo "  PROJECT_NAME: $PROJECT_NAME   SLUG: $PROJECT_SLUG"
if [ -n "$PACKAGE_NS" ]; then
  echo "  PACKAGE_NS  : $PACKAGE_NS"
else
  echo "  PACKAGE_NS  : (미설정 — 플레이스홀더 유지) → $PACKAGE_NS_HINT"
fi
echo "  PROTECTED   : $PROTECTED_PATH"
echo "  모드        : $([ $DRY_RUN = 1 ] && echo dry-run || echo write)$([ $FORCE = 1 ] && echo ' +force')"
echo ""

count_written=0; count_skipped=0; count_excluded=0

LOCK="$TARGET/$HARNESS_LOCK_REL"
PREV_LOCK=""
if [ "$DRY_RUN" != 1 ]; then
  mkdir -p "$(dirname "$LOCK")"
  # 재실행 시 lock 을 그냥 새로 쓰면, 이미 사용자가 고쳐 둔 파일의 '현재' 해시가
  # 원본 해시 자리에 들어가 업데이트가 그 파일을 미수정으로 오판한다.
  # 그래서 이전 lock 을 옆에 떠 두고, skip 되는 파일은 옛 해시를 그대로 물려준다.
  if [ -f "$LOCK" ]; then
    PREV_LOCK="$(mktemp)"
    cp "$LOCK" "$PREV_LOCK"
  fi
  harness_lock_init "$LOCK"
fi
# return 0 이 없으면 PREV_LOCK 이 빈 첫 설치·dry-run 에서 [ -n "" ] 가 1을 반환하고,
# EXIT trap 의 반환값이 스크립트 exit code 를 덮어써 성공이 실패로 보고된다.
cleanup() { [ -n "$PREV_LOCK" ] && rm -f "$PREV_LOCK"; return 0; }
trap cleanup EXIT

# skip 된 파일의 해시를 정한다. 이전 lock 에 기록이 있으면 그것이 원본 해시다.
inherited_hash() {
  local path="$1" old=""
  [ -n "$PREV_LOCK" ] && old="$(harness_lock_hash "$PREV_LOCK" "$path" || true)"
  if [ -n "$old" ]; then echo "$old"; else harness_sha256 "$TARGET/$path"; fi
}

# 한 템플릿 루트(common · stacks/<stack> · stacks/<stack>/arch/<arch>)를 대상에 복사한다.
# 뒤에 복사하는 레이어가 앞 레이어를 덮는다(--force 시): common → stack → arch.
#
# 처리 흐름:
#  1. 소속 에이전트 판정 — 고르지 않은 에이전트의 파일은 여기서 걸러 낸다.
#  2. 기존 파일 보호 — --force 가 없으면 건드리지 않는다(사용자가 채운 값이 날아간다).
#  3. 렌더 후 해시 기록 — lock 에 남긴 해시가 나중에 '사용자가 고쳤는가'의 기준이 된다.
copy_tree() {
  local root="$1" label="$2" skip_arch="${3:-0}" src rel owner dest_rel dest
  while IFS= read -r src; do
    rel="${src#"$root"/}"
    owner="$(harness_agent_of "$rel")"
    if [ "$owner" != core ] && ! harness_agent_selected "$owner" "$AGENTS_SEL"; then
      count_excluded=$((count_excluded+1))
      continue
    fi
    dest_rel="$(harness_remap "$rel")"
    dest="$TARGET/$dest_rel"

    if [ -e "$dest" ] && [ "$FORCE" != 1 ]; then
      echo "  ↷ skip (존재)   $dest_rel"
      count_skipped=$((count_skipped+1))
      [ "$DRY_RUN" != 1 ] && harness_lock_append "$LOCK" "$(inherited_hash "$dest_rel")" "$label" "$owner" "$dest_rel"
      continue
    fi
    echo "  ✎ write [$label/$owner] $dest_rel"
    if [ "$DRY_RUN" != 1 ]; then
      harness_render "$src" "$dest"
      case "$dest" in *.sh) chmod +x "$dest" ;; esac
      harness_lock_append "$LOCK" "$(harness_sha256 "$dest")" "$label" "$owner" "$dest_rel"
    fi
    count_written=$((count_written+1))
  done < <(list_layer "$root" "$skip_arch")
}

copy_tree "$COMMON_DIR" "common"
copy_tree "$STACK_DIR"  "$STACK" 1
copy_tree "$ARCH_DIR"   "$STACK/$ARCH"

if [ "$DRY_RUN" != 1 ]; then
  harness_write_meta "$TARGET" "$(harness_kit_version "$PLUGIN_DIR")" "$STACK" "$ARCH" "$AGENTS_SEL"
fi

echo ""
echo "✔ 완료: write=$count_written, skip=$count_skipped, 미선택 에이전트로 제외=$count_excluded $([ $DRY_RUN = 1 ] && echo '(dry-run — 실제 변경 없음)')"
if [ "$DRY_RUN" != 1 ]; then
  echo "  상태 파일: $HARNESS_META_REL · $HARNESS_LOCK_REL"
fi
echo ""
# 에이전트만 덧붙이는 호출(add-agent.sh)은 스택 셋업 안내가 이미 끝난 리포를 다룬다.
[ "${HARNESS_SKIP_NEXT_STEPS:-0}" = 1 ] && exit 0

echo "다음 단계 ($STACK · $ARCH):"
case "$STACK" in
  jvm)
    echo "  1) scripts/verify.sh 의 GRADLE_DIR 를 코드 위치에 맞게 조정(Maven이면 대응 명령으로 교체)"
    echo "  2) .agents/rules/tech.md 의 기준 버전(Kotlin/Spring Boot/JDK)을 프로젝트에 맞게 확정"
    case "$ARCH" in
      hexagonal)
        echo "  3) settings.gradle.kts 에 멀티모듈 등록(컨텍스트 최상위): core·common + bootstrap"
        echo "     + 컨텍스트마다 :$PROJECT_SLUG-<ctx>:{domain,application,primary,infra}"
        echo "     디렉터리는 $PROJECT_SLUG-<ctx>/{domain,application,primary,infra}/ (Gradle 기본 매핑)"
        echo "     의존 방향은 모듈 그래프가 컴파일 레벨에서 강제한다(ARCHITECTURE.md §3.1)"
        echo "     컨테이너 아래로 한 단계 더 묶고 싶으면 ARCH=hexagonal-nested 로 다시 설치"
        ;;
      hexagonal-nested)
        echo "  3) settings.gradle.kts 에 멀티모듈 등록(도메인 컨테이너 아래 중첩): core·common + bootstrap"
        echo "     + 컨텍스트마다 :$PROJECT_SLUG-domain:<ctx>:{domain,application,primary,infra}"
        echo "     디렉터리는 $PROJECT_SLUG-domain/<ctx>/{domain,application,primary,infra}/ (Gradle 기본 매핑)"
        echo "     의존 방향은 모듈 그래프가 컴파일 레벨에서 강제한다(ARCHITECTURE.md §3.1)"
        echo "     컨텍스트를 최상위 모듈로 올리고 싶으면 ARCH=hexagonal 로 다시 설치"
        ;;
      hexagonal-standalone)
        echo "  3) settings.gradle.kts 에 컨텍스트당 7모듈 등록(평면 하이픈):"
        echo "     :$PROJECT_SLUG-<ctx>-{core,common,domain,application,primary,infra,bootstrap}"
        echo "     디렉터리는 projectDir 재지정으로 <ctx>/<layer>/ 에 묶는다(structure.md §1.1 의 context() 헬퍼)"
        echo "     전역 공유 모듈이 없다 — core·common·bootstrap 을 컨텍스트마다 소유한다(실행 단위 N개)"
        echo "  4) build-logic 컨벤션 플러그인 4종(jvm-base·pure-module·spring-module·boot-app) 작성"
        echo "     모듈이 7×N개라 이게 없으면 빌드 스크립트 수정이 N배로 늘어난다(tech.md)"
        echo "     Spring Boot 플러그인은 <ctx>-bootstrap 에만. core·domain 에는 Spring/JPA 부착 금지"
        echo "  5) 컨텍스트마다 bootstrap 테스트 소스셋에 구조 테스트 배치 — others 목록에 다른 컨텍스트를"
        echo "     전부 등록해야 컨텍스트 간 의존이 검사된다(컴파일러는 이 간선을 막지 않는다)"
        echo "  6) 컨텍스트별 DB 스키마 분리 + 포트 표(tech.md) 등록. 실행 단위마다 포트가 따로 필요하다"
        ;;
      layered)
        echo "  3) 단일 모듈 패키지 생성: config·common + controller/{docs,dto}·service·repository·entity"
        echo "     ArchUnit(archunit-junit5) + LayeredArchitectureTest 를 추가해야 레이어 방향이 강제된다"
        ;;
      layered-multimodule)
        echo "  3) settings.gradle.kts 에 레이어 모듈 등록(레이어 = 모듈):"
        echo "     :$PROJECT_SLUG-api(실행 단위) · -service · -domain(엔티티+리포지토리) · -common"
        echo "     선택: -batch·-admin(추가 실행 단위) · -client(외부 연동)"
        echo "  4) 엔티티 노출 범위를 먼저 정한다(structure.md §1.2):"
        echo "     (A) service 가 domain 을 api() 로 노출 → ArchUnit 이 컨트롤러 시그니처를 막는다"
        echo "     (B) implementation() 으로 차단 → 컴파일러가 막고 서비스 결과 모델이 한 겹 늘어난다"
        echo "     채택한 방식을 structure.md 에 기록하지 않으면 다음 사람이 반대로 선언한다"
        echo "  5) Spring Boot 플러그인은 실행 단위 모듈에만(라이브러리에 붙으면 bootJar 가 생겨 의존이 깨진다)"
        echo "     루트 subprojects { } 로 Spring 의존성을 뿌리지 않는다 — common 까지 오염된다"
        echo "  6) api 테스트 소스셋에 LayeredModuleTest 배치 + 실행 단위를 늘릴 때마다 포트 표(tech.md) 등록"
        echo "     마이그레이션은 -domain 이 소유하고 적용 주체를 하나로 정한다(나머지는 validate)"
        ;;
      modulith)
        echo "  3) 단일 모듈 + 모듈 패키지 생성: shared/ + <module>/{공개 API 루트 타입, internal/…}"
        echo "     spring-modulith-starter-{core,test} 추가 + ModuleStructureTest 의 ApplicationModules.verify()"
        echo "     (Kotlin 이면 @ApplicationModule 선언용 package-info.java 만 src/main/java 에 둔다)"
        ;;
      feature)
        echo "  3) 단일 모듈 + 기능 패키지 생성: config·common + <feature>/{api,web,service,repository,domain}"
        echo "     ArchUnit(archunit-junit5) + FeatureArchitectureTest 슬라이스 규칙이 기능 독립을 강제한다"
        ;;
      multimodule)
        echo "  3) 모듈 분할 축과 네이밍을 먼저 정한다(도메인·연동 대상·기술 관심사·공개 표면 중 선택)"
        echo "     ARCHITECTURE.md §3.1~3.3 의 '채택한 규약'·'모듈 등급표' 빈칸을 채우는 것이 첫 작업이다"
        echo "  4) settings.gradle 에 모듈 등록 — 등급은 실행(1개) > 구성(N개) > 공유. 의존은 위→아래 단방향"
        echo "     Java 는 Groovy DSL(build.gradle), Kotlin 만 Kotlin DSL(.kts). 섞지 않는다"
        echo "     버전·좌표는 gradle/libs.versions.toml 단일 소스 — 루트에서 의존성을 뿌리지 않는다"
        echo "     Spring Boot 플러그인은 실행 모듈에만 적용(나머지는 bootJar 태스크가 아예 안 생긴다)"
        echo "  5) ArchUnit(또는 Konsist) + ModuleBoundaryTest 의 <자리표시자>를 실제 모듈명으로 채운다"
        echo "     채우지 않으면 아무것도 검사하지 않는다(ARCHITECTURE.md §3.6)"
        ;;
    esac
    if [ -n "$JVM_LANG" ]; then
      echo "  · 언어=$JVM_LANG → 빌드 스크립트는 $JVM_DSL 로, 구조 테스트는 $JVM_ARCH_TEST 로 통일한다"
      echo "    (DSL 을 섞으면 IDE 지원과 리팩터링이 둘 다 나빠진다. 한쪽을 골라 끝까지 간다)"
    fi
    ;;
  python)
    echo "  1) pyproject.toml 에 [tool.ruff]·[tool.mypy]·[tool.pytest]·[tool.importlinter] 설정 추가"
    echo "     (import-linter 계약 골격은 ARCHITECTURE.md — 모듈/앱/컨텍스트를 늘리면 계약에도 등록)"
    case "$ARCH" in
      hexagonal)
        echo "  2) src/<패키지>/ 생성: core·common·bootstrap + <ctx>/{domain,application,primary,infra}"
        ;;
      layered)
        echo "  2) src/<패키지>/ 생성: core·api·schemas·services·repositories·models + main.py"
        ;;
      modular)
        echo "  2) src/<패키지>/ 생성: core·shared + modules/<feature>/{router,schema,service,repository,model}.py"
        echo "     모듈 공개 API 는 modules/<feature>/__init__.py — 다른 모듈은 여기만 import 한다"
        ;;
      django)
        echo "  2) django-admin startproject config . 후 config/settings/{base,dev,prod}.py 로 분리"
        echo "     apps/<app>/{models,selectors,services,serializers,views,urls}.py 생성"
        echo "     (services = 쓰기 / selectors = 읽기. 뷰에서 ORM 직접 호출 금지)"
        ;;
      ai-service)
        echo "  2) src/<패키지>/ 생성: api·agents·prompts·llm·retrieval·pipelines·evaluation·observability"
        echo "     + domain·core·common·bootstrap. 프롬프트는 버전 관리 자산이다"
        echo "     evaluation/ 에 골든 데이터셋·기준선 점수를 두고 회귀 게이트로 쓴다"
        ;;
    esac
    echo "  3) uv sync 후 bash scripts/verify.sh 로 게이트(ruff→mypy→lint-imports→pytest) 통과 확인"
    ;;
  go)
    echo "  1) go mod init <모듈경로> 로 go.mod 생성(PACKAGE_NS 와 일치시킬 것)"
    echo "  2) .golangci.yml 에 depguard 레이어 규칙 추가(골격은 ARCHITECTURE.md)"
    case "$ARCH" in
      hexagonal)
        echo "  3) cmd/$PROJECT_SLUG · internal/{core,common,platform} · internal/<ctx>/{domain,app,primary/http,infra} 생성"
        ;;
      layered)
        echo "  3) cmd/$PROJECT_SLUG · internal/{config,database,logger,middleware,handler,service,repository,model} 생성"
        ;;
      feature)
        echo "  3) cmd/$PROJECT_SLUG · internal/platform/{config,db,log,httpx} · internal/<feature>/{handler,service,store,model}.go 생성"
        echo "     feature 패키지끼리 직접 import 금지 — main 조립 또는 contract 경유"
        ;;
      flat)
        echo "  3) cmd/$PROJECT_SLUG/main.go · internal/app/{handler,service,store,model}.go 생성"
        echo "     파일이 5~7개를 넘으면 --arch=feature 로 승격한다(기준은 ARCHITECTURE.md)"
        ;;
    esac
    echo "  4) bash scripts/verify.sh 로 게이트(fmt→build→vet→lint→test -race) 통과 확인"
    ;;
esac
echo "  · product.md · ARCHITECTURE.md · structure.md 의 {{플레이스홀더}} 채우기"
echo "    SDD 는 제품 폴더도 단계 문서도 미리 만들지 않는다. 단계에 들어갈 때 하나씩 생긴다:"
echo "      scripts/new-feature.sh <product-slug> <feature>                  (또는 /hx-specify)"
echo "      scripts/new-feature.sh <product-slug> <feature> --stage=design   (또는 /hx-plan)"
echo "      scripts/new-feature.sh <product-slug> <feature> --stage=tasks    (또는 /hx-tasks)"
echo "      → 첫 실행이 .agents/docs/<slug>-specs/ 골격 + specs-index.md 등록까지 함께 한다"
echo "      빈 design·tasks 를 미리 깔면 보드가 곧장 구현으로 뛰고 단계 게이트가 무력해진다."
echo "    템플릿 원본은 .agents/docs/_spec-templates/ 한 곳이다(제품 폴더에 복사되지 않는다)."
echo "  · 검증 레벨: 에이전트 Stop hook 은 fast(구조 점검 + 가벼운 정적 검사, 수 초)만 돈다."
echo "    빌드·테스트를 포함한 full 은 커밋·푸시 전에 직접 실행한다:  bash scripts/verify.sh"
echo "    (hook 이 full 을 돌면 턴마다 빌드가 겹쳐 lock 경합으로 멈춘다. 그래서 나눠 둔 것이다)"
echo "  · 미치환 토큰 확인:  grep -rn '{{' . --include='*.md' --include='*.sh' | grep -vE '_spec-templates/|\{\{\.\.\.\}\}|PRODUCT_SLUG'"
echo "    (_spec-templates/ 의 {{PRODUCT_SLUG}}·{{FEATURE_NAME}}·{{EPIC_ID}} 는 의도적으로 남긴 토큰이다)"
echo "  · 에이전트를 더 깔려면(예: Cursor·Kiro 추가):  hx-agent-add 스킬"
echo "      bash <킷>/skills/hx-agent-add/add-agent.sh --agents=cursor $TARGET"
echo "  · 킷 새 버전을 반영하려면:  hx-update 스킬"
echo "      bash <킷>/skills/hx-update/update.sh --dry-run $TARGET"
echo "      (사용자가 고친 파일은 덮지 않고 .new 로 옆에 둔다 — $HARNESS_LOCK_REL 해시로 판별)"
echo "  · 이 킷은 harness-kit 플러그인의 hx-bootstrap 스킬로도 쓸 수 있다"
echo "      Claude Code: /plugin marketplace add <킷_저장소> → /plugin install harness-kit@harness-starter-kit"
echo "      Codex:       codex plugin marketplace add <킷_저장소> → codex plugin add harness-kit@harness-starter-kit"
