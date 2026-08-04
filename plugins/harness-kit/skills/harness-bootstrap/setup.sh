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
#   --force                  기존 파일도 덮어쓴다 (기본: 존재하면 skip)
#   --dry-run                실제로 쓰지 않고 계획만 출력
#
# 스택별 아키텍처 변형(ARCH):
#   jvm    = hexagonal | layered | modulith | feature | multimodule
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
#    제품 폴더 product-<slug>-specs/ 는 설치가 아니라 scripts/new-feature.sh 가 만든다 —
#    설치되는 것은 복사 원본 한 벌인 .agents/docs/_spec-templates/ 뿐이다)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES="$SCRIPT_DIR/templates"

FORCE=0
DRY_RUN=0
TARGET=""
STACK="${STACK:-jvm}"
ARCH="${ARCH:-hexagonal}"
for arg in "$@"; do
  case "$arg" in
    --force)   FORCE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --stack=*) STACK="${arg#--stack=}" ;;
    --arch=*)  ARCH="${arg#--arch=}" ;;
    -*)        echo "알 수 없는 옵션: $arg" >&2; exit 2 ;;
    *)         TARGET="$arg" ;;
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
mkdir -p "$TARGET"
TARGET="$(cd "$TARGET" && pwd)"

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
    PRIMARY_LANGUAGE="${PRIMARY_LANGUAGE:-Kotlin/Java}"
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
echo "  PROJECT_NAME: $PROJECT_NAME   SLUG: $PROJECT_SLUG"
if [ -n "$PACKAGE_NS" ]; then
  echo "  PACKAGE_NS  : $PACKAGE_NS"
else
  echo "  PACKAGE_NS  : (미설정 — 플레이스홀더 유지) → $PACKAGE_NS_HINT"
fi
echo "  PROTECTED   : $PROTECTED_PATH"
echo "  모드        : $([ $DRY_RUN = 1 ] && echo dry-run || echo write)$([ $FORCE = 1 ] && echo ' +force')"
echo ""

# templates/{common,stacks/<stack>}/ 최상위 세그먼트 → 대상 경로 매핑
remap() {
  case "$1" in
    root/*)          echo "${1#root/}" ;;                       # 프로젝트 루트
    kiro-steering/*) echo ".kiro/steering/${1#kiro-steering/}" ;;
    kiro-skills/*)   echo ".kiro/skills/${1#kiro-skills/}" ;;   # Kiro CLI 슬래시 커맨드
    agents-rules/*)  echo ".agents/rules/${1#agents-rules/}" ;; # 공통 규칙 정본(3 에이전트 공유)
    agents-skills/*) echo ".agents/skills/${1#agents-skills/}" ;; # Codex 스킬 탐색 경로($<name>)
    agents-docs/*)   echo ".agents/docs/${1#agents-docs/}" ;;
    scripts/*)       echo "scripts/${1#scripts/}" ;;
    claude/*)        echo ".claude/${1#claude/}" ;;
    codex/*)         echo ".codex/${1#codex/}" ;;
    cursor/*)        echo ".cursor/${1#cursor/}" ;;             # Cursor 프로젝트 커맨드
    *)               echo "$1" ;;
  esac
}

# {{TOKEN}} 치환(비어 있지 않은 값만). macOS/Linux 공통(sed → 임시파일 → mv).
subst() {
  local f="$1"; local tmp="${f}.harness.tmp"; local -a args=()
  local k v
  for k in PROJECT_NAME PROJECT_SLUG PACKAGE_NS SERVICE_NAME \
           PRIMARY_LANGUAGE BUILD_TOOL TEST_CMD DOMAIN_EXAMPLE PROTECTED_PATH; do
    v="${!k}"
    [ -n "$v" ] && args+=( -e "s|{{${k}}}|${v}|g" )
  done
  if [ ${#args[@]} -gt 0 ]; then
    LC_ALL=C sed "${args[@]}" "$f" > "$tmp" && mv "$tmp" "$f"
  fi
}

count_written=0; count_skipped=0

# 한 템플릿 루트(common · stacks/<stack> · stacks/<stack>/arch/<arch>)를 대상에 복사한다.
# 뒤에 복사하는 레이어가 앞 레이어를 덮는다(--force 시): common → stack → arch.
# 세 번째 인자가 1이면 arch/ 하위를 건너뛴다(변형 레이어는 선택된 하나만 따로 복사한다).
copy_tree() {
  local root="$1" label="$2" skip_arch="${3:-0}" src rel dest_rel dest
  while IFS= read -r src; do
    rel="${src#"$root"/}"
    dest_rel="$(remap "$rel")"
    dest="$TARGET/$dest_rel"

    if [ -e "$dest" ] && [ "$FORCE" != 1 ]; then
      echo "  ↷ skip (존재)   $dest_rel"
      count_skipped=$((count_skipped+1))
      continue
    fi
    echo "  ✎ write [$label] $dest_rel"
    if [ "$DRY_RUN" != 1 ]; then
      mkdir -p "$(dirname "$dest")"
      cp "$src" "$dest"
      subst "$dest"
      case "$dest" in *.sh) chmod +x "$dest" ;; esac
    fi
    count_written=$((count_written+1))
  done < <(
    if [ "$skip_arch" = 1 ]; then
      find "$root" -type f ! -path "*/arch/*" ! -name '.DS_Store' | sort
    else
      find "$root" -type f ! -name '.DS_Store' | sort
    fi
  )
}

copy_tree "$COMMON_DIR" "common"
copy_tree "$STACK_DIR"  "$STACK" 1
copy_tree "$ARCH_DIR"   "$STACK/$ARCH"

echo ""
echo "✔ 완료: write=$count_written, skip=$count_skipped $([ $DRY_RUN = 1 ] && echo '(dry-run — 실제 변경 없음)')"
echo ""
echo "다음 단계 ($STACK · $ARCH):"
case "$STACK" in
  jvm)
    echo "  1) scripts/verify.sh 의 GRADLE_DIR 를 코드 위치에 맞게 조정(Maven이면 대응 명령으로 교체)"
    echo "  2) .agents/rules/tech.md 의 기준 버전(Kotlin/Spring Boot/JDK)을 프로젝트에 맞게 확정"
    case "$ARCH" in
      hexagonal)
        echo "  3) settings.gradle.kts 에 멀티모듈 등록: core·common + domain/<ctx>/{domain,application,primary,infra} + bootstrap"
        echo "     의존 방향은 모듈 그래프가 컴파일 레벨에서 강제한다(ARCHITECTURE.md §3.1)"
        ;;
      layered)
        echo "  3) 단일 모듈 패키지 생성: config·common + controller/{docs,dto}·service·repository·entity"
        echo "     ArchUnit(archunit-junit5) + LayeredArchitectureTest 를 추가해야 레이어 방향이 강제된다"
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
echo "    SDD 는 제품 폴더를 미리 만들지 않는다. 첫 기능에서 만들어진다:"
echo "      scripts/new-feature.sh <product-slug> <feature>   (또는 /hx-specify)"
echo "      → .agents/docs/product-<slug>-specs/{requirements,design,tasks} 생성 + specs-index.md 등록"
echo "    템플릿 정본은 .agents/docs/_spec-templates/ 한 곳이다(제품 폴더에 복사되지 않는다)."
echo "  · 미치환 토큰 확인:  grep -rn '{{' . --include='*.md' --include='*.sh' --include='*.yml' | grep -v '_spec-templates/'"
echo "    (_spec-templates/ 의 {{PRODUCT_SLUG}}·{{FEATURE_NAME}}·{{EPIC_ID}} 는 의도적으로 남긴 토큰이다)"
echo "  · 이 킷은 harness-kit 플러그인의 harness-bootstrap 스킬로도 쓸 수 있다"
echo "      Claude Code: /plugin marketplace add <킷_저장소> → /plugin install harness-kit@harness-starter-kit"
echo "      Codex:       codex plugin marketplace add <킷_저장소> → codex plugin add harness-kit@harness-starter-kit"
