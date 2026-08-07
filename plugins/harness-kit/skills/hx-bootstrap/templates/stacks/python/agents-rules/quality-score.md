<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Python 백엔드 · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 품질 기준 / DoD — {{PROJECT_NAME}}

에이전트가 코드를 생성·수정할 때 자체 점검하는 체크리스트. PR 전 충족해야 한다.

## 코드 품질 체크리스트

- [ ] 변경에 대한 테스트 존재(성공 + 최소 1개 실패 케이스). 도메인/유스케이스는 **테스트 우선(TDD)**.
- [ ] **타입 힌트 완비** — 모든 공개 함수에 인자·반환 타입. `mypy --strict` 통과. 근거 없는 `Any`·`# type: ignore`·`cast()` 없음.
- [ ] 예외 처리 명시(도메인 오류 → `DomainError` → 전역 handler에서 envelope 매핑). `except: pass`·삼키기 없음.
- [ ] 구조화 로깅 포함(민감정보 미출력). 에러 로그는 경계에서 한 번만.
- [ ] 매직 넘버·하드코딩 값 없음(`Final` 상수·`StrEnum`·설정으로 외부화). 메시지는 i18n 키.
- [ ] 레이어 경계 준수 — `lint-imports` 통과([`structure.md`](./structure.md)). **안쪽 계층은 웹 프레임워크 무의존**(경계 위치는 `ARCHITECTURE.md` 계약).
- [ ] 경계에서 입력 파싱·검증(Pydantic → 도메인 VO). 안쪽으로 `dict`/`Any` 유출 없음.
- [ ] 생성자 주입만 사용(모듈 전역 싱글턴·import 시점 부작용 없음). `Depends`는 **인바운드 경계에만**.
- [ ] 트랜잭션 커밋은 **오케스트레이션 계층에서만**(데이터 접근 계층에 `commit()` 없음).
- [ ] async 규약 준수 — `async def` 안 blocking 호출 없음, 참조 없는 `create_task` 없음, 외부 호출에 timeout 존재.
- [ ] 가변 기본 인자 없음. `from x import *` 없음.
- [ ] `ruff check` · `ruff format --check` 통과(포맷 드리프트 없음).

## Story DoD

- [ ] path/field/status code가 API 명세와 일치.
- [ ] 인증 필요 API는 401/403 케이스 포함.
- [ ] 소유·권한 판정이 있는 리소스는 권한 없는 접근 차단 테스트 포함(허용 200 · 비허용 403/404 · 미인증 401).
- [ ] 응답은 공통 envelope(`code`/`message`/`request_id`/`timestamp` + `data`/`page` 또는 `details`) 준수.
- [ ] API 변경 시 OpenAPI 스냅샷 및 관련 명세 동시 갱신([`guardrails.md`](./guardrails.md) "docs 동시 갱신").
- [ ] Secret·자격증명 원문 미저장·미반환(발급 시 1회만). 비밀번호는 argon2id/bcrypt 등 느린 KDF.
- [ ] 모든 요청/응답 스키마 필드에 `Field(description=..., examples=[...])` 존재([`api-standards.md`](./api-standards.md)).
- [ ] DB 스키마 변경 시 Alembic 마이그레이션 포함(자동 생성 diff를 사람이 검토).

## Epic DoD

- [ ] 모든 P0 Story 완료.
- [ ] 내부 demo flow에서 해당 기능 사용 가능.
- [ ] 로그·오류 메시지로 실패 원인 파악 가능.
- [ ] 다음 Epic이 의존하는 계약(port·API 스키마) 문서화.
- [ ] (통합 환경 있으면) 핵심 경로 부하테스트 시나리오 추가([`reliability.md`](./reliability.md)).

## 커버리지

- 도메인/유스케이스 ≥ 90%, 전체 ≥ 80%. `pytest --cov --cov-fail-under=80`로 게이트에서 강제한다.
- 커버리지 숫자를 채우려고 assert 없는 테스트를 쓰지 않는다. **행위(입력→기대 결과)** 를 검증한다.
- 순수 로직은 `hypothesis`로 속성 기반 테스트를 추가하면 경계 케이스를 싸게 얻는다.

## 검증 절차

1. `bash scripts/verify.sh` 실행(= `ruff format --check` → `ruff check` → `mypy` → `lint-imports` → `pytest --cov`)
2. 실패 시 수정 후 재검증 → 3. 결과 제시.
- 도구가 없으면 표준 도구로 셋업하고, 불가하면 그 사유를 명시한다.
- exec-plan 완료는 임의로 `completed/`로 옮기지 않는다. `check/`로 옮겨 사용자 검증을 요청한다([`agent-harness.md`](./agent-harness.md)).

> 상세 DoD 원본이 별도 백로그 문서에 있으면 여기 링크만 둔다(같은 내용을 두 곳에 두지 않는다).
