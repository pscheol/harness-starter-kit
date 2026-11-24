# v2 구현 이슈 지도

브랜치 `feature/v2-harness-next`(원격에 올리지 않는다). 이슈마다 `HK-<n>-<이름>/` 폴더에 requirements → design · tasks → 시험(RED) → 구현(GREEN) → 검증 기록을 남긴다. 서브에이전트는 동시에 2개까지. 설계 원본: [docs/design](../../../docs/design/README.md).

## 사용자가 정한 것 (2026-11-23 밤)

- GitHub 비공개 시험 저장소 `harness-kit-e2e-sandbox`를 만들어 원격 시험에 쓰고 남겨 둔다.

- 결정 D3 · D4 · D6 · D7은 추천안으로 정했다(설계 README §11).
- 실측 검증: knots-platform · hdr-vision-3d를 `/tmp`에 복사해 돌린다. 원본은 읽기만 한다.
- AI-DLC · Entire는 이 컴퓨터에 실제로 설치해 시험해도 된다. 시험 폴더에 프로젝트를 처음부터 만들어 전체 흐름을 검증한다. 원격이 필요한 시험은 비공개 시험 저장소로 해도 된다.
- 작업 브랜치는 push하지 않는다.
- 문서에 ECC · spec-kit을 참고 · 활용했다는 내용을 쓰지 않는다.

## 사용자가 정한 것 (2026-11-24)

- 에이전트 세션의 `harness-kit dispatch` 는 막는다(exit 3). 사람이 터미널 · 관리 페이지에서 고를 때만 보낸다.
- 회사 팩끼리 같은 파일 · 훅 id 를 가지면 멈추고 사람이 정한다(지금 구현, exit 4).
- 관리 페이지 승인은 터미널 승인(approve.py)과 같은 규칙이다(승인 해시에서 status · state 줄 제외, tasks 게이트는 오래된 done 기록도 받음).
- `init` 은 전체 프로젝트 등록부에 자동 등록하고 `--no-register` 로 끈다.
- `outdated` 기본 원격은 `https://github.com/pscheol/harness-starter-kit.git`.
- `pack new --dir` 은 사람이 명시한 경로면 리포 밖도 쓴다(빈 폴더 · 없는 경로만, 리포 `.agents/` 안은 거부).
- 새 제품 이름은 **harnessync**(하네스싱크, 접두사 후보 `hs-`). 바꾸는 범위(제품 이름만 · CLI 와 패키지까지 · 전부)는 나중에 정한다. 이름 변경은 HK-22 릴리스에서 한다(npm · GitHub 이름은 2026-11-24 비어 있음, 상표 미확인).
- HK-14 는 설계 04 와 다르게 주인별 훅 · 검사 파일(`hooks.d` · `verify-checks.d`), 개인 스킬 복사, Codex 개인 스킬 · Claude 개인 규칙 미배치로 간다.

## 이슈

| 키 | 단계 | 내용 | 설계 | 선행 | 상태 |
|---|---|---|---|---|---|
| HK-1 | v1.0.9 | 킷 저장소 모노레포 | 02 §3.1 | — | 끝 |
| HK-2 | v1.1 | 에이전트 세션 full 차단 | 01 R2 | HK-1 | 끝 |
| HK-3 | v1.1 | 이슈 단위 SDD | 01 R7 | HK-1 | 끝 |
| HK-4 | v1.1 | 실행 기록 · 테스트 없음 처리 | 01 R3 · R5 | HK-1 | 끝 |
| HK-5 | v1.1 | affected 레벨 | 01 R1 | HK-1 | 끝 |
| HK-6 | v1.1 | 다층 리포 상위 게이트 | 01 R4 | HK-1 | 끝 |
| HK-7 | v1.1 | full 지시 문구 | 01 R6 | HK-1 | 끝 |
| HK-8 | P17 | CLI init · plan · doctor · list | 02 | HK-1 | 끝 |
| HK-9 | v1.1 | SDD 새 경로 따라잡기 | 01 §3.7 | HK-3 | 끝 |
| HK-10 | v1.1 | setup.sh 층 겹침 · 치환 특수 문자 | 02 §3.5 · §3.6 | HK-8 | 끝 |
| HK-11 | P17 | CLI update · repair · uninstall | 02 §3.10 · §3.12 · §3.13 | HK-8 | 끝 |
| HK-12 | P17 | CLI add · remove · outdated · 스킬 전환 + 설치 전 파일 보존 · 스택 문구 · README 표 · later-wins update 동일성 | 02 §3.3 · §3.14 | HK-11 | 끝 |
| HK-13 | P18 | 배치 엔진: 하네스 어댑터 · mirror · render · merge · 규칙 paths 자동 로드 · 역할 파일 · CLAUDE.md 블록 · check_layout | 03 · 12 | HK-12 | 끝 |
| HK-24 | P18 | 훅: hooks.json 생성 · dispatch · hook_root(worktree) · 동기화 · 보호 훅 · 업그레이드 공지 · 세션 시작 예산 | 03 §3.4 · §3.10~§3.12 | HK-13 | 끝 |
| HK-25 | P17 보강 | v1 첫 업데이트 병합(문서 줄 병합 · JSON 키 병합 · 코드 .new) · platform-guards 모듈 삭제 | 사용자 결정 | HK-13 | 끝 |
| HK-14 | P18 | 확장 층(회사 팩 · 개인 층 · 게이트 하한) | 04 | HK-13 | 끝 |
| HK-15 | P19 | worktree 운영 | 05 | HK-13 | 진행 |
| HK-16 | P23 | 정적 분석 · SARIF · 새 문제만 막는 게이트 · CI 템플릿 · 지표 | 09 §3.2~§3.7 · §3.9 | HK-8 | 끝 |
| HK-23 | P23 | 자체 리뷰 에이전트(/hx-review) · 승인 규칙 강제(approve.py · approvals.md 덧붙이기 전용 · done 승인) | 09 §3.1 · §3.8 | HK-16 | 끝 |
| HK-17 | P20 | 관리 페이지 서버(REST · 읽기 · 쓰기 규칙 · 승인 · 질문 · 세션 · 작업 요청 · 내보내기) | 06 §3.1~§3.15 | HK-13 | 끝 |
| HK-18 | P20 | 관리 페이지 화면 · 흐름 보기(React Flow) · 전체 프로젝트 · 기록 · 사용량 · 스킬 목록 | 06 §3.16~§3.19 · 07 · screens | HK-17 | 진행 |
| HK-19 | P21 | 킷 설계 단계: 접수(intake) · /hx-intent · Unit 목록 · 질문 · 기획물 · 역할 | 08 · 12 | HK-17 | 대기 |
| HK-20 | P22 | 선택 모듈: module.json · aidlc · entire(실제 설치 시험) · jira-workflow 개편 · notion · 모듈 토큰 측정 | 10 | HK-12 · HK-19 | 대기 |
| HK-21 | P24 | 배포 · 운영 기록 · 전달 지표 · 규칙 후보 | 14 | HK-16 · HK-19 | 대기 |
| HK-22 | 전 단계 | v1 → v2 이전 도구 · 릴리스 스크립트 · 두 구성 e2e(킷만 / 모두 켬) · knots · hdr 복사본 실측 | 11 · 13 | 전부 | 대기 |

## 진행 방식

- 슬롯 A: HK-11(끝) → HK-16(끝) → HK-23(끝) → HK-17(끝) → HK-18 → HK-19 → HK-21
- 슬롯 B: HK-9/10(끝) → HK-12(끝) → HK-13(끝) → HK-25(끝) → HK-24(끝) → HK-14(끝) → HK-15 → HK-20 → HK-22
- HK-12는 HK-9 · HK-10과 같은 파일(플러그인 문서 · setup.sh · CLI 겹침)을 건드려서 HK-9/10을 합친 뒤에 띄운다. 합친 뒤 HK-11 update 동일성 시험이 HK-9의 update.sh 보드 재생성 · HK-10 겹침 순서를 따라가는지 HK-12에서 맞춘다.
- 합칠 때마다 깨끗한 worktree에서 시험 전체(`pnpm -C packages/cli test` · `node scripts/gen-plugins.mjs --check` · `python3 -m unittest discover -s tests -p "test_*.py"`)를 돌린다.

## 사람에게 물을 것(아침에)

- 서브에이전트는 opus 주간 한도(11-28 03:00 KST 초기화)에 걸렸지만 sonnet 모델로는 돈다. HK-15 · HK-18 을 서브에이전트 2개로 진행한다(2026-11-24).
- (할 일) 사용자 결정 반영: 에이전트 세션 dispatch 차단 · outdated 기본 원격 · init 등록부 자동 등록(`--no-register`, 시험은 `HARNESS_KIT_CONFIG_DIR` 로 실제 홈을 쓰지 않게 — HK-18 뒤).
- (정함) CLI 기본 이슈 키 접두 버그(ACME-NOTES)는 고쳤다(`82aa3db`). 킷이 쓴 잘못된 값은 읽을 때 고친다.
- (HK-24) 살아 있는 세션에서 디스패처 명령 · Codex/Kiro 훅 입력의 `cwd` 확인(수동). update.sh(plugin.json 1.0.8)와 CLI(2.0.0-alpha.0)의 판 값이 달라 공지 내용이 다르다 — 릴리스 스크립트(HK-22)가 맞춘다.
- (HK-17) 살아 있는 Claude 세션에 소켓 요청 전달 · deep link · Codex 대기함 표시는 수동 확인이 남았다. `harness-kit dispatch` 를 에이전트 세션이 부를 때 막을지는 HK-24 훅 정리에서 정한다.

- (정함) platform-guards 모듈은 없앤다 → HK-25.
- 승인 대기 설계 문서: HK-9 ~ HK-12 design.md는 에이전트가 approved로 두었다. 사람 확인이 필요하다.
- (정함) v1.0.8 첫 update의 구별 불가 파일은 문서는 줄 병합, JSON은 키 병합, 코드는 .new → HK-25.
- `outdated`의 기본 원격(배포 원격이 정해지면 `package.json` repository 등).
- (HK-13) 처음 v1.0.8 lock을 올릴 때 `.agents/rules|skills|roles`도 구별 불가로 보아 배치를 미룬다 → HK-25에서 사용자 편한 쪽으로 정한다.
- (HK-13) 확인 필요: Kiro `fileMatchPattern` 배열, Cursor `globs` 쉼표 목록, Claude `paths`가 Read로 연 파일에도 걸리는지(수동).
- (HK-23) GitHub 비공개 시험 저장소 `harness-kit-e2e-sandbox` PR #1로 MR 요약 코멘트가 하나만 남는 것을 확인했다(남겨 둠). GitLab은 가짜 glab으로만 시험.
- (HK-23) 승인 sha는 status/state 줄을 빼고 계산한다. tasks 게이트는 오래된(stale) done 기록도 받는다. 관리 페이지도 같게 할지.
