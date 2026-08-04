<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}): {{PROJECT_NAME}} 치환 후 사용 -->

# generated — 에이전트가 만드는 문서

여기 있는 문서는 에이전트가 코드나 스키마를 읽어서 생성한다. 손으로 고치지 않는다.

## 여기 들어올 문서

<!-- [STACK 예시] 프로젝트에서 자동 생성할 문서로 치환한다. -->
- `db-schema.md` — DB migration에서 뽑은 스키마 요약(테이블·컬럼·제약·인덱스).
- 필요하면 `api-endpoints.md`, `event-topics.md` 같은 것도 여기 둔다.

## 규칙

- 기준은 코드와 마이그레이션이다. 이 문서는 거기서 파생된 것이라 소스가 바뀌면 다시 생성한다.
- 재생성 스크립트가 생기면 CI에서 내용이 어긋났는지(drift) 검사한다.
