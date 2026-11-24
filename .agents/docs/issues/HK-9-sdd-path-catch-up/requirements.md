---
key: HK-9
area: sdd
type: refactor
title: 템플릿 · 도구 · 업데이트를 이슈 단위 SDD 경로에 맞춘다
status: approved
created: 2026-11-23
---

# Requirements — HK-9 SDD 새 경로 따라잡기 (v1.1)

근거: HK-3 보고의 남은 일([HK-3 tasks.md](../HK-3-issue-unit-sdd/tasks.md)), HK-8 보고의 doctor 경고. 설계 [01 §3.7](../../../../docs/design/01-v1.1-verify-and-issues.md).

- **R9.1** 설치 템플릿(`stacks/*` · `stacks/*/arch/*`의 AGENTS · CLAUDE · ARCHITECTURE · structure · guardrails, `optional/jira-workflow`, `packages/plugin`의 SKILL · README · manifest, setup.sh 끝 안내)에서 옛 SDD 경로(`<영역>-specs/…`)와 옛 명령 형식(`new-feature.sh <slug> <이름>`)을 새 형식으로 바꾼다. "옛 구조는 읽기만 한다"를 설명하는 문장은 남긴다. 시험이 남은 수를 센다.
- **R9.2** 기능 문서 도구(`tools/docs`)의 SDD 추출기가 새 구조(`.agents/docs/issues/<키>-<이름>/`, frontmatter)를 읽어 이슈를 기능 문서 backlog에 보인다. 옛 구조도 계속 읽는다.
- **R9.3** `hx-update`(update.sh) 뒤 보드 형식이 바뀐 리포에서 보드를 한 번 다시 만들어, 업데이트 직후 fast 검증이 보드 차이로 실패하지 않는다.
- **R9.4** 설치되는 `.gitignore`에 `.agents/state/` · `.agents/local/` · `.agents/reports/`가 있어, 새 설치 직후 `harness-kit doctor`에 `gitignore` 경고가 없다.
