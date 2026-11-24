---
key: HK-14
area: cli
type: feat
title: 확장 층 — 회사 팩 · 프로젝트 · 개인 층과 게이트 하한
state: completed
created: 2026-11-24
---

# Tasks — HK-14

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | 게이트 하한 상수(TS `floor.ts` · Python `floor.py`) · doctor `gate-floor` · `floor-hook-missing` · `full-allowed` · `approvers` | R4.1 | done |
| T2 | 주인별 훅 · 검사 파일(`*.d/`) 합쳐 읽기 — 배치(TS · Python) · `hook_root.py` · `verify_planner.py`, 하한 id 덮기 거부(`floor-override`) | R4.1 · 04 §3.7 | done |
| T3 | 팩: `pack.json` 검사 · 소스(file · git · npm) · 캐시 · 후보 · 충돌 · overrides · `requires.kit` · `update --packs` · lock `packs` · 킷 update 의 skip-pack | R1 · R2 | done |
| T4 | `pack new` | R6.1 | done |
| T5 | 개인 층: `harness-kit.local.json` · `local sync`(스킬 · Kiro 규칙 · 훅) · `.git/info/exclude` 블록 · doctor `personal-ignored` · `personal-weakens` | R3 | done |
| T6 | doctor `--only overrides` | R5.1 | done |
| T7 | 생성물 · manifest · 문서 · 시험 전체 · 검증 기록 | 완료 기준 | done |

## 요구사항별 결과

| 요구(04 §2) | 결과 | 근거(시험) |
|---|---|---|
| R1.1 packs → update --packs, lock 에 pack:<이름> | 충족 | `packs.test.ts` — 팩 파일 7개 `pack:acme` · layer `pack:acme@1.2.0`, lock `packs` 기록, 팩 규칙 · 스킬 · 역할 · 훅이 하네스 폴더에 배치 |
| R1.2 file · git · npm 소스, resolved | 충족 | file `tree:<sha>`, git `git:<커밋 sha>`(로컬 bare 리포 태그 · 캐시 폴더 이름), npm `npm:sha512-…`(로컬 폴더 `npm pack` → tgz 풀기). tar 해석기는 링크 · 리포 밖 경로 거부 |
| R1.3 requires.kit 밖이면 exit 3 | 충족 | 팩 설치 때 · 킷 update 때(lock packs 의 requiresKit) 모두 쓰기 전에 exit 3. 사전 출시 꼬리는 떼고 본다 |
| R2.1 킷 update 뒤 팩 파일 해시 그대로 | 충족 | 템플릿을 바꾼 킷으로 update 뒤 7파일 바이트 같음(04 §5 #1) |
| R2.2 overrides 없이 킷 경로 → exit 3 | 충족 | 04 §5 #4. 선언하면 팩이 덮고, 팩을 빼면 킷 판으로 돌아간다 |
| R2.3 팩끼리 같은 경로 · id → exit 4, 쓴 파일 0 | 충족 | 04 §5 #3(트리 비교) |
| R3.1 개인 설정은 roles · git.ide 만 | 충족 | `local.test.ts` — 나머지는 personal-ignored, 공유 메타 하한 · full 판정에 영향 없음. 세션 등록이 개인 역할 harness 를 따른다 |
| R3.2 개인 층은 더하기만 | 충족 | 공유 스킬 · 규칙과 같은 이름 → personal-shadowed, 하한 · 공유 훅 id → personal-floor, 공유 lock 바이트 그대로, exclude 블록 |
| R4.1 게이트 하한 · 하한 훅 | 충족 | `floor.test.ts`(TS = Python = 관리 페이지, gate-floor · floor-hook-missing), 프로젝트 · 팩 · 개인이 하한 훅 id 를 쓰면 거부(floor-override · 설치 거부 · personal-floor), 설치본 `test_issue_sdd` · `test_block_full_verify`(개인 설정 · flow.gates 를 바꿔도 막힘) |
| R5.1 doctor --only overrides | 충족 | `doctor-overrides.test.ts` — 팩 · 사람 · 프로젝트 항목 · 개인 역할 4건 = 이긴 층이 킷 아닌 수(04 §5 #6), 무시한 개인 설정 · 하한 위반, `--check` exit 1 |
| R6.1 pack new | 충족 | `pack-new.test.ts` — 파일 · 폴더 · 훅 id 를 옮기고(킷 경로는 overrides), 팩 자체 시험 통과, 빈 리포에 file: 로 깔면 같은 바이트(04 §5 #5) |
| 04 §5 #7 | 충족 | `flow.gates` 에서 design 을 빼면 `doctor --check` exit 1, tasks 생성은 design 승인 없이 거부 |

## 검증 기록

### 시험을 쓴 순서(솔직한 기록)

- 이 이슈도 구현과 시험을 함께 썼다(구현 → 시험 → 고침). 새 시험이 처음부터 통과한 것이 많아, 팩 시험은 git · npm 소스가 실제로 돌았는지 따로 확인했다(`--reporter=verbose`).
- 기존 시험 중 바뀐 것: `update --packs` · `pack` 이 예약 명령이 아니게 되어 두 시험을 고쳤다. 배치 검사가 Kiro 생성물의 원본 해시를 hooks.json 하나로 계산하던 것을 hooks.d 까지 묶은 해시로 맞췄다(doctor · check_layout).

### 고친 점

- manifest 파일 수: 새 Python 시험이 템플릿 폴더에 `__pycache__` 를 만들어 수가 늘었고, 거꾸로 HK-24 때 적은 수(256 · 260 · 243)에도 캐시가 섞여 있었다. 시험이 바이트코드를 쓰지 않게 하고 수 세기에서 캐시를 빼, 실제 수 255 · 259 · 242 로 맞췄다.

### 시험 결과

- `pnpm -C packages/cli test`: 401개 통과(파일 32개, 새 파일 `floor` · `packs` · `pack-new` · `local` · `doctor-overrides`).
- 킷 Python: `test_layer_files`(3) · `test_projection_hooks` · `test_template_wording` 통과.
- 설치본: `test_issue_sdd` 하한 시험 · `test_block_full_verify` 개인 층 시험 통과.
- 전체 시험(merge 커밋 `99fa2ae`): CLI 401 · 대시보드 94 통과, 킷 `python3 -m unittest discover -s tests -p "test_*.py"` 117개 OK(1,493초), 설치본(setup.sh python) 494개 OK(772초).

### 토큰

- 팩 · 개인 규칙 · 스킬은 그 층이 더한 만큼만 실린다. 세션 시작 출력 · 상시 안내는 바꾸지 않았다. CLI · 훅은 모델을 부르지 않는다.

## 확인 필요(사람)

- 사내 GitLab 비공개 팩을 `git:` 로 받을 때 인증(ssh · 토큰) — 현장 장비에서 `update --packs --dry-run`.
- Claude `CLAUDE.local.md` · Codex 개인 지침 파일 지원(04 §6) — 확인되면 개인 규칙 배치를 더한다.
- `.git/info/exclude` 가 worktree 에서도 먹는지(공통 git 폴더 파일이라 먹는다고 보지만 실제 확인은 HK-15 와 같이).
