<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# API 표준 규약 — {{PROJECT_NAME}}

REST 응답·오류·문서화의 단일 규약. 직접 구현하는 REST API에 적용한다(외부/서드파티 API를 그대로 프록시하는 경로는 해당 API의 native 규칙을 따른다).

## URL / 버전 / 인증 모델

- 공개 API는 버전 prefix를 둔다(예: `/api/v1`). 버전 정책은 한 곳에 고정한다.
- 인증 방식은 API 성격에 맞춘다: 사용자 대상은 JWT(`Authorization: Bearer <token>`), 서비스/머신 대상은 발급 키 헤더 등. 상세는 [`security.md`](./security.md).
- 외부에 노출하는 리소스는 path에 **외부 식별자(code)**를 포함한다(내부 PK는 노출하지 않는다). 삭제는 기본 soft delete.

## 응답 Envelope (필수, 래핑형)

성공/실패 분기는 **HTTP status code**가 담당한다(body에 success/error 플래그를 두지 않는다).
성공·오류가 `code`·`message`·`requestId`·`timestamp`를 **대칭으로 공유**하고, 성공은 `data`(+`page`), 오류는 `details`를 추가한다.
`null` 필드는 전역 생략(`spring.jackson.default-property-inclusion: non_null`). 필드 순서는 `@JsonPropertyOrder`로 고정: `code` · `message` · `requestId` · `timestamp` · (`details`) · `data` · `page`.

- **성공**: `:{{PROJECT_SLUG}}-common`의 `ApiResponses.ok(data, requestId)` / 목록 `ApiResponses.page(items, page, requestId)`.
  ```json
  { "code": "SUCCESS", "message": "OK", "requestId": "req_123", "timestamp": "2026-06-10T10:00:00Z", "data": { } }
  ```
  목록:
  ```json
  { "code": "SUCCESS", "message": "OK", "requestId": "req_123", "timestamp": "...",
    "data": [], "page": { "limit": 20, "cursor": "next", "hasNext": true } }
  ```
- **오류**: `throw ApiException(ErrorCode.XXX, ...)` → `GlobalExceptionHandler`가 envelope + HTTP status로 변환.
  ```json
  { "code": "RS0001", "message": "요청한 리소스를 찾을 수 없습니다.", "requestId": "req_123", "timestamp": "...", "details": { } }
  ```
- 성공 `code`는 고정 `SUCCESS`. 오류에 200 금지 — 적절한 HTTP status를 쓴다.
- 컨트롤러에서 `ResponseEntity<DTO>` 직접 반환 금지(envelope 우회). 컨트롤러 DTO와 애그리거트는 다른 타입이다(인바운드 경계의 DTO 패키지에 별도 정의 — 위치는 [`structure.md`](./structure.md)).

## ErrorCode ↔ HttpStatus 단일 매핑

- `common`의 `ErrorCode` enum이 (머신코드 · HTTP status · 기본 메시지 키)의 단일 매핑 소스다. 매핑을 여러 곳에 흩지 않는다.
- 응답 body에는 **`code`(머신코드)만** 노출한다. enum 이름은 내부 식별자(미노출).
- **`GlobalExceptionHandler`**(`@RestControllerAdvice`)가 모든 예외를 envelope로 변환하는 유일한 경계다:
  - `ApiException`/`DomainException` → 매핑된 `ErrorCode`의 status.
  - `MethodArgumentNotValidException`(body 검증)·`HandlerMethodValidationException`(param/path 검증) → 422(`RQ0001`) + 필드별 i18n 메시지.
  - 미분류 예외 → 500(`SY0001`). 에러 로그는 **이 경계에서 한 번만** 남긴다(안쪽 계층·어댑터의 중복 로깅 금지).
- 도메인·오케스트레이션 계층은 `DomainException`을 던지고 web 경계(`ApiException`)에서 변환한다. 규칙을 담은 안쪽 계층은 `HttpStatus`·`ResponseEntity`·Spring web 타입을 모른다(아키텍처 변형에 따라 컴파일 또는 구조 테스트가 차단).

## RequestId

- **`RequestIdFilter`**가 요청마다 `requestId`를 부여하고 `X-Request-Id` 헤더로 노출하며 MDC에 넣는다(로그 자동 상관).
- 컨트롤러는 `currentRequestId()`로 읽어 `ApiResponses.ok(data, requestId)`에 전달한다.

## 공통 Error Code 카탈로그

`code`만 응답 body에 노출된다. 아래 `enum`은 내부 식별자다. prefix(2자) + 일련번호(4자, `0001`부터).

| code | enum (내부) | HTTP | 도메인 |
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

- 공통 prefix: `AU`(인증·인가) · `RQ`(요청검증) · `RS`(리소스) · `BL`(비즈니스 규칙) · `SY`(시스템). 도메인 prefix(2자)는 프로젝트에 맞게 추가한다.
- 코드는 한번 부여하면 재사용·변경하지 않는다.

## 다국어(i18n) 오류 메시지

- 오류 `message`는 `Accept-Language`에 따라 다국어로 내려준다. **기본 로케일은 한국어**(헤더 없으면 한국어). `code`는 로케일 무관 고정, 다국어가 되는 것은 `message`뿐.
- 메시지를 코드에 하드코딩하지 않는다. 도메인/application은 예외에 **메시지 키 + 치환 인자**만 담아 던지고(`throw NotFoundException(messageKey = "error.{{DOMAIN_EXAMPLE}}.not_found", args = listOf(code))`), 경계(`GlobalExceptionHandler`)가 `MessageSource`로 해석한다. 순수 도메인은 `MessageSource`에 의존하지 않는다.
- 키 규칙: 일반 폴백 `error.{ErrorCode}`, 케이스별 `error.{context}.{case}`, 치환 인자 `{0}`,`{1}`. Bean Validation 필드 메시지 키 규칙 `validation.{제약명}`(`validation.NotBlank`·`validation.Size`…).
- 번들 `classpath:messages*.properties`(UTF-8), 지원 로케일 `ko`·`en`. 구현: `MessageSource` + `Accept-Language` `LocaleResolver`. MVC는 `LocaleContextHolder`, 보안 필터단은 요청 `Accept-Language` 직접 사용.

## 리소스 ID

- 내부 PK는 **bigint**(`<단수테이블>_id`). UUID 미사용, 응답 비노출.
- 외부 노출 식별자는 **code**(prefix 2자 + base62, `gen_code()`), 예: `order_code`(OD)·`user_code`(US)·`catalog_code`(CT).

## Pagination

- 목록은 **cursor pagination**: `limit`(기본 20, 상한 강제) · `cursor` · `sort`(기본 `createdAt.desc`). 무한/전체 스캔 금지.

## OpenAPI/Swagger 문서화 (필수)

모든 엔드포인트는 Swagger UI에서 바로 이해되도록 문서화한다. 문서는 인바운드 경계의 `docs` 패키지에 둔 **`*Api` 인터페이스가 단일 관리**하고 컨트롤러(`*RestController`)가 구현한다(코드/문서 분리 — 패키지 위치는 [`structure.md`](./structure.md)). 설명은 한국어.

- **Operation**: `@Operation(summary, description)` — 동작·권한·주요 오류(status) 요약.
- **Path/Query**: `@Parameter(in = PATH|QUERY, description, example)` 필수(외부 식별자는 code 예시).
- **인증 주체**: `@AuthenticationPrincipal` 파라미터는 `@Parameter(hidden = true)`로 숨긴다.
- **요청/응답 DTO의 모든 필드**: `@field:Schema(description, example)` 필수(빠진 필드 금지). 필수 필드 `requiredMode = REQUIRED`, 길이/형식(`minLength`/`maxLength`/`format`) 명시, enum은 허용값·의미를 description에 명시. 내부 PK(bigint)는 응답 비노출.
- **검증 제약**: `@Min/@Max/@Size/@Email`은 **`*Api` 인터페이스 메서드 파라미터에 선언**한다(구현 오버라이드에 두면 Jakarta BV Liskov 위반 `ConstraintDeclarationException`).
- 요청 검증은 Jakarta Validation: 요청 DTO에 `@field:NotBlank`·`@field:Email` + 컨트롤러 파라미터에 `@Valid`. 위반은 422(`RQ0001`) + 필드 오류(i18n).
- 노출 경로 `/v3/api-docs`(JSON)·`/swagger-ui.html`(UI)는 SecurityConfig에서 permitAll. 문서 메타·보안 스킴(bearerAuth)은 조립 지점의 `OpenApiConfig`가 정의.

## API DoD (Story)

- [ ] path/field/status code가 명세와 일치.
- [ ] 성공 + 최소 1개 실패 케이스 테스트.
- [ ] 인증 필요 API는 401/403 케이스 포함.
- [ ] 소유·권한 판정이 있는 리소스는 권한 없는 접근 차단 테스트 포함.
- [ ] 응답은 공통 envelope 준수, API 변경 시 `.agents/docs/openapi/` 갱신.
- [ ] 위 OpenAPI/Swagger 문서화 규약 충족(Operation·Parameter·모든 DTO 필드 `@Schema`).
- [ ] Secret·자격증명 원문 미저장·미반환(발급 시 1회만).
