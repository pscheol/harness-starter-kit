<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 품질 기준 / DoD — {{PROJECT_NAME}}

에이전트가 코드를 생성·수정할 때 자체 점검하는 체크리스트. PR 전 충족해야 한다.

## 코드 품질 체크리스트

- [ ] 변경에 대한 단위 테스트 존재(성공 + 최소 1개 실패 케이스). 도메인/유스케이스는 **테스트 우선(TDD)**.
- [ ] 예외 처리 명시(도메인 오류 → `DomainException` → web 경계에서 공통 error envelope 매핑).
- [ ] 구조화된 로깅 포함(민감정보 미출력). 에러 로그는 경계에서 한 번만.
- [ ] 매직 넘버·하드코딩 값 없음(상수/`enum`/설정으로 외부화). 메시지는 i18n 번들.
- [ ] 레이어 경계 준수([`structure.md`](./structure.md)·`ARCHITECTURE.md`의 단방향 의존). `core`/`domain`은 Spring/JPA 무의존.
- [ ] 경계에서 입력 파싱·검증(Jakarta Validation → 도메인 VO `require`). 추측한 형태로 빌드 금지.
- [ ] 생성자 주입만 사용(`@Autowired` 필드/`lateinit var` 의존성·`!!` null assert 금지).
- [ ] `@Transactional`은 오케스트레이션 계층(유스케이스/서비스)에만(어댑터/Repository 금지).

## Story DoD

- [ ] path/field/status code가 API 명세와 일치.
- [ ] 인증 필요 API는 401/403 케이스 포함.
- [ ] 소유·권한 판정이 있는 리소스는 권한 없는 접근 차단 테스트 포함(허용 200 · 비허용 403/404 · 미인증 401).
- [ ] 응답은 공통 envelope(`code`/`message`/`requestId`/`timestamp` + `data`/`page` 또는 `details`) 준수.
- [ ] API 변경 시 `.agents/docs/openapi/` 및 관련 명세 동시 갱신([`guardrails.md`](./guardrails.md) "docs 동시 갱신").
- [ ] Secret·자격증명 원문 미저장·미반환(발급 시 1회만). 재검증용=해시, 원문 재사용=인증 암호화.
- [ ] OpenAPI/Swagger 문서화 규약 충족([`api-standards.md`](./api-standards.md)).

## Epic DoD

- [ ] 모든 P0 Story 완료.
- [ ] 내부 demo flow에서 해당 기능 사용 가능.
- [ ] 로그·오류 메시지로 실패 원인 파악 가능.
- [ ] 다음 Epic이 의존하는 계약(port·contract·API) 문서화.
- [ ] (통합 환경 있으면) 핵심 경로 부하테스트 시나리오 추가([`reliability.md`](./reliability.md)).

## 커버리지

- 도메인/유스케이스 ≥ 90%, 전체 평균 ≥ 80%. 측정 도구(예: Kover/JaCoCo) 연결 시 검증 게이트(`scripts/verify.sh`)에서 강제.

## 검증 절차

1. 빌드/컴파일 → 2. 관련 테스트 실행(`scripts/verify.sh` = `./gradlew check`) → 3. 실패 시 수정 후 재검증 → 4. 결과 제시.
- 프레임워크/명령이 없으면 표준 도구로 셋업하고, 불가하면 그 사유를 명시한다.
- exec-plan 완료는 임의로 `completed/`로 옮기지 않는다. `check/`로 옮겨 사용자 검증을 요청한다([`agent-harness.md`](./agent-harness.md)).

> 상세 DoD 원본이 별도 백로그 문서에 있으면 여기 링크만 둔다(같은 내용을 두 곳에 두지 않는다).
