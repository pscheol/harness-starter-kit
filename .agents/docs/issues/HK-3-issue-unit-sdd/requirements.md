---
key: HK-3
area: sdd
type: feat
title: SDD를 이슈 단위(키-이름 폴더)로 만들고 영역별 보드로 묶는다
status: approved
created: 2026-11-23
---

# Requirements — HK-3 이슈 단위 SDD (v1.1)

근거: [설계 01 R7 · §3.7](../../../../docs/design/01-v1.1-verify-and-issues.md), 결정 D9(이슈 키는 Jira 키, 없으면 킷이 만든다). 사용자 요청: "SDD는 프로젝트 폴더가 아니라 이슈 단위로", "지라 이슈 번호 그대로, 지라가 없으면 적절하게 이슈명을 만든다".

## 요구사항(EARS) — 설계 01 R7.1~R7.9 그대로

- **R7.1** `scripts/new-feature.sh <이슈키> <이름> --area <영역>`은 `.agents/docs/issues/<이슈키>-<이름>/requirements.md`를 만든다.
- **R7.2** `--next <이름>`은 `issueKey.source`가 `kit`일 때 `<prefix>-<N>` 키를 만든다. N은 §3.7.3의 최댓값(기본 브랜치 트리 · 작업 트리 · 로컬/원격 브랜치 이름 · worktree 브랜치) + 1이다.
- **R7.3** `issueKey.source`가 `jira`인데 `--next`를 쓰면 키를 만들지 않고 exit 2.
- **R7.4** 이슈 문서 세 종은 frontmatter에 `key`·`area`·`type`·`status`(tasks는 `state`)를 가진다. 상태의 원본은 frontmatter다.
- **R7.5** 보드는 `area` 값으로 묶어 `.agents/docs/specs-index.md`의 BOARD 마커 사이에 쓴다. `board.sh --area <영역>`은 그 영역 표만 낸다.
- **R7.6** `sdd-layout.py migrate --dry-run`은 `migrate-map.json`만 쓰고 파일을 바꾸지 않는다. `--apply`는 지도대로 `git mv`하고, 영역별 상태 개수가 전후로 다르면 되돌린다.
- **R7.7** 옛 구조(`<영역>-specs/`)는 읽기만 한다. 옛 구조에 새 이슈 폴더 · 단계 문서가 생기면 fast 검증이 실패한다(`check-legacy-frozen`).
- **R7.8** 브랜치 이름은 `<종류>/<이슈키>-<이름>`이다. 이 형식의 브랜치를 push할 때 같은 키의 이슈 폴더가 없으면 pre-push가 막는다. `exp/`는 검사하지 않는다.
- **R7.9** base에 같은 키가 다른 이름으로 있으면 fast 검증이 실패한다(`check-issue-keys`).
- **R7.10** 키 · 이름 형식은 §3.7.2를 따른다. 옛 호출 `new-feature.sh <slug> <이름>`은 v1.1 동안 `--next <이름> --area <slug>`로 바꿔 실행하고 새 형식을 안내한다. `--legacy`는 exit 2.
- **R7.11** `harness_write_meta`는 v1 메타를 다시 쓸 때 모르는 키(`issueKey` · `git` · `verify`)를 지운다. 이를 보존하도록 JSON 병합으로 바꾼다(§3.7.2).

## 범위 밖

- Intent · Unit 연결(`intent`·`unit` frontmatter 값 채우기)은 P21. 필드만 받는다.
