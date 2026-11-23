---
key: HK-1
area: repo
type: refactor
title: 킷 저장소를 모노레포로 옮기고 플러그인 폴더를 생성물로 바꾼다
status: approved
created: 2026-11-23
---

# Requirements — HK-1 킷 저장소 모노레포 이동 (v1.0.9)

근거: [설계 02 §3.1](../../../../docs/design/02-cli-engine.md) · [계획 03 #restructure](../../../../docs/harness-next/03-plan.html#restructure). 승인: 사용자가 2026-11-23 "네 가지 다 반영" · "브랜치 만들고 SDD로 진행"으로 범위를 정했다.

## 1. 문제와 목표

- **문제**: 템플릿 459개를 포함한 킷 전체가 Claude 플러그인의 스킬 폴더(`plugins/harness-kit/skills/hx-bootstrap/templates/`) 안에 있다. v2에서 CLI · 관리 페이지 · React Flow 소스 · 모듈 연결 코드가 생기는데 둘 자리가 없고, 배포 경로(Claude · Codex 플러그인, Kiro, npm)가 모두 그 스킬 폴더를 거치게 휜다.
- **목표**: 원본은 `packages/` 한 곳에 두고, `plugins/harness-kit/`은 원본에서 만든 생성물로 바꾼다. 사용자가 받는 플러그인과 설치 결과는 v1.0.8과 같다.

## 2. 범위

- **In**: 파일 이동(`git mv`), 생성 스크립트 `scripts/gen-plugins.mjs`, 생성물 시험, 워크스페이스 뼈대(`package.json` · `pnpm-workspace.yaml`), 개발 도구 `sync-commands.sh`의 자리 이동, 문서의 경로 안내.
- **Out**: CLI(`packages/cli`, P17) · 관리 페이지(P20) · flow-view(P20) 코드. 설치 결과를 바꾸는 템플릿 수정(v1.1 이후 이슈).

## 3. 요구사항(EARS)

- **R1.1** 이동 뒤 템플릿 원본은 `packages/templates/`, Node 없는 설치 스크립트(`setup.sh` · `lib/` · `update.sh` · `add-agent.sh`)는 `packages/legacy-setup/<스킬>/`, 플러그인 스킬 문서 · 명령 · 매니페스트는 `packages/plugin/`에 있다.
- **R1.2** 이동은 이력이 이어지는 커밋 하나로 한다. `git log --follow packages/templates/common/agents-rules/git-workflow.md`가 이동 전 커밋을 보인다.
- **R2.1** WHEN `node scripts/gen-plugins.mjs`를 실행하면 THE 스크립트 SHALL `packages/plugin` · `packages/legacy-setup` · `packages/templates`로 `plugins/harness-kit/`을 다시 만든다. 실행 권한 비트를 지킨다.
- **R2.2** 같은 원본으로 두 번 만들면 결과가 바이트 단위로 같다(정렬된 순서, 시각 정보 없음).
- **R2.3** WHEN `--check`를 주면 THE 스크립트 SHALL 임시 폴더에 만든 결과와 `plugins/harness-kit/`을 비교하고, 다르면 다른 경로를 출력하고 exit 1로 끝낸다. 쓰기는 하지 않는다.
- **R2.4** 스크립트는 출력 폴더가 `plugins/harness-kit` 또는 `--out`으로 준 폴더일 때만 그 안을 지운다.
- **R3.1** 생성된 `plugins/harness-kit/`은 이동 전 트리와 같다. 예외는 개발 도구 `tools/sync-commands.sh` 하나(루트 `scripts/`로 옮김)다.
- **R3.2** 마켓플레이스 파일 두 개(`.claude-plugin/marketplace.json` · `.agents/plugins/marketplace.json`)의 `source`는 그대로 `./plugins/harness-kit`이다.
- **R4.1** `tests/test_generated.py`가 `--check`를 돌려 생성물과 원본이 같은지 본다. `plugins/harness-kit/` 안 파일 하나를 손으로 바꾸면 이 시험이 실패한다.
- **R4.2** 기존 시험 전체(`python3 -m unittest discover -s tests -p "test_*.py"`)가 이동 전과 같은 결과를 낸다.
- **R5.1** `.gitattributes`가 `plugins/harness-kit/**`을 생성물로 표시한다.
- **R5.2** 루트 README의 구조 · 개발 절차가 새 자리를 가리킨다("원본은 `packages/`, 고친 뒤 `node scripts/gen-plugins.mjs`").

## 4. 성공 기준

- 이동 전 커밋과 이동 뒤 생성물로 같은 선택값의 `setup.sh` 설치를 돌린 결과 폴더의 diff가 0이다(스택 5개).
- 시험 전체 통과, `test_generated.py` 통과.

## 5. 가정

- 킷 개발 환경에는 Node 18 이상이 있다(루트 `package.json`의 `engines`). 생성물을 쓰는 사용자 환경에는 Node가 필요 없다.
