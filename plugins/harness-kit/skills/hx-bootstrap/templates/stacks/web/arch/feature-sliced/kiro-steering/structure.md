---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · FSD 계층 (포인터)

원본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 기능 착수 전 연다. 아키텍처 원본은 `ARCHITECTURE.md`.

요약:

- 6계층 고정: `app` → `pages` → `widgets` → `features` → `entities` → `shared`.
- **위 계층만 아래를 import한다.** 아래에서 위를 참조하면 순환이다.
- **같은 계층의 다른 슬라이스를 직접 import하지 않는다** — 협력이 필요하면 한 계층 위에서 조립한다(가장 자주 깨지는 규칙).
- 슬라이스는 **공개 API(`index.ts`)로만** 열린다. 내부 파일 직접 import 금지. `index.ts` 에 전부 re-export 하지 않는다.
- 세그먼트는 `ui`·`model`·`api`·`lib`·`config` 중 필요한 것만.
- 슬라이스 판단: 개념이면 `entities`(명사), 행동이면 `features`(동사-목적어), 조합이면 `widgets`, 라우트면 `pages`.
- **`shared` 는 도메인을 모른다.** 도메인 이름이 등장하면 `entities` 로 내린다.
- 강제는 ESLint 경계 플러그인 + 타입 strict 뿐이다. 새 계층·디렉터리를 만들면 설정에 등록한다.
- 만들 때는 아래 계층부터(entities → features → widgets → pages).
