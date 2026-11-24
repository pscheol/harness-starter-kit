#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# harness-starter-kit / lib/harness-lib.sh
#
# setup.sh · add-agent.sh · update.sh 가 공유하는 함수 모음.
# 이 파일은 실행되지 않고 source 된다.
#
# 설치 상태는 대상 리포의 두 파일에 남는다:
#   .agents/harness-kit.json  메타(킷 버전·스택·변형·에이전트·치환값) — 사람이 읽는다
#   .agents/harness-kit.lock  파일별 설치 시점 해시 — 업데이트가 '사용자가 고친 파일'을 가린다
# ─────────────────────────────────────────────────────────────────────────────

# bash 5.2 이상은 ${v//패턴/대체} 의 대체 안 & 를 일치 문자열로 읽는다(patsub_replacement). 3.2 와 같게 끈다.
shopt -u patsub_replacement 2>/dev/null || true

HARNESS_META_REL=".agents/harness-kit.json"
HARNESS_LOCK_REL=".agents/harness-kit.lock"
HARNESS_ALL_AGENTS="claude codex cursor kiro"
HARNESS_ALL_MODULES="jira-workflow multi-harness"
# 없앤 모듈(HK-25): 파일이 공통 층과 같아져 따로 켤 것이 없다. 받으면 한 줄 알리고 넘긴다(오류가 아니다).
HARNESS_RETIRED_MODULES="platform-guards"
# 도메인 이름의 유효 집합. templates/domains/ 디렉터리 유무와는 별개다 —
# backend 는 이름은 유효하지만 공유 규칙이 없어 디렉터리가 존재하지 않는다.
HARNESS_ALL_DOMAINS="backend frontend"

# ── 도메인 · 스택 ───────────────────────────────────────────────────────────
#
# 도메인은 "여러 스택이 실제로 공유하는 규칙"이 있을 때만 존재하는 레이어다.
# frontend 는 web·electron 이 디자인 시스템·접근성·상태 관리 규약을 그대로 공유하므로
# 도메인 레이어가 있고, backend 는 규칙이 이미 언어별(jvm·python·go)이라 비어 있다.
# 빈 도메인은 디렉터리 자체가 없고, 호출자는 없으면 그냥 건너뛴다.
harness_domain_of() {
  case "$1" in
    jvm|python|go) echo backend ;;
    web|electron)  echo frontend ;;
    *)             echo "" ;;
  esac
}

# 스택마다 "가장 흔한 출발점"이 다르다. 백엔드는 헥사고날이지만 web 에는 그런 변형이
# 아예 없다. 기본값을 스택 단위로 두지 않으면 web 설치가 매번 --arch 를 요구한다.
harness_default_arch() {
  case "$1" in
    web)      echo nextjs-app ;;
    electron) echo main-renderer ;;
    *)        echo hexagonal ;;
  esac
}

# ── 에이전트 ────────────────────────────────────────────────────────────────

# 템플릿 상대경로가 어느 에이전트에 속하는지 판정한다. 어디에도 안 걸리면 core.
# core = 에이전트를 가리지 않는 규칙·SDD·스크립트로, 선택과 무관하게 항상 설치된다.
harness_agent_of() {
  case "$1" in
    claude/*)                       echo claude ;;
    root/CLAUDE.md)                 echo claude ;;   # AGENTS.md 로 보내는 Claude 전용 리다이렉트
    codex/*)                        echo codex ;;
    cursor/*)                       echo cursor ;;
    kiro-steering/*|kiro-skills/*|kiro-agents/*|kiro-hooks/*|kiro-root/*)  echo kiro ;;
    # agents-skills/* 는 core 다 — .agents/skills/hx-* 가 스킬 원본이고 Claude 커맨드·Kiro 스킬·Cursor 커맨드는 그 원본을 가리킨다.
    *)                              echo core ;;
  esac
}

# 템플릿 상대경로 → 대상 리포 설치 경로.
harness_remap() {
  case "$1" in
    root/*)          echo "${1#root/}" ;;
    kiro-steering/*) echo ".kiro/steering/${1#kiro-steering/}" ;;
    kiro-skills/*)   echo ".kiro/skills/${1#kiro-skills/}" ;;
    kiro-agents/*)   echo ".kiro/agents/${1#kiro-agents/}" ;;
    kiro-hooks/*)    echo ".kiro/hooks/${1#kiro-hooks/}" ;;
    kiro-root/*)     echo ".kiro/${1#kiro-root/}" ;;
    agents-rules/*)  echo ".agents/rules/${1#agents-rules/}" ;;
    agents-skills/*) echo ".agents/skills/${1#agents-skills/}" ;;
    agents-docs/*)   echo ".agents/docs/${1#agents-docs/}" ;;
    agents-root/*)   echo ".agents/${1#agents-root/}" ;;   # 규칙도 기록도 아닌 .agents 직속 설정
    scripts/*)       echo "scripts/${1#scripts/}" ;;
    claude/*)        echo ".claude/${1#claude/}" ;;
    codex/*)         echo ".codex/${1#codex/}" ;;
    cursor/*)        echo ".cursor/${1#cursor/}" ;;
    *)               echo "$1" ;;
  esac
}

# 대상 리포에 이미 있는 에이전트 디렉터리로 후보를 찾는다.
# 리포에 흔적이 없으면 실행 중인 CLI 의 환경변수를 본다(그 CLI 로 부트스트랩하는 상황).
harness_detect_agents() {
  local target="$1" found=""
  [ -d "$target/.claude" ] && found="$found claude"
  [ -d "$target/.codex" ]  && found="$found codex"
  [ -d "$target/.cursor" ] && found="$found cursor"
  [ -d "$target/.kiro" ]   && found="$found kiro"

  if [ -z "$found" ]; then
    [ -n "${CLAUDECODE:-}${CLAUDE_PROJECT_DIR:-}" ] && found="$found claude"
    [ -n "${CODEX_HOME:-}${CODEX_SANDBOX:-}" ]      && found="$found codex"
    [ -n "${CURSOR_TRACE_ID:-}" ]                   && found="$found cursor"
    [ -n "${KIRO_IDE:-}${KIRO_HOME:-}" ]            && found="$found kiro"
  fi
  echo "${found# }"
}

# 쉼표·공백 목록을 정규화하고 모르는 이름은 걸러 낸다. 'all' 은 전체로 편다.
# 결과는 "<유효 목록>|<거부 목록>" 한 줄이다 — 호출자가 커맨드 치환(서브셸)으로 부르므로
# 변수 대입으로는 거부 목록을 돌려줄 수 없다.
harness_normalize_agents() {
  local raw a out="" bad=""
  raw="$(echo "$1" | tr ',' ' ')"
  for a in $raw; do
    if [ "$a" = all ]; then out="$HARNESS_ALL_AGENTS"; bad=""; break; fi
    case " $HARNESS_ALL_AGENTS " in
      *" $a "*) case " $out " in *" $a "*) ;; *) out="$out $a" ;; esac ;;
      *)        bad="$bad $a" ;;
    esac
  done
  echo "${out# }|${bad# }"
}

harness_agent_selected() {
  case " $2 " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

# ── 선택 모듈 ───────────────────────────────────────────────────────────────
#
# 모듈은 "어떤 팀은 쓰고 어떤 팀은 안 쓰는" 규약 묶음이다(이슈 트래커 연동·여러 리포 하네스).
# 안 쓰는 규칙 파일은 컨텍스트만 먹고, 지켜지지 않는 규칙은 나머지 규칙의 신뢰도를 깎는다.
# 그래서 기본은 '설치 안 함'이고 명시할 때만 깔린다.
harness_module_retired() {
  case " $HARNESS_RETIRED_MODULES " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

# 없앤 모듈 안내 한 줄. 두 번째 인자가 meta 면 메타에서 뺀다는 문구(update · add-agent).
harness_retired_note() {
  if [ "${2:-}" = meta ]; then
    echo "· $1 모듈은 공통 층에 포함됨 — 메타에서 뺀다(파일은 그대로)"
  else
    echo "· $1 모듈은 공통 층에 포함됨 — 따로 켜고 끌 것이 없다"
  fi
}

# "<고른 모듈>|<모르는 이름>|<없앤 이름>". 없앤 이름은 all · none 과 상관없이 먼저 가려낸다(CLI 와 같다).
harness_normalize_modules() {
  local raw m out="" bad="" retired="" rest=""
  raw="$(echo "$1" | tr ',' ' ')"
  for m in $raw; do
    if harness_module_retired "$m"; then
      case " $retired " in *" $m "*) ;; *) retired="$retired $m" ;; esac
    else
      rest="$rest $m"
    fi
  done
  for m in $rest; do
    if [ "$m" = all ]; then out="$HARNESS_ALL_MODULES"; bad=""; break; fi
    if [ "$m" = none ]; then out=""; bad=""; break; fi
    case " $HARNESS_ALL_MODULES " in
      *" $m "*) case " $out " in *" $m "*) ;; *) out="$out $m" ;; esac ;;
      *)        bad="$bad $m" ;;
    esac
  done
  echo "${out# }|${bad# }|${retired# }"
}

# ── 레이어 · 설치 후보(뒤 레이어가 이긴다) ─────────────────────────────────
#
# 레이어 순서: common → domains/<도메인> → stacks/<스택>(arch/ 제외) → stacks/<스택>/arch/<변형> → optional/<모듈>.
# 같은 설치 경로가 두 레이어에 있으면 뒤 레이어 판 하나만 쓰고 lock 에 한 줄만 남긴다(CLI layout.json overlap: last).

# 한 레이어의 템플릿 파일. skip_arch=1 이면 arch/ 아래를 뺀다(변형 레이어는 고른 하나만 따로 돈다).
# ABOUT 는 --list-modules 가 읽는 모듈 설명 파일, module.json 은 CLI 가 읽는 모듈 선언 파일(설계 10 §3.1)이라 템플릿이 아니다(빼지 않으면 대상 리포 루트에 생긴다).
harness_list_layer() {
  if [ "${2:-0}" = 1 ]; then
    find "$1" -type f ! -path "*/arch/*" ! -name '.DS_Store' ! -name 'ABOUT' ! -name 'module.json' | sort
  else
    find "$1" -type f ! -name '.DS_Store' ! -name 'ABOUT' ! -name 'module.json' | sort
  fi
}

# 이번 설치가 도는 레이어를 순서대로 "<경로>|<라벨>|<arch 제외>" 로 낸다. setup.sh · update.sh 가 같이 쓴다
# (순서나 라벨이 어긋나면 lock 이 어긋난다). 도메인 폴더가 없으면(backend) domain_dir 을 비워서 넘긴다.
harness_layer_roots() {
  local templates="$1" domain_dir="$2" domain="$3" stack="$4" arch="$5" modules="$6" m
  echo "$templates/common|common|0"
  [ -n "$domain_dir" ] && echo "$domain_dir|$domain|0"
  echo "$templates/stacks/$stack|$stack|1"
  echo "$templates/stacks/$stack/arch/$arch|$stack/$arch|0"
  for m in $modules; do echo "$templates/optional/$m|mod/$m|0"; done
  return 0
}

# stdin 의 레이어 줄로 설치 후보를 "<라벨>\t<소속>\t<템플릿 경로>\t<설치 경로>" 로 낸다.
# 고르지 않은 에이전트의 파일은 HARNESS_EXCLUDED 에 센다 — 서브셸에서 부르면 수가 사라지므로 리다이렉트로 부른다.
harness_candidates() {
  local agents="$1" spec root rest label skip src rel owner
  HARNESS_EXCLUDED=0
  while IFS= read -r spec; do
    root="${spec%%|*}"; rest="${spec#*|}"; label="${rest%|*}"; skip="${spec##*|}"
    while IFS= read -r src; do
      rel="${src#"$root"/}"
      owner="$(harness_agent_of "$rel")"
      if [ "$owner" != core ] && ! harness_agent_selected "$owner" "$agents"; then
        HARNESS_EXCLUDED=$((HARNESS_EXCLUDED+1))
        continue
      fi
      printf '%s\t%s\t%s\t%s\n' "$label" "$owner" "$src" "$(harness_dest_name "$(harness_remap "$rel")")"
    done < <(harness_list_layer "$root" "$skip")
  done
}

# 같은 설치 경로의 후보 중 마지막(뒤 레이어) 줄만 <이긴 것> 에 원래 순서로 남긴다.
# 진 후보는 "<진 라벨>\t<이긴 라벨>\t<설치 경로>" 로 <진 것> 에 적는다.
harness_last_wins() {
  LC_ALL=C awk -F'\t' -v losers="$3" '
    { line[NR] = $0; label[NR] = $1; dest[NR] = $4; last[$4] = NR }
    END {
      printf "" > losers
      for (i = 1; i <= NR; i++) {
        if (last[dest[i]] == i) print line[i]
        else printf "%s\t%s\t%s\n", label[i], label[last[dest[i]]], dest[i] > losers
      }
    }' "$1" > "$2"
}

# ── 해시 ────────────────────────────────────────────────────────────────────

# macOS(shasum)·Linux(sha256sum) 어느 쪽이든 같은 값을 낸다. 둘 다 없으면 '-'.
# '-' 는 어떤 해시와도 안 맞으므로 업데이트가 그 파일을 수정본으로 보고 보존한다(안전한 쪽).
harness_sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" 2>/dev/null | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" 2>/dev/null | awk '{print $1}'
  else
    echo -
  fi
}

# ── 치환 ────────────────────────────────────────────────────────────────────

HARNESS_TOKENS="PROJECT_NAME PROJECT_SLUG PACKAGE_NS SERVICE_NAME
                PRIMARY_LANGUAGE BUILD_TOOL TEST_CMD DOMAIN_EXAMPLE PROTECTED_PATH"

# 파일 안의 {{TOKEN}} 을 같은 이름의 환경변수 값으로 바꾼다(빈 값은 건드리지 않는다).
# 값은 글자 그대로 들어간다 — & · | · \ · 줄바꿈을 해석하지 않는다(CLI 의 리터럴 치환과 같다).
# 값은 환경변수로 넘겨 ENVIRON 으로 읽는다(awk -v 는 \ 를 해석한다). RS 를 \001 로 두어 파일 전체를 한 레코드로 읽으므로
# 마지막 줄바꿈 유무 · CRLF 가 그대로다. 토큰은 HARNESS_TOKENS 순서로 차례로 바꾼다(앞 값 안의 뒤 토큰도 바뀐다).
# PRODUCT_SLUG·FEATURE_NAME·EPIC_ID 가 목록에 없는 건 스펙 작성 시점에 정해지기 때문이다.
harness_subst() {
  local f="$1" tmp="${1}.harness.tmp" k names=""; local -a values=()
  for k in $HARNESS_TOKENS; do
    [ -n "${!k:-}" ] || continue
    names="$names $k"
    values+=("HX_SUBST_$k=${!k}")
  done
  [ -z "$names" ] && return 0
  env "${values[@]}" HX_SUBST_NAMES="$names" LC_ALL=C awk '
    function literal(s, from, to,   out, at, n) {
      out = ""; n = length(from)
      while ((at = index(s, from)) > 0) { out = out substr(s, 1, at - 1) to; s = substr(s, at + n) }
      return out s
    }
    BEGIN { RS = "\001"; count = split(ENVIRON["HX_SUBST_NAMES"], names, " ") }
    {
      s = $0
      for (i = 1; i <= count; i++) s = literal(s, "{{" names[i] "}}", ENVIRON["HX_SUBST_" names[i]])
      if (NR > 1) printf "%s", RS
      printf "%s", s
    }' "$f" > "$tmp" && mv "$tmp" "$f"
}

# 값을 JSON 문자열(따옴표 포함)로 낸다. " · \ · 제어 문자를 이스케이프한다(Node JSON.stringify 와 같다).
harness_json_str() {
  HX_JSON_VALUE="$1" LC_ALL=C awk 'BEGIN {
    for (i = 1; i < 32; i++) esc[sprintf("%c", i)] = sprintf("\\u%04x", i)
    esc["\b"] = "\\b"; esc["\f"] = "\\f"; esc["\n"] = "\\n"; esc["\r"] = "\\r"; esc["\t"] = "\\t"
    esc["\""] = "\\\""; esc["\\"] = "\\\\"
    s = ENVIRON["HX_JSON_VALUE"]; out = ""
    for (i = 1; i <= length(s); i++) { c = substr(s, i, 1); out = out ((c in esc) ? esc[c] : c) }
    printf "\"%s\"", out
  }'
}

# 템플릿을 치환까지 끝낸 상태로 dest 에 만든다. 설치와 업데이트가 같은 함수를 써야
# 해시 비교가 성립한다(한쪽만 치환하면 전부 수정본으로 보인다).
harness_render() {
  local src="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  harness_subst "$dest"
}

# ── 메타 · lock ─────────────────────────────────────────────────────────────

# 평면 JSON 전용 조회. 값이 문자열인 키만 읽는다(agents 배열은 harness_meta_agents 로).
harness_meta_get() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 1
  sed -n "s|.*\"${key}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*|\1|p" "$file" | head -1
}

# 최상위 문자열 배열을 공백 구분 목록으로 읽는다.
# 값이 없거나 키 자체가 없으면 빈 문자열이다(구버전 메타에는 modules 가 없다).
# python3 가 있으면 JSON 으로 읽는다(사람이 배열을 여러 줄로 고쳐도 읽힌다). 없으면 한 줄 배열만 sed 로 읽는다.
harness_meta_list() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 1
  if command -v python3 >/dev/null 2>&1 && python3 - "$file" "$key" <<'PY' 2>/dev/null; then return 0; fi
import json, sys
value = json.load(open(sys.argv[1], encoding="utf-8")).get(sys.argv[2], [])
print(" ".join(str(item) for item in value) if isinstance(value, list) else "")
PY
  sed -n "s|.*\"${key}\"[[:space:]]*:[[:space:]]*\[\([^]]*\)\].*|\1|p" "$file" \
    | head -1 | tr -d '" ' | tr ',' ' '
}

harness_meta_agents()  { harness_meta_list "$1" agents; }
harness_meta_modules() { harness_meta_list "$1" modules; }

harness_kit_version() {
  local plugin_dir="$1" pj
  for pj in "$plugin_dir/.claude-plugin/plugin.json" "$plugin_dir/.codex-plugin/plugin.json"; do
    if [ -f "$pj" ]; then
      sed -n 's|.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*|\1|p' "$pj" | head -1
      return 0
    fi
  done
  echo unknown
}

# 공백 구분 목록을 JSON 배열 본문("a", "b")으로 만든다. 비면 빈 문자열이다.
harness_json_list() {
  local x list=""
  for x in $1; do list="$list, \"$x\""; done
  echo "${list#, }"
}

# 메타를 쓴다. 킷이 관리하는 키(kitVersion · domain · stack · arch · agents · modules · installedAt · updatedAt · tokens)만
# 바꾸고, 사람이 더한 키는 값과 순서를 그대로 둔다(R7.11). installedAt 은 기존 값이 있으면 보존한다(최초 설치 시각이므로).
# v1.1 기본값 issueKey · git.base · verify.fullOnlyInCI 는 없을 때만 더한다. 배열은 한 줄로 쓴다(harness_meta_list 의 sed 경로).
# python3 가 없으면 예전처럼 통째로 쓰고 경고한다(사람이 더한 키는 사라진다).
harness_write_meta() {
  local target="$1" version="$2" domain="$3" stack="$4" arch="$5" agents="$6" modules="${7:-}"
  local file="$target/$HARNESS_META_REL" installed today list mlist
  today="$(date +%F)"
  installed="$(harness_meta_get "$file" installedAt 2>/dev/null || true)"
  [ -z "$installed" ] && installed="$today"
  mkdir -p "$(dirname "$file")"
  if command -v python3 >/dev/null 2>&1; then
    # 치환값은 export 되지 않은 셸 변수일 수 있다. 이름마다 HX_TOKEN_<이름> 으로 넘긴다.
    local k; local -a token_env=()
    for k in $HARNESS_TOKENS; do token_env+=("HX_TOKEN_$k=${!k:-}"); done
    env "${token_env[@]}" HX_VERSION="$version" HX_DOMAIN="$domain" HX_STACK="$stack" HX_ARCH="$arch" \
      HX_AGENTS="$agents" HX_MODULES="$modules" HX_INSTALLED="$installed" HX_TODAY="$today" \
      HX_TOKEN_NAMES="$HARNESS_TOKENS" python3 - "$file" <<'PY'
import json, os, re, shutil, sys

path = sys.argv[1]
env = os.environ
current = {}
if os.path.exists(path):
    try:
        with open(path, encoding="utf-8") as handle:
            current = json.load(handle)
        if not isinstance(current, dict):
            raise ValueError("top level is not an object")
    except ValueError as error:
        shutil.copyfile(path, path + ".bak")
        print(f"  ⚠ {path} 를 JSON 으로 읽지 못했다({error}) — {path}.bak 로 남기고 새로 쓴다", file=sys.stderr)
        current = {}
tokens = dict(current.get("tokens") or {}) if isinstance(current.get("tokens"), dict) else {}
tokens.update({name: env.get("HX_TOKEN_" + name, "") for name in env["HX_TOKEN_NAMES"].split()})
managed = {
    "kitVersion": env["HX_VERSION"],
    "domain": env["HX_DOMAIN"],
    "stack": env["HX_STACK"],
    "arch": env["HX_ARCH"],
    "agents": env["HX_AGENTS"].split(),
    "modules": env["HX_MODULES"].split(),
    "installedAt": env["HX_INSTALLED"],
    "updatedAt": env["HX_TODAY"],
    "tokens": tokens,
}
slug = re.sub(r"^[0-9]+", "", re.sub(r"[^A-Z0-9]", "", (tokens.get("PROJECT_SLUG") or "").upper()))[:10]
defaults = {
    "issueKey": {"source": "kit", "prefix": slug if len(slug) >= 2 else "ISSUE"},
    "git": {"base": "develop"},
    "verify": {"fullOnlyInCI": True},
}
meta = {**managed, **{key: value for key, value in current.items() if key not in managed}}
for key, value in defaults.items():
    if not isinstance(meta.get(key), dict):
        meta[key] = value
    else:
        meta[key] = {**value, **meta[key]}


def dump(value, indent):
    pad = "  " * (indent + 1)
    if isinstance(value, dict) and value:
        body = ",\n".join(f"{pad}{json.dumps(key, ensure_ascii=False)}: {dump(item, indent + 1)}" for key, item in value.items())
        return "{\n" + body + "\n" + "  " * indent + "}"
    if isinstance(value, list):
        return "[" + ", ".join(json.dumps(item, ensure_ascii=False) for item in value) + "]"
    return json.dumps(value, ensure_ascii=False)


temporary = path + ".tmp"
with open(temporary, "w", encoding="utf-8") as handle:
    handle.write(dump(meta, 0) + "\n")
os.replace(temporary, path)
PY
    return $?
  fi
  echo "  ⚠ python3 가 없어 $HARNESS_META_REL 를 통째로 다시 쓴다 — 사람이 더한 키(issueKey · git · verify 등)는 사라진다" >&2
  list="$(harness_json_list "$agents")"
  mlist="$(harness_json_list "$modules")"
  cat > "$file" <<JSON
{
  "kitVersion": "$version",
  "domain": "$domain",
  "stack": "$stack",
  "arch": "$arch",
  "agents": [$list],
  "modules": [$mlist],
  "installedAt": "$installed",
  "updatedAt": "$today",
  "tokens": {
    "PROJECT_NAME": "${PROJECT_NAME:-}",
    "PROJECT_SLUG": "${PROJECT_SLUG:-}",
    "PACKAGE_NS": "${PACKAGE_NS:-}",
    "SERVICE_NAME": "${SERVICE_NAME:-}",
    "PRIMARY_LANGUAGE": "${PRIMARY_LANGUAGE:-}",
    "BUILD_TOOL": "${BUILD_TOOL:-}",
    "TEST_CMD": "${TEST_CMD:-}",
    "DOMAIN_EXAMPLE": "${DOMAIN_EXAMPLE:-}",
    "PROTECTED_PATH": "${PROTECTED_PATH:-}"
  }
}
JSON
}

# 메타 tokens.<이름> 의 값. python3 가 있으면 JSON 으로 읽어 이스케이프(\\ · \")를 푼다.
# python3 가 없거나 JSON 이 깨졌으면 sed 로 읽는다(이스케이프가 든 값은 다르게 읽힌다).
harness_meta_token() {
  local file="$1" key="$2"
  if command -v python3 >/dev/null 2>&1 && python3 -c '
import json, sys
tokens = json.load(open(sys.argv[1], encoding="utf-8")).get("tokens") or {}
value = tokens.get(sys.argv[2], "")
sys.stdout.write(value if isinstance(value, str) else "")
' "$file" "$key" 2>/dev/null; then return 0; fi
  harness_meta_get "$file" "$key"
}

# 메타의 tokens 를 환경변수로 올린다. 이미 값이 있는 변수는 덮지 않는다
# — 호출자가 명시적으로 준 값이 항상 이긴다.
harness_load_tokens() {
  local file="$1" k v
  [ -f "$file" ] || return 1
  for k in $HARNESS_TOKENS; do
    [ -n "${!k:-}" ] && continue
    v="$(harness_meta_token "$file" "$k" || true)"
    if [ -n "$v" ]; then printf -v "$k" '%s' "$v"; export "${k?}"; fi
  done
  return 0
}

# lock 둘째 줄 표시. 이 줄이 있는 lock 은 설치 전부터 있던 파일을 해시 '-'(킷 판과 같으면 그 해시)로 적었다(HK-12 R12.6).
# 없는 lock(v1.0.8 이하)은 미리 있던 파일을 그 파일 해시로 적어서, 업데이트가 사람 파일을 킷 파일로 보고 덮을 수 있다.
HARNESS_LOCK_MARK="# pre-existing: -"

# lock 을 새로 연다. 둘째 인자가 0 이면 표시 줄을 쓰지 않는다(물려받은 해시를 아직 가리지 못했을 때).
harness_lock_init() {
  printf '# harness-kit lock v1 — sha256<TAB>layer<TAB>agent<TAB>path\n' > "$1"
  [ "${2:-1}" = 0 ] || printf '%s\n' "$HARNESS_LOCK_MARK" >> "$1"
}

harness_lock_marked() {
  [ -f "$1" ] && grep -qxF "$HARNESS_LOCK_MARK" "$1"
}

harness_lock_append() {
  printf '%s\t%s\t%s\t%s\n' "$2" "$3" "$4" "$5" >> "$1"
}

harness_lock_hash() {
  local lock="$1" path="$2"
  [ -f "$lock" ] || return 1
  awk -F'\t' -v p="$path" '$1 !~ /^#/ && $4 == p { print $1; exit }' "$lock"
}

# lock 의 한 항목을 갈아 끼운다(업데이트가 교체한 파일의 해시를 새 값으로 옮길 때).
harness_lock_replace() {
  local lock="$1" path="$2" sha="$3" layer="$4" agent="$5" tmp="${1}.tmp"
  if [ -f "$lock" ]; then
    awk -F'\t' -v p="$path" '$1 ~ /^#/ || $4 != p' "$lock" > "$tmp" && mv "$tmp" "$lock"
  else
    harness_lock_init "$lock"
  fi
  harness_lock_append "$lock" "$sha" "$layer" "$agent" "$path"
}


# ── 하네스 배치(HK-13) ──────────────────────────────────────────────────────
#
# `.agents/` 원본(규칙 · 스킬 · 역할)에서 하네스 폴더의 복사본(mirror) · 생성물(render) · 병합(merge)을 만든다.
# 킷 판 projection.py 를 부른다(대상 리포에 깔린 코드는 실행하지 않는다). CLI 어댑터와 같은 결과를 낸다(시험이 묶는다).
# 배치 줄은 lock 에 '<sha>\t<mirror|render|merge|merge+>\t<하네스>\t<경로>' 로 덧붙는다.
#   harness_project <setup|update> <대상> <쓸 lock> <이전 lock|""> <에이전트 목록> [--force] [--accept-all] [--dry-run]
harness_project() {
  local mode="$1" target="$2" lock="$3" prev="$4" agents="$5" py
  shift 5
  py="$TEMPLATES/common/scripts/harness/projection.py"
  [ -f "$py" ] || return 0
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  ⚠ python3 가 없어 하네스 배치(복사본 · 생성물)를 건너뛴다 — python3 를 깐 뒤 'python3 scripts/harness/projection.py sync'" >&2
    return 0
  fi
  local -a extra=()
  [ -n "$prev" ] && [ -f "$prev" ] && extra+=(--prev-lock "$prev")
  PYTHONDONTWRITEBYTECODE=1 python3 -B "$py" apply --mode "$mode" --root "$target" --lock "$lock" \
    --agents "$(echo "$agents" | tr ' ' ',')" --token "PROTECTED_PATH=${PROTECTED_PATH:-}" \
    ${extra[@]+"${extra[@]}"} "$@"
}

# ── 파일 이름 토큰 · 하네스 매니페스트 ────────────────────────────────────────

# 설치 경로 속 `__PROJECT_SLUG__` 를 실제 값으로 바꾼다(Kiro 조율 에이전트 파일 이름).
harness_dest_name() {
  local rel="$1"
  if [ -n "${PROJECT_SLUG:-}" ]; then
    echo "${rel//__PROJECT_SLUG__/$PROJECT_SLUG}"
  else
    echo "$rel"
  fi
}

# 실행 권한: *.sh · *.py 스크립트와 확장자 없는 git hook.
harness_is_executable() {
  case "$1" in
    *.sh|scripts/*.py|scripts/git-hooks/*) return 0 ;;
    *) return 1 ;;
  esac
}

# .agents/harness.json — 하네스 검사기·세션 조율·변경 검증이 읽는 매니페스트(unit · agents).
# 킷 메타(.agents/harness-kit.json)와 목적이 다르다: 이 파일은 하네스 스크립트가 읽는 식별자다.
# 값은 JSON 으로 이스케이프한다(CLI manifestContent 와 같은 바이트).
harness_write_manifest() {
  local target="$1" stack="$2" agents="$3" path="$1/.agents/harness.json" list="" a unit title kind
  for a in $agents; do list="$list${list:+, }\"$a\""; done
  unit="$(harness_json_str "${PROJECT_SLUG:-project}")"
  title="$(harness_json_str "${PROJECT_NAME:-Project}")"
  kind="$(harness_json_str "$stack")"
  mkdir -p "$(dirname "$path")"
  cat > "$path" <<JSON
{
  "unit": $unit,
  "title": $title,
  "stack": $kind,
  "agents": [$list],
  "shared": []
}
JSON
}
