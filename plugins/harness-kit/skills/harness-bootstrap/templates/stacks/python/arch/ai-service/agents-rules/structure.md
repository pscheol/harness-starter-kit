<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Python 백엔드 · 아키텍처: ai-service · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · AI 서비스 레이아웃 — {{PROJECT_NAME}}

이 프로젝트는 **LLM 파이프라인을 1급 구성요소로 다루는 레이아웃**을 **src 레이아웃 + import 계약 린터**로 강제한다.
일반 백엔드와 다른 점은 하나다: **모델 호출은 비결정적이고, 비용이 들고, 조용히 품질이 나빠진다.**
그래서 구조가 세 가지를 강제한다 — **① 프롬프트를 버전 관리 자산으로**, **② 프로바이더를 어댑터 뒤로**, **③ 평가(eval)를 회귀 게이트로**.
위반은 리뷰가 아니라 `scripts/verify.sh` 실패로 막힌다. 아키텍처 상세 정본(선택 기준·전환 가이드 포함)은 `ARCHITECTURE.md`.

## 리포 레이아웃 (src layout)

```
{{PROJECT_SLUG}}/
├── pyproject.toml              # 의존성·도구 설정·import-linter 계약의 단일 소스
├── uv.lock                     # 잠금 파일(커밋 필수)
├── src/
│   └── {{PACKAGE_NS}}/
│       ├── core/               # 서드파티 0. 예외 계층·상수
│       ├── common/             # envelope·error_code·exception handler·미들웨어
│       ├── domain/             # 순수 규칙·정책·값 타입(허용 도구·인용 규칙 등)
│       ├── prompts/
│       │   ├── registry.py     #   프롬프트 로더(id·버전·변수 스키마 검증)
│       │   └── {{DOMAIN_EXAMPLE}}/answer/v3.md
│       ├── llm/
│       │   ├── port.py         #   LLMClient Protocol(생성·구조화 출력·스트리밍·임베딩)
│       │   ├── <provider>_adapter.py   #   프로바이더 SDK 는 여기서만
│       │   └── parsing.py      #   구조화 출력 파싱·복구
│       ├── retrieval/          # chunking·embedding·index·search·rerank
│       ├── agents/             # 에이전트 루프·도구 레지스트리·정지 조건·턴 예산
│       ├── pipelines/          # 다단계 흐름·분기·재시도·폴백
│       ├── observability/      # 토큰·비용·지연 계측·트레이스·구조화 로깅
│       ├── api/                # 라우터·요청 스키마·스트리밍(SSE)
│       └── bootstrap/          # app factory·DI 조립·settings·lifespan
├── evaluation/                 # src 밖: 골든 데이터셋·채점기·기준선·실행기
│   ├── datasets/ · scorers/ · baselines/ · run_eval.py
├── tests/{unit,integration,e2e,architecture}/
├── scripts/verify.sh           # 단일 검증 게이트
└── docs/
```

- **src 레이아웃을 쓴다.** 테스트가 설치된 패키지를 import하게 되어 "로컬 경로 덕분에만 동작하는" 사고를 막는다.
- **`evaluation/`은 `src/` 밖**에 둔다(배포 아티팩트가 아니고 데이터셋이 커진다).
- 모든 패키지에 `__init__.py`를 둔다. `__init__.py`에는 **재수출만**, 로직·부작용 금지.

## 레이어 ↔ 의존 가능 (import-linter 강제)

| 패키지 | 책임 | 의존 가능 |
|---|---|---|
| `bootstrap` | app factory·DI 조립·settings | 전부(조립 목적) |
| `api` | HTTP 경계·요청/응답 스키마·스트리밍 | `pipelines`, `common`, `core` |
| `pipelines` | 다단계 흐름·분기·재시도·폴백 정책 | `agents`, `llm`, `retrieval`, `domain`, `observability` |
| `agents` | 에이전트 루프·도구 등록·정지 조건·예산 | `llm`, `retrieval`, `prompts`, `domain`, `observability` |
| `llm` | **프로바이더 어댑터**·구조화 출력 파싱·토큰 계측 | `prompts`, `domain`, `observability`, `core` |
| `retrieval` | 청킹·임베딩·색인·검색·리랭킹 | `domain`, `observability`, `core` |
| `prompts` | 프롬프트 자산 + 로더 | `core` |
| `domain` | 순수 규칙·정책·값 타입 | `core` |
| `observability` | 토큰·비용·지연 계측·구조화 로깅 | `core` |
| `common` / `core` | envelope·에러 매핑 / 예외·상수 | `core` / — (stdlib만) |

- **의존 금지(게이트 차단)**: `llm ↔ retrieval`(형제), 하위 → 상위, `domain`·`prompts` → 프로바이더 SDK·웹 프레임워크, `api`·`agents`·`pipelines`·`retrieval` → 프로바이더 SDK.
- **`agents`와 `pipelines`의 구분**: 흐름이 **코드로 결정**되면 `pipelines`, **모델이 다음 행동을 고르면** `agents`. 둘을 섞으면 디버깅이 불가능해진다.
- 계약 선언과 추가 절차는 `ARCHITECTURE.md` §3.2. **새 레이어 패키지를 만들면 계약에 등록**해야 강제 대상이 된다.

## 프로바이더 포트 (교체 가능성의 핵심)

```python
# llm/port.py — SDK 타입을 시그니처에 노출하지 않는다.
from typing import Protocol
from collections.abc import AsyncIterator

class LLMClient(Protocol):
    async def complete(self, prompt: RenderedPrompt, *, params: GenParams) -> Completion: ...
    async def complete_structured[T](self, prompt: RenderedPrompt, schema: type[T], *, params: GenParams) -> T: ...
    def stream(self, prompt: RenderedPrompt, *, params: GenParams) -> AsyncIterator[str]: ...
```

- 포트는 **능력 기준**으로 정의한다. SDK 고유 파라미터를 그대로 노출하면 교체 가능성이 사라진다.
- 프로바이더 오류는 `core`의 도메인 예외로 변환해 올린다(상위 레이어가 SDK 예외 타입을 알면 계약이 샌다).
- 모델 id·temperature·max_tokens·타임아웃은 **설정으로 주입**한다(코드 하드코딩 금지 — A/B·롤백이 불가능해진다).

## 프롬프트 규약 (버전 관리 자산)

- 프롬프트는 코드 안 문자열이 아니라 `prompts/<도메인>/<이름>/v<N>.md` 파일이다. **레지스트리를 통해 id + 버전으로 로드**한다.
- 파일에 **변수 스키마**를 함께 선언하고 렌더링 시 검증한다(누락 변수가 조용히 빈 문자열이 되는 사고 차단).
- **기존 버전을 수정하지 않는다. 새 버전을 만든다.**
- 모든 응답 로그·트레이스에 `prompt_id`·`prompt_version`·`model`·`params`를 남긴다(품질 회귀 조사의 최소 조건).
- 프롬프트 파일 상단에 메타 주석을 둔다: 목적 · 변수 · 이 버전에서 바뀐 것 · eval 점수 변화.
- **프롬프트 변경 PR은 eval 결과 첨부가 필수**다(아래 회귀 게이트).

## 출력·비결정성 규약

- 모델 출력을 자유 텍스트로 정규식 파싱하지 않는다. **Pydantic 스키마**로 받고, 도메인 검증(인용 유효성·허용 값)을 `domain`에서 순수 함수로 다시 수행한다.
- 파싱 실패는 **정상 경로**다: 오류를 되먹인 1회 재시도 → 실패 시 폴백 또는 명시적 에러. **조용히 빈 값 반환 금지**.
- 결정적이어야 하는 경로(분류·추출·라우팅)는 temperature 0(+ 지원 시 seed 고정).
- **출력 문자열 스냅샷 테스트를 만들지 않는다.** 속성 기반 검증(스키마 준수·필수 필드·인용 유효성·금지어·길이·라벨 집합)을 쓴다.
- 단위 테스트는 **fake LLM 클라이언트**(포트 구현)로 돌린다. 실제 프로바이더 호출은 eval과 소수 e2e에만.

## 계측·안전 규약

- **모든 모델 호출은 `observability/` 계측 래퍼를 통과**한다(직접 SDK 호출 금지 — 구조 테스트가 검사).
- 호출마다 기록: `prompt_id`·`prompt_version`·`model`·입출력 토큰·추정 비용·지연·재시도 횟수·실패 사유.
- **요청당 토큰 예산 + 턴 예산**을 두고 초과 시 정지·부분 결과 반환(무한 루프·비용 폭주 차단). 모든 호출에 타임아웃(스트리밍은 첫 토큰/전체 분리).
- 캐시 키에 **프롬프트 버전 + 모델 + 파라미터 + 입력 해시**를 넣는다(버전이 빠지면 캐시가 오염된다).
- **도구 권한은 화이트리스트**. 모델 출력을 신뢰 입력으로 취급하지 않는다 — 도구 인자는 스키마 + 도메인 규칙 검증 후 실행.
- 검색 결과·사용자 입력은 시스템 지시와 **구분된 영역**에 넣는다(프롬프트 인젝션). 실행 권한은 프롬프트가 아니라 코드가 정한다.
- PII·비밀값은 프로바이더 전송 전에 마스킹한다. 프롬프트·출력 전문을 무조건 로깅하지 않는다(비용·PII — 샘플링·마스킹 정책). 상세는 `.agents/rules/security.md`.

## 검색(RAG) 규약

- 색인 파이프라인은 **재현 가능**해야 한다: 청킹 전략·임베딩 모델·차원·정규화를 **버전으로 기록**하고 인덱스 메타데이터에 남긴다.
- **임베딩 모델을 바꾸면 전체 재색인**한다. 버전 불일치는 부팅 시 검사해 실패시킨다(혼합 인덱스는 조용히 품질을 떨어뜨린다).
- 검색 품질(recall@k·MRR)은 생성 품질과 **따로 측정**한다 — 나쁜 답변이 검색 문제인지 생성 문제인지 구분할 수 있어야 한다.
- 인용은 **검색 결과 ID로 반환**하고 도메인 검증에서 실제 존재 여부를 확인한다.

## 평가(eval) 회귀 게이트

테스트가 "코드가 깨졌는가"를 본다면, eval은 **"품질이 나빠졌는가"** 를 본다.

1. 골든 데이터셋은 **작게 시작**한다(30~50건). 실패 사례·엣지 케이스 우선 — 크기보다 대표성.
2. **규칙 채점 우선**(스키마·인용·필수 필드·금지어). 루브릭 기반 모델 채점은 규칙으로 못 잡는 것에만.
3. **기준선을 커밋**하고, 허용 폭 이상 떨어지면 실패로 본다. 올라가면 기준선을 갱신하고 근거를 남긴다.
4. **CI 기본은 비활성**(비용·비결정성). `scripts/verify.sh`는 `evaluation/`이 있고 `EVAL_ON_VERIFY=1`일 때만 스모크를 돌리고, 전체는 nightly.
5. eval 실패는 조사 시작 신호다 — 프롬프트인지·검색인지·모델 버전인지 트레이스로 좁힌다.

## 새 파이프라인/에이전트 착수 워크플로

1. **배치 결정**: 흐름이 코드로 결정되면 `pipelines`, 모델이 다음 행동을 고르면 `agents`. 먼저 이걸 답한다.
2. **자산 준비**: `prompts/<도메인>/<이름>/v1.md` + 변수 스키마 → `evaluation/datasets/`에 골든 케이스 10건 이상 먼저 만든다.
3. **TDD 사이클**(RED→GREEN→REFACTOR):
   1. `domain`: 유효성 규칙(인용·허용 값·금지어) 테스트 → 순수 함수 구현.
   2. `llm`: 기록된 응답 fixture로 파싱·재시도·오류 변환 테스트 → 어댑터 구현.
   3. `retrieval`(필요 시): 소형 인덱스로 검색 정확성 테스트 → 구현.
   4. `pipelines`/`agents`: fake LLM·fake 검색으로 흐름·정지 조건·예산·폴백 테스트 → 구현.
   5. `api`: `httpx.AsyncClient(ASGITransport)`로 라우터·스트리밍 테스트. **응답은 공통 envelope**.
4. **품질 확인**: `python evaluation/run_eval.py`로 기준선 대비 점수 확인 → 회귀 없으면 기준선 갱신 여부 판단.
5. **검증**: `bash scripts/verify.sh`(ruff·mypy·lint-imports·pytest) 통과 + OpenAPI/문서 동기화(`.agents/docs/openapi`).
6. **계획 추적**: 복잡 작업은 `.agents/docs/product-<slug>-specs/tasks/active/`에 기록([`agent-harness.md`](./agent-harness.md) 게이트).

## 아키텍처 구조 테스트 (계약 린터의 보완)

`import-linter`가 **레이어 방향과 SDK 격리**를 막는다. 그러나 계약이 **못 잡는** 위반이 있다:
계측 래퍼 우회, 코드 안 프롬프트 리터럴, 정지 조건 없는 루프 등.
이런 것은 `tests/architecture/`의 테스트로 강제한다(게이트가 자동 실행).

```python
# tests/architecture/test_ai_rules.py
"""AI 고유 규율 중 import-linter 가 못 잡는 것을 테스트로 강제한다."""
import pathlib

SRC = pathlib.Path("src/{{PACKAGE_NS}}")

def test_프롬프트를_코드에_하드코딩하지_않는다() -> None:
    """코드 안 프롬프트는 버전 추적·eval·롤백이 불가능하다."""
    for path in [*SRC.glob("agents/**/*.py"), *SRC.glob("pipelines/**/*.py")]:
        source = path.read_text(encoding="utf-8")
        assert '"""당신은' not in source, f"{path}: prompts/ 자산으로 옮기고 레지스트리로 로드한다"

def test_모델_호출은_계측_래퍼를_통과한다() -> None:
    """계측을 우회하면 토큰·비용·지연이 보이지 않아 회귀를 못 잡는다."""
    for path in SRC.glob("llm/*_adapter.py"):
        source = path.read_text(encoding="utf-8")
        assert "observability" in source, f"{path}: 계측 래퍼를 통해 호출한다"
```

> 규칙은 프로젝트에 맞게 늘린다. 핵심은 **위반을 `scripts/verify.sh`에서 실패로 만드는 것**(리뷰가 아니라 게이트).

## 새 기능 착수 규칙

1. 새 기능은 위 패키지 경계 안에서 구현한다. 프로바이더 SDK는 `llm/`을 벗어나지 않는다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `.agents/docs/openapi`(또는 OpenAPI 스냅샷)를 함께 갱신한다.
4. **프롬프트·모델·검색 설정 변경은 eval 결과와 함께** 올린다.
5. 승격/강등 신호(`evaluation/`이 비어 있음·수동 검증으로 배포·에이전트 다도메인화)가 보이면 `ARCHITECTURE.md` §0·§12를 연다.

> `{{DOMAIN_EXAMPLE}}`는 실제 프로젝트 도메인으로 치환한다(예: support · search · summarize · triage · assistant).
