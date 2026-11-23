#!/usr/bin/env bash
# `.env.example` 에 실값이 들어가는 것을 막는다.
#
# 왜 필요한가:
#   `.env` 는 git-ignore 되지만 `.env.example` 은 **커밋 대상**이다. 급할 때 예시 파일에 실값을
#   적어 두는 일이 실제로 일어나고(2026-08-24 HF_TOKEN), 한 번 커밋되면 히스토리에서 지우기 어렵다.
#   문서로 "넣지 마라"라고 적는 것으로는 막히지 않는다. 게이트가 막아야 한다.
#
# 무엇을 검사하나 — 두 층:
#   ① 알려진 발급 토큰의 형태(hf_ · sk- · AIza · ghp_ · xox_ · AKIA)
#   ② 로컬 더미가 존재할 수 없는 키가 비어 있지 않은지(HF_TOKEN · *_API_KEY …)
#   `POSTGRES_PASSWORD=dev` 같은 로컬 개발용 더미는 ②의 목록에 없으므로 통과한다.
#
# ⚠ 위반을 찍을 때 **값을 출력하지 않는다.** 키 이름과 줄 번호만 낸다 —
#   가드가 secret 을 CI 로그에 옮겨 적으면 가드가 사고의 원인이 된다.
#
# harness-guard-enforce: 1
#
# 규약·승격 절차 원본: .agents/rules/platform-invariants.md
set -uo pipefail

fail=0

# 실제 발급 토큰의 접두사 형태. 길이 하한을 둬서 설명문의 `hf_xxx` 같은 자리표시자는 걸리지 않게 한다.
TOKEN_SHAPES='(hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[A-Z0-9]{16})'

# 로컬 더미가 있을 수 없는 키. 값이 붙어 있으면 그건 실값이다.
MUST_BE_EMPTY='^(HF_TOKEN|GEMINI_API_KEY|OPENAI_API_KEY|ASR_VLLM_API_KEY)='

while IFS= read -r f; do
  # ① 토큰 형태
  hits="$(grep -nE "$TOKEN_SHAPES" "$f" 2>/dev/null | cut -d: -f1 || true)"
  if [ -n "$hits" ]; then
    for line in $hits; do
      key="$(sed -n "${line}p" "$f" | cut -d= -f1)"
      echo "$f:$line: '$key' 에 실제 토큰 형태의 값이 있다"
      fail=1
    done
  fi

  # ② 비어 있어야 하는 키
  hits="$(grep -nE "$MUST_BE_EMPTY.+" "$f" 2>/dev/null | cut -d: -f1 || true)"
  if [ -n "$hits" ]; then
    for line in $hits; do
      key="$(sed -n "${line}p" "$f" | cut -d= -f1)"
      echo "$f:$line: '$key' 는 예시 파일에서 비어 있어야 한다 (실값은 .env 로)"
      fail=1
    done
  fi
done < <(find . -name ".env.example" -not -path "*/node_modules/*" -not -path "*/.venv/*" -not -path "*/build/*" -not -path "./{{PROTECTED_PATH}}/*" 2>/dev/null)

exit "$fail"
