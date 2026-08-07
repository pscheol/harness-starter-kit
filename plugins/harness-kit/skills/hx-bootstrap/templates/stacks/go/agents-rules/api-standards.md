<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Go 백엔드 · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# API 표준 규약 — {{PROJECT_NAME}}

REST 응답·오류·문서화의 단일 규약. 직접 구현하는 REST API에 적용한다(외부 API를 그대로 프록시하는 경로는 해당 API의 native 규칙을 따른다).

## URL / 버전 / 인증 모델

- 공개 API는 버전 prefix를 둔다(예: `/api/v1`). 버전 정책은 한 곳에 고정한다.
- 인증 방식은 API 성격에 맞춘다: 사용자 대상은 JWT(`Authorization: Bearer <token>`), 서비스/머신 대상은 발급 키 헤더. 상세는 [`security.md`](./security.md).
- 외부에 노출하는 리소스는 path에 **외부 식별자(code)**를 포함한다(내부 PK 미노출). 삭제는 기본 soft delete.
- 라우팅은 `internal/<ctx>/primary/http/route.go`에서 컨텍스트 단위로 등록하고 `cmd`가 조립한다. 경로 문자열을 여러 곳에 흩지 않는다.

## 응답 Envelope (필수, 래핑형)

성공/실패 분기는 **HTTP status code**가 담당한다(body에 success 플래그를 두지 않는다).
성공·오류가 `code`·`message`·`request_id`·`timestamp`를 **대칭으로 공유**하고, 성공은 `data`(+`page`), 오류는 `details`를 추가한다.

- **성공**: `internal/common`의 `httpx.OK(w, data, requestID)` / 목록 `httpx.Page(w, items, page, requestID)`.
  ```json
  { "code": "SUCCESS", "message": "OK", "request_id": "req_123", "timestamp": "2026-06-10T10:00:00Z", "data": { } }
  ```
  목록:
  ```json
  { "code": "SUCCESS", "message": "OK", "request_id": "req_123", "timestamp": "...",
    "data": [], "page": { "limit": 20, "cursor": "next", "has_next": true } }
  ```
- **오류**: 유스케이스는 도메인 에러를 반환하고, 경계(핸들러/미들웨어)가 envelope + status로 변환한다.
  ```json
  { "code": "RS0001", "message": "요청한 리소스를 찾을 수 없습니다.", "request_id": "req_123", "timestamp": "...", "details": { } }
  ```
- 성공 `code`는 고정 `SUCCESS`. 오류에 200 금지.
- 핸들러가 도메인 엔티티·DB 스캔 구조체를 직접 마샬링 금지. **응답 DTO**로 변환해 envelope에 담는다(DTO 위치는 `structure.md`).
- JSON 필드명은 **struct tag로 명시**한다(`json:"created_at"`). 표기(스네이크/카멜)는 프로젝트에서 하나로 고정한다.
- 응답 쓰기는 **한 번만**: `WriteHeader` 이후 다시 상태를 쓰지 않는다. 헬퍼(`httpx`)를 통해서만 응답한다(중복 쓰기 방지).

## ErrorCode ↔ HTTP status 단일 매핑

- `internal/common`의 `ErrorCode`(타입 있는 상수)가 (머신코드 · HTTP status · 기본 메시지 키)의 단일 매핑 소스다. 매핑을 여러 곳에 흩지 않는다.
- 응답 body에는 **`code`(머신코드)만** 노출한다.
- **에러 변환은 한 곳**에서 한다: 핸들러가 `httpx.WriteError(w, r, err)`를 호출하고, 그 함수가 `errors.Is/As`로 도메인 에러를 판별해 status·code로 매핑한다.
  - `domain.ErrNotFound` → 404(`RS0001`), `domain.ConflictError` → 409(`RS0002`), 검증 실패 → 422(`RQ0001`), 그 외 → 500(`SY0001`).
  - 미분류 에러는 500으로 뭉뚱그리되 내부 메시지를 노출하지 않는다. 상세는 로그에만.
  - 에러 로그는 **이 경계에서 한 번만** 남긴다(안쪽 계층 중복 로깅 금지).
- `domain`/`app`은 HTTP를 모른다. `http.StatusNotFound` 같은 상수를 그 안에서 쓰지 않는다(depguard가 차단).
- 에러 래핑은 `%w`로 하고, 경계에서 `errors.Is/As`로 판별한다(`errorlint`가 잘못된 비교를 잡는다).

## Request ID

- **미들웨어**가 요청마다 `request_id`를 부여하고 `X-Request-Id` 헤더로 노출하며 `context`에 넣는다(로그 상관용).
- 핸들러는 `httpx.RequestID(ctx)`로 읽어 응답 envelope에 전달한다.
- 로거는 `slog.With("request_id", id)`로 요청 스코프 로거를 만들어 ctx로 전달한다(전역 로거에 상태를 넣지 않는다).

## 공통 Error Code 카탈로그

`code`만 응답 body에 노출된다. prefix(2자) + 일련번호(4자, `0001`부터).

| code | 상수(내부) | HTTP | 도메인 |
|---|---|---|---|
| `AU0001` | `ErrCodeAuthRequired` | 401 | 인증·인가 |
| `AU0002` | `ErrCodeInvalidToken` | 401 | 인증·인가 |
| `AU0003` | `ErrCodeInvalidAPIKey` | 401 | 인증·인가 |
| `AU0004` | `ErrCodeForbidden` | 403 | 인증·인가 |
| `RQ0001` | `ErrCodeValidation` | 422 | 요청검증 |
| `RS0001` | `ErrCodeNotFound` | 404 | 리소스 |
| `RS0002` | `ErrCodeConflict` | 409 | 리소스 |
| `BL0001` | `ErrCodePlanLimitExceeded` | 429 | 비즈니스 |
| `SY0001` | `ErrCodeInternal` | 500 | 시스템 |
| `<도메인prefix>0001` | `ErrCode{{DOMAIN_EXAMPLE}}...` | 4xx/5xx | {{DOMAIN_EXAMPLE}} |

- 공통 prefix: `AU`·`RQ`·`RS`·`BL`·`SY`. 도메인 prefix(2자)는 프로젝트에서 추가한다.
- 코드는 한번 부여하면 재사용·변경하지 않는다.

## 다국어(i18n) 오류 메시지

- 오류 `message`는 `Accept-Language`에 따라 다국어로 내려준다. **기본 로케일은 한국어**. `code`는 로케일 무관 고정.
- 메시지를 도메인 코드에 하드코딩하지 않는다. 도메인은 에러 타입 + 메시지 키(+ 인자)만 담고, 경계에서 번역기(`golang.org/x/text/message` 등)로 해석한다.
- 키 규칙: 폴백 `error.{ErrorCode}`, 케이스별 `error.{context}.{case}`.

## 요청 검증 (경계에서 parse)

- 요청 본문은 **DTO 구조체로 디코딩**한다. `json.Decoder`에 `DisallowUnknownFields()` 를 켠다(오타 필드를 조용히 무시하지 않는다).
- **본문 크기 상한**을 건다: `http.MaxBytesReader(w, r.Body, maxBody)` — 무제한 본문은 메모리 고갈 벡터다.
- 검증은 DTO → 도메인 VO 변환에서 수행한다(도메인 생성자가 불변식 검증). 태그 기반 검증기(`go-playground/validator`)를 쓰더라도 도메인 생성자 검증을 대체하지 않는다.
- 경로·쿼리 파라미터는 파싱 실패를 반드시 처리한다(`strconv.Atoi` 결과 무시 금지). 상한이 있는 값(`limit`)은 파싱 직후 클램프한다.
- 안쪽으로 `map[string]any`를 흘리지 않는다. 경계에서 타입으로 좁힌다.

## 리소스 ID

- 내부 PK는 **정수(int64)**. 응답 비노출.
- 외부 노출 식별자는 **code**(prefix 2자 + base62), 예: `order_code`(OD)·`user_code`(US)·`catalog_code`(CT).

## Pagination

- 목록은 **cursor pagination**: `limit`(기본 20, 상한 강제) · `cursor` · `sort`(기본 `created_at.desc`). 무한/전체 스캔 금지.

## OpenAPI 문서화 (필수)

Go는 코드에서 스펙이 자동 생성되지 않으므로 **스펙을 계약 원본으로 관리**한다.

- **spec-first 권장**: `api/openapi.yaml`을 원본으로 두고 `oapi-codegen`으로 서버 인터페이스·DTO를 생성한다. 생성 코드는 커밋하고 손편집하지 않는다(생성기 설정을 고친다).
- spec-last(주석 기반 생성기)를 쓴다면 **주석과 실제 응답의 드리프트**를 CI에서 검사한다.
- 스펙에는 모든 필드의 description·example, 필수 여부, 형식(`format`·`pattern`), enum 허용값 의미를 적는다(빠진 필드 금지). 설명은 한국어.
- 실제 발생 가능한 **오류 응답**(4xx/5xx)을 status별로 선언한다.
- 문서 UI 노출 여부는 환경별 설정으로 제어한다(운영 비공개가 기본).
- API 변경 시 `api/` 스펙과 `.agents/docs/openapi/`를 함께 갱신한다. 스펙 diff가 곧 API 변경 리뷰 포인트다.

## 서버 설정 (필수)

- `http.Server`에 **타임아웃을 명시**한다: `ReadHeaderTimeout`·`ReadTimeout`·`WriteTimeout`·`IdleTimeout`. 설정하지 않으면 느린 클라이언트가 커넥션을 점유한다.
- **graceful shutdown**: `signal.NotifyContext`로 종료 신호를 받고 `srv.Shutdown(ctx)`로 진행 중 요청을 마무리한다.
- 미들웨어 체인 순서: recover → request_id → 로깅 → 인증 → 라우팅. recover는 panic을 500 envelope로 변환하고 스택을 로깅한다.

## API DoD (Story)

- [ ] path/field/status code가 명세와 일치.
- [ ] 성공 + 최소 1개 실패 케이스 테스트(`httptest`).
- [ ] 인증 필요 API는 401/403 케이스 포함.
- [ ] 소유·권한 판정이 있는 리소스는 권한 없는 접근 차단 테스트 포함.
- [ ] 응답은 공통 envelope 준수, API 변경 시 `api/` 스펙 갱신.
- [ ] 요청 본문에 크기 상한·`DisallowUnknownFields` 적용.
- [ ] Secret·자격증명 원문 미저장·미반환(발급 시 1회만).
