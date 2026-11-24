#!/usr/bin/env bash
# 새 Intent 폴더(설계 08 §3.1 · DS-R1): .agents/docs/intents/<Intent 키>-<이름>/ 에 intent.md(draft) · questions.md(open)를 템플릿에서 만든다.
#   bash scripts/new-intent.sh "<요약>" --name <영문-kebab-이름> [--kind product|feature|change|refactor] [--key <에픽 키>]
# 키는 INT-<n>(base 브랜치 + 작업 트리 최대 + 1), jira-workflow 모듈이면 에픽 키를 --key 로 준다. 모델을 부르지 않는다.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
exec python3 -B scripts/harness/intent.py new "$@"
