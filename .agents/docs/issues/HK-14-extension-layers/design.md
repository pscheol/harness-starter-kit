---
key: HK-14
area: cli
type: feat
title: 확장 층 — 회사 팩 · 프로젝트 · 개인 층과 게이트 하한
status: in-review
created: 2026-11-24
---

# Design — HK-14

근거: [requirements](requirements.md), [설계 04](../../../../docs/design/04-extension-layers.md) §2 · §3 · §5, [README](../../../../docs/design/README.md) §5 · 원칙 3 · 7 · 10, [03](../../../../docs/design/03-projection-and-hooks.md) §3.4(hooks.json). 선행: HK-12(update · lock owner · skip-pack 자리), HK-13(배치 · lock v2), HK-24(hooks.json · 디스패처 · 배치가 훅 원본을 읽는다).

킷은 모델을 부르지 않는다. 층이 늘어도 세션에 실리는 양은 그 층이 더한 파일만큼만 는다(doctor 가 owner 별로 보인다, 12 §3.8).

## 1. 설계 04 와 다르게 하는 것(먼저 읽는다)

| 04 | 이 판 | 이유 |
|---|---|---|
| §3.1 · §3.7 `.agents/hooks.json` · `verify-checks.json` 한 파일 안 항목마다 `owner`, lock 은 `merge` 항목 | **주인별 파일**: 킷 `.agents/hooks.json` · `.agents/verify-checks.json`(킷 copy 그대로) + 팩 `.agents/hooks.d/<팩>.json` · `.agents/verify-checks.d/<팩>.json`(팩 copy) + 프로젝트 `.agents/hooks.d/project.json` · `.agents/verify-checks.d/project.json`(사람 파일, lock 밖) | lock 은 파일 단위로 주인을 적는다. 한 파일 안 항목 병합을 얹으면 (1) 킷 update 가 사람 항목이 든 hooks.json 을 '사람이 고친 파일'로 보고 `.new` 를 내고, (2) 배치가 읽는 원본(hooks.json)을 배치 전에 병합해야 해서 계획 순서가 꼬인다. 파일을 나누면 기존 copy · lock · update 표가 그대로 맞는다. 읽는 쪽(배치 · 디스패처 · verify_planner)이 폴더를 합쳐 읽는다 |
| §3.6 개인 스킬은 하네스 폴더에 **링크** | **복사**(개인 lock 에 기록) | 링크는 Claude Code 스킬 목록에서 빠지는 문제가 있어 v2 가 복사로 정했다(03 §4). 개인 파일도 같은 이유다 |
| §3.6 Codex 개인 스킬 `.agents/skills/<이름>` 링크 | 배치하지 않고 doctor 정보 | `.agents/skills/` 는 공유 원본 폴더라 배치가 공유 lock 에 올린다. Codex 개인 스킬은 사용자 폴더(`~/.codex/skills`)를 쓴다 |
| §3.6 Claude 개인 규칙 | 배치하지 않고 doctor 정보 | 04 §6 확인 전(`CLAUDE.local.md`) |
| §3.4 팩 `npm:` | 받는다. tgz 는 Node 표준 zlib + 작은 tar 해석기(번들 안) | 런타임 의존성 0 유지(02) |

## 2. 층과 주인

| 층 | 주인(lock owner) | 어디 | 우선 |
|---|---|---|---|
| 킷 | `kit` | 템플릿 | 4 |
| 회사 팩 | `pack:<이름>` | `harness-kit.json` `packs` → `update --packs` | 3 |
| 프로젝트 | `user` | 리포에 사람이 둔 파일 · `*.d/project.json` | 2 |
| 개인 | (공유 lock 밖) | `.agents/local/`(gitignore) → 개인 lock | 1(더하기만) |

같은 경로: 프로젝트 > 팩 > 킷(04 §3.5). 팩끼리 같은 경로 · id 는 충돌(exit 4, 쓴 파일 0). 개인 층은 경로를 덮지 않는다(같은 이름이면 배치하지 않고 경고).

## 3. 팩

### 3.1 형식 · 검사

04 §3.2 그대로(`pack.json` schema · name · version · requires.kit · provides · overrides · tokens). 세그먼트는 킷 `layout.json` 의 것을 쓰고 `common/` · `domains/<d>/` · `stacks/<s>/` · `stacks/<s>/arch/<a>/` 층을 킷과 같은 선택으로 거른다. 금지 세그먼트: `root/` · `claude/` · `codex/` · `cursor/` · `kiro-*`. 팩 조각은 `fragments/hooks.json` → `.agents/hooks.d/<이름>.json`, `fragments/verify-checks.json` → `.agents/verify-checks.d/<이름>.json` 으로 까는 팩 파일이다.

설치 전 검사(하나라도 어기면 exit 3, 쓴 파일 0): 형식 · 경로 ⊆ provides 가 가리키는 경로 ∪ overrides ∪ 조각 두 파일 · 킷이 가진 경로는 overrides 에 있어야 · 훅 id 는 `harness-<이름>-` 접두이고 하한 훅 id 가 아님 · 검사 id 는 `<이름>-` 접두 · 금지 세그먼트 · 링크 · `requires.kit` 가 지금 CLI 판을 포함.

### 3.2 소스

| 소스 | 받기 | lock `resolved` |
|---|---|---|
| `file:<경로>` | 리포 상대 또는 절대 폴더를 읽는다 | `tree:<tree-sha256>` |
| `git:<주소>#<ref>` | `git clone --depth 1 --branch <ref> <URL>`. `<주소>` 가 `host/path` 면 `https://host/path.git`, `ssh://` · `https://` · `file://` 은 그대로 | `git:<커밋 sha>` |
| `npm:<spec>` | `npm pack <spec> --pack-destination <캐시>` → tgz 를 풀어 `package/` 아래 | `npm:<sha512 무결성>` |

캐시 `.agents/state/packs/<이름>@<버전>-<resolved 앞 12자>/`(gitignore). 자격증명은 git · npm 설정을 그대로 쓰고 읽거나 저장하지 않는다. doctor: `pack-unpinned`(git ref 가 `v` 태그 꼴이 아님) · `pack-local-path`(`file:` 이 리포 밖).

### 3.3 명령

| 명령 | 하는 일 |
|---|---|
| `update --packs [--dry-run]` | `packs` 를 받아 검사 → 팩 파일 판정(02 §3.10 표, B = lock 의 팩 기준 해시) → 쓰기. 킷 판은 바꾸지 않는다. 팩에서 빠진 파일은 고치지 않았으면 지우고, 그 경로를 킷이 가지면 킷 판으로 되돌린다. 고쳤으면 남기고 주인을 `user` 로 |
| `update`(옵션 없음) | 팩 파일은 skip-pack(지금처럼). 새 킷 판이 팩 `requires.kit` 밖이면 쓰기 전에 exit 3 |
| `pack new <이름> --dir <경로> [--from <파일>[#id]]… [--kit-range <범위>]` | 04 §3.9 |
| `uninstall [--keep-packs]` | 지금처럼 |

## 4. 프로젝트 층

- 사람이 고친 킷 파일 · lock 밖 사람 파일은 지금처럼 프로젝트가 이긴다(skip-user).
- 프로젝트 훅 · 검사: `.agents/hooks.d/project.json` · `.agents/verify-checks.d/project.json`(킷 · 팩이 쓰지 않는다). 같은 id 가 킷에 있으면 프로젝트 판이 이긴다 — 단 하한 훅 id 는 덮을 수 없다(배치가 그 항목을 버리고 doctor `floor-override` 오류).
- 합쳐 읽기(배치 · `hook_root.py` 의 출력 상한 · `verify_planner.py`): `<파일>.json` → `<파일>.d/*.json`(이름 순, `project.json` 은 마지막). 팩끼리 같은 id 는 설치 때 막는다.

## 5. 개인 층(`.agents/local/`, gitignore)

| 파일 | 하는 일 |
|---|---|
| `harness-kit.local.json` | `roles.<역할>.harness` · `git.ide` 만 덮는다. 그 밖의 키는 무시하고 doctor `personal-ignored` |
| `skills/<이름>/` | `.claude/skills/<이름>/` · `.kiro/skills/<이름>/` 복사(공유 스킬과 이름이 같으면 배치하지 않고 경고) |
| `rules/<이름>.md` | Kiro `.kiro/steering/local-<이름>.md`(render). Claude · Codex 는 배치하지 않고 doctor 정보 |
| `hooks.json` | Claude `.claude/settings.local.json`(merge, 킷 키 판정과 같은 알고리즘) · Kiro IDE `.kiro/hooks/local-<id>.json`. Codex 는 정보. 하한 훅 id 는 쓸 수 없다 |

- `harness-kit local sync` 가 개인 배치를 만들고 `.agents/local/harness-kit.local.lock` 에 적고, 공유 폴더에 둔 개인 파일 경로를 `.git/info/exclude` 의 킷 블록(`# harness-kit local begin` … `end`)에 적는다. `init` · `update` · `repair` 끝에 같은 일을 한다(개인 층이 없으면 아무것도 하지 않는다).
- doctor `personal-weakens`: `.claude/settings.local.json` 의 `disableAllHooks: true`, 또는 킷 훅 id 명령을 덮는 항목.

## 6. 게이트 하한

- 상수: `packages/cli/src/core/floor.ts` `GATE_FLOOR = ["requirements","design","mr","done"]` · `FLOOR_HOOKS = ["harness-protect-sources","harness-block-full-verify","harness-verify-gate","harness-protect-approvals"]`. Python `scripts/harness/floor.py` 같은 값(시험이 묶는다). 설정으로 바꿀 수 없다.
- doctor: `gate-floor`(오류 — `flow.gates` 가 있는데 하한 게이트가 빠짐) · `floor-hook-missing`(오류 — 킷 hooks.json 에 하한 훅이 없음, `repair` 가 되살린다) · `floor-override`(오류 — 프로젝트 · 개인 · 팩이 하한 id 를 씀) · `full-allowed`(경고 — `verify.fullOnlyInCI: false`) · `approvers` 는 검사만(비면 누구나, 형식이 틀리면 경고).
- `check-sdd-prerequisites` 는 설정과 상관없이 하한 게이트를 검사한다(지금 동작을 시험으로 묶는다).

## 7. doctor `--only overrides`

04 §3.10 의 사람 줄과 JSON(`overrides` · `ignoredPersonal` · `floorViolations`). 셈: 이긴 층이 킷이 아닌 경로(팩 파일 중 킷도 가진 경로, 킷이 원하는 경로를 사람이 고쳤거나 둔 것) + 프로젝트가 덮은 킷 훅 · 검사 id + 개인이 덮은 역할 harness.

## 8. 시험

| 완료 기준(04 §5) | 시험 |
|---|---|
| 1 팩 6파일 `pack:acme` · 킷 update 뒤 해시 그대로 | `packs.test.ts` |
| 2 개인 설정 무시 2건 · full 차단 그대로 | `local.test.ts` + 설치본 `test_block_full_verify` |
| 3 같은 경로 팩 둘 → exit 4, 쓴 파일 0 | `packs.test.ts` |
| 4 overrides 밖 킷 경로 · 하한 훅 id → exit 3 | `packs.test.ts` |
| 5 `pack new` → 빈 리포에 `file:` 로 깔면 같은 바이트 | `pack-new.test.ts` |
| 6 overrides 수 = 이긴 층이 킷 아닌 수 | `doctor-overrides.test.ts` |
| 7 `flow.gates` 에서 design 빼면 `doctor --check` exit 1, tasks 생성 거부 | `doctor.test.ts` + 설치본 `test_issue_sdd` |
| git · npm 소스 | 임시 bare 리포(`file://`) 태그 · 로컬 폴더 `npm pack` |
| 합쳐 읽기 TS = Python | 배치 동일성 fixture 에 `hooks.d` |

## 9. 토큰

- 팩 · 개인 규칙 · 스킬은 그 층이 더한 만큼만 실린다. 세션 시작 고정 안내 · 상태 예산은 그대로다(HK-24).
- doctor 의 상시 컨텍스트 합계는 owner 별로 나눠 보인다(12 §3.8).
