<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Go 백엔드 · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 품질 기준 / DoD — {{PROJECT_NAME}}

에이전트가 코드를 생성·수정할 때 자체 점검하는 체크리스트. PR 전 충족해야 한다.

## 코드 품질 체크리스트

- [ ] 변경에 대한 테스트 존재(성공 + 최소 1개 실패 케이스). 도메인/유스케이스는 **테스트 우선(TDD)**. 테이블 주도 테스트 우선.
- [ ] **모든 error를 처리하거나 반환**한다(`_ = err` 없음). 래핑은 `%w`, 판별은 `errors.Is/As`.
- [ ] 도메인 오류는 sentinel/타입으로 정의하고 **경계에서 한 곳**에서 status·에러코드로 변환.
- [ ] **`ctx context.Context`가 모든 I/O 경로에 전파**된다. `context.TODO()`가 프로덕션 경로에 없다. `WithTimeout`의 `cancel`을 `defer`로 호출한다.
- [ ] 고루틴에 **소유자와 종료 조건**이 있다(누수 없음). 팬아웃에 상한이 있다.
- [ ] 외부 호출에 timeout, `resp.Body.Close()`, 클라이언트 재사용이 적용되어 있다.
- [ ] 구조화 로깅 포함(민감정보 미출력). 에러 로그는 경계에서 한 번만.
- [ ] 매직 넘버·하드코딩 값 없음(타입 있는 `const`·설정으로 외부화).
- [ ] 레이어 경계 준수 — `golangci-lint`(depguard) 통과([`structure.md`](./structure.md)). **안쪽 계층은 전송·영속 메커니즘 무의존**(경계 위치는 `ARCHITECTURE.md` 규칙).
- [ ] 경계에서 입력 파싱·검증(DTO 디코딩 → 도메인 생성자). 안쪽으로 `map[string]any` 유출 없음.
- [ ] 생성자 주입만 사용(패키지 전역 가변 상태·`init()` I/O 없음).
- [ ] 트랜잭션 커밋은 **오케스트레이션 계층에서만**(데이터 접근 계층에 `Commit()` 없음).
- [ ] `panic`으로 정상 오류 흐름을 처리하지 않는다.
- [ ] `gofumpt` 포맷 통과(포맷 드리프트 없음). exported 식별자에 doc comment 존재.

## Story DoD

- [ ] path/field/status code가 API 명세와 일치.
- [ ] 인증 필요 API는 401/403 케이스 포함.
- [ ] 소유·권한 판정이 있는 리소스는 **권한 없는 접근 차단 테스트 포함**(허용 200 · 비허용 403/404 · 미인증 401).
- [ ] 응답은 공통 envelope(`code`/`message`/`request_id`/`timestamp` + `data`/`page` 또는 `details`) 준수.
- [ ] API 변경 시 `api/` OpenAPI 스펙 및 관련 명세 동시 갱신([`guardrails.md`](./guardrails.md) "docs 동시 갱신").
- [ ] Secret·자격증명 원문 미저장·미반환(발급 시 1회만). 비교는 `subtle.ConstantTimeCompare`. 난수는 `crypto/rand`.
- [ ] 요청 본문에 크기 상한(`http.MaxBytesReader`)과 `DisallowUnknownFields` 적용.
- [ ] DB 스키마 변경 시 마이그레이션(up/down) 포함.

## Epic DoD

- [ ] 모든 P0 Story 완료.
- [ ] 내부 demo flow에서 해당 기능 사용 가능.
- [ ] 로그·오류 메시지로 실패 원인 파악 가능.
- [ ] 다음 Epic이 의존하는 계약(포트 인터페이스·API 스펙) 문서화.
- [ ] (통합 환경 있으면) 핵심 경로 부하테스트 시나리오 추가([`reliability.md`](./reliability.md)).

## 커버리지

- 도메인/유스케이스 ≥ 90%, 전체 ≥ 80%. `go test -race -covermode=atomic -coverprofile` + 임계 검사를 게이트에서 강제한다.
- **커버리지 숫자보다 행위 검증이 우선**이다. assert 없는 실행만으로 커버리지를 채우지 않는다.
- 테스트는 `t.Parallel()`을 기본으로 하되 공유 상태를 만들지 않는다. `-race`는 항상 켠다.
- 목 프레임워크보다 **직접 만든 fake**를 우선한다(작은 인터페이스라 쉽다).

## 검증 절차

1. `bash scripts/verify.sh` 실행(= `gofumpt -l` → `go build` → `go vet` → `golangci-lint run` → `go test -race -cover` → 선택 `govulncheck`)
2. 실패 시 수정 후 재검증 → 3. 결과 제시.
- 도구가 없으면 표준 도구로 셋업하고, 불가하면 그 사유를 명시한다.
- exec-plan 완료는 임의로 `completed/`로 옮기지 않는다. `check/`로 옮겨 사용자 검증을 요청한다([`agent-harness.md`](./agent-harness.md)).

> 상세 DoD 원본이 별도 백로그 문서에 있으면 여기 링크만 둔다(정본 중복 보관 금지).
