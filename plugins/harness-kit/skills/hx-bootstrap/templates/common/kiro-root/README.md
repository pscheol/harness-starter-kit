# Kiro

이 하네스 루트를 workspace로 연다. `steering/`은 `.agents/rules/` 원본을 가리키는 포인터, `skills/`는 `.agents/skills/` 원본을 가리키는 포인터다.

- `agents/{{PROJECT_SLUG}}.json`은 다섯 역할(`explorer`·`reviewer`·`docs-researcher`·`planner`·`worker`)에 위임하는 조율 에이전트다. CLI에서는 이 하네스 루트에서 `kiro-cli chat --agent {{PROJECT_SLUG}}`로 시작한다(V3 는 `--v3`). 전역 기본 에이전트로 두지 않는다.
- `hooks/`는 v1 형식이고 CLI V3 · IDE 가 읽는다. SessionStart가 하네스 컨텍스트를, PreToolUse가 보호 경로 쓰기 차단을, Stop이 changed 검증을 부른다.
- CLI 기본 엔진(V2)은 `hooks/`를 읽지 않고 고른 에이전트 JSON 의 `hooks`만 쓴다. 그래서 조율 에이전트에 같은 세 hook(`agentSpawn`·`preToolUse`·`stop`)을, `worker`에 보호 hook 을 둔다. V2 의 `agentSpawn`은 대화형 세션에서만 돈다.
- Stop 실패는 exit 1 로 알린다(V3 · IDE 는 exit 2 를 무시한다). 클라이언트별 차이는 [하네스 설명서](../.agents/docs/guides/harness-engineering.md) §6.
- steering의 `inclusion: always`는 모든 CLI 버전에서 로드되고, `manual`(hx-* 워크플로)은 V3에서 `#파일명`으로 부른다.
- 설정 형식의 정적 검사와 설치된 Kiro 클라이언트의 실제 실행 확인은 별개다.

새 코드·리팩토링은 `.agents/rules/code-maintenance.md`, 공동 세션은 `.agents/rules/session-collaboration.md`를 읽는다.
변경 검증은 `bash scripts/verify.sh --files <paths> --tests <tests> --plan`, MR 전에는 `--affected`, 전체(full)는 CI가 돈다.
