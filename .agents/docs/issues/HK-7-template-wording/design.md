---
key: HK-7
area: templates
type: docs
title: 킷 템플릿에서 에이전트에게 full을 지시하는 문장을 없앤다
status: approved
created: 2026-11-23
---

# Design — HK-7

같은 문장을 고치는 파일이 다른 이슈와 겹치지 않게 담당을 나눈다.

| 파일(`packages/templates/…`) | 담당 |
|---|---|
| `common/agents-skills/hx-*/SKILL.md`(8 + hx-maintain), `common/agents-rules/{git-workflow,code-maintenance,agent-harness,verification-ladder}.md`, `common/claude/rules/code-maintenance.md`, `common/{codex,kiro-root}/README.md`, `common/agents-docs/guides/{sdd-pattern,doc-standards,agent-collaboration,harness-engineering}.md`, `common/kiro-hooks/harness-verify-gate.json` | HK-7(이 이슈) |
| `common/agents-docs/_spec-templates/{tasks,design}/_template.md`의 "full 선택/이유" 칸, `common/scripts/hooks/session-start.sh` 검증 줄 | HK-3(같은 파일의 frontmatter · SDD 경로를 바꾼다) |
| `common/scripts/harness/verify_{planner,runner}.py` 권고 문장, `verify-gate.sh` · `verify-entry.sh` 메시지, `stacks/*/scripts/verify.sh` 출력 | HK-4 · HK-5 |

바꾸는 방향: "full은 `--full`로 명시한다" → "MR 전에는 `bash scripts/verify.sh --affected`, 전체 검증(full)은 CI가 돈다". 레벨 표에는 affected 행을 더하고 full 행의 실행 주체를 CI로 적는다.

시험: 세 이슈를 합친 뒤 `tests/test_template_wording.py`가 `packages/templates`에서 에이전트 지시 문형(`--full`로 명시 · `--full`로 선택 · opt in to full · full을 권고 등)을 세어 0인지 본다. CI 템플릿과 `verification-ladder.md`의 레벨 정의 행, 훅 · 차단 안내 자체는 제외 목록으로 둔다.
