---
key: HK-1
area: repo
type: refactor
title: 킷 저장소를 모노레포로 옮기고 플러그인 폴더를 생성물로 바꾼다
status: approved
created: 2026-11-23
---

# Design — HK-1 킷 저장소 모노레포 이동

요구사항: [requirements.md](requirements.md). 상위 설계: [02 §3.1](../../../../docs/design/02-cli-engine.md).

## 1. 옮기는 곳

| 지금(v1.0.8) | 옮긴 뒤 | 생성물에서의 자리 |
|---|---|---|
| `plugins/harness-kit/skills/hx-bootstrap/templates/**` | `packages/templates/**` | `skills/hx-bootstrap/templates/**` |
| `…/hx-bootstrap/setup.sh` · `lib/harness-lib.sh` | `packages/legacy-setup/hx-bootstrap/…` | `skills/hx-bootstrap/…` |
| `…/hx-update/update.sh` | `packages/legacy-setup/hx-update/update.sh` | `skills/hx-update/update.sh` |
| `…/hx-agent-add/add-agent.sh` | `packages/legacy-setup/hx-agent-add/add-agent.sh` | `skills/hx-agent-add/add-agent.sh` |
| `.claude-plugin/` · `.codex-plugin/` · `commands/` · `skills/*/SKILL.md` · `hx-bootstrap/README.md` · `manifest.md` | `packages/plugin/…`(같은 상대 경로) | 같은 상대 경로 |
| `…/hx-bootstrap/tools/sync-commands.sh` | `scripts/sync-commands.sh`(킷 개발 도구) | 없음 |

- `legacy-setup`을 스킬 이름으로 나눈 것은 생성 규칙을 "그 폴더를 그 스킬 위에 겹친다" 한 줄로 두기 위해서다. 스크립트 안의 상대 경로(`$SCRIPT_DIR/../hx-bootstrap`)는 생성물 안에서 지금과 같은 자리를 가리키므로 고치지 않는다.
- 설계 02 §3.1의 패키지 목록에 `packages/plugin`(얇은 플러그인의 원본)을 더한다. 02 §3.1 그림에는 생성물 쪽만 적혀 있어 원본 자리가 비어 있었다.

## 2. 생성 스크립트 `scripts/gen-plugins.mjs`

```text
node scripts/gen-plugins.mjs [--out <폴더>] [--check]
1 out = --out 또는 <저장소>/plugins/harness-kit
2 --check 면 out 대신 임시 폴더에 만든다
3 안전: out 이 plugins/harness-kit 도 아니고 --out 으로 받은 폴더도 아니면 exit 2
4 out 을 비우고(폴더째 지우고 다시 만든다) 세 층을 차례로 복사한다
    packages/plugin/**                → out/**
    packages/legacy-setup/<스킬>/**    → out/skills/<스킬>/**
    packages/templates/**             → out/skills/hx-bootstrap/templates/**
  같은 경로가 두 층에 있으면 exit 2(겹침 금지 — 덮어쓰기로 생긴 차이를 숨기지 않는다)
5 파일마다 바이트와 권한 비트(0o755 / 0o644)만 옮긴다. mtime 은 옮기지 않는다
6 --check: 임시 결과와 plugins/harness-kit 을 경로 목록 · 바이트 · 실행 비트로 비교
    다르면 "+ 생성물에만 / - 커밋에만 / ~ 내용 / x 실행 비트" 줄을 출력하고 exit 1
```

- `.DS_Store` · `__pycache__` · `*.pyc`는 복사하지 않는다(커밋되지 않는 파일).
- Node 표준 모듈(`node:fs` · `node:path` · `node:os`)만 쓴다. 의존 패키지 0.

## 3. 시험

| 시험 | 내용 |
|---|---|
| `tests/test_generated.py::test_check_passes` | `node scripts/gen-plugins.mjs --check` exit 0 |
| `::test_detects_manual_edit` | 저장소를 임시 폴더로 복사하고 생성물 파일 하나를 고친 뒤 `--check` exit 1, 출력에 그 경로 |
| `::test_deterministic` | `--out` 두 곳에 만든 결과가 같다 |
| `::test_refuses_unknown_out` | 출력 폴더 안전 검사(R2.4) |
| `::test_overlap_rejected` | 두 층에 같은 경로를 둔 임시 복사본에서 exit 2 |
| 기존 `tests/test_install.py` | `SYNC_COMMANDS` 경로만 `scripts/sync-commands.sh`로 바꾸고 그대로 통과 |
| 수동(성공 기준) | 이동 전 커밋 `1c89e9e`의 `setup.sh`와 생성물 `setup.sh`로 스택 5개 설치 결과 diff 0 |

## 4. 커밋 나누기

1. `refactor: 킷 원본을 packages/ 로 옮긴다` — `git mv`만. 이 커밋에서 `plugins/harness-kit/`은 비어 있다(이력 추적이 rename 으로 잡히게 하려고 생성물은 다음 커밋에 넣는다).
2. `build: 플러그인 폴더를 packages/ 에서 생성한다` — 생성 스크립트 · 생성물 · 시험 · 문서.

## 5. 위험

| 위험 | 대응 |
|---|---|
| 사람이 생성물을 고치고 원본을 안 고친다 | `test_generated.py`가 실패. README에 원본 자리를 적는다 |
| 커밋 1과 2 사이의 플러그인이 비어 있다 | 같은 브랜치에서 연속으로 넣고, 릴리스는 커밋 2 이후만 한다 |
| 생성물이 커밋되어 저장소가 커진다 | 같은 내용은 git이 같은 blob으로 저장한다. 늘어나는 것은 트리 객체뿐이다 |
