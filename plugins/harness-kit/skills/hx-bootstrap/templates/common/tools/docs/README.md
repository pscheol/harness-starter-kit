# tools/docs — 기능 문서 생성기·검사기

`docs/features/` 를 만든다. 코드에서 나오는 사실(API·테이블·인덱스·RLS·캐시·잠금·시험·화면)은 생성기가 뽑고,
사람이 판단해 쓰는 서술(요구·정책·흐름·시퀀스·상태·변경 영향)은 기능 원고에 둔다. 규칙 원본은 `.agents/rules/sdd-workflow.md` 「S7 문서 반영」이다.

## 명령

| 할 일 | 명령 | 쓰는 것 |
|---|---|---|
| 검사(게이트) | `python3 tools/docs/feature_docs.py check` | 아무것도 쓰지 않는다 |
| 사이트 자산 검사 | `python3 tools/docs/feature_docs.py check --assets` | 아무것도 쓰지 않는다. 복사한 자산 = `tools/docs/assets` 원본, `assets/vendor` = 잠금의 파일 sha256. 생성물·외부 라이브러리는 파일마다 시험이 없어 changed 게이트가 이 검사로 대신한다(`.agents/verify-checks.json` `covers`) |
| 생성 | `python3 tools/docs/feature_docs.py build` | `docs/features/*.html`·`features/`·`api/`·`assets/` |
| 통계 | `python3 tools/docs/feature_docs.py stats` | — |
| 기능 사실 요약 | `python3 tools/docs/feature_docs.py brief F-NOTE-02` | — |
| OpenAPI 사본 갱신 | `uv run --no-project --with pyyaml python3 tools/docs/feature_docs.py refresh openapi` | `_data/openapi/*.json` |
| DB 카탈로그 갱신 | `python3 tools/docs/feature_docs.py refresh schema` | `_data/schema/*.json` (Docker, `tools/docs/schema-snapshot.sh` 가 빈 Postgres 에 마이그레이션 적용) |
| 외부 스크립트 갱신 | `python3 tools/docs/feature_docs.py refresh vendor` | `assets/vendor/` (`vendor.lock.json` 의 판·integrity) · 꺼낸 파일의 sha256 을 `vendor.lock.json` 에 적는다 |
| 도구 시험 | `cd tools/docs && python3 -m unittest discover -s tests` · 사이트 자산 `node --test tests/*.test.mjs` | — |

build·check·stats·brief 는 표준 라이브러리만 쓰고 DB·서버·네트워크에 붙지 않는다.

## 폴더

```text
docs/features/
  _src/docs.config.json   단위·OpenAPI 원본·DB·중계 규칙
  _src/catalog.json       영역·기능·배정 규칙(패키지·모듈·라우트·경로·명시 목록·SDD 패턴)
  _src/features/<ID>.md   기능 원고(절 12개)
  _src/stages/<NN-이름>.md 단계 문서 머리말
  _src/mockups/<단위>/<경로>.png  화면 목업(경로의 / 는 __)
  _data/                  스냅숏(생성기 입력)
  *.html features/ api/ assets/   생성물 — 손으로 고치지 않는다
```

## 그림 보기

사이트의 Mermaid 그림(원고·단계 페이지·Scalar API 설명)마다 위쪽에 보기 도구가 붙는다(`assets/site.js` `FeatureDocsDiagrams`).

| 조작 | 하는 일 |
|---|---|
| `−` · `+` 버튼, 그림 칸에서 `-` · `+` 키 | 1.25배씩 축소·확대(10%~400%). 표시는 지금 배율 |
| Ctrl(⌘) + 휠 | 커서 자리를 기준으로 확대·축소. 그냥 휠은 스크롤 |
| 끌기 | 그림이 칸보다 크면 끌어서 옮긴다 |
| `맞춤` 버튼, `0` 키 | 칸 폭에 맞춘 처음 상태로(전체화면에서는 화면에 맞춤) |
| `전체화면` 버튼, `F` 키 | 브라우저 전체화면으로 열고 화면에 맞춘다. 막히면 화면을 덮는 보기로 대신한다. `닫기 (Esc)`·Esc 로 나온다 |

시험: `node --test tests/site.test.mjs`(배율 계산·viewBox) · `tests/scalar-page.test.mjs`(Scalar 그림에도 도구를 붙인다). 실제 동작은 브라우저에서 본다.

## 기능에 배정하기

새 API·테이블·캐시·화면은 어느 기능에든 배정돼야 검사를 통과한다. `catalog.json` 의 기능 `match` 에 적는다.

| 대상 | 규칙 |
|---|---|
| JVM operation · 테이블 · 시험 | `"<단위>": {"packages": ["com.example.note.*.folder"]}` — 컨트롤러·엔티티·시험 패키지 앞부분. `*` 한 마디, `**` 여러 마디 |
| Python operation | `"<단위>": {"modules": ["app.summarization.**"]}` |
| operation 경로로 가르기 | `"<단위>": {"routes": ["/api/v1/recordings/retention"]}` — 패키지보다 먼저 본다 |
| 화면 | `"app-web": {"routes": ["/notes/**"]}` |
| 비JVM 시험 | `"<단위>": {"paths": ["src/features/note/**"]}` — 단위 폴더 기준 |
| 명시 | `"operations": ["app-server GET /api/v1/x"]` · `"tables": ["note.nte_x"]` · `"caches": ["app-server:x"]` |
| SDD 이슈 | `"sdd": [".:note-specs/3-*"]` — `<하네스 경로>:<slug>-specs/<키>` |

가장 구체적인 패턴이 이긴다. 같은 구체성으로 두 기능에 맞으면 검사가 "중복 배정"으로 실패한다.

## 원고 쓰기

`_src/features/<ID>.md` 는 `# <ID> <이름>` 으로 시작하고 `##` 절 열두 개를 이 순서로 둔다.
절이 비거나 `TODO-DOC` 가 남으면 검사가 실패한다. 해당 없는 절은 이유를 한 줄로 쓴다(예: "상태 없음 — 즐겨찾기는 있음/없음만 있다.").

| 절 | 쓸 것 | 생성기가 붙이는 것 |
|---|---|---|
| 개요 | 무엇을·누가·어디서 쓰는지 2~4문장 | 단위별 operation 수·배정 규칙 |
| 요구사항 | `\| ID \| 요구 \| 출처 \|` 표. ID `FR-<번호>-<n>`(예 `FR-NOTE-02-1`), 출처는 SDD 문서 경로나 코드 위치 | 관련 SDD 이슈 표 |
| 정책 | `\| ID \| 규칙 \| 강제 위치 \|` 표. ID `P-<번호>-<n>`. 강제 위치는 `클래스.메서드`·제약 이름·RLS 정책 이름 | — |
| 화면 | 화면이 하는 일, 목업 위치 | 화면 경로 → 고유 API 표 |
| 흐름 | ` ```mermaid flowchart ` 하나 이상(분기·실패 포함) | — |
| 시퀀스 | ` ```mermaid sequenceDiagram ` 하나 이상(대표 성공·실패) | operation 마다 정적 분석 시퀀스(API 절) |
| 상태 전이 | ` ```mermaid stateDiagram-v2 ` 또는 "상태 없음 — 이유" | — |
| 데이터 | 테이블 사이 관계·보존·암호화 칸 설명 | 테이블별 칸·인덱스·제약·FK·RLS, 다른 기능 테이블 사용처 |
| 캐시·동시성 | 캐시 키 의미·무효화 시점, 잠금·멱등성·경합 처리 | 캐시 키 식, 잠금 위치 |
| API | 계약에서 주의할 점(멱등 키·페이지·오류 코드) | operation 상세(구현·경로·테이블·인덱스·캐시·잠금·외부 호출·시퀀스·시험) |
| 테스트 | 핵심 시나리오 Given/When/Then 과 그 시험 이름 | 시험 파일·종류·수 |
| 변경 영향 | "이것을 바꾸면 같이 고칠 곳" 목록 | — |

글은 `.agents/rules/writing-style.md` 를 따른다. 코드에서 확인한 것만 쓰고, 확인 못 한 것은 `[확인 필요: 무엇]` 으로 남긴다.
`python3 tools/docs/feature_docs.py brief <ID>` 출력이 출발점이다. 정적 분석 표는 근사이므로 원고에서 단정할 때는 코드를 연다.

## 갱신이 필요한 때

| 바뀐 것 | 할 일 |
|---|---|
| OpenAPI 스냅숏(단위의 `OpenApiSnapshotIT` 등) | `refresh openapi` → 새 operation 배정 → 원고 API·요구 갱신 → `build` |
| 마이그레이션 | `refresh schema` → 새 테이블 배정 → 원고 데이터 갱신 → `build` |
| 컨트롤러·서비스·캐시·잠금 코드 | `build` (호출 경로·테이블 표가 다시 계산된다) → 원고 정책·흐름 확인 |
| 화면 추가 | catalog `routes` → 원고 화면 → `build` |
