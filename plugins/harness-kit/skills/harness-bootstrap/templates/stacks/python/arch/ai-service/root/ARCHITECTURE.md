<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}} 치환 후 사용. 스택: Python 백엔드(ASGI) · 아키텍처: ai-service -->

# ARCHITECTURE — {{PROJECT_NAME}} (AI 서비스)

이 문서는 `{{PROJECT_NAME}}`의 **기술 아키텍처 원본**이다. 진입 가이드는 `./AGENTS.md`·`./CLAUDE.md`, 빌드·실행 상세는 `./README.md`와 `.agents/rules/tech.md`를 본다.

본 프로젝트는 LLM 파이프라인을 1급 구성요소로 다루는 AI 서비스 레이아웃을 Python **src 레이아웃** 위에서 구현한다.
일반 백엔드와 다른 점은 하나다: 모델 호출은 비결정적이고, 비용이 들고, 조용히 품질이 나빠진다.
그래서 이 아키텍처는 세 가지를 구조로 강제한다 — ① 프롬프트를 버전 관리 자산으로, ② 프로바이더를 어댑터 뒤로, ③ 평가(eval)를 회귀 게이트로.
경계는 import 계약 린터(import-linter) + 타입 체커(mypy strict) + 린터(Ruff) 가 검증 게이트에서 막는다.

스택 기준(버전 기준은 `pyproject.toml` + lock 파일 단일 소스 — 구체 버전은 예시이며 프로젝트에서 최신 안정 버전으로 확정):
Python 3.12+ · FastAPI(ASGI) · Pydantic v2(경계·구조화 출력) · 벡터/검색 저장소(선택) · uv(또는 Poetry) · Ruff · mypy · pytest · import-linter.
LLM 프로바이더 SDK는 **`llm/` 어댑터 안에서만** 쓴다(§3.2 계약이 강제).

---

## 0. 이 변형을 언제 쓰나 (선택 기준)

**쓴다:**
- 제품의 핵심 동작이 **모델 호출**이다(생성·요약·분류·추출·에이전트 실행).
- 프롬프트·검색 인덱스·모델 버전이 **자주 바뀌고**, 바뀔 때마다 품질 회귀가 걱정된다.
- 토큰 비용·지연이 실제 운영 지표이고 누군가 매주 들여다본다.
- RAG·도구 호출·멀티스텝 파이프라인 중 하나 이상이 있다.

**쓰지 않는다:**
- 모델 호출이 부가 기능 한둘뿐이다(그냥 `hexagonal`·`layered`의 어댑터 하나로 충분하다).
- 평가 데이터셋을 만들 생각이 없다 — 그렇다면 이 구조의 핵심 이득(회귀 게이트)이 사라진다.
- 배치 학습·모델 훈련이 주 관심사다(서빙 아키텍처가 아니라 학습 파이프라인이 필요하다).

**승격/강등 신호:**
1. `evaluation/`이 비어 있고 6개월째 안 채워진다 → 이 변형이 과하다. `layered`로 내린다.
2. 프롬프트를 고칠 때마다 수동으로 몇 개 던져보고 배포한다 → 게이트가 없다는 뜻. 먼저 골든 데이터셋을 만든다.
3. 에이전트가 늘어 도메인 경계가 여러 개로 갈린다 → `modular`의 모듈 개념을 이 레이아웃에 얹는다(§12).

전환 절차는 §12.

---

## 1. 아키텍처 원칙 (요약)

| 원칙 | 강제 수단 | 위반 시 |
|---|---|---|
| 레이어 단방향 (api→pipelines→agents→llm·retrieval→domain) | `import-linter` layers 계약 | `lint-imports` 실패 → 게이트 차단 |
| **프로바이더 SDK는 `llm/` 안에서만** | `import-linter` forbidden 계약 | 게이트 차단 |
| `domain`·`prompts`는 프로바이더·프레임워크 무의존 | `import-linter` forbidden 계약 | 게이트 차단 |
| 구조화 출력은 스키마로 검증 | Pydantic 모델 파싱 + 실패 시 재시도/폴백 | 런타임 차단 |
| 프롬프트 변경은 eval 통과 필요 | `evaluation/` 회귀 게이트(§6) | 리뷰 차단 |
| 토큰·비용·지연 계측 | `observability/`의 호출 래퍼(계측 없는 직접 호출 금지) | 코드리뷰·구조 테스트 차단 |
| 타입 계약 준수 | `mypy --strict` | 게이트 차단 |
| 테스트 우선 (TDD) | RED→GREEN→REFACTOR. 커버리지 ≥ 80%(domain·pipelines 우선) | `pytest --cov-fail-under` 게이트 |

> 기계적 강제 우선. "프롬프트를 신중히 관리하자"는 규율은 지켜지지 않는다. 계약 + eval 게이트가 지킨다.

---

## 2. 시스템 경계

```
 ┌──────────┐        ┌──────────────────────┐
 │ Client   │───────▶│  {{PROJECT_NAME}}     │
 │(Web/API) │        │  (ASGI 애플리케이션)   │
 └──────────┘        └──────────┬───────────┘
                                │
     ┌───────────┬──────────────┼───────────────┬──────────────┐
     ▼           ▼              ▼               ▼              ▼
┌──────────┐┌──────────┐ ┌─────────────┐ ┌────────────┐ ┌────────────┐
│ LLM      ││ 벡터/검색 │ │ 관계형 DB    │ │ Cache/Queue│ │ 외부 도구   │
│ 프로바이더││  인덱스   │ │ (대화·감사)  │ │  (선택)     │ │ (선택)      │
└──────────┘└──────────┘ └─────────────┘ └────────────┘ └────────────┘
```

- LLM 프로바이더는 외부 시스템이다. 느리고, 실패하고, 요금이 붙고, 버전이 바뀐다 — DB보다 훨씬 불안정한 의존으로 취급한다(타임아웃·재시도·폴백·회로 차단).
- 애플리케이션 인스턴스는 **무상태**. 대화 상태·캐시는 외부 저장소에 둔다.
- 긴 생성은 **스트리밍(SSE)** 으로 내보내고, 배치·색인은 요청 경로 밖 워커로 분리한다.

---

## 3. 패키지 구조 (src 레이아웃)

```
        ┌──────────────────────────────────────────────────────┐
        │ bootstrap/  app factory · DI 조립 · 설정               │
        └───────────────────────┬──────────────────────────────┘
        ┌───────────────────────▼──────────────────────────────┐
        │ api/        HTTP 경계 · 스트리밍 · 요청 스키마          │
        └───────────────────────┬──────────────────────────────┘
        ┌───────────────────────▼──────────────────────────────┐
        │ pipelines/  다단계 오케스트레이션 · 분기 · 재시도 정책  │
        └───────────────────────┬──────────────────────────────┘
        ┌───────────────────────▼──────────────────────────────┐
        │ agents/     에이전트 루프 · 도구 등록 · 정지 조건       │
        └──────────┬─────────────────────────┬─────────────────┘
     ┌─────────────▼──────────┐   ┌──────────▼─────────────┐
     │ llm/  프로바이더 어댑터 │   │ retrieval/  검색·색인   │   서로 모른다(형제)
     │  (SDK 는 여기서만)      │   │  청킹·임베딩·랭킹       │
     └─────────────┬──────────┘   └──────────┬─────────────┘
                   └────────────┬────────────┘
        ┌───────────────────────▼──────────────────────────────┐
        │ domain/     순수 규칙 · 정책 · 값 타입(프레임워크 0)   │
        └──────────────────────────────────────────────────────┘

  가로지르는 것:  prompts/(자산)   observability/(계측)   common/·core/(공유 토대)
  게이트 밖:      evaluation/(골든 데이터셋 · 채점 · 기준선)
```

### 3.1 패키지 ↔ 책임

| 패키지 | 책임 | 의존 가능 |
|---|---|---|
| `bootstrap` | app factory·DI 조립·settings·lifespan | 전부(조립 목적) |
| `api` | HTTP 경계·요청/응답 스키마·스트리밍·인증 | `pipelines`, `common`, `core` |
| `pipelines` | 다단계 흐름(검색→생성→검증), 분기·재시도·폴백 정책 | `agents`, `llm`, `retrieval`, `domain`, `observability` |
| `agents` | 에이전트 루프·도구 등록·정지 조건·턴 예산 | `llm`, `retrieval`, `prompts`, `domain`, `observability` |
| `llm` | **프로바이더 어댑터**(SDK는 여기서만) · 구조화 출력 파싱 · 토큰 계측 | `prompts`, `domain`, `observability`, `core` |
| `retrieval` | 청킹·임베딩·색인·검색·리랭킹 | `domain`, `observability`, `core` |
| `prompts` | **프롬프트 자산 + 로더**(텍스트·버전·변수 스키마) | `core` |
| `domain` | 순수 규칙·정책·값 타입(예: 허용 도구, 인용 규칙) | `core` |
| `observability` | 토큰·비용·지연·트레이스 계측 · 구조화 로깅 | `core` |
| `common` | envelope·error_code·exception handler·미들웨어 | `core` |
| `core` | 예외 계층·상수·공용 타입 | — (stdlib만) |
| `evaluation` | 골든 데이터셋·채점기·기준선 비교(§6) | 전부(테스트 측) |

- **의존 금지(게이트 차단)**: `llm ↔ retrieval`(형제), 하위 레이어 → 상위 레이어, `domain`·`prompts` → 프로바이더 SDK·웹 프레임워크, `api`·`agents`·`pipelines`·`retrieval` → 프로바이더 SDK.
- `agents`와 `pipelines`의 구분: 흐름이 코드로 결정되면 `pipelines`, 모델이 다음 행동을 고르면 `agents`. 둘을 섞으면 디버깅이 불가능해진다.

### 3.2 import-linter 계약 (컴파일 강제의 대체물)

`pyproject.toml`에 계약을 선언하고 `scripts/verify.sh`가 `lint-imports`를 호출한다.

```toml
[tool.importlinter]
root_packages = ["{{PACKAGE_NS}}"]

# (1) 레이어 단방향. llm 과 retrieval 은 형제(서로 import 금지)
[[tool.importlinter.contracts]]
name = "레이어 단방향"
type = "layers"
layers = [
  "{{PACKAGE_NS}}.api",
  "{{PACKAGE_NS}}.pipelines",
  "{{PACKAGE_NS}}.agents",
  "{{PACKAGE_NS}}.llm : {{PACKAGE_NS}}.retrieval",
  "{{PACKAGE_NS}}.domain",
]

# (2) 도메인·프롬프트는 프로바이더 SDK 와 웹 프레임워크를 모른다
#     forbidden_modules 는 프로젝트가 실제로 쓰는 SDK 패키지명으로 교체한다.
[[tool.importlinter.contracts]]
name = "domain·prompts 는 프로바이더 무의존"
type = "forbidden"
source_modules = ["{{PACKAGE_NS}}.domain", "{{PACKAGE_NS}}.prompts"]
forbidden_modules = ["<provider_sdk>", "fastapi", "starlette", "sqlalchemy"]

# (3) 프로바이더 SDK 는 llm 어댑터에서만 — 교체 가능성을 지키는 핵심 계약
[[tool.importlinter.contracts]]
name = "프로바이더 SDK 는 llm 패키지에서만"
type = "forbidden"
source_modules = [
  "{{PACKAGE_NS}}.api",
  "{{PACKAGE_NS}}.pipelines",
  "{{PACKAGE_NS}}.agents",
  "{{PACKAGE_NS}}.retrieval",
]
forbidden_modules = ["<provider_sdk>"]

# (4) 공유 토대는 상위 레이어를 모른다
[[tool.importlinter.contracts]]
name = "core·common·observability 는 상위를 모른다"
type = "forbidden"
source_modules = [
  "{{PACKAGE_NS}}.core",
  "{{PACKAGE_NS}}.common",
  "{{PACKAGE_NS}}.observability",
]
forbidden_modules = [
  "{{PACKAGE_NS}}.api",
  "{{PACKAGE_NS}}.pipelines",
  "{{PACKAGE_NS}}.agents",
  "{{PACKAGE_NS}}.llm",
  "{{PACKAGE_NS}}.retrieval",
]
```

> `bootstrap`·`evaluation`은 조립·테스트 측이라 (1)에서 제외한다. **새 레이어 패키지를 만들면 (1)에 등록**한다(등록 누락 = 강제 누락).
> `<provider_sdk>`는 실제 패키지명으로 바꾼다. 프로바이더가 둘 이상이면 전부 나열한다.

### 3.3 디렉터리 레이아웃

```
{{PROJECT_SLUG}}/
├── pyproject.toml              # 의존성·도구 설정 단일 소스(+ [tool.importlinter])
├── uv.lock                     # 잠금 파일(커밋 필수)
├── src/{{PACKAGE_NS}}/
│   ├── core/                   # 서드파티 0. 예외 계층·상수
│   ├── common/                 # envelope·error_code·exception handler·미들웨어
│   ├── domain/                 # 순수 규칙·정책·값 타입
│   ├── prompts/
│   │   ├── registry.py         #   프롬프트 로더(id·버전·변수 스키마 검증)
│   │   └── {{DOMAIN_EXAMPLE}}/answer/v3.md   # 프롬프트 = 버전 있는 자산
│   ├── llm/
│   │   ├── port.py             #   LLMClient Protocol(생성·구조화 출력·스트리밍)
│   │   ├── <provider>_adapter.py  #   SDK 는 여기서만
│   │   └── parsing.py          #   구조화 출력 파싱·복구
│   ├── retrieval/              # chunking·embedding·index·search·rerank
│   ├── agents/                 # 루프·도구 레지스트리·정지 조건·턴 예산
│   ├── pipelines/              # 다단계 흐름·분기·재시도·폴백
│   ├── observability/          # 토큰·비용·지연 계측·트레이스·구조화 로깅
│   ├── api/                    # 라우터·요청 스키마·스트리밍(SSE)
│   └── bootstrap/              # app factory·DI 조립·settings·lifespan
├── evaluation/
│   ├── datasets/               # 골든 데이터셋(입력 + 기대 속성)
│   ├── scorers/                # 채점기(규칙·모델 기반)
│   ├── baselines/              # 기준선 점수(커밋된 스냅샷)
│   └── run_eval.py             # 실행기 — CI/nightly 진입점
├── tests/{unit,integration,e2e,architecture}/
├── scripts/verify.sh           # 단일 검증 게이트
└── docs/
```

- src 레이아웃 필수: 설치된 패키지를 테스트하게 되어 "로컬에서만 import되는" 사고를 막는다.
- **`evaluation/`은 `src/` 밖**에 둔다. 배포 아티팩트가 아니고 데이터셋이 커지기 때문이다.
- 모든 패키지에 `__init__.py`를 둔다. `__init__.py`에는 재수출만, 로직·부작용 금지.

---

## 4. AI 고유 규약 (이 변형의 핵심)

### 4.1 프롬프트는 코드가 아니라 **버전 관리 자산**

- 프롬프트는 문자열 리터럴로 코드에 흩지 않는다. `prompts/<도메인>/<이름>/v<N>.md` 파일로 두고 **레지스트리를 통해 id + 버전으로 로드**한다.
- 프롬프트 파일에는 **변수 스키마**를 함께 선언하고 렌더링 시 검증한다(누락 변수가 조용히 빈 문자열이 되는 사고를 막는다).
- 기존 버전을 수정하지 않는다. 새 버전을 만든다. 배포 중인 요청과 새 요청이 같은 id로 다른 프롬프트를 쓰는 상황을 없앤다.
- 모든 응답 로그·트레이스에 `prompt_id` + `prompt_version` + `model` + `params`를 남긴다. 품질 회귀 조사가 가능해지는 최소 조건이다.
- **프롬프트 변경 PR은 eval 결과를 첨부**한다(§6). 프롬프트 변경은 코드 변경과 같은 무게다.

### 4.2 프로바이더는 어댑터 뒤로

- `llm/port.py`에 `typing.Protocol`로 계약을 선언하고, SDK 호출은 `llm/<provider>_adapter.py` 안에서만 한다(계약 (3)이 강제).
- 포트는 **능력 기준**으로 정의한다: `complete(...)` · `complete_structured(schema, ...)` · `stream(...)` · `embed(...)`. SDK 고유 파라미터를 시그니처에 그대로 노출하지 않는다.
- 모델 식별자·온도·최대 토큰 같은 파라미터는 **설정으로 주입**한다(코드에 하드코딩 금지). 모델 교체가 배포 없이 가능해야 한다.
- 프로바이더 오류는 `core`의 도메인 예외로 변환해 올린다(상위 레이어가 SDK 예외 타입을 알면 계약이 새어 나간다).

### 4.3 구조화 출력은 스키마로 강제

- 모델 출력을 자유 텍스트로 파싱하지 않는다. **Pydantic 모델로 스키마를 선언**하고 프로바이더의 구조화 출력 기능(또는 도구 호출)으로 받는다.
- 파싱 실패는 **정상 경로**다: 1회 재시도(오류 메시지를 되먹임) → 실패 시 폴백 또는 명시적 에러. 조용히 빈 값을 반환하지 않는다.
- 출력에 대한 **도메인 검증**(인용이 실제 검색 결과에 있는지, 허용 값인지)은 `domain`에서 순수 함수로 수행한다 — 모델을 믿지 않는다.

### 4.4 비결정성 통제

- 결정적이어야 하는 경로(분류·추출·라우팅)는 **temperature 0**(+ 프로바이더가 지원하면 seed 고정)으로 고정한다.
- 출력 문자열 스냅샷 테스트를 만들지 않는다. 모델이 바뀌면 전부 깨지고, 깨진 걸 무의미하게 갱신하게 된다.
  - 대신 **속성 기반 검증**을 쓴다: 스키마 준수 · 필수 필드 존재 · 인용 유효성 · 금지어 없음 · 길이 범위 · 분류 라벨 집합 소속.
- 단위 테스트에서는 **fake LLM 클라이언트**(포트 구현)를 쓴다. 실제 프로바이더를 부르는 테스트는 `evaluation/`과 소수의 e2e 스모크에만 둔다.

### 4.5 비용·지연 계측 (필수)

- 모든 모델 호출은 `observability/`의 계측 래퍼를 통과한다. 직접 SDK 호출 금지(구조 테스트가 검사).
- 호출마다 기록: `prompt_id`·`prompt_version`·`model`·입력/출력 토큰·**추정 비용**·지연·재시도 횟수·실패 사유.
- 요청 단위로 토큰 예산과 턴 예산을 둔다. 에이전트 루프는 예산 초과 시 정지하고 부분 결과를 반환한다(무한 루프·비용 폭주 차단).
- 대시보드 없이도 볼 수 있게 **구조화 로그 필드명을 고정**한다(`.agents/rules/reliability.md`와 동일한 필드 규약).
- 캐싱: 동일 입력의 재호출은 캐시한다(프롬프트 버전 + 모델 + 파라미터 + 입력 해시를 키로). 프롬프트 버전이 키에 들어가지 않으면 캐시가 오염된다.

### 4.6 에이전트 안전

- **도구 권한은 최소화**한다. 도구는 화이트리스트로 등록하고, 파괴적 도구(쓰기·외부 전송·결제)는 별도 승인 경로를 둔다.
- 모델 출력을 신뢰 입력으로 취급하지 않는다. 도구 인자는 스키마 검증 + 도메인 규칙 검증을 통과해야 실행된다.
- **프롬프트 인젝션 방어**: 검색 결과·사용자 입력은 시스템 지시와 구분된 영역에 넣고, "이전 지시를 무시하라" 류를 신뢰하지 않는다. 도구 실행 권한은 프롬프트가 아니라 코드가 결정한다.
- PII·비밀값은 프로바이더로 보내기 전에 마스킹한다. 무엇을 보냈는지 감사 로그에 남긴다(원문이 아니라 마스킹 후 형태로).
- 자세한 규약은 `.agents/rules/security.md`.

### 4.7 검색(RAG) 규약

- 색인 파이프라인은 재현 가능해야 한다: 청킹 전략·임베딩 모델·차원·정규화 방식을 버전으로 기록하고 인덱스 메타데이터에 남긴다.
- **임베딩 모델을 바꾸면 전체 재색인**이 필요하다. 혼합된 인덱스는 조용히 품질을 떨어뜨린다 — 버전 불일치를 부팅 시 검사한다.
- 검색 품질은 생성 품질과 **따로 측정**한다(recall@k·MRR). 답변이 나쁠 때 검색 문제인지 생성 문제인지 구분할 수 있어야 한다.
- 인용은 **검색 결과 ID로 반환**하고, 도메인 검증에서 실제 존재 여부를 확인한다.

### 4.8 async 규약

- I/O 경계(모델 호출·검색·DB)는 **async 일관성**을 유지한다. `async def` 안에서 blocking 호출 금지(불가피하면 `await anyio.to_thread.run_sync(...)`).
- 팬아웃(여러 문서 요약 등)은 `asyncio.gather`/`anyio.create_task_group` + **동시성 상한**(세마포어). 프로바이더 레이트 리밋을 넘기면 전체가 느려진다.
- **모든 모델 호출에 타임아웃**을 건다. 스트리밍은 첫 토큰 타임아웃과 전체 타임아웃을 따로 둔다.
- 참조를 버리는 `asyncio.create_task` 금지(예외가 삼켜진다).

---

## 5. 레이어 책임

- **비즈니스 규칙은 `domain`에**. "무엇이 유효한 답인가"는 순수 함수로 표현해 모델 없이 테스트한다.
- **흐름은 `pipelines`에**. 검색 → 생성 → 검증 → 폴백 같은 단계와 실패 정책은 코드로 명시한다(모델에게 맡기지 않는다).
- **에이전트 루프는 `agents`에**. 정지 조건(최대 턴·예산 초과·도구 실패)을 반드시 코드로 둔다.
- **생성자 주입 only**. 모듈 전역 클라이언트·`global`·import 시점 부작용 금지. 시간·난수·ID는 `Protocol`(`Clock`·`IdGenerator`)로 주입한다.
  - FastAPI `Depends`는 **`api` 경계에서만**. `pipelines`/`agents` 생성자에 `Depends`를 침투시키지 않는다.
- **로깅은 경계에서만**(`api`/`pipelines`/`agents`/`llm`/`retrieval`), 한 번만. `domain`은 로깅 금지. 프롬프트 전문·모델 출력 전문을 무조건 로깅하지 않는다(비용·PII — 샘플링·마스킹 정책을 정한다).

---

## 6. 평가(eval) 회귀 게이트 — 이 변형의 안전망

테스트가 "코드가 깨졌는가"를 본다면, eval은 **"품질이 나빠졌는가"** 를 본다. 둘 다 필요하다.

```
evaluation/
├── datasets/{{DOMAIN_EXAMPLE}}.jsonl   # 입력 + 기대 속성(정답 문자열이 아니라 검증 가능한 속성)
├── scorers/                            # 규칙 채점기(스키마·인용·금지어) + 모델 채점기(루브릭)
├── baselines/{{DOMAIN_EXAMPLE}}.json   # 커밋된 기준선 점수
└── run_eval.py                         # 실행기
```

**운영 규칙:**
1. 골든 데이터셋은 작게 시작한다(30~50건). 실패 사례·엣지 케이스를 우선 담는다. 크기보다 대표성이 중요하다.
2. **채점은 규칙 우선**: 스키마 준수·인용 유효성·필수 필드·금지어는 규칙으로 채점한다(싸고 결정적). 루브릭 기반 모델 채점은 규칙으로 못 잡는 것에만 쓴다.
3. 기준선을 커밋한다. 새 점수가 기준선보다 허용 폭 이상 떨어지면 실패로 본다. 올라가면 기준선을 갱신하고 그 커밋에 근거를 남긴다.
4. 프롬프트·모델·검색 설정 변경 PR은 eval 결과 첨부가 필수다.
5. CI 기본은 비활성이다(비용·비결정성). `scripts/verify.sh`는 `evaluation/`이 있고 `EVAL_ON_VERIFY=1`일 때만 스모크 eval을 돌리고, 전체 eval은 nightly로 돌린다.
6. eval 실패는 "모델이 나쁘다"가 아니라 **조사 시작 신호**다: 프롬프트인지·검색인지·모델 버전인지 트레이스로 좁힌다.

---

## 7. 코드 주석 규약 (요약)

- 코드는 라인 단위 What/How를, 주석은 Why를 설명한다. 단 함수·메서드 docstring은 ① 책임 한 줄 + ② 비자명한 Why + ③ `처리 흐름:`(의도를 곁들인 단계) 로 로직 이해를 돕는다.
- 타입 힌트가 계약을 담는다 — `Args:`/`Returns:`에 타입을 되풀이하지 않는다. 타입이 못 담는 의미(단위·범위·부작용·예외 조건)만 적는다.
- **프롬프트 파일 상단에는 메타 주석**을 둔다: 목적 · 변수 · 이 버전에서 바뀐 것 · eval 점수 변화. 프롬프트도 리뷰 대상이다.
- 한국어로 작성한다. 비밀·토큰·키 원문은 주석/예시에도 넣지 않는다. 원본·Bad/Good 예시: `.agents/rules/code-comments.md`.

---

## 8. 상수·설정 외부화 (매직 리터럴 금지)

| 계층 | 무엇 | 위치/수단 |
|---|---|---|
| (a) 도메인 상수 | 라벨·허용 도구·에러코드 | `enum.StrEnum`/`Final`(`domain` 또는 `core`) |
| (b) 환경별 설정 | 모델 id·temperature·타임아웃·예산·엔드포인트 | `bootstrap/settings.py`의 pydantic-settings `BaseSettings`(+ `.env`) |
| (c) 운영자 변경 가능 값 | 활성 프롬프트 버전·기능 플래그·레이트 리밋 | DB 설정 테이블/기능 플래그(캐시·무효화 동반) |

- 모델 id·temperature·max_tokens를 코드에 하드코딩하지 않는다. 설정으로 빼야 A/B와 롤백이 가능하다.
- API 키는 env·시크릿 매니저에서 읽고, 없으면 **부팅 시 실패**시킨다(조용한 기본값 금지).
- 가변 기본 인자(`def f(items: list = [])`) 금지 — `None` 기본값 + 내부 생성.

---

## 9. 성능·비용 예산 (측정으로 확정)

- 첫 토큰 지연(TTFT) 과 전체 지연을 따로 목표한다. 사용자 체감은 TTFT가 지배한다 → 스트리밍 우선.
- **요청당 토큰 예산**을 정하고 초과 시 절단·요약한다. 컨텍스트를 무한정 채우지 않는다(비용·지연·품질이 함께 나빠진다).
- **캐시**: 동일 입력 재호출·임베딩 결과·검색 결과를 캐시한다(키에 프롬프트/임베딩 버전 포함).
- **팬아웃 상한**: 동시 모델 호출은 세마포어로 제한한다. 레이트 리밋 초과는 지수 백오프 + 지터로 재시도한다.
- **모델 계층화**: 쉬운 단계(라우팅·분류)는 작고 빠른 모델, 어려운 단계만 큰 모델로. 단계별 모델을 설정으로 분리한다.

| 경로 부류 | 예 | 목표(예시 — 프로젝트 확정) | 도달 레버 |
|---|---|---|---|
| 라우팅·분류 | 의도 분류 | 수백 ms | 작은 모델·temperature 0·캐시 |
| 검색 | 벡터 + 키워드 | 수십~수백 ms | 인덱스 튜닝·top-k 축소·리랭킹 선택적 |
| 생성(스트리밍) | 답변 생성 | TTFT 목표 우선 | 스트리밍·프롬프트 길이 축소 |
| 에이전트 루프 | 도구 다단계 | 턴·토큰 예산 상한 | 정지 조건·병렬 도구 호출 |
| 색인 배치 | 문서 임베딩 | 처리량 기준 | 요청 경로 밖·배치 임베딩 |

---

## 10. TDD 워크플로 (요약)

```
RED   파이프라인/도메인 행위 1개에 대한 실패 테스트(fake LLM)
GREEN 최소 구현으로 통과
REFACTOR 중복 제거·의도 드러내기
```

- 테스트가 먼저, 구현이 나중. 테스트 없는 `domain`/`pipelines` 변경 금지. 프레임워크는 **pytest**(+`pytest-asyncio`).
- **fake LLM 클라이언트**(포트 구현)로 단위 테스트를 돌린다. 실제 호출은 eval과 소수 e2e에만.

| 레이어 | 도구 | 비고 |
|---|---|---|
| `core`/`domain` | pytest (+ hypothesis) | 순수 규칙·검증 함수. 모델 없음 |
| `prompts` | pytest | 렌더링·변수 스키마·버전 로드 |
| `llm` | pytest + 기록된 응답(fixture) | 파싱·재시도·오류 변환. SDK는 목 |
| `retrieval` | pytest + 실제 인덱스(소형) | 청킹·검색 정확성(recall@k) |
| `agents`/`pipelines` | pytest + fake LLM·fake 검색 | 흐름·정지 조건·예산·폴백 |
| `api` | pytest + `httpx.AsyncClient(ASGITransport)` | 라우터·스트리밍·envelope |
| 품질 | `evaluation/run_eval.py` | 회귀 게이트(§6) — 테스트와 별개 |
| `architecture` | `lint-imports` + 보조 테스트 | 레이어·SDK 격리 계약(§3.2) |

- 검증 게이트: `bash scripts/verify.sh` (CI·pre-commit·hook이 모두 이 스크립트를 호출).

---

## 11. Anti-pattern (코드리뷰 즉시 차단)

- 프롬프트를 코드 안 문자열 리터럴로 두기(버전·추적·eval 불가).
- 기존 프롬프트 버전 파일을 수정(새 버전을 만든다).
- `llm/` 밖에서 프로바이더 SDK를 직접 import.
- 모델 id·temperature를 코드에 하드코딩.
- 계측 래퍼를 우회한 직접 모델 호출(비용·지연이 보이지 않게 된다).
- 모델 출력을 자유 텍스트로 정규식 파싱(스키마 강제 없이).
- 파싱 실패를 빈 값·기본값으로 조용히 대체(silent failure).
- 모델 출력을 검증 없이 도구 인자·SQL·경로로 사용.
- 출력 문자열 스냅샷 테스트(모델이 바뀌면 전부 무의미하게 깨진다).
- 정지 조건·턴 예산 없는 에이전트 루프.
- 타임아웃 없는 모델 호출, 상한 없는 팬아웃.
- 프롬프트 버전을 키에 넣지 않은 응답 캐시(오염된다).
- 임베딩 모델을 바꾸고 재색인하지 않기.
- 검색 결과·사용자 입력을 시스템 지시와 같은 영역에 섞기(프롬프트 인젝션).
- PII·비밀값을 마스킹 없이 프로바이더로 전송, 모델 출력 전문을 무조건 로깅.
- `domain`이 프로바이더·프레임워크를 참조.
- 참조 없는 `asyncio.create_task` fire-and-forget, `async def` 안의 blocking I/O.
- 테스트 없이 `pipelines`/`domain` 코드 추가, eval 없이 프롬프트 변경.

---

## 12. 다른 변형으로 전환하기

| 목표 | 디렉터리 이동 | 강제 규칙 교체 지점 |
|---|---|---|
| → `layered` (AI가 부가 기능으로 축소될 때) | `llm/`·`prompts/`를 하나의 어댑터 패키지로 접고, `pipelines`/`agents`를 `services/`로 흡수한다. `evaluation/`은 유지할지 결정한다(유지하면 회귀 안전망이 남는다). | `layers` 를 `[api, services, repositories, models]` 로 교체. SDK 격리 계약(3)은 **그대로 유지**할 것을 권한다 |
| → `modular` (에이전트·도메인이 여러 개로 갈릴 때) | `modules/<feature>/{router,pipeline,agent,prompts,service}.py` 로 기능별로 모으고, `llm/`·`retrieval/`·`observability/`는 공유 인프라로 남긴다(모듈마다 프로바이더 어댑터를 복제하지 않는다). | `layers` 를 모듈별 `containers` + `independence` 로 교체하고, SDK 격리 계약(3)의 `source_modules` 에 `modules` 를 추가 |
| → `hexagonal` (도메인 규칙이 지배적이 될 때) | `domain/`을 바운디드 컨텍스트별로 나누고 `llm`·`retrieval`을 `<ctx>/infra/` 어댑터로 내린다. `pipelines`는 `<ctx>/application/usecase/`가 된다. | `layers` 를 `containers = [<ctx>]` + `["primary : infra", "application", "domain"]` 로 교체 |

- 어느 방향으로 가든 세 가지는 가져간다: 프롬프트 버전 관리, 프로바이더 어댑터 격리, eval 회귀 게이트. 이것들은 레이아웃이 아니라 **품질 안전망**이다.
- 전환은 한 번에 한 조각씩 옮기고 각 단계마다 `scripts/verify.sh`를 통과시킨다.
- 전환 시작 전 `.agents/docs/decisions/`에 ADR을 남긴다(왜 옮기는지·되돌릴 조건).

---

## 13. 관련 문서

- 스택·구조·보안·API 규약 원본: `.agents/rules/` (`tech.md`·`security.md`·`api-standards.md`·`structure.md`·`guardrails.md`·`reliability.md`)
- 주석 규약 원본: `.agents/rules/code-comments.md`
- 에이전트 진입: `./AGENTS.md`·`./CLAUDE.md`
- SDD 기록: `.agents/docs/README.md`
