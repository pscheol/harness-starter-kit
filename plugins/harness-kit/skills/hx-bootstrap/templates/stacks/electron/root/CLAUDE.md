# CLAUDE.md

이 리포지터리의 에이전트 작업 가이드는 `AGENTS.md`를 단일 진입점으로 사용한다.
Claude Code는 먼저 `AGENTS.md`를 읽고 거기서 연결하는 `.agents/rules/`(규칙 원본)와 `.agents/docs/`(SDD 기록)를 따른다.
`.agents/rules/` 전체가 자동 주입된다고 가정하지 말고, 작업 유형에 맞는 규칙 파일을 직접 연다.

→ 시작: [AGENTS.md](./AGENTS.md)

## 스택 요약

Electron 데스크톱 앱 · TypeScript + React. 프로세스는 main(Node 권한) · preload(다리) · renderer(웹, 권한 없음) 셋이고, 디렉터리 구조는 `ARCHITECTURE.md` 원본(선택한 변형에 따라 다르다). 검증 게이트 `bash scripts/verify.sh`(포맷 → lint → typecheck → **프로세스 경계 가드** → test → build). 명령·구조·버전 상세는 `ARCHITECTURE.md`·`.agents/rules/tech.md` 원본으로 위임.

## 핵심 (전체는 AGENTS.md 참고)

- 규칙 원본은 `.agents/rules/`, 설계와 기록은 `.agents/docs/`가 기준이다. 진입 파일은 목차일 뿐 상세를 중복 보관하지 않는다.
- 추측 금지: 확인 후 단정, 미확인은 명시 (`.agents/rules/guardrails.md`).
- **`contextIsolation: true` · `nodeIntegration: false` · `sandbox: true` 는 협상 대상이 아니다.** 하나라도 풀면 렌더러 XSS가 로컬 코드 실행이 된다. 게이트가 이 셋을 검사한다.
- IPC는 preload 화이트리스트로만 노출한다. `ipcRenderer` 통째 노출 금지 (`.agents/rules/security.md`).
- main 핸들러는 렌더러 인자를 **스키마로 파싱**한 뒤 쓴다. 렌더러는 신뢰 경계 밖이다.
- 파일 경로·셸 실행은 main에서만, 검증 후에. 사용자 입력으로 경로를 조립하지 않는다.
- main 프로세스를 막지 않는다(동기 I/O·큰 파싱은 워커로) (`.agents/rules/frontend-performance.md`).
- 상태는 종류가 사는 곳을 정한다 (`.agents/rules/ui-state.md`). 값은 토큰에서 고른다 (`.agents/rules/design-system.md`).
- 복잡한 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 계획을 남기고, 변경은 `bash scripts/verify.sh`로 검증한다.
- IPC 채널을 추가하면 채널 목록·계약 문서·preload 화이트리스트·main 스키마를 같은 변경에 함께 넣는다.
- exec-plan은 완료 조건을 채워도 임의로 `completed/`로 옮기지 않는다. `check/`로 옮기고(상태 `check`) **사용자 검증 후** `completed/`로 이동한다.
- 규칙이 바뀌면 `.agents/rules/` 원본을 먼저 고치고 `AGENTS.md`와 이 파일, Kiro 포인터를 동기화한다.
