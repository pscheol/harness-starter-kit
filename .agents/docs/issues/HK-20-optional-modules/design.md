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

---

# Design — HK-20b (jira-workflow v2 · 접수 출처 jira · notion · multi-harness)

근거: 설계 10 §3.4 · §3.5 · §3.6 · §5 완료 기준 7 · 8 · 9, 위 HK-20a 의 모듈 엔진(`module.json` · `add` · `remove`). 킷은 모델을 부르지 않는다. 새로 도는 것은 사람 터미널(또는 에이전트 세션이 부르는 같은 명령)의 REST 호출뿐이고, 모듈을 켜지 않으면 세션에 실리는 양이 늘지 않는다(notion · jira 규칙은 `paths` 가 있어 그 경로를 다룰 때만 실린다. 시험 `modules-hk20b`).

## 1. 파일

| 자리 | 내용 |
|---|---|
| `packages/dashboard/src/board-status.ts` · `readers/issues.ts` | 보드 여덟 상태 `boardStatusOf` — 문서 머리 · 승인에서만 계산한다(MD-R15). 이슈 모델에 `boardStatus: {id, label}` 가 붙는다(Jira 가 없어도 같다) |
| `packages/dashboard/src/approvals.ts` · `templates/common/scripts/harness/approvals.py` | 경로 `jira` 기록의 대상 sha `(jira)` 허용 · `근거` 줄 쓰기. fixture `tests/fixtures/approvals/` 에 두 건 |
| `packages/cli/src/modules/http.ts` | REST 공통 바닥(내장 fetch). https 만 허용하고 루프백만 http. 토큰은 오류 문구에서도 지운다 |
| `packages/cli/src/modules/jira/{config,rest,sync}.ts` | `issue-tracker.yml` v2 읽기 · Jira REST v3 클라이언트 · `sync jira` |
| `packages/cli/src/modules/intake/{from,notion,adf,types}.ts` | `intake --from jira:<키>\|notion:<페이지>` · Notion 블록 → Markdown · Jira ADF → Markdown |
| `packages/cli/src/modules/units/{engine,safety,sync}.ts` | `sync units` — `sync.py` · `sync_safety.py` 이식 |
| `packages/templates/common/scripts/harness/{intake,from_unit,verify_affected}.py` | 출처 · 다시 가져오기 diff · `--key` / Unit `repo` / 바뀐 submodule 검사 |
| `packages/templates/optional/jira-workflow/**` | `issue-tracker.yml` v2 키 · 규칙 §5.1 · `hx-issue` · `hx-ticket`. 스킬 `hx-jira-setup`(plugin) 에 v2 절 |
| `packages/templates/optional/notion/**` | 새 모듈(`kind: external`, 도구 없음, 규칙 파일 1개 + `notion.writeBack: false`). `layout.json` `externalModules` 에 더했다 |
| `packages/templates/optional/multi-harness/**` | `agents-rules/cross-repo.md` · `scripts/harness/check_submodules.py` · `scripts/guards/no-cross-domain-paths.sh` · `agents-root/guards/cross-domain-allow.txt` · 시험 `test_cross_repo.py` |
| 공유 파일 | `cli/main.ts`(도움말) · `cli/args.ts`(플래그) · `commands/sync.ts` · `commands/intake.ts` · `core/selection-change.ts`(`LATER_MODULES` 비움) · `dashboard/src/writers/intake.ts`(`key`) · `layout.json` · `hx-bootstrap/manifest.md`(multi-harness 9 → 14) |

## 2. jira-workflow v2

`.agents/issue-tracker.yml` 에 `statusMap`(여덟 상태 → 상태 ID) · `approvalTransitions`(`"<from>><to>": 게이트`) · `issueTypes` · `groupMap` · `sync: {method, mcpServer, restTokenEnv, restUserEnv}` 를 더했다. 기존 `statusIds` · `transitionIds` · `agentBoundary` 는 `/hx-issue` 단품 조작용으로 그대로 두고 `agentBoundary.maxStatus` 만 `verifying`(= v1 inReview)으로 바꿨다. 값은 `TBD` 면 비어 있는 것으로 본다. 기본은 `sync.method: none` 이다.

`npx harness-kit sync jira [--dry-run] [--issue <키> --to <상태>] [--issue <키> --mr-url <주소>]`(리포 → Jira):

```text
모듈 꺼짐            → "jira-workflow 모듈이 꺼져 있다 …" exit 0, 요청 0건
sync.method none     → 같은 취지의 문구 exit 0 · mcp 면 "세션의 /hx-issue 가 한다" exit 0(승인 가져오기만 REST)
baseUrl TBD          → exit 3 · 토큰 환경 변수 없음 → exit 5
이슈마다(키 꼴 = issueKeyPattern): 원하는 상태 = 보드 여덟 상태(boardStatusOf)
  Jira 상태 = 원하는 상태            → 같음
  Jira 가 앞서 있다(사람이 옮김)      → 되돌리지 않고 알린다
  사람 상태 · 승인 전이가 필요        → "사람 승인 전이를 기다림"(요청 0건)
  에이전트 몫(백로그 · 요구사항 작성 · 승인 대기 · 검증) → GET transitions 에서 to.id 가 맞는 전이 하나를 POST
원격 링크: SDD 폴더(origin 호스트로 만든 웹 주소) · --mr-url. globalId harness-kit:sdd:<키> · harness-kit:mr:<키>, 같은 globalId · 주소가 있으면 건너뜀
```

에이전트 경계(MD-R14): `transitionRefusal` 이 (1) `approvalTransitions` 에 있는 `from>to` (2) 설계 · 구현 중 · 완료 · 배포됨(또는 승인 전이의 도착 상태) (3) `maxStatus` 위를 거부한다. `--issue --to` 로 그런 이동을 요청하면 exit 4 와 "거부"를 낸다. 이 검사는 사람 터미널에서 불러도 같다 — 승인 전이는 사람이 Jira 에서 한다.

`sync jira --approvals`(Jira → 리포): `GET /issue/{key}/changelog`(페이지 끝까지, `startAt`) 의 `status` 항목 중 `from>to` 가 `approvalTransitions` 에 있는 것만 본다.

- 같은 changelog id 가 이미 `근거: changelog <id>` · `경로: jira` 로 있으면 건너뛴다(한 번만).
- 작성자 `accountId` → `GET /user?accountId=` 의 `emailAddress`. 없으면(공개 설정) 경고만, `approvers[게이트]` 밖이어도 경고만 하고 기록하지 않는다. `flow.gates` 에 없는 게이트도 경고만.
- 덧붙임: `## <기록 시각> · <게이트> · approved`, `승인자`, `대상: <문서> · sha256: (jira)`, `경로: jira`, `근거: changelog <id>`, `기록 ID`. 시각은 Jira `+0900` 을 `+09:00` 으로 고친다. 대상 문서는 requirements → `requirements.md`, design → `design.md`, done → `tasks.md`, deploy → `deploy`.
- requirements · design 문서가 `draft` · `in-review` 면 대시보드 승인과 같게 머리 `status: approved` 로 고친다(`sdd_gates.py` 가 머리를 본다). 문서가 없으면 기록하지 않고 경고한다.
- 에이전트 세션에서도 돈다. `approvals_guard.py` 의 에이전트 규칙(새 기록의 기록 ID 가 `approvals-log.jsonl` 에 있어야 한다)을 지키려고 같은 로그에 적는다. 승인 시점 = Jira 기록 시각이라 그 뒤 문서 변경과 비교하지 않는다(`sha_matches` — Python · Node 파서가 같다).
- `--verify`: `경로: jira` 기록을 changelog 로 다시 대조한다(기록 id 없음 · 게이트 전이가 아님 · 작성자 불일치 → exit 1). 쓰지 않는다. CI 가 `JIRA_API_TOKEN` 이 있을 때 부른다.

토큰: `JIRA_API_TOKEN` · `JIRA_USER_EMAIL`(이름은 `sync.restTokenEnv` · `restUserEnv`)만 환경 변수에서 읽는다. 리포 · `harness-kit.json` · 출력 · 오류 문구에 쓰지 않는다. 자식 프로세스(intake.py)에는 넘기지 않는다.

Jira 없이(MD-R15): 이슈 모델의 `boardStatus` 가 같은 여덟 이름을 킷 단계에서 계산한다. 배포됨은 배포 승인 기록이 필요해 HK-21 이 `deployed` 를 넘길 때까지 완료에서 멈춘다.

## 3. 접수 출처(설계 10 §3.6)

`harness-kit intake --from jira:<키>|notion:<페이지 URL|id> --name <영문-kebab> [--kind …] [--key <Intent 키>] [--depth n] [--yes]`. 가져오기(네트워크)는 Node, 저장은 `intake.py new --source-json …` 한 곳이라 형식 · 제한(`intake.maxFileMB` · `maxTotalMB`) · 비밀값 검사 · 제어 문자 제거 · `trust: untrusted` 가 접수와 같다.

- `intake.md` 머리 `source: {"type","ref","url","importedAt","version"}`(한 줄 JSON).
- 같은 type · ref 가 이미 있으면 새 Intent 를 만들지 않는다. 시각 · 출처 줄을 뺀 `intake.md` 와 `attachments.json` 을 비교해 같으면 "변화 없음"(exit 0), 다르면 diff 만 보이고 exit 4, `--yes`(`--apply`)일 때만 덮는다. 처음 접수 시각 · 접수자는 지킨다.
- Jira: 에픽 설명(ADF → Markdown) · 하위 작업 항목(`parent = KEY`) · 첨부. 첨부가 `maxFileMB` 를 넘으면 내려받지 않고 링크로 둔다. jira-workflow 모듈이 켜져 있으면 Intent 키 = 에픽 키(`--key` 로도 준다).
- Notion: `NOTION_TOKEN`(환경 변수) · `NOTION_API_BASE`(시험 · 사내 프록시, 루프백만 http). 블록 → Markdown(제목 · 목록 · 할 일 · 토글 · 인용 · 코드 · 표 · 구분선 · 수식 · 이미지 · 파일 · 링크), 속성은 `## 속성` 표, 하위 페이지는 `--depth`(기본 1) 단계까지 `## 하위 페이지: <제목>`, 파일 · 이미지는 첨부(서명 주소에는 인증 헤더를 붙이지 않는다). 설정은 `harness-kit.json` 의 `notion: {database, properties, kindMap, writeBack}`.
- `writeBack` 은 기본 꺼짐. 켜면 접수할 때 `properties.status` 에 "접수됨", `properties.key` 에 Intent 키를 쓴다.
- `intake` 의 `--key`(jira-workflow 가 켜진 리포는 Intent 키가 에픽 키라서 원래 접수가 막혔다)와 대시보드 `POST /intake` 의 `key` 를 같이 열었다.

## 4. multi-harness(설계 10 §3.5)

`npx harness-kit sync units [--check] [--unit <id>] [--adopt]`:

- `sync.py` 와 같은 계획(원본 `tools/harness/shared/` → 단위, `UNIT_*` 토큰, `__UNIT_ID__` 파일 이름, `exclude` fnmatch, 단위마다 `.agents/harness.json` 매니페스트와 지문, 정렬 규칙)이고 `--check` 의 stdout 줄 · exit 가 같다. 23곳 fixture 에서 python 과 TS 로 따로 배포한 트리가 바이트까지 같고 어긋남 7종(missing · differs · mode differs · stale · excluded · collision · 매니페스트)의 `--check` 줄이 같다(`modules-units.test.ts`). knots 사본이 없어 합성 fixture 다.
- 달라진 점: ① 사람이 고친 단위 파일은 전체를 멈추지 않고 `<경로>.new` 로 옆에 둔다(exit 4). ② 단위마다 `<단위>/.agents/harness-kit.lock` 에 `layer: unit:<id>`, `owner: kit`, `op: copy` 항목을 쓴다(이미 있는 다른 항목 · 같은 경로의 다른 레이어는 건드리지 않는다). ③ 동시 실행 잠금은 `harness-sync-<uid>-<리포 해시>.lock.node` 를 `O_EXCL` 로 잡는다(Node 에 flock 이 없다. 주인 pid 가 죽었으면 지운다. python `sync.py` 와는 서로를 막지 않는다). ④ 스키마 `harness-kit.deploy-units/v1`(`tools/harness/units.json`, `schema` 가 없는 이전 파일도 읽는다). `--snapshot` · `--baseline` 은 옮기지 않았다(에이전트 작업 흐름용이라 `sync.py` 에 남는다).
- `gates.py` 는 그대로 두고 `verify_affected.py` · `check_submodules.py --changed` 가 쓴다. 바뀐 도메인 판정(pointer · worktree · unmerged · path)은 한 곳이다.

`scripts/harness/check_submodules.py`: `init`(`git submodule status` 가 `-`) · `pointer`(상위 색인 gitlink SHA 가 submodule 의 어느 원격에도 없음 — 포인터를 먼저 커밋한 경우) · `dirty`(커밋 안 된 변경이 있고 포인터가 스테이징됐거나 `--commit`. 아니면 경고) · `branch`(상위와 submodule 의 이슈 키가 다름). `--domain` · `--changed` 로 범위를 줄이고, `--record <키>` 가 `specs-index.md` 의 `<!-- DOMAINS:BEGIN -->` 구간에 이슈 행(도메인별 submodule SHA · 단계 · 병합일)을 적는다(`BOARD` 구간은 건드리지 않는다). `verify_affected.py` 는 바뀐 도메인이 submodule 일 때만 그 도메인 하나를 `--domain` 으로 부른다.

`scripts/guards/no-cross-domain-paths.sh`: 단위 안 추적 파일에서 다른 단위의 `../<폴더>/` · `<상위 기준 경로>/` · 단위 `packages` 목록의 패키지 import 를 찾는다. 예외 `.agents/guards/cross-domain-allow.txt`(`경로 사유`, 사유 없는 줄은 위반). `harness-guard-enforce: 0` 으로 시작한다.

`/hx-specify --from-unit`(`from_unit.py`): Unit `repo` 가 `tools/harness/units.json` 의 배포 단위 id 이고 계약 Unit 이 아니면 그 도메인 폴더(`<경로>/scripts/new-feature.sh` 가 있어야 한다)에 이슈를 만든다. 출력의 `repo` · `path` 로 어디인지 알 수 있다. 목록에 없는 repo 면 exit 3, multi-harness 가 꺼져 있으면 `repo` 를 무시하고 알린다.

## 5. 설계와 다르게 하는 것 (HK-20b)

| 설계 | 이 이슈 | 이유 |
|---|---|---|
| `대상: <문서> · sha256: (jira)` | 두 파서가 `sha256: (jira)` 를 경로 `jira` 에서만 받는다(다른 경로면 `bad-target`) | 원래 형식이 64자 hex 만 받았다 |
| `done` 승인의 대상 문서 | `tasks.md` · `sha256: (jira)`, deploy 는 `deploy` · `(jira)` | 이 게이트들은 문서 sha 를 비교하지 않는다 |
| Jira 승인을 `approvals.md` 에만 | requirements · design 문서 머리를 `status: approved` 로도 고친다 | `sdd_gates.py` 가 머리 status 를 승인 조건으로 본다. 대시보드 승인 경로와 같은 처리다 |
| 설정 파일 주석 | `readTracker` 가 주석 줄을 지운 뒤 읽는다 | `yaml-lite` 가 들여쓴 주석 줄에서 멈춘다 |
| notion 모듈은 kit 모듈 | `kind: external`(도구 없음) + `externalModules` | 레거시 `setup.sh` 의 모듈 목록 · parity 시험을 건드리지 않고 `add notion` · `remove notion` 을 모듈 엔진으로 한다 |
| 동시 실행 잠금 = `deployment_lock` | 같은 이름 + `.node`, O_EXCL | Node 에 flock 이 없다 |
| 경고 가드의 "exit 0" | 가드는 위반이 있으면 exit 1, 실행기 `run-guards.sh` 가 `harness-guard-enforce: 0` 이면 게이트를 막지 않고 `▲ [경고]` 로 보인다 | 실행기가 성공한 가드의 출력을 버린다. 가드가 스스로 exit 0 이면 경고가 안 보인다 |
| `specs-index.md` 의 SHA 열 템플릿 | `--record` 가 쓰는 `DOMAINS` 구간(이슈 행 · 도메인 열) | `BOARD` 구간이 생성물이라 같은 표에 열을 못 더한다. 손으로 쓴 앞부분은 보존한다 |
| 리포 → Jira 링크의 체크포인트 id | 넣지 않는다 | 체크포인트는 원격 링크로 걸 주소가 없다. SDD 폴더 · MR 만 건다 |
| Notion `writeBack` 의 상태 4종 | 접수 때 "접수됨" 과 Intent 키만 | 나머지 셋(설계 중 · 완료 · 배포됨)은 게이트 이벤트를 받는 자리가 아직 없다 |
| 대시보드 S11 "가져오기" 탭 · 승인 가져오기 버튼 | 만들지 않았다(CLI 만) | 화면은 이 이슈 범위 밖. 읽기 경로를 더하지 않아 PAIRS 규칙에 영향이 없다 |
| MCP 로 접수 · 동기화 | 하지 않는다(`sync.method: mcp` 면 안내만) | 도구 이름 · 출력을 서버가 정한다. 설계 10 §4 |

## 6. 시험 (HK-20b)

| 시험 | 내용 |
|---|---|
| `cli/test/modules-jira.test.ts` | 모의 Jira REST. 꺼짐 · none · TBD · 토큰 없음, 전이 · 링크 · dry-run · 승인 전이 거부, 승인 가져오기(3건 · 재실행 0건 · 승인자 밖 · 이메일 없음 · Python 파서 · 로그), `--verify` |
| `cli/test/modules-intake-from.test.ts` | 모의 Jira · Notion. 형식 · 출처 · 신뢰하지 않는 입력 · 비밀값 · 큰 첨부 · 다시 가져오기 diff · `--yes` · 깊이 · writeBack · 토큰 비유출 |
| `cli/test/modules-units.test.ts` | 23곳 합성 fixture 에서 `sync.py` 와 같은 결과 · `.new` · lock · 거부 |
| `cli/test/modules-hk20b.test.ts` | notion add · remove · 적재량 · jira 템플릿 · multi-harness 파일 |
| `dashboard/test/board-status.test.ts` | 여덟 상태 · `GET /issues` 의 `boardStatus` |
| 모듈 시험 `test_cross_repo.py` | 제공 도메인 → 소비 도메인 → 상위 포인터 순서(완료 기준 9), 순서를 어긴 포인터 · dirty · 브랜치 · 초기화, `affected` 가 바뀐 도메인만, 가드 |
| `tests/harness_scripts/test_intake.py` · `test_from_unit.py` | 출처 · diff · `repo` |

## 7. 사람이 확인할 것 (실제 Jira · Notion · knots)

- Jira Cloud 실제 연결: `GET /rest/api/3/issue/{key}/changelog` 응답의 `author.accountId` · `items[].from/to`(상태 ID 문자열), `GET /user?accountId=` 의 `emailAddress` 가 비는 비율(설계 10 §6 의 표본 20건), `search/jql` 의 `parent = <에픽>` 이 하위 작업 항목을 주는지(팀 관리형 · 회사 관리형 프로젝트 차이), 첨부 `content` 주소가 인증 헤더로 내려받히는지.
- `hx-jira-setup` 으로 `statusMap` 여덟 ID · `approvalTransitions` 네 개를 채우고 `sync jira --dry-run` 이 맞는 전이를 고르는지. 워크플로 조건(그룹)이 실제로 사람만 승인 전이를 하게 막는지.
- Notion: 통합에 페이지를 공유한 뒤 `intake --from notion:<URL> --depth 1`. 표 · 토글 · 동기화 블록 · 첨부(파일 URL 만료 1시간) · 속성 종류별 값 · `writeBack: true` 의 `status` 속성이 `status` 형인지 `select` 형인지.
- knots 실제 사본(23곳)에서 `harness-kit sync units --check` 와 `python3 tools/harness/sync.py --check` 의 출력이 같은지. 이 세션에는 사본이 없어 합성 fixture 로만 시험했다.
- 실제 submodule 리포에서 `check_submodules.py` 의 `pointer`(원격 브랜치 판정이 `--remotes` 기준이다) · 도메인 간 경로 가드의 오탐 수.
