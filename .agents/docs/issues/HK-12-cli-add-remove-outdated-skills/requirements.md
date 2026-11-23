---
key: HK-12
area: cli
type: feat
title: CLI add · remove · outdated와 플러그인 스킬의 CLI 호출
status: approved
created: 2026-11-23
---

# Requirements — HK-12 CLI add · remove · outdated · 스킬 전환 (P17 마지막 조각)

근거: [설계 02](../../../../docs/design/02-cli-engine.md) R7.1, §3.3 명령 표, §3.14. [10 §3.1](../../../../docs/design/10-modules.md)(모듈 선언 · add 절차의 v1 모듈 부분).

- **R12.1** `add <하네스|모듈>…`은 v1 하네스(`claude` `codex` `cursor` `kiro`)와 v1 모듈(`jira-workflow` `platform-guards` `multi-harness`)을 켜고 그 몫만 깔며, 메타의 `agents` · `modules`에 더한다. 결과는 add-agent.sh와 같다(동일성 시험, lock · 메타 제외). 외부 도구 모듈(aidlc · entire)과 notion은 P22에서 더한다(이번에는 exit 2와 제공 단계 안내).
- **R12.2** `remove <이름>…`은 그 하네스 · 모듈의 킷 소유 파일 중 고치지 않은 것만 지우고, 메타에서 뺀다. 고친 파일은 남기고 목록과 exit 4.
- **R12.3** `outdated`는 설치 버전 · CLI 버전 · 소스의 최신 태그(`git ls-remote --tags`)를 비교해 출력한다. 네트워크가 없으면 그 칸을 "확인 못 함"으로 두고 exit 0. `--check`는 새 버전이 있으면 exit 1.
- **R12.4** 플러그인 스킬 `hx-bootstrap` · `hx-update` · `hx-agent-add`는 Node 18.3 이상이면 `bin/harness-kit.js`를 부르고, 없거나 낮으면 setup.sh · update.sh · add-agent.sh로 내려간다(§3.14). 스킬은 CLI의 `--json` 출력을 사람에게 보이고, exit 4면 `.new` 목록을 그대로 보인다.
- **R12.5** 모든 명령은 `--json`을 받는다. 킷은 모델을 부르지 않고, 스킬 문서가 세션에 싣는 양(설명 길이)을 늘리지 않는다(README 원칙 10).
