<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}): {{PROJECT_NAME}} 치환 후 사용 -->

# generated — 에이전트 생성 산출물

이 디렉터리의 문서는 **에이전트가 코드/스키마에서 자동 생성**한다. **손으로 직접 편집하지 않는다.**

## 예정 산출물

<!-- [STACK 예시] 프로젝트에서 자동 생성할 산출물로 치환한다. -->
- `db-schema.md` — DB migration에서 생성한 스키마 요약(테이블·컬럼·제약·인덱스).
- (추가 가능) `api-endpoints.md`, `event-topics.md` 등.

## 규칙

- **정본은 코드/마이그레이션**이다. 이 문서는 파생물이므로 소스 변경 시 재생성한다.
- 재생성 스크립트가 생기면 CI에서 최신성(drift)을 검사한다.
