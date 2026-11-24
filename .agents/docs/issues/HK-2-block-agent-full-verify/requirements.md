---
key: HK-2
area: verify
type: feat
title: 에이전트 세션의 전체 검증(full)을 훅으로 막는다
status: approved
created: 2026-11-23
---

# Requirements — HK-2 에이전트 세션의 full 차단 (v1.1)

근거: [설계 01 R2 · §3.2](../../../../docs/design/01-v1.1-verify-and-issues.md), 결정 D10(full은 CI에서만). knots 기록 59곳에서 에이전트가 완료 확인으로 `--full`을 불러 검증이 1~2시간 걸렸다.

## 요구사항(EARS)

- **R2.1** WHEN 에이전트 세션의 셸 도구 명령에 `verify.sh`(또는 `verify-entry.sh`)와 `--full`이 함께 있거나, `HARNESS_VERIFY_LEVEL=full`이 있거나, `verify-changed.py … --level full`이 있으면 THE PreToolUse 훅 SHALL 명령을 막고(exit 2) 안내를 stderr로 낸다.
- **R2.2** 사람 터미널과 CI의 `verify.sh --full`은 지금처럼 돈다(훅은 하네스가 셸 도구를 부를 때만 돈다).
- **R2.3** WHERE `.agents/harness-kit.json`의 `verify.fullOnlyInCI`가 `false`면 훅은 막지 않는다. 값이 없으면 `true`로 본다.
- **R2.4** IF 입력을 해석하지 못하면(JSON 오류, `tool_input.command` 없음) THEN 훅은 통과시킨다. 셸 도구가 아닌 호출(`tool_name`이 셸이 아님)은 보지 않는다.
- **R2.5** 훅은 Claude Code(`.claude/settings.json`) · Codex(`.codex/hooks.json`) · Kiro IDE(`.kiro/hooks/`) · Kiro CLI(조율 에이전트 `hooks.preToolUse`)에 등록된다.
- **R2.6** 보조 점검: WHEN 레벨이 full이고 `CI`와 `HARNESS_VERIFY_PARENT`가 비어 있고 에이전트 환경 표지(`CLAUDECODE=1`)가 있으면 THE `verify-entry.sh` SHALL 같은 안내를 내고 exit 3으로 끝낸다.
- **R2.7** 안내 문구에 바꾼 범위 · MR 전 · 범위 보기 명령 세 줄과 설정 키 이름이 있다. full을 권하는 문장은 없다.

## 범위 밖

- 문자열을 바꿔 우회하는 것까지 막지 않는다. 목표는 완료 확인으로 full을 습관처럼 부르는 일을 없애는 것이다.
- affected 레벨 자체는 HK-5.
