---
key: HK-8
area: cli
type: feat
title: npx harness-kit CLI의 뼈대와 init · plan · doctor · list를 만든다
status: approved
created: 2026-11-23
---

# Requirements — HK-8 CLI 엔진 핵심 (P17 첫 조각, v2.0.0-alpha)

근거: [설계 02](../../../../docs/design/02-cli-engine.md) R1 · R2 · R4 · R8, §3.1~§3.9 · §3.11 · §3.15. 계획: [harness-next 03 #p17](../../../../docs/harness-next/03-plan.html#p17). 사용자 요청: "npx로 설치".

## 범위

- **In**:
  - `packages/cli`(TypeScript → esbuild → `dist/cli.js` 한 파일)
  - `packages/templates/layout.json`
  - `plan` · `init`(작업 종류 `copy`만, v1.0.8과 같은 결과) · `doctor`(읽기 전용) · `list`
  - 공통 플래그 · 종료 코드, `--json`
  - lock v2 · 메타 v2 쓰기
  - setup.sh ↔ CLI 동일성 시험
  - 생성 스크립트가 CLI 번들을 플러그인 `bin/harness-kit.js`로 넣기
- **Out(다음 조각)**:
  - `update`(3방향 비교) · `repair` · `uninstall` · `add` · `remove` · `outdated`
  - 하네스 어댑터(P18 · mirror · render · merge)
  - 플러그인 스킬이 CLI를 부르게 바꾸기(02 §3.14)

## 요구사항(EARS)

- **R1.1** Node 18 이상에서 `node dist/cli.js <명령>`(npx 진입과 같은 파일)이 돈다. 18 미만이면 exit 5와 필요한 버전을 출력한다.
- **R1.2** `dist/cli.js`는 파일 하나이고 런타임에 `node_modules`를 읽지 않는다. `packages/cli/package.json`의 `dependencies`는 비어 있다.
- **R2.1** `init`은 같은 선택값(스택 · 변형 · 도메인 · 하네스 · 모듈 · 치환값)에서 setup.sh와 같은 파일 목록 · 내용 · 실행 권한을 만든다. lock · 메타 파일은 비교에서 뺀다.
- **R2.2** `init`은 쓰기 전에 전체 작업 목록을 만들고, `--dry-run`(= `plan`)이면 목록만 출력한다.
- **R2.3** 이미 설치된 리포(`.agents/harness-kit.json` 있음)에서 `init`은 exit 3으로 끝나고 `update` · `add`를 안내한다.
- **R2.4** `init`은 lock v2(`.agents/harness-kit.lock`, README §6)와 메타 v2(`.agents/harness-kit.json`, README §5)를 쓴다. 메타에는 v1.1 기본값 `issueKey` · `git.base` · `verify.fullOnlyInCI`가 들어간다.
- **R4.1** `doctor`는 아무것도 쓰지 않는다. `--check`면 오류 등급 발견이 하나라도 있을 때 exit 1.
- **R4.2** 새 설치 직후 `doctor --check`는 exit 0. 킷 파일 하나를 지우면 `missing`(오류), 고치면 `drifted`(정보)를 낸다.
- **R8.1** 모든 명령은 `--json`을 받고, 사람용 출력과 같은 정보를 JSON 한 개로 stdout에 낸다.
- **R9.1** `node scripts/gen-plugins.mjs`가 `packages/cli/dist/cli.js`를 `plugins/harness-kit/skills/hx-bootstrap/bin/harness-kit.js`로 넣고, 생성물 시험이 그 사본도 비교한다.
- **R9.2** 시험은 네트워크 없이 돈다. CLI 단위 시험(vitest)과 동일성 시험(Python unittest, 스택 매트릭스)이 있다.
