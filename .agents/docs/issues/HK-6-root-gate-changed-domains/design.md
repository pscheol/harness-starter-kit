---
key: HK-6
area: verify
type: feat
title: 다층 리포의 상위 게이트가 바뀐 도메인만 부른다
status: approved
created: 2026-11-23
---

# Design — HK-6

근거: [설계 01 R4 · §3.4](../../../../docs/design/01-v1.1-verify-and-issues.md). 경로는 `packages/templates/` 기준이다.

## 파일

| 파일 | 바꿈 |
|---|---|
| `optional/multi-harness/tools/harness/gates.py` | `--changed [--base <ref>]`, `--json` |
| `common/scripts/harness/verify_affected.py` | 하네스 루트에 `tools/harness/gates.py`와 `units.json`이 있으면 바뀐 도메인의 게이트만 부른다 |
| `common/scripts/harness/verify_runner.py` | 게이트 명령(`kind: gate`) 앞에 `▶ 하네스 <id> (<레벨>)`, 건너뛴 도메인마다 `↷ <id> 건너뜀 — 변경 없음`(stderr) |
| `common/scripts/verify-entry.sh` | fast · full 본문이 부르는 하위 게이트가 받도록 `HARNESS_VERIFY_PARENT`를 export한다(R4.5) |
| `optional/multi-harness/tools/harness/tests/test_gates.py` | 네 규칙 |
| `optional/multi-harness/tools/harness/tests/test_root_gate.py` | 새로. 도메인 3곳 중 하나만 바꾼 루트 affected |
| `optional/multi-harness/tools/harness/tests/{test_verify_entry,test_sync,test_sync_concurrency}.py` | 설치본에서 돌도록 고친다(아래) |
| `tests/test_multi_harness_module.py` | 새로. `--modules=multi-harness` 설치본에서 모듈 시험을 돌린다(지금은 어느 시험도 돌리지 않는다) |

## `gates.py --changed`

```text
python3 tools/harness/gates.py                       # 줄마다 "<id> <path> <rootVerify>" (지금 그대로)
python3 tools/harness/gates.py --changed --base origin/develop   # 같은 형식, 변경 없는 도메인 줄을 뺀다
python3 tools/harness/gates.py --json [--changed …]  # [{"id","path","rootVerify","changed","reasons"}] — 모든 도메인
```

`--base`가 없으면 `.agents/harness-kit.json`의 `git.base`(기본 `develop`)로 `origin/<base>` → `<base>` 순서로 찾는다. 없으면 exit 2와 `base ref 없음: origin/develop — git fetch origin develop 뒤 다시 실행`. merge-base = `git merge-base HEAD <ref>`.

도메인 d(경로 p)는 하나라도 참이면 바뀌었다(`reasons`에 이름을 남긴다):

| 이유 | 판정 |
|---|---|
| `pointer` | `git diff --name-only <merge-base> -- p`에 p 자체(gitlink)가 있다 |
| `worktree` | p가 저장소(`p/.git`)이고 `git -C p status --porcelain`이 비어 있지 않다 |
| `unmerged` | p가 저장소이고 `git -C p rev-list --count HEAD --not origin/<base>` > 0. `<base>`는 p의 메타 `git.base`, 없으면 루트 값. 그 ref가 p에 없으면 판정할 수 없으므로 바뀐 것으로 본다(`unmerged-unknown`) |
| `path` | 루트 변경 집합(`git diff --name-only <merge-base>` + 추적 안 된 파일)에 `p/` 아래 경로가 있다 |

## 루트 게이트

- 루트 `verify.sh --affected`(`verify-changed.py --level affected`)는 하네스 루트에 `tools/harness/gates.py`와 `tools/harness/units.json`이 있으면 `gates.py --json --changed --base <ref>`로 도메인을 고른다. `--files`로 부르면 그 파일이 든 도메인을 고른다.
- 고른 도메인마다 게이트 명령 하나: `bash <p>/scripts/verify.sh --affected --summary`(+ `--files`면 그 도메인 상대 경로), 환경 `HARNESS_VERIFY_LEVEL=affected` · `HARNESS_VERIFY_PARENT=affected`. 도메인 아래 파일은 루트에서 다시 계획하지 않는다. 도메인 밖 루트 파일은 루트에서 affected 계획을 세운다(경로 검사 `verify-checks.json` 포함).
- 고르지 않은 도메인은 `skippedUnits`에 `{"id", "reason": "no-change"}`로 남고, 실행할 때 stderr에 `↷ <id> 건너뜀 — 변경 없음`을 낸다. 게이트 명령 앞에는 `▶ 하네스 <id> (affected)`.
- 기록(`verify-last.json`)의 `units[]`에 도메인 기록 경로 `lastRun`(`<p>/.agents/state/verify-last.json`)을 적는다. 도메인 게이트도 자기 기록을 쓴다.
- fast · full은 지금처럼 사용자 루트 본문의 루프가 `gates.py`(전체)를 쓴다. `verify-entry.sh`가 fast · full 본문 앞에서 `HARNESS_VERIFY_PARENT`를 export하므로 하위 게이트의 HK-2 보조 점검을 통과한다.

## 시험

- `test_gates.py`: 바뀐 것 없음 → 빈 출력, 네 규칙 각각, 형제 도메인은 남는다, `--json` 이유, base 없음 exit 2. submodule은 중첩 저장소를 gitlink로 더하고 `origin/develop`은 `git update-ref`로 만든다.
- `test_root_gate.py`: 도메인 3곳 중 하나만 바꾼 루트에서 `verify-changed.py --level affected`의 stderr에 `▶ 하네스` 1줄 · `↷ … 건너뜀` 2줄, 도메인 게이트가 `HARNESS_VERIFY_PARENT=affected`로 불린다, `--plan`은 게이트를 부르지 않는다, 도메인 밖 루트 파일만 바꾸면 도메인 게이트를 하나도 부르지 않는다.
- 진입: 설치본 `verify.sh --full`(사람 터미널)의 본문이 부른 하위 게이트가 `CLAUDECODE=1`에서도 막히지 않는다(`test_verify_record.py`에 둔다).

## 설치본에서 모듈 시험 고치기

지금 모듈 시험 62개 중 5개가 설치본에서 실패한다(실패 3 · 오류 2). 이 이슈의 시험을 같은 묶음에서 돌리려면 먼저 고친다.

- `test_sync.py` · `test_sync_concurrency.py`: 시험 입력의 `{{PROJECT_NAME}}`이 설치 때 치환된다. 자리표시자를 문자열 이어 붙이기로 만든다.
- `test_verify_entry.py`: `tools/harness/shared/scripts/verify-entry.sh`가 없는 설치본에서는 리포 `scripts/verify-entry.sh`를 쓴다.

## 설계와 다른 점

- 루트 changed는 지금처럼 루트가 바뀐 파일의 검사를 직접 고른다. 도메인 게이트를 부르지 않으므로 R4.1의 "바뀐 도메인만"을 만족한다. 도메인 게이트 위임은 affected에서 한다. changed까지 위임하면 Stop 훅(`--session`) · git 훅(`--files`) 출력 형식이 바뀐다.
- 루트 fast · full 루프는 사용자 리포의 루트 `verify.sh` 본문에 있다(킷 템플릿에 없다). 킷은 `gates.py`의 출력 형식을 바꾸지 않고, `HARNESS_VERIFY_PARENT`는 진입 블록이 export한다.
- `rootVerify: fast`(루트에서 full 대신 fast) 상한은 full에만 적용한다. affected는 상한이 1,200초인 별도 레벨이라 그대로 부른다.
- 설계 01에 없는 `gates.py --json`을 더했다. `verify-changed.py`가 바뀐 도메인 · 건너뛴 도메인 · 이유를 호출 한 번으로 읽는다.
- 도메인 저장소에 `origin/<base>`가 없으면 규칙 3을 판정할 수 없다. 건너뛰면 검증하지 않은 변경이 통과하므로 바뀐 것으로 본다(`unmerged-unknown`).
- 규칙 1(포인터)은 `--ignore-submodules=dirty`로 본다. 도메인 작업 트리 변경은 규칙 2가 따로 센다.

## 확인 필요

- `rootVerify: fast` 도메인을 루트 affected에서도 fast로 낮출지(knots 플랫폼 도메인).
