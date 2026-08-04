<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Python 백엔드 · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# API 표준 규약 — {{PROJECT_NAME}}

REST 응답·오류·문서화의 단일 규약. 직접 구현하는 REST API에 적용한다(외부 API를 그대로 프록시하는 경로는 해당 API의 native 규칙을 따른다).

## URL / 버전 / 인증 모델

- 공개 API는 버전 prefix를 둔다(예: `/api/v1`). 버전 정책은 한 곳에 고정한다.
- 인증 방식은 API 성격에 맞춘다: 사용자 대상은 JWT(`Authorization: Bearer <token>`), 서비스/머신 대상은 발급 키 헤더. 상세는 [`security.md`](./security.md).
- 외부에 노출하는 리소스는 path에 **외부 식별자(code)**를 포함한다(내부 PK 미노출). 삭제는 기본 soft delete.
- 라우터는 `APIRouter(prefix="/api/v1/...", tags=[...])`로 묶고 `bootstrap`에서 등록한다. 경로 문자열을 여러 곳에 흩지 않는다.

## 응답 Envelope (필수, 래핑형)

성공/실패 분기는 **HTTP status code**가 담당한다(body에 success 플래그를 두지 않는다).
성공·오류가 `code`·`message`·`request_id`·`timestamp`를 **대칭으로 공유**하고, 성공은 `data`(+`page`), 오류는 `details`를 추가한다.
`None` 필드는 응답에서 생략한다(`response_model_exclude_none=True` 또는 envelope 직렬화에서 일괄 처리).

- **성공**: `common`의 `ApiResponse.ok(data, request_id)` / 목록 `ApiResponse.page(items, page, request_id)`.
  ```json
  { "code": "SUCCESS", "message": "OK", "request_id": "req_123", "timestamp": "2026-06-10T10:00:00Z", "data": { } }
  ```
  목록:
  ```json
  { "code": "SUCCESS", "message": "OK", "request_id": "req_123", "timestamp": "...",
    "data": [], "page": { "limit": 20, "cursor": "next", "has_next": true } }
  ```
- **오류**: `raise DomainError(ErrorCode.XXX, ...)` → 전역 exception handler가 envelope + HTTP status로 변환.
  ```json
  { "code": "RS0001", "message": "요청한 리소스를 찾을 수 없습니다.", "request_id": "req_123", "timestamp": "...", "details": { } }
  ```
- 성공 `code`는 고정 `SUCCESS`. 오류에 200 금지.
- **라우터에서 ORM 모델·도메인 애그리거트를 직접 반환 금지**. 응답 스키마(Pydantic)로 변환해 envelope에 담는다.
- JSON 키 표기는 프로젝트에서 하나로 고정한다(예: `snake_case`). 카멜케이스를 쓰면 `alias_generator`를 **한 곳(BaseSchema)** 에만 설정한다.

## ErrorCode ↔ HTTP status 단일 매핑

- `common`의 **`ErrorCode`(StrEnum)가 (머신코드 · HTTP status · 기본 메시지 키)의 단일 매핑 소스**다. 매핑을 여러 곳에 흩지 않는다.
- 응답 body에는 **`code`(머신코드)만** 노출한다. enum 멤버명은 내부 식별자다.
- **전역 exception handler**(`app.add_exception_handler(...)`)가 모든 예외를 envelope로 변환하는 유일한 경계다:
  - `DomainError` → 매핑된 `ErrorCode`의 status.
  - `RequestValidationError`(Pydantic 검증) → 422(`RQ0001`) + 필드별 메시지.
  - 미분류 `Exception` → 500(`SY0001`). 에러 로그는 **이 경계에서 한 번만** 남긴다(하위 레이어 중복 로깅 금지).
- **인바운드 경계 안쪽 계층은 `DomainError`만 던진다. `fastapi.HTTPException`을 그 안에서 던지지 않는다**(계약 위반 — import-linter가 차단).
- 핸들러는 **예외 타입 → 상태 코드** 변환만 한다. 여기서 비즈니스 판단을 하지 않는다.

## Request ID

- **미들웨어**가 요청마다 `request_id`를 부여하고 `X-Request-Id` 헤더로 노출하며 로깅 컨텍스트(`contextvars`/structlog bind)에 넣는다(로그 자동 상관).
- 라우터는 의존성(`Depends(current_request_id)`)으로 읽어 `ApiResponse.ok(data, request_id)`에 전달한다.
- `contextvars`를 쓴다(스레드 로컬은 async에서 안전하지 않다).

## 공통 Error Code 카탈로그

`code`만 응답 body에 노출된다. prefix(2자) + 일련번호(4자, `0001`부터).

| code | enum 멤버(내부) | HTTP | 도메인 |
|---|---|---|---|
| `AU0001` | `AUTH_REQUIRED` | 401 | 인증·인가 |
| `AU0002` | `INVALID_TOKEN` | 401 | 인증·인가 |
| `AU0003` | `INVALID_API_KEY` | 401 | 인증·인가 |
| `AU0004` | `FORBIDDEN` | 403 | 인증·인가 |
| `RQ0001` | `VALIDATION_ERROR` | 422 | 요청검증 |
| `RS0001` | `RESOURCE_NOT_FOUND` | 404 | 리소스 |
| `RS0002` | `RESOURCE_CONFLICT` | 409 | 리소스 |
| `BL0001` | `PLAN_LIMIT_EXCEEDED` | 429 | 비즈니스 |
| `SY0001` | `INTERNAL_ERROR` | 500 | 시스템 |
| `<도메인prefix>0001` | `{{DOMAIN_EXAMPLE}}_...` | 4xx/5xx | {{DOMAIN_EXAMPLE}} |

- 공통 prefix: `AU`·`RQ`·`RS`·`BL`·`SY`. 도메인 prefix(2자)는 프로젝트에서 추가한다.
- 코드는 한번 부여하면 재사용·변경하지 않는다.

## 다국어(i18n) 오류 메시지

- 오류 `message`는 `Accept-Language`에 따라 다국어로 내려준다. **기본 로케일은 한국어**. `code`는 로케일 무관 고정.
- **메시지를 코드에 하드코딩하지 않는다.** 안쪽 계층은 예외에 **메시지 키 + 치환 인자**만 담아 던지고(`raise NotFoundError(message_key="error.{{DOMAIN_EXAMPLE}}.not_found", args=(code,))`), 경계(exception handler)가 번역기로 해석한다.
- 키 규칙: 폴백 `error.{ErrorCode}`, 케이스별 `error.{context}.{case}`. 구현은 `gettext`(`.po`/`.mo`) 또는 단순 키→메시지 매핑 테이블. 순수 도메인은 번역기에 의존하지 않는다.

## 요청 검증 (경계에서 parse)

- 요청 스키마는 **Pydantic v2 모델**로 정의하고 라우터 시그니처에 선언한다. 검증 실패는 자동 422(`RQ0001`).
- 스키마는 `model_config = ConfigDict(extra="forbid")`를 기본으로 한다 — 오타 필드를 조용히 무시하지 않는다.
- **경계에서 도메인 타입으로 좁힌다**: Pydantic 모델 → `mapper`가 도메인 VO/커맨드로 변환. 도메인 안쪽으로 `dict`·`Any`를 흘리지 않는다.
- 도메인 VO의 `__post_init__` 검증은 2차 방어선이다(경계 검증을 대체하지 않는다).
- 쿼리 파라미터 제약은 `Annotated[int, Query(ge=1, le=100)]`처럼 **시그니처에 선언**한다(문서와 검증이 한 소스).

## 리소스 ID

- 내부 PK는 **정수(bigint)**. **응답 비노출.**
- 외부 노출 식별자는 **code**(prefix 2자 + base62), 예: `order_code`(OD)·`user_code`(US)·`catalog_code`(CT).

## Pagination

- 목록은 **cursor pagination**: `limit`(기본 20, 상한 강제) · `cursor` · `sort`(기본 `created_at.desc`). 무한/전체 스캔 금지.

## OpenAPI 문서화 (필수)

FastAPI가 스키마를 자동 생성하지만 **자동 생성만으로는 문서가 되지 않는다.** 아래를 채운다.

- **Operation**: `@router.post(..., summary="...", description="...", responses={...})` — 동작·권한·주요 오류를 적는다. 설명은 한국어.
- **응답 모델**: `response_model=ApiResponse[{{DOMAIN_EXAMPLE}}Response]`로 envelope 타입을 노출한다(문서와 실제 응답 불일치 금지).
- **모든 스키마 필드**: `Field(description=..., examples=[...])` **필수**(빠진 필드 금지). 제약(`min_length`·`max_length`·`pattern`)을 선언하면 문서와 검증이 함께 간다. enum은 허용값 의미를 description에 적는다.
- **인증 주체**: 의존성으로 주입되는 인증 principal은 문서에 노출하지 않는다(`include_in_schema` 조정 또는 의존성 시그니처 설계).
- **오류 응답**: `responses={404: {"model": ErrorResponse}, 409: {...}}`로 실제 발생 가능한 오류만 선언한다.
- **문서 경로**(`/docs`·`/openapi.json`)의 공개 여부는 환경별 설정으로 제어한다(운영 비공개가 기본).
- API 변경 시 **OpenAPI 스냅샷을 리포에 갱신**한다(`.agents/docs/openapi/`). 스냅샷 diff가 곧 API 변경 리뷰 포인트다.

## API DoD (Story)

- [ ] path/field/status code가 명세와 일치.
- [ ] 성공 + 최소 1개 실패 케이스 테스트(`httpx.AsyncClient`).
- [ ] 인증 필요 API는 401/403 케이스 포함.
- [ ] 소유·권한 판정이 있는 리소스는 권한 없는 접근 차단 테스트 포함.
- [ ] 응답은 공통 envelope 준수, API 변경 시 OpenAPI 스냅샷 갱신.
- [ ] 모든 요청/응답 필드에 `Field(description=..., examples=[...])` 존재.
- [ ] Secret·자격증명 원문 미저장·미반환(발급 시 1회만).
