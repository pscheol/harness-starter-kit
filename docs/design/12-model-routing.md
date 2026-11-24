# 12. 위임 작업의 모델·effort 배정과 토큰 절감

- 단계: P18(역할 파일 생성에 모델·effort 넣기) · P20(대시보드 하네스 탭 사용량 보고).
- 관련: [02 #roles](../harness-next/02-direction.html#roles) · [02 #engine](../harness-next/02-direction.html#engine) · [04 #measure](../harness-next/04-usage.html#measure) · [05 #extend](../harness-next/05-principles.html#extend) · D7 · D10
- 역할 파일 생성: 03 §3.6. 확장 층: 04. 사용량 화면: 06 §3.13.
- 근거 문서(2026-11-23 열람): Claude Code [Subagents](https://code.claude.com/docs/en/sub-agents) · [Skills](https://code.claude.com/docs/en/skills) · [Settings](https://code.claude.com/docs/en/settings-reference) · [Hooks](https://code.claude.com/docs/en/hooks) · [Monitoring](https://code.claude.com/docs/en/monitoring-usage), Codex [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), Kiro [Custom agent configuration](https://kiro.dev/docs/custom-agents/configuration-reference/).

## 1. 목적·범위

지금은 모든 에이전트가 같은 모델·effort로 돈다. 위임한 작업의 종류에 맞춰 모델과 effort를 낮추거나 올려 토큰을 줄인다. 사람이 개발용으로 고른 세션의 모델·effort는 하네스가 바꾸지 않는다.

범위에 넣는 것: 바꾸지 않는 대상의 경계, 작업 분류와 등급(tier), `.agents/model-policy.json`, 역할 파일 머리와 하네스별 생성, 실패 시 한 등급 올리기, 개인 층 규칙, 그 밖의 토큰 절감 장치, 역할별 사용량 측정.

범위 밖: 사람이 여는 세션의 모델 추천(사람이 정한다), 모델 가격표 관리, Cursor·Gemini 위임(킷이 역할 파일을 만들지 않는다).

## 2. 요구사항

| ID | 요구사항(EARS) |
|---|---|
| MR-R1 | 하네스 동작(`init` · `update` · `add` · `remove` · `repair` · `uninstall` · 훅 · 관리 페이지)은 사람이 연 세션의 모델·effort를 정하는 설정 키(§3.1 표)를 쓰지도 지우지도 않는다. |
| MR-R2 | `locked`에 있는 역할(기본 `implement` · `design` · `review`)의 역할 파일은 모델·effort를 상속으로 생성한다. |
| MR-R3 | `locked` 역할의 원본에 `tier` · `model` · `effort`가 있으면 생성은 실패하고 doctor가 오류로 보고한다. |
| MR-R4 | 잠기지 않은 역할의 원본에 `class` 또는 `tier`가 있으면 생성은 정책의 등급을 하네스별 모델·effort 필드로 바꿔 쓴다. |
| MR-R5 | 하네스가 지원하지 않는 필드는 쓰지 않는다(Kiro effort, 값이 정해지지 않은 Codex·Kiro 모델). |
| MR-R6 | `light` 등급 작업이 두 번 실패하거나 결과에 `확신: 낮음`이 있으면 위임한 세션은 한 등급 위 모델로 한 번 더 맡긴다. `locked` 역할에는 이 규칙을 쓰지 않는다. |
| MR-R7 | 개인 층은 잠기지 않은 분류의 등급만 바꿀 수 있다. `locked` · 등급 정의 · `flow.gates`를 바꾸는 개인 설정은 무시하고 doctor가 경고한다. |
| MR-R8 | 킷 스킬은 `context: fork`가 아닌 한 `model` · `effort` 머리 필드를 두지 않는다. |
| MR-R9 | 진입 파일(AGENTS.md + CLAUDE.md)이 24,576바이트를 넘으면 `verify.sh fast`와 doctor가 경고한다. |
| MR-R10 | 위임 역할의 결과가 `limits.subagentResultMaxChars`를 넘으면 SubagentStop 훅이 끝내기를 막고 줄여 다시 끝내라고 알린다(Claude). |
| MR-R11 | 사용량 측정은 기본 꺼짐이다. 켜면 토큰 수만 모으고 대화 내용은 모으지 않는다. |
| MR-R12 | 구현·설계·리뷰 세션에 설정된 모델과 effort는 어떤 하네스 동작 전후에도 같다(시험). |

## 3. 설계

### 3.1 바꾸지 않는 대상

사람이 연 세션(구현 · 설계 · 리뷰 · 문서, 대화형이든 사람이 띄운 `claude -p`든)의 모델·effort는 그 사람이 정한다. 하네스는 아래 키를 어느 설정 층에도 쓰지 않는다. 03의 병합 엔진이 이 목록을 금지 키로 갖고, 모듈·팩의 `settings` 선언에 이 키가 있으면 거부한다.

| 하네스 | 금지 키 | 이유 |
|---|---|---|
| Claude | `model` · `effortLevel` · `modelSettings` · `maxEffortLevel` · `fallbackModel` · `availableModels` · `advisorModel` | 세션 시작 모델·effort를 바꾸거나 제한한다. 프로젝트 설정의 `effortLevel`은 모든 모델에 적용된다 |
| Claude `env` | `ANTHROPIC_MODEL` · `ANTHROPIC_DEFAULT_*_MODEL` · `CLAUDE_CODE_EFFORT_LEVEL` · `MAX_THINKING_TOKENS` · `CLAUDE_CODE_SUBAGENT_MODEL` · `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` · `CLAUDE_CODE_SUBAGENT_EFFORT` | 앞의 셋은 세션을, 뒤의 셋은 모델·effort를 적지 않은 위임(= locked 역할)까지 바꾼다 |
| Codex `.codex/config.toml` | 최상위 `model` · `model_reasoning_effort` · `model_reasoning_summary` · `model_verbosity` · `model_provider` · `profile` · `[profiles.*]`, `[agents]`의 `default_subagent_model` · `default_subagent_reasoning_effort` | 앞은 세션을, 뒤는 모델을 적지 않은 위임(locked 역할)을 바꾼다 |
| Kiro | 사용자·작업 공간 기본 모델 설정, 프로젝트 주 에이전트(`.kiro/agents/<slug>.json`)의 `model` | 주 에이전트는 사람이 여는 세션이 쓰는 설정이다 |

사람이 이미 이 키를 프로젝트 설정에 넣어 두었으면 킷은 그 값을 그대로 둔다(병합은 킷 키만 넣고 뺀다). doctor는 아래 사용자 환경이 라우팅을 끄는지 알리기만 한다.

- `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`: 역할 파일의 `model`이 무시된다.
- `CLAUDE_CODE_EFFORT_LEVEL`: 역할 파일의 `effort`보다 앞선다.

### 3.2 작업 분류와 등급

위임은 세 경로뿐이다: 위임 역할(subagent), 그 역할로 도는 보조 작업, 읽기 전용 점검. 킷은 모델 프로세스를 직접 띄우지 않는다(관리 페이지도 세션에 요청만 보낸다, 06 §3.10).

| 분류 | 하는 일 | 역할 원본 | 기본 등급 |
|---|---|---|---|
| `explore` | 정의·호출 경로·영향 범위 찾기 | `explorer` | `light` |
| `docs-research` | 공식 문서로 동작 확인, 출처 URL·버전 | `docs-researcher` | `standard` |
| `plan-draft` | tasks 초안(범위·의존·파일 소유권) | `planner` | `standard` |
| `summarize` | 긴 출력(로그·diff·검증 결과) 요약 | `summarizer`(새로) | `light` |
| `skills-summary` | 스킬 목록·지도 해석 결과 설명 | `summarizer` | `light` |
| `draft-docs` | 변경 기록·인수인계·릴리스 노트 초안 | `documenter`(새로) | `light` |
| `triage` | SARIF·로그 발견 묶기, 오탐 근거 찾기 | `triager`(새로) | `standard` |
| `check-readonly` | 링크·형식·추적 누락 같은 읽기 점검 | `checker`(새로) | `light` |
| `implement` | 배정 파일 구현(RED → GREEN) | `worker` | `inherit`(locked) |
| `design` | 설계 문서·기획물 | `designer`(08) | `inherit`(locked) |
| `review` | 정확성·보안·회귀 검토 | `reviewer` | `inherit`(locked) |

관리 페이지에서 시작하는 요약(예: 리뷰 발견 요약)은 그 이슈 세션에 요청을 보내고, 세션이 `summarizer` 역할에 위임한다.

### 3.3 `.agents/model-policy.json`

```json
{
  "schema": "knots-sync.model-policy/v1",
  "locked": ["implement", "design", "review"],
  "classes": {
    "explore": "light", "summarize": "light", "skills-summary": "light",
    "draft-docs": "light", "check-readonly": "light",
    "docs-research": "standard", "plan-draft": "standard", "triage": "standard",
    "implement": "inherit", "design": "inherit", "review": "inherit"
  },
  "tiers": {
    "light":    { "claude": { "model": "haiku",  "effort": "low" },
                  "codex":  { "model": null, "model_reasoning_effort": "low" },
                  "kiro":   { "model": null } },
    "standard": { "claude": { "model": "sonnet", "effort": "medium" },
                  "codex":  { "model": null, "model_reasoning_effort": "medium" },
                  "kiro":   { "model": null } },
    "deep":     { "claude": { "model": "opus",   "effort": "high" },
                  "codex":  { "model": null, "model_reasoning_effort": "high" },
                  "kiro":   { "model": null } }
  },
  "escalation": { "failuresBeforeEscalate": 2, "onLowConfidence": true, "ceiling": "deep", "maxEscalations": 1 },
  "limits": { "subagentResultMaxChars": 6000, "entryFileMaxBytes": 24576, "sessionStartMaxChars": 4000, "contextWarnBytes": 40960 }
}
```

- `inherit`는 등급이 아니라 "아무것도 쓰지 않음"이다. Claude는 `model: inherit`만 쓰고 `effort`는 쓰지 않는다. Codex는 두 필드 모두 쓰지 않는다. Kiro는 `model`을 쓰지 않는다.
- 값이 `null`인 필드는 쓰지 않는다. Codex·Kiro의 모델 ID는 계정·버전마다 달라 킷 기본값을 두지 않고 팀이 채운다. Claude는 별칭(`haiku` · `sonnet` · `opus`)을 써서 새 버전으로 자동으로 따라간다.
- 층: 킷 기본값(주인 kit) → 회사 팩 → 프로젝트 순으로 덮는다(04). `locked`는 위 층이 더할 수만 있고 뺄 수 없다(하한 = 킷의 세 항목).

### 3.4 역할 원본 머리

03 §3.6의 머리에 필드를 더한다.

```yaml
---
name: explorer
description: 코드·설정에서 정의·호출 경로·영향 범위를 근거 줄과 함께 찾아야 할 때 쓴다. 읽기 전용이다.
mode: read-only
tools: [read, search]
class: explore                 # 분류 → policy.classes → 등급
# tier: standard               # 분류 대신 등급을 바로 적는다(선택)
# model:  { claude: sonnet }   # 하네스별 직접 지정(선택, 등급보다 앞선다)
# effort: { claude: medium, codex: medium }
summary: |
  출력: 질문 → 근거(경로:줄) → 결론 → 미확인 → 확신(높음 · 보통 · 낮음). 6,000자 이하.
---
```

해석 순서: 직접 지정(`model` · `effort`) → `tier` → `class`의 정책 등급 → 없으면 `inherit`. `class`가 `locked`에 들어 있거나 역할이 `worker` · `reviewer` · `designer`면 locked로 본다(MR-R3).

### 3.5 하네스별 생성

| 하네스 | 파일 | 쓰는 필드 | 지원 근거 |
|---|---|---|---|
| Claude | `.claude/agents/<이름>.md` 머리 | `model`: `haiku` · `sonnet` · `opus` · `fable` · 전체 모델 ID · `inherit`. `effort`: `low` · `medium` · `high` · `xhigh` · `max`(모델마다 지원 범위가 다르다) | Subagents 문서의 지원 필드 표. 둘 다 생략하면 세션 모델, 세션 effort를 따른다 |
| Codex | `.codex/agents/<이름>.toml` | `model`, `model_reasoning_effort`(`low` · `medium` · `high` · `xhigh` · `max` · `ultra`, 뒤 셋은 모델이 지원할 때만) | Codex Subagents 문서. 둘 다 생략하면 부모 세션 값을 따른다(`[agents]` 기본값이 없을 때) |
| Kiro | `.kiro/agents/<이름>.json` | `model`(Kiro 모델 서비스가 돌려주는 ID). effort 필드는 없다 | Kiro 설정 문서. 생략하면 기본 모델. 없는 ID면 첫 프롬프트가 실패하고 다른 모델로 바꾸지 않는다 |

생성 예(explorer, `light`):

```text
.claude/agents/explorer.md            .codex/agents/explorer.toml            .kiro/agents/explorer.json
---                                   name = "explorer"                      { "name": "explorer", …
name: explorer                        description = "…"                        (model 없음: 정책 값이 null)
description: …                        model_reasoning_effort = "low"         }
tools: Read, Glob, Grep               developer_instructions = """…"""
model: haiku
effort: low
---
```

locked 예(worker): Claude 머리에 `model: inherit`만, Codex·Kiro에는 모델 관련 줄 0개.

```text
render(role, harness):
  r = resolve(role)                         # §3.4
  if r.locked:
     if role에 tier·model·effort 있음: error "locked 역할에 모델을 지정할 수 없다"(MR-R3)
     return {claude: {model: "inherit"}, codex: {}, kiro: {}}[harness]
  t = policy.tiers[r.tier][harness]
  fields = {k: v for k, v in (r.direct[harness] or t).items() if v is not null}
  if harness == kiro: fields.pop("effort")  # MR-R5
  return fields
```

킷 스킬 규칙(MR-R8): Claude 스킬 머리의 `model` · `effort`는 "그 턴의 나머지"에 적용된다(Skills 문서). `context: fork`가 아닌 스킬에 넣으면 사람이 고른 세션 모델이 그 턴 동안 바뀐다. 보조 작업 스킬은 `context: fork` + `agent: <역할 이름>`으로 두고 모델은 역할 파일이 정한다. `check_layout.py`가 `.agents/skills/*/SKILL.md`에서 이 규칙을 검사한다.

### 3.6 한 등급 올리기

`.agents/rules/model-routing.md`(정책에서 생성, 주인 kit)가 위임하는 세션에 지시한다.

- 실패 = 역할이 오류로 끝남, 또는 결과가 역할 출력 형식을 어김(예: explorer 결과에 `경로:줄` 근거가 0개), 또는 결과 끝 `확신: 낮음`.
- `light` 분류가 같은 작업에서 두 번 실패하면 한 등급 위로 한 번 더 맡긴다. `escalation.maxEscalations`는 1이고 `ceiling` 위로는 올리지 않는다.
- Claude: Agent 도구 호출의 `model` 인자(호출별 값이 역할 파일보다 앞선다)로 위 등급 모델을 준다. effort는 역할 파일 값 그대로다(§6).
- Codex: 위임할 때 명시 값(모델·effort)을 준다(명시 값이 `[agents]` 기본값과 역할 파일보다 앞선다).
- Kiro: 호출별 모델 지정이 없어 올리지 않고, 사람에게 "light 위임이 두 번 실패했다"를 보고한다.
- locked 역할(`worker` · `reviewer` · `designer`)은 다시 맡길 때도 `model` 인자를 주지 않는다(MR-R6).

### 3.7 개인 층

`.agents/local/model-policy.local.json`(커밋 안 함):

```json
{ "classes": { "explore": "standard", "draft-docs": "standard" } }
```

- 받는 키는 `classes`뿐이고, 값은 `light` · `standard` · `deep`, 대상은 locked가 아닌 분류뿐이다. 다른 키·locked 분류는 무시하고 doctor가 경고한다(MR-R7).
- 역할 파일은 커밋하는 생성물이라 개인 값으로 다시 생성하지 않는다(사람마다 파일이 달라진다). 대신 세션 시작 훅이 개인 값을 한 줄로 알린다: `개인 설정: explore → standard(Agent 호출 때 model: sonnet).` 위임하는 세션은 이 값을 호출별 `model` 인자로 쓴다. Kiro는 호출별 지정이 없어 개인 층이 적용되지 않는다고 doctor가 알린다.

### 3.8 그 밖의 토큰 절감

| 장치 | 내용 | 강제 |
|---|---|---|
| 진입 파일 크기 | AGENTS.md + CLAUDE.md 24,576바이트 이하(knots 61KB). 규칙 본문은 `.agents/rules/`에 두고 `paths`로 경로별 자동 로드한다(03 §3.2: Claude `.claude/rules` · Cursor `.mdc` · Kiro `fileMatch`). 진입 파일에는 꼭 지킬 가드레일과 목차만 둔다. 경로별 규칙은 그 파일을 다룰 때만 실려 늘 싣는 양에 들지 않는다 | fast·doctor 경고(MR-R9) |
| 요약 출력 | `verify.sh`·`/kns-scan`의 화면 출력은 40줄 이하(분석기·단계마다 한 줄, 실패 꼬리 15줄). 전체는 `.agents/state/verify-last.json`·`.agents/reports/`에. Stop 훅은 요약만 넘긴다(지금 `verify_summary.py`의 한도 유지). 계약 §7에 `--summary` 인자를 더할지는 §6 | 시험: 요약 출력 줄 수 |
| 위임 결과 크기 | 역할 출력 형식에 6,000자 한도. Claude SubagentStop 훅이 마지막 응답 길이를 보고 넘으면 끝내기를 막고(exit 2) "결론·근거만 남겨 6,000자 이하로 다시 끝낸다"를 준다 | 훅(MR-R10). Codex·Kiro는 규칙 문장만 |
| 상시 컨텍스트 경고 | doctor가 세션마다 실리는 양(진입 파일 + `paths` 없는 규칙 + 세션 시작 출력 + 스킬 설명 합계)을 바이트로 보여 주고 40,960을 넘으면 경고. 합계는 lock의 `owner`별(킷 · 팩 · 사람 · `external:aidlc` · `external:entire` …)로 나눠 보인다(10 §3.7) | doctor |
| 세션 시작 출력 | 합계 2,560바이트 이하(README 원칙 10). 고정 안내 1,024 · 단위 안내(`session-context.md`) 1,024 · 바뀌는 상태(세션 · 공지 · 점유 · 대기함) 512. 대기함은 건수와 확인 명령 한 줄만 싣는다(06 §3.10). 기준선은 v1.0.8 knots 실측 약 2.4KB(고정 1,480 + 단위 882 + 세션 상태 줄)이고, v2가 더하는 상태 줄은 고정 안내를 줄여 그 안에 넣는다 | 훅 자르기 · 시험: 출력 바이트 |
| 캐시 친화 순서 | 매 세션 같은 바이트가 앞에 오게 한다. AGENTS.md → CLAUDE.md 고정 절 → 규칙 목차 순서는 고정이고, 생성 파일은 정렬·시각 없음(같은 원본 → 같은 바이트). 바뀌는 상태(세션 목록·공지·대기함·날짜)는 세션 시작 출력 끝에만 둔다 | 시험: 같은 원본으로 두 번 생성한 파일 바이트가 같다 |
| 전체 검증 금지 | 에이전트 세션의 `--full`은 훅이 막는다(D10, 01) | 훅 |
| 스킬 설명 길이 | 킷 스킬 `description` 300자 이하(스킬 목록이 세션마다 실린다) | `check_layout.py` |
| MCP 서버 | 킷은 MCP 서버를 기본으로 켜지 않는다(서버마다 도구 정의가 실린다) | 설치 목록 |

### 3.9 역할별 사용량 측정

기본은 꺼짐이다(MR-R11). `knots-sync.json`의 `metrics.tokens`: `"off"`(기본) · `"hooks"` · `"otel"`.

`hooks` 방식(Claude):

```text
SubagentStop 훅(입력: session_id, agent_id, agent_type, transcript_path, effort …)
  위임 대화 기록에서 assistant 메시지의 usage 합계와 model을 읽는다(읽는 곳은 §6)
  .agents/state/usage/<session_id>.jsonl 에 한 줄 덧붙인다
Stop · SessionEnd 훅
  주 세션 대화 기록의 usage 합계를 같은 파일에 덧붙인다(role = 세션 등록의 role)
```

```json
{ "schema": "knots-sync.usage/v1", "at": "2026-11-23T10:40:02+09:00", "session": "4f0c2d1e",
  "harness": "claude", "scope": "subagent", "agent": "explorer", "class": "explore", "tier": "light",
  "model": "claude-haiku-…", "effort": "low",
  "tokens": { "input": 18230, "output": 2104, "cacheRead": 120400, "cacheCreation": 9100 } }
```

- 토큰 수·모델·역할만 남긴다. 메시지 내용·도구 입력·경로는 남기지 않는다. 파일은 0600, 커밋 안 함, 내보내기 제외(06 §3.12).
- 대화 기록은 리포 밖(`~/.claude/projects/…`)에 있다. 원칙 7(사용자 폴더는 스킬 목록을 만들 때만 읽는다)에 예외가 하나 더 생기므로, 이 방식은 사람이 켜야 하고 훅은 하네스가 넘겨준 자기 세션 기록 경로만 읽는다.

`otel` 방식: 사람이 `CLAUDE_CODE_ENABLE_TELEMETRY=1`과 OTLP 수집기를 자기 환경에 둔다(킷은 설정에 쓰지 않는다). `claude_code.token.usage`(속성 `type` · `model` · `query_source` · `agent.name`)와 `claude_code.cost.usage`를 수집기가 `.agents/state/otel/` 아래 JSON 줄로 내보내게 하면 대시보드가 읽는다. 문서상 `agent.name`은 사용자 정의 에이전트 이름을 `custom`으로 바꾸므로 킷 역할별로 나누지 못한다. 역할별 보고는 `hooks` 방식이고, `otel`은 세션 합계·비용용이다.

하네스 탭 보고(06 `GET /harness`의 `usage`):

| 열 | 값 |
|---|---|
| 역할 · 분류 · 등급 | `worker` · implement · inherit / `explorer` · explore · light … |
| 호출 수 | 기간 안 SubagentStop 수(주 세션은 세션 수) |
| 입력 · 출력 · 캐시 읽기 · 캐시 쓰기 토큰 | 합계와 호출당 중앙값 |
| 캐시 읽기 비율 | cacheRead ÷ (input + cacheRead + cacheCreation) |
| 비용 | `otel`의 `claude_code.cost.usage`가 있으면 그 값, 없으면 "토큰만" |
| 올리기 횟수 | §3.6으로 한 등급 올린 위임 수(훅이 호출별 `model`과 역할 기본 모델 차이로 센다) |

Codex·Kiro 세션의 사용량은 자료 출처를 확인한 뒤 붙인다(§6). 그 전까지 표에 "자료 없음"으로 보인다.

### 3.10 바꾸지 않음 시험(MR-R12)

fixture 리포에 사람이 정한 값을 미리 둔다.

```text
.claude/settings.local.json   { "model": "opus", "effortLevel": "high" }
.claude/settings.json         { "model": "sonnet" }                       # 팀이 정한 값
.codex/config.toml            model = "<팀 모델>"  model_reasoning_effort = "high"
.kiro/agents/<slug>.json      "model": "<팀 모델>"
환경                           CLAUDE_CODE_EFFORT_LEVEL 없음
```

동작 목록: `init --adopt` · `update` · `add`/`remove`(jira-workflow · multi-harness · aidlc stub · entire stub) · `repair` · `uninstall` · 세션 시작·프롬프트 제출·Stop·SubagentStop 훅 실행 · 관리 페이지 저장·승인·요청.

판정: 동작마다 전후로 §3.1 금지 키 값 전부를 읽어 비교한다(파일 sha256이 아니라 키 값). 하나라도 다르면 실패. 생성된 `worker`·`reviewer`·`designer` 역할 파일은 Claude `model: inherit` · effort 없음, Codex·Kiro 모델 관련 필드 0개다.

## 4. 버린 대안과 이유

| 대안 | 버린 이유 |
|---|---|
| 단계에 따라 주 세션 모델을 바꾼다(문서 단계는 haiku 등) | 사람이 정한 개발 모델을 바꾸지 않는다는 요구와 정면으로 어긋난다 |
| `CLAUDE_CODE_SUBAGENT_MODEL`·Codex `default_subagent_model`로 한 번에 낮춘다 | 모델을 적지 않은 위임 전부에 걸려 locked 역할(구현·리뷰)까지 바뀐다 |
| 개인 등급으로 역할 파일을 다시 생성 | 커밋하는 생성물이 사람마다 달라져 diff가 생긴다. 호출별 인자로 대신한다 |
| 실행 중에 모델로 작업을 분류해 라우팅 | 분류에 토큰이 든다. 분류는 역할 원본에 한 번 적는다 |
| 전체 모델 ID를 기본값으로 | 모델 버전이 나올 때마다 킷 patch가 필요하다. Claude는 별칭을 쓰고, 별칭이 없는 하네스는 팀이 채운다 |
| 스킬 머리에 `model`을 넣어 보조 작업을 가볍게 | fork가 아닌 스킬은 주 세션의 그 턴 모델을 바꾼다 |
| OpenTelemetry만으로 역할별 보고 | 사용자 정의 에이전트 이름이 `custom`으로 바뀌어 역할을 나누지 못한다 |

## 5. 완료 기준

1. §3.10 시험: 모든 동작 전후로 구현·설계·리뷰 세션에 설정된 모델과 effort(금지 키 값 전부)가 같다.
2. 생성 시험: `explorer`(light)는 Claude 머리에 `model: haiku` · `effort: low`, Codex에 `model_reasoning_effort = "low"`이고 `model` 줄 0개, Kiro에 `model` 키 0개. `worker`는 Claude `model: inherit`만, Codex·Kiro 모델 관련 필드 0개.
3. `worker` 원본에 `tier: light`를 넣으면 `repair`가 오류로 끝나고 doctor가 오류 1건을 보고한다.
4. 개인 층에 `"classes": {"implement": "light"}`와 `"locked": []`를 넣으면 둘 다 무시되고 doctor 경고 2건. `"explore": "standard"`는 세션 시작 출력에 한 줄로 나온다.
5. 모듈·팩의 `settings`에 `effortLevel`을 넣은 fixture를 `add`하면 거부한다.
6. `.agents/skills/*/SKILL.md` 중 `context: fork` 없이 `model`을 둔 fixture를 `check_layout.py`가 실패시킨다.
7. 진입 파일 25,000바이트 fixture에서 `verify.sh fast`가 경고 1건. 같은 원본으로 두 번 생성한 하네스 파일의 sha256이 모두 같다.
8. Claude 세션에서 6,000자를 넘는 결과를 낸 위임 역할이 SubagentStop 훅으로 한 번 더 돌고 6,000자 이하로 끝난다(수동 점검 1회).
9. `metrics.tokens: "hooks"`로 위임 10회를 한 뒤 하네스 탭에 역할별 호출 수 합계 10이 보이고, `.agents/state/usage/`에 메시지 내용 문자열이 0건이다(심은 표지 문자열 grep).
10. 같은 작업 묶음(fixture 리포에서 explore 20회 · summarize 10회)을 정책 전후로 돌려 위임 역할 입력+출력 토큰 합계를 기록한다. 줄어든 비율을 릴리스 노트에 적는다(목표값은 첫 측정 뒤 정한다).

## 6. 확인 필요

| 항목 | 확인 방법 |
|---|---|
| Claude Agent 도구 호출에 effort 인자가 있는지(문서는 `model` 인자만 우선순위 1로 적는다) | Agent 도구 입력 스키마를 시험 세션에서 확인 |
| SubagentStop 입력에 위임 대화 기록 경로가 있는지(`agent_transcript_path` 등), 없으면 위임 사용량을 어디서 읽는지 | Hooks 문서 SubagentStop 절 전체를 읽고 시험 훅으로 입력을 기록 |
| SubagentStop exit 2로 결과 길이를 줄이게 하는 동작이 결과 대신 피드백을 붙이는지 | 시험 세션에서 긴 결과를 내는 역할로 확인 |
| `query_source`가 사용자 정의 에이전트 이름을 그대로 담는지(OTel 역할별 보고 가능 여부) | 콘솔 exporter로 위임 1회를 기록해 본다 |
| Codex `sandbox_mode`가 역할 파일에서 적용되는지. Codex 문서는 역할 파일의 `sandbox_mode`가 부모 설정을 덮지 않는다고 적는데, 03 §3.6은 이 필드로 읽기 전용을 만든다 | Codex 시험 세션에서 read-only 역할이 파일을 쓸 수 있는지 본다. 안 되면 03의 읽기 전용 방법을 바꾼다 |
| Codex `config.toml`의 `[agents.<이름>] config_file` 방식이 지금 문서의 `.codex/agents/*.toml` 자동 발견과 어떻게 겹치는지 | Codex 문서와 시험 세션 |
| Kiro 위임 에이전트가 `model` 생략 시 부모 세션 모델을 따르는지 기본 모델을 쓰는지 | Kiro CLI에서 `/model`을 바꾼 세션으로 위임해 본다 |
| Codex·Kiro 사용량 자료(세션 로그 위치·형식) | 각 하네스 문서와 로그 폴더 확인. 리포 밖 읽기라 `metrics.tokens`를 켠 경우에만 |
| 계약 §7에 `verify.sh --summary`를 더할지(지금은 Stop 훅이 요약 모듈을 직접 쓴다) | 01·02와 정한다 |
