---
description: 이미 하네스가 깔린 리포에 에이전트 배선을 덧붙인다(claude · codex · cursor · kiro). 스택·변형·치환값은 .agents/harness-kit.json 에서 읽는다.
argument-hint: --agents=<claude,codex,cursor,kiro|all> [경로] [--dry-run]
---

<!-- HARNESS STARTER KIT · 얇은 트리거. 원본: skills/hx-agent-add/SKILL.md -->

`hx-agent-add` 스킬을 로드해 그 절차대로 수행한다.

> 이 커맨드는 얇은 트리거다. 스킬을 직접 불러도 결과는 같다 — `/harness-kit:hx-agent-add` (짧게는 `/hx-agent-add`).


입력: $ARGUMENTS

## 인자 해석

| 인자 | 의미 | 없을 때 |
|---|---|---|
| `--agents=` | 추가할 에이전트(쉼표 구분, `all` 은 전체) | 현재 설치 목록을 보여주고 **사용자에게 묻는다**. 임의로 전부 깔지 않는다 |
| 첫 위치 인자 | 대상 프로젝트 경로 | 현재 작업 디렉터리 |
| `--dry-run` | 설치 없이 목록만 | 미지정 시 실제 설치 |

## 수행 순서

1. **스킬 위치 확인** — 이 커맨드가 속한 플러그인의 `skills/hx-agent-add/` 절대경로를 `SKILL_DIR` 로 잡는다.
2. **현재 상태 확인** — `<대상>/.agents/harness-kit.json` 의 `agents` 를 읽어 무엇이 이미 깔렸는지 보여준다.
   파일이 없으면 하네스 미설치다. `/bootstrap` 으로 안내하고 멈춘다.
3. **추가 대상 확정** — 사용자에게 확인받는다.
4. **`--dry-run` 선실행** → 결과 요약 → 승인 후 실제 설치.

```bash
SKILL_DIR="<플러그인 내 skills/hx-agent-add 절대경로>"
bash "$SKILL_DIR/add-agent.sh" --agents=<목록> [--dry-run] <대상_프로젝트_경로>
```

## 주의

- core(`.agents/rules`·`.agents/docs`·`scripts`)는 이미 깔려 있어 건드리지 않는다. 에이전트 배선만 더한다.
- 기존 파일은 덮지 않는다. `--force` 는 사용자가 명시적으로 요구할 때만 붙인다.
- 에이전트를 **빼는** 기능은 없다. 안 쓰는 디렉터리는 사용자가 지우고, 메타의 `agents` 에서도 이름을 뺀다.
