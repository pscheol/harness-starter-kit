---
key: HK-20
area: modules
type: feat
title: 모듈 엔진 · aidlc · entire(HK-20a) — module.json · 도구 설치 · 어댑터 · 체크포인트 · 세션 적재량 측정
status: draft
created: 2026-11-24
---

# Design — HK-20a

근거: [requirements](requirements.md), [설계 10](../../../../docs/design/10-modules.md) §3.1~§3.3 · §3.7, 실제 도구 시험 기록 [docs/analysis/05-aidlc-entire-real-tools.md](../../../../docs/analysis/05-aidlc-entire-real-tools.md)(aidlc 2.11.4 · Entire 0.13.4, 2026-11-24). 선행: HK-12(add · remove), HK-13 · HK-24(훅 병합 · hooks.d), HK-17(관리 페이지), HK-19(Intent · units.json · from_unit).

킷은 모델을 부르지 않는다. 모듈 엔진이 부르는 외부 명령은 `module.json` 의 `steps`(와 도구가 없을 때의 설치 · 갱신 명령)에 적힌 것뿐이다.

## 1. 범위

| 이 이슈(HK-20a) | HK-20b |
|---|---|
| 모듈 엔진(`add` · `remove` 외부 도구 절차) · `module.json` 선언 · 도구 설치 · 범위 · 갱신(`update --tools`) · 스냅숏 · 외부 소유 등록 · 되돌리기 | jira-workflow v2(상태 대응 · REST · 승인 가져오기) |
| aidlc 모듈 · `sync aidlc` 어댑터 · intent.json · from_unit 의 intent.json 입력 | notion 접수 출처 |
| entire 모듈 · push 정책 · doctor 점검 · `GET /checkpoints` · `checkpoints` 명령 | multi-harness 단위 동기화 · `sync units` · `check_submodules.py` |
| 세션 적재량 측정(`add` · `remove` · `doctor` · `GET /usage/kit` 의 `load`) | S13 화면에 owner 별 막대(화면은 건드리지 않았다 — API 값만) |
| 기존 jira-workflow · multi-harness 를 `module.json` kind `kit` 최소 선언으로 | 두 모듈의 설치 파일은 그대로 |

## 2. 파일

| 자리 | 내용 |
|---|---|
| `packages/templates/optional/<id>/module.json` | aidlc · entire(external), jira-workflow · multi-harness(kit, `files: "layer"`) |
| `packages/templates/optional/aidlc/agents-root/hooks.d/aidlc.json` · `scripts/hooks/aidlc-freshness.{sh,py}` | 킷 몫: Stop 훅 `harness-aidlc-freshness`(`module: "aidlc"`, claude 만, 최대 512바이트). 산출물이 `intent.json` 의 `adaptedAt` 보다 새롭거나 연결 안 된 AI-DLC Intent 가 있을 때만 한 줄을 낸다 |
| `packages/templates/optional/entire/agents-rules/entire-usage.md` | 킷 몫: 트레일러를 지우지 않는다 · `entire` 설정 명령은 사람이 한다. `paths: [".entire/**"]` 라 그 폴더를 다룰 때만 실린다 |
| `packages/templates/layout.json` | `ignore` 에 `module.json`, 새 키 `externalModules: ["aidlc","entire"]`(`init --modules all` 에 들어가지 않는다) |
| `packages/cli/src/modules/declaration.ts` | `module.json` 읽기 · 검사(§3) |
| `packages/cli/src/modules/engine.ts` | `add` · `remove` 절차(§4) |
| `packages/cli/src/modules/{tools,roles,external,rollback,handlers,doctor}.ts` | 도구 확인 · 설치 · 범위, 역할 → 하네스 이름, 스냅숏 · 외부 소유 등록, 되돌리기, `call` 처리기, doctor 점검 |
| `packages/cli/src/modules/aidlc/{adapter-v2,sync}.ts` | AI-DLC 2.11 읽기 · `sync aidlc`(§5) |
| `packages/cli/src/modules/entire/{visibility,settings}.ts` | 원격 공개 여부 · Entire 설정 읽기(§6) |
| `packages/cli/src/core/measure.ts` | 세션 적재량 측정(§7). CLI doctor · add 와 대시보드가 같이 쓴다 |
| `packages/cli/src/commands/{sync,checkpoints,update-tools}.ts` | `sync aidlc` · `checkpoints` · `update --tools` |
| `packages/cli/src/commands/{add,remove,change,init,doctor,update}.ts` · `main.ts` · `cli/args.ts` · `reserved.ts` · `core/{layout,selection-change}.ts` | 외부 모듈 분기 · `withAfterMeta` · init 의 외부 모듈 · doctor 모듈 점검 · 플래그 `--install-tools` `--allow-unverified` |
| `packages/dashboard/src/checkpoints.ts` · `api.ts` · `usage.ts` | 501 이던 두 경로를 구현, `/usage/kit` 에 `load` |
| `packages/templates/common/scripts/harness/{intent,from_unit}.py` | `intent.json` 만 있는 Intent(AI-DLC) 입력 지원 |
| `packages/legacy-setup/hx-bootstrap/{setup.sh,lib/harness-lib.sh}` | 모듈 파일 목록에서 `module.json` 제외. setup.sh 는 kit 종류 모듈만(§9) |

## 3. `module.json` (harness-kit.module/v1)

설계 10 §3.1 의 필드를 구현했다. 달라진 점은 §9 표.

| 필드 | 뜻 · 검사 |
|---|---|
| `schema` `id` `title` `summary` `kind` | `kind`: `kit` · `external`. `id` 는 폴더 이름과 같아야 한다 |
| `requires.kit` | 킷 판 범위(`>=2.0.0 <3.0.0`, 사전 출시 꼬리는 뗀다). 밖이면 exit 3 |
| `requires.modules` · `conflicts` | 먼저 켜야 하는 모듈 · 같이 못 켜는 모듈(exit 3) |
| `requires.tools[]` | `name` · `versionCmd` · `rangeKey`(`versions.<이름>`) · `range`(기본 범위) · `harnessNames`(킷 하네스 → 도구 이름, 없는 하네스는 미지원) · `install`(OS별 argv 또는 null, `doc`, `hint`) · `update`(OS별) · `latest`(`cmd` + `json` 점 경로) |
| `files` | `"layer"`(모듈 폴더 전부, layout.json 매핑) 또는 `[{from, op:"copy"}]`. 목록이면 폴더의 파일이 모두 선언돼야 한다(`undeclaredTemplateFiles` 시험) |
| `hooks[]` | 선언만: `id` · `event` · `harnesses` · `script`. 실제 훅은 모듈 폴더의 `agents-root/hooks.d/<id>.json`(주인 kit, `module` 필드)이고 병합은 기존 훅 엔진이 한다. 선언한 훅이 `.agents/hooks.d` 에 없으면 doctor `module-undeclared` 오류 |
| `settings[]` | 선언만(이 두 모듈은 비어 있다) |
| `externalPaths[]` | 외부 도구가 만드는 경로 글롭. 등록 · 스냅숏에 쓴다 |
| `externalHooks[]` | 하네스 설정 속 외부 훅 명령에 든 글. 측정에서 훅 주인을 가른다 |
| `harnessWarnings{}` | 하네스별 경고 문장(aidlc: codex · cursor · kiro 는 `AGENTS.md` 에 쓴다) |
| `config.set` / `unset` | `harness-kit.json` 의 점 경로 값(`flow.design`, `flow.record`) |
| `steps.add[]` / `remove[]` | `run`(argv, `confirm`, `allowFail`) · `call`(고정 처리기 이름) · `registerExternal` · `applyKit` · `removeKit` · `setConfig` · `unsetConfig` · `doctor` · `print`. 자리표 `{designHarnessName}` `{implementHarnessName}` `{designHarness}` `{implementHarness}` |
| `doctor[]` | 점검 이름 목록(문서용) |

HK-20b 를 위한 자리: `kind: kit` 모듈이 `files: [..]` 와 `hooks` · `settings` · `config` 를 가질 수 있고, 외부 호출이 없는 모듈은 `steps` 에 `applyKit` · `setConfig` 만 둔다. jira-workflow 는 여기에 `config.set`(`issueKey.source` 등) · `settings` 를, notion 은 `kind: external` + `run` 없는 `call`(접수 처리기)을 더하면 된다. 새 `call` 이름은 `handlers.ts` 의 고정 목록에만 추가한다(임의 코드를 module.json 에서 부르지 않는다).

## 4. 엔진 절차

`add <모듈…>`: 이름 중 `kind: external` 인 것은 모듈 엔진이, 나머지(하네스 · kit 모듈)는 기존 `runKitAdd` 가 먼저 한다.

```text
1 module.json 읽기 · 검사 → requires.kit 범위
2 충돌 · 요구 모듈(exit 3)
3 도구마다: versionCmd. 없음 → decideInstall(§MD-R3). 설치 뒤 다시 확인. 범위 밖 → --allow-unverified 없으면 exit 4
  (자리표를 먼저 풀어 미지원 하네스면 쓰기 전에 exit 3)
3a 측정 전(measureSession)
4 계획 출력(킷 파일 · 훅 · 외부 명령 · 설정). --dry-run 이면 여기서 exit 0(도구가 없으면 설치 명령만 보이고 설치하지 않는다)
  실행 확인: confirm 단계는 --yes 또는 TTY 확인. 둘 다 없으면 exit 5(아무것도 쓰기 전)
5 스냅숏 .agents/state/module-snapshots/<id>-<시각>.json (externalPaths 기존 파일 sha256 · 하네스 설정 sha256 · 전체 파일 목록 · lock · meta sha)
6 steps.add 를 차례로. run 은 TTY 면 stdio 를 넘기고 아니면 출력을 줄로 받는다
  registerExternal → lock 항목 op none · owner external:<도구> (applyKit 이 lock 을 한 번에 쓴다)
  applyKit → 기존 planAdd 로 다시 계획(외부 명령이 설정 파일을 바꿨으니) → 쓰기 앞 경로의 바이트를 Rollback 으로 잡고 applyChange
  setConfig → harness-kit.json 점 경로. 중간이 객체가 아니면 exit 3
  call entire.pushPolicy → §6
  doctor → 이 모듈의 점검 줄
  실패 → applyKit 이 끝났으면 Rollback.restore(킷이 쓴 경로만), 외부 파일은 남기고 진행 줄을 오류에 붙여 같은 종료 코드로
7 측정 후 → 늘어난 양을 출력. 4,096바이트 초과 + TTY + --yes 아님 → 한 번 더 묻고 "아니오"면 removeKitPart(exit 4)
```

`remove <모듈>`: `removeKit`(`planRemove` + 외부 소유 lock 항목 제거) → `unsetConfig` → `print`. 외부 파일 · 산출물 · 외부 훅 항목은 두고, 남은 외부 훅 수는 doctor `external-hooks-left`(info)가 알린다.

**훅 병합 시 메타 겹침**(`withAfterMeta`): 모듈 훅은 메타 `modules` 로 거르는데 plan 때 메타는 아직 옛것이라, `planAdd` · `planRemove` 가 바뀔 메타를 원본 보기에 겹쳐 병합을 판정한다. 이것이 없으면 add 가 훅을 병합하지 못하고 remove 가 훅을 빼지 못한다.

**등록 규칙(설계와 다름)**: 설계 10 은 "새로 생긴" 파일만 등록하지만, `remove` 뒤 다시 `add` 하면 이미 있는 파일이 새로 생기지 않아 등록이 빠진다. 그래서 lock 에 없는 `externalPaths` 맞춤 파일은 모두 등록한다(킷 · 사람 항목이 이미 있으면 건드리지 않는다).

## 5. aidlc

- `module.json`: `aidlc config --harness {designHarnessName} --yes`(확인) → `aidlc doctor`(`allowFail`, 출력만) → 등록 → 킷 몫 → `flow.design = "aidlc"`.
- 하네스 이름: 킷 claude · codex · cursor · kiro = AI-DLC `claude` · `codex` · `cursor` · `kiro`.
- `externalPaths`: `aidlc/**` 와 하네스 폴더의 AI-DLC 파일(claude 는 실측 405개(그중 404개가 externalPaths 에 맞아 등록되고 `.claude/settings.json` 은 킷 병합 항목), 나머지는 `--dry-run` 파일 목록 기준).
- 어댑터 `sync aidlc [--intent <폴더>] [--key <키>] [--check]`(`aidlc/sync.ts`):
  - 입력 파일: [분석 문서 1.3](../../../../docs/analysis/05-aidlc-entire-real-tools.md). 필수: Intent 제목(`project-description.json` 또는 `aidlc-state.md` 의 Project 줄), `unit-of-work-dependency.md` 의 yaml `units:` 블록. 없으면 exit 2 + 빠진 항목(폴더를 지정하지 않았으면 그 Intent 만 "아직 가져올 수 없다"로 건너뛴다).
  - `inputSha256` = 폴더 파일(이름 정렬 · `.aidlc-*` 제외)의 `경로\0sha256\n` 합 sha256. 같으면 쓰지 않고(`action: same`), 다르면 `units.json` 은 내용이 달라질 때만 쓴다.
  - Unit: `sourceId` = `U1`(표의 Unit ID) · 없으면 디렉터리 이름, `kind: spec` → `contract` 그 밖 `feature`, `area` = 이름에서 `u<n>-` 뗀 kebab, `order` = 의존 깊이, `repo/nfr/risks/provides/consumes` 는 비워 둔다(AI-DLC 가 구조로 주지 않는다). 새 Unit 번호는 `max(U-n)+1`. 사라진 Unit 은 `planned: false` 로 번호 · `issue` 를 둔다.
  - 스토리: `stories.md` 의 `USx.y`(없으면 맵의 `FR`), 맵에서 여러 Unit 이 적힌 스토리는 첫 Unit 에만 두고 알린다.
  - 폴더: 같은 `aidlc.path` 의 `intent.json` 이 있으면 그 폴더, 없으면 `<키>-<라벨>`(키는 `--key`, jira-workflow 가 켜져 있으면 필수, 아니면 `INT-<max+1>`).
  - 승인: AI-DLC 감사 기록의 `GATE_APPROVED` 행에는 승인자(이메일)가 없어 `approvals.md` 로 옮기지 않고 개수만 알린다(설계 10 §3.2 6단계 규칙 그대로).
- `intent.json` 은 08 §3.10 의 스키마에 `stories`(`[{id,title}]`)와 `adapter.reader` 를 더했다. `intent.py check` 는 `intent.json` 만 있는 Intent 의 스토리 배정(DS-R8)을 이 `stories` 로 보고, 분해 판정(DS-R5)은 AI-DLC 몫이라 건너뛴다. `from_unit.py` 는 `intent.md` 대신 `intent.json`(intent 게이트 대상 문서 포함)을 읽는다.
- doctor: `design-harness`(MD-R11) · `construction-artifacts` · 도구 버전 · `harnessWarnings`.

## 6. entire

- `module.json`: `entire enable --agent {implementHarnessName} --project`(확인) → `call entire.pushPolicy` → 등록 → 킷 몫(`entire-usage.md`) → `flow.record = "entire"`.
  - 설계의 `entire enable` 뒤 `entire agent add` 두 단계를 `enable --agent` 하나로 합쳤다(`--agent` 가 비대화형이면서 그 에이전트 하나만 켠다 — MD-R12).
- `entire.pushPolicy`: `checkVisibility`(원격 URL 호스트 → `gh repo view --json visibility` · `glab repo view -F json`). private · internal 이면 기본값(올림)을 건드리지 않고, 아니면 `entire configure --project --skip-push-sessions` → `.entire/settings.json` 의 `strategy_options.push_sessions: false`.
- doctor: `implement-only`(하네스 설정 파일에서 `entire hooks ` 명령이 있는 하네스 집합 = 구현 하네스) · `trailer-allowed`(커밋 메시지 검사 훅이 트레일러를 지울 수 있는지) · `push-policy`(공개 · 확인 실패인데 올리는 설정이면 오류) · `global-hooks-path`(전역 `core.hooksPath` — Entire 가 그 폴더에 git 훅을 깔아 모든 리포에 영향을 준다) · `gitlab-squash-template` · `concurrent-sessions`.
- 실제 키 이름 · 한계: 분석 문서 2.3. 비밀값 마스킹 패턴을 쓸 설정 키는 0.13.4 에 없어 설계 10 §3.3 3단계는 하지 않는다.
- 체크포인트 API(`dashboard/src/checkpoints.ts`): 목록은 `git log <base>..<이슈 브랜치>` 의 `Entire-Checkpoint` 트레일러 + `refs/entire/checkpoints/` 의 id(슬래시를 뺀 꼬리) 대조 → `local` · `remote-or-missing`. 설명은 `entire checkpoint explain <id>` 10초 · 20,000바이트 · 제어 문자 제거 · `untrusted: true`. entire 가 꺼져 있으면 `enabled: false`, 도구가 없으면 `available: false`(둘 다 200). id 형식이 틀리면 400.

## 7. 측정(§3.7)

`core/measure.ts` `measureSession(root, {harness, entries, hookOwners})`:

| 항목 | 방법 |
|---|---|
| 진입 파일 | `CLAUDE.md` · `.claude/CLAUDE.md`(claude) / `AGENTS.md`(그 밖) + 줄 전체가 `@경로` 인 가져오기(5단계까지, 파일 기준 상대 → 리포 루트 기준) |
| 규칙 | `.claude/rules` · `.kiro/steering` · `.cursor/rules` 의 `paths`(`globs`) 없는 파일 전체 바이트 |
| 스킬 · 서브에이전트 | `<폴더>/skills/*/SKILL.md` · `agents/*.md` 머리의 `name: description` 바이트(본문은 세지 않는다 — 하네스가 세션 시작에 싣는 것은 설명이다) |
| owner | lock 항목(정확히 맞는 것 → 가까운 상위 폴더), 없으면 `user` |
| 훅 수 | `.claude/settings.json` · `.codex/hooks.json` · `.cursor/hooks.json` 의 `hooks.<이벤트>` 항목 수. 명령에 `scripts/hooks/` 가 있으면 kit, 모듈의 `externalHooks` 글이 있으면 `external:<도구>`(대시보드는 module.json 없이 lock 의 `external:<도구>` 이름 + 공백), 그 밖 user |

측정 하네스: aidlc 는 설계 역할 하네스, 그 밖은 구현 역할 하네스(`meta.agents` 에 없으면 첫 하네스). `doctor` 는 `meta.agents` 모두를 낸다. 실제 시험(claude): 킷 10.2KB, AI-DLC 73.3KB(진입 파일 9 · 규칙 1 · 스킬 43 · 에이전트 14 · 훅 17개), Entire 0바이트 · 훅 10개.

## 8. 시험

`packages/cli/test/modules-{engine,aidlc-sync,checkpoints}.test.ts`(가짜 aidlc · entire · gh · brew 를 PATH 에 둔 hermetic 시험 — 완료 기준 1 · 2 · 5 · 6 · 10 · 11 와 어댑터 3 · 4), `tests/harness_scripts/test_aidlc_intent.py`(intent.py · from_unit.py 의 intent.json 입력), 기존 시험 갱신(add · remove · update · cli · dashboard-cli · projects). 실제 도구 e2e 는 tasks.md.

## 9. 설계와 다르게 하는 것

| 설계 | 이 이슈 | 이유 |
|---|---|---|
| `entire` 설치 `brew install entireio/tap/entire` | `brew install --cask entireio/tap/entire` | 공식 README 가 cask. formula 이름은 없다 |
| `entire enable` + `entire agent add <구현 하네스>` | `entire enable --agent <구현 하네스> --project` 하나 | `--agent` 가 비대화형 + 그 에이전트 하나만 켠다 |
| `.entire/settings.json` 에 커밋 연결 · 마스킹 기본값 | 쓰지 않는다. push 끄기만 | 0.13.4 에 그런 설정 키가 없다(내장 redaction) |
| `{implementHarnessName}` = 03 어댑터 변환 | `module.json` 의 `harnessNames` 표 | 어댑터에 도구 이름이 들어가면 D1(외부 도구 이름은 모듈 폴더 안에만)을 어긴다 |
| 외부 훅은 Entire 가 만든 `.claude/hooks/entire*` | 하네스 설정 속 `entire hooks …` 명령 | 실제 Entire 는 별도 훅 파일 없이 `.claude/settings.json` 에 명령을 더한다 |
| 새로 생긴 `externalPaths` 파일만 등록 | lock 에 없는 맞춤 파일 모두(이미 있던 것 포함) | remove → add 를 다시 하면 등록이 빠진다 |
| MD-R7 "외부 소유 파일의 sha256" | 파일은 sha256, `.claude/settings.json` 은 외부 훅 항목별 sha256 | 그 파일은 킷 `merge` 항목이라 파일 전체는 킷 키가 바뀐다 |
| 스킬 측정 "하네스가 세션 시작에 싣는 스킬 설명" | `name: description` 바이트 | 본문은 세지 않는다. 설명 합계라는 점을 출력에 쓴다 |
| 훅 모듈 선언 `hooks[]` 에 `command` | `script`, 병합은 `hooks.d` 파일 | 훅 엔진이 이미 `hooks.json` 의 `module` 필드로 거른다(`hooks.d/<모듈>.json` 은 킷 소유 파일) |
| aidlc 훅 `Stop` 이 `sync aidlc` 안내 | JSON `systemMessage` 한 줄, 새 것이 없으면 0바이트 | 세션 적재량 원칙 |
| 승인 가져오기(§3.2 6단계) | 구현하지 않는다(개수만 알림) | 실제 AI-DLC 기록에 승인자 신원이 없다 |
| `jira-workflow` ABOUT → module.json | ABOUT 은 두고 `module.json` 을 더했다 | setup.sh `--list-modules` 가 ABOUT 을 읽는다. setup.sh 는 kit 종류 모듈만 알고 aidlc · entire 는 모른다 |
| `intent.json` 스키마 | `stories` · `adapter.reader` 를 더했다 | `intent.py check` 가 DS-R8 을 보려면 스토리 ID 가 필요하다 |
| doctor 가 `.entire` · 커밋 트레일러 보존 점검 | 커밋 메시지 검사 파일(`scripts/git-hooks/commit-msg` 등)에 트레일러를 지울 수 있는 글이 있는지 정적 확인 | 킷 git 훅에는 commit-msg 가 없다 |

## 10. 사람이 확인할 것

- 실제 Claude Code 세션이 쓴 AI-DLC 산출물(`unit-of-work*.md`)이 어댑터가 읽는 형식과 같은지(분석 1.3 한계).
- 실제 Entire 세션이 만든 체크포인트 ref 이름 구조(`refs/entire/checkpoints/…`)와 id 대조.
- GitLab 환경: `glab` 가시성 확인 · squash 템플릿 필드(가짜 응답으로만 시험).
- 사용자 전역 `core.hooksPath` 를 쓰는 컴퓨터에서 `add entire` 를 하기 전에 doctor 경고를 읽는다.
