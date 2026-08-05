# harness-starter-kit — SDD 통합 로드맵 (남은 작업)

이 문서는 **킷 자체를 개발할 때** 남은 작업을 추적한다(설치된 프로젝트의 SDD `tasks/`와는 별개).
모든 항목은 **킷 안에서 직접 작성**한다 — 외부 레퍼런스 폴더나 다른 방법론 킷을 이름으로 언급하거나 경로로 참조하지 않는다.

> **불변식(self-contained):** `harness-starter-kit/` 킷은 그 자체만으로 동작·설명돼야 한다.
> 외부 `ref/` 경로 참조 금지, 외부 방법론 킷의 고유명 언급 금지.

---

## 완료

- **구조 재배치**: SDD를 제품 단위 `.agents/docs/product-<slug>-specs/{requirements,design,tasks/{active,check,completed}}` 로 배치. 전역 결정은 `decisions/`, 색인 `specs-index.md`, 전역 `tech-debt-tracker.md`.
- **워크플로 원본 + 명령**: `.agents/rules/sdd-workflow.md`(specify→clarify→plan→tasks→analyze→implement) + Claude 명령 6종 + Kiro 포인터 + `scripts/{new-feature,check-sdd-prerequisites}.sh`.
- **템플릿 강제 장치 각인**: requirements(우선순위 User Story P1/P2/P3 + 왜 + 독립 테스트 기준 + EARS `R#.#`, 측정가능·기술중립 Success Criteria `SC-###`, `[NEEDS CLARIFICATION]≤3` 규약, Edge Cases), design(Constitution Check 게이트 + Complexity Tracking, Quickstart e2e 검증, Research & Decisions), tasks(`T001 [P] [US1]` 포맷, Phase 구조 Setup→Foundational→User Story별→Polish, 의존 그래프·병렬 예시·구현 전략, 완료 승인 게이트 active→check→confirm→completed).
- **self-contained 정리**: 킷에서 외부 방법론 킷 이름표·경로 참조 전부 제거(grep 0건).

---

## 남은 작업 (다음 세션)

### Phase 4 — 게이트 · 정합성 ✅ (완료: 이 세션)
- [x] `/hx-analyze` 정합성 검사 정착: requirements↔design↔tasks 커버리지·모순·헌법 충돌 탐지를 읽기 전용 리포트로. 심각도(CRITICAL/HIGH/MEDIUM/LOW) 분류.
      → `sdd-workflow.md` `/hx-analyze` 절에 탐지 분류표(유형↔심각도) + 리포트 포맷(ID·심각도·유형·위치·발견·권고) + 커버리지 매트릭스 요약. `analyze.md` 트리거 동기화.
- [x] checklist 도입: 제품 폴더에 `checklists/` + 요구사항 품질 체크리스트 템플릿 신설. "요구사항의 유닛테스트" 개념 — 완결성 · 명료성 · 일관성 · 측정가능성 · 커버리지 항목. harness 한국어·EARS 스타일로 킷 안에서 직접 작성.
      → `checklists/_template.md`(CHK-### 5축 + 도메인 항목 + 판정 요약). `new-feature.sh` 부트스트랩·product `index.md` 반영.
- [x] `/hx-checklist <domain>` 얇은 명령 + 원본 `sdd-workflow.md`에 절 추가.
      → `commands/checklist.md`(얇은 트리거) + `sdd-workflow.md` `/hx-checklist` 절(clarify와 plan 사이). specs-index·kiro 포인터·manifest 흐름 문자열 동기화.

> 역할 분담: checklist = 한 문서 품질, /analyze = 세 문서 간 정합성. 둘 다 읽기 전용(수정은 `/hx-clarify`·`/hx-specify`·`/hx-plan`·`/hx-tasks`로 되돌림).

### Phase 5 — 하네스 완결성 ✅ (완료: 이 세션)
- [x] `.github/workflows/verify.yml` + `.pre-commit-config.yaml`: 둘 다 `scripts/verify.sh` **한 곳**을 트리거만("1곳 + N트리거" 유지).
      → CI(push/PR, JDK21+Gradle→`bash scripts/verify.sh`) + pre-commit(로컬 hook, 기본 pre-push 스테이지, `entry: bash scripts/verify.sh`). 로직 복제 0.
- [x] 아키텍처 구조 테스트 스켈레톤: 레이어 단방향 의존 위반을 잡는 ArchUnit/Konsist 예시.
      → `structure.md`에 **Konsist** 스켈레톤 절(도메인 프레임워크 무의존·domain/application→primary/infra 금지·컨텍스트 간 도메인 직접 import 금지·컨트롤러 envelope·`*PersistenceAdapter` 네이밍). 실제 레이어는 킷의 헥사고날(core→common→domain→application→primary/infra→bootstrap)에 맞춤. ArchUnit 대안 명시.
- [x] `settings.json` defaultMode의 `bypassPermissions` 완화 + 경고 문구(GateGuard 등 안전장치와의 관계 명시).
      → 기본값 `acceptEdits`로 하향 + `_comment_defaultMode` 경고(bypassPermissions는 모든 권한 프롬프트를 끄며 protect-sources·GateGuard 훅은 남지만 위험 도구까지 무프롬프트 — 신뢰·격리 환경에서만 상향).

### Phase 6 — 정리 ✅ (완료: 이 세션)
- [x] converge 명령: 잔여 작업을 tasks에 append-only로 회수(`## Phase N: Convergence`).
      → `commands/converge.md`(얇은 트리거) + `sdd-workflow.md` `/hx-converge` 절(구현 후·append-only·완료 기능 재개방·스펙 결함은 되돌림). N-트리거 동기화(kiro 포인터·specs-index·new-feature.sh·tasks/README·manifest).
- [x] 스펙 신선도 체크(오래된 draft·미해결 마커 리포트).
      → `scripts/check-spec-freshness.sh`(읽기 전용·항상 exit 0). 정체 draft/in-review(mtime), 미해결 `[NEEDS CLARIFICATION: …]`(콜론 형식만·백틱 예시 제외로 오탐 제거), 정체 active tasks 리포트. `/hx-converge` 근거.
- [x] Kiro 포인터 3종 보강 + Codex 훅 검증.
      → `.kiro/steering/{code-comments(fileMatch),quality-score(always),reliability(always)}.md` 추가(원본 8→11종 격차 해소). Codex 훅 3종(`.codex/hooks/*.sh`)은 Claude 훅과 바이트 동일·`hooks.json` 배선(PreToolUse/SessionStart/Stop) 일치 확인(경로만 codex 상대·claude `$CLAUDE_PROJECT_DIR`, hooks.json `_comment`에 명시된 의도적 차이).
- [x] 위생 파일(`.gitignore`에 `.DS_Store` 등) 정리.
      → `templates/root/.gitignore`(OS·IDE·Gradle 빌드·`.env` 무시). manifest 등록.
- e2e 검증: 임시 디렉터리 `setup.sh` 설치 → `new-feature.sh` → 신규 파일 6종 설치·치환·실행권한, `check-spec-freshness.sh`(오탐 0·인라인 마커 1 탐지) + `check-exec-plan-status.sh`(OK), self-contained 위반 0 확인.

> 잔여(선택): `docs/analysis/*` 스크래치 정리(로드맵 line 53) — 삭제는 사용자 판단에 위임(생성자 아님).

### Phase 7 — 다중 스택 지원 (python · go) ✅ (완료: 이 세션)

킷이 Kotlin/Java + Spring 전용이던 것을 **스택 오버레이** 구조로 바꿔 Python·Go 백엔드를 추가했다.

- [x] `templates/` 재편: `templates/common/`(스택 무관 51개) + `templates/stacks/{jvm,python,go}/`(각 17개).
      → 공통 = SDD 기록 시스템·claude/codex 배선·공통 스크립트 4종·규칙 3종(`agent-harness`·`sdd-workflow`·`product`)·`.pre-commit-config.yaml`.
      → 스택별 = 진입 파일 5종(`AGENTS`·`CLAUDE`·`ARCHITECTURE`·`.gitignore`·CI) + 규칙 8종 + kiro 포인터 3종 + `verify.sh`.
- [x] 공통 파일의 JVM 종속 문구 중립화(`agent-harness.md`·session-start 훅·`/hx-harness`·pre-commit·SDD 템플릿의 Kotlin 예시).
- [x] **python 스택**: src 레이아웃 헥사고날 + import-linter 계약이 컴파일 강제를 대신(layers·forbidden·independence) + mypy strict. FastAPI/SQLAlchemy 2.0(async)/Pydantic v2(경계 전용)/uv/Ruff/pytest. docstring 주석 표준(타입 힌트가 계약을 담으므로 `Args:` 타입 반복 금지), async 규약(blocking 금지·timeout 필수·fire-and-forget 금지), Python 고유 보안(eval/pickle·`shell=True`·경로 순회·`secrets`).
- [x] go 스택: [golang-standards/project-layout](https://github.com/golang-standards/project-layout)(`cmd`·`internal`·`pkg`·`api`·`configs`…) + `internal/` 안 헥사고날. 강제는 `internal/` 가시성·import 사이클(컴파일) + depguard. Go doc 주석 규약(선언 이름으로 시작), 에러는 값(`%w`·`errors.Is/As`·panic 금지), context 전파·고루틴 소유권, Go 고유 보안(`crypto/rand`·`subtle.ConstantTimeCompare`·`InsecureSkipVerify` 금지).
- [x] `setup.sh`: `STACK`/`--stack=` 지원(기본 `jvm`), 두 루트 순차 복사(common → stack), 스택별 기본 치환값(`PRIMARY_LANGUAGE`·`BUILD_TOOL`·`TEST_CMD`)·`PACKAGE_NS` 의미 안내·스택별 다음 단계 출력, 미지원 스택은 목록 출력 후 `exit 2`.
- [x] 킷 문서 동기화: `SKILL.md`(스택 결정 절차 추가)·`manifest.md`(공통/스택 분리표)·`README.md`·`docs/analysis/{README,01,02,04}`.
- e2e 검증: 3스택 dry-run + 실제 설치 각 **68개 파일**(공통 51 + 스택 17), 미치환 토큰 0(안내 문구의 리터럴 `{{...}}` 제외), `verify.sh` 3종 `bash -n` 통과, 미지원 스택 거부 확인.

---

## Phase 8 — 아키텍처 변형(ARCH) 선택 지원 ✅ (완료: 이 세션)

> **배경**: Python·Go가 무조건 헥사고날일 필요는 없다. 레이어드·모듈(패키지 바이 피처)·플랫 등
> 실무에서 흔한 레이아웃을 선택할 수 있어야 한다. **사용자 승인 완료(2026-07-28)**.

### 완료 요약

- [x] **구조 재편** — 3스택의 아키텍처 종속 3종(`root/ARCHITECTURE.md`·`agents-rules/structure.md`·`kiro-steering/structure.md`)을 `arch/hexagonal/`로 이동. 스택 루트에는 변형 무관 14개만 남았다.
- [x] 신규 21개 — python 4변형(`layered`·`modular`·`django`·`ai-service`) + go 3변형(`layered`·`feature`·`flat`) × 3파일. 각 `ARCHITECTURE.md`에 선택 기준(§0)·승격 신호·전환 절차를 각인(사용자가 "둘 다"를 고른 이유).
- [x] setup.sh — `ARCH` 환경변수 + `--arch=` 플래그(기본 `hexagonal`), `find ... ! -path "*/arch/*"` 로 스택 순회에서 변형 제외, 변형 유효성 검사(`exit 2` + 사용 가능 목록), 요약에 `아키텍처:` 한 줄, "다음 단계"를 **스택×변형**으로 분기.
- [x] 공유 규칙 중립화(8.4) — `guardrails.md`의 "레이어 책임(DDD)" 절을 **변형 무관 공통 원칙**(비즈니스 규칙은 안쪽·오케스트레이션은 바깥·트랜잭션 경계 한 곳·경계에서 파싱·생성자 주입)으로 재작성. `AGENTS/CLAUDE.md`·`api-standards`·`quality-score`·`reliability`·`code-comments`·`tech.md`의 헥사고날 경로 하드코딩을 역할 명칭 + 원본 위임으로 교체. jvm은 범위 밖이라 그대로 둔다.
- [x] verify.sh 조건부 단계(8.5) — python 게이트 한 파일에 존재 감지 기반 단계 추가: `manage.py` → `manage.py check` + `makemigrations --check --dry-run`(드리프트 차단), `evaluation|evals` + `EVAL_ON_VERIFY=1` → eval 스모크(기본 비활성·nightly 권장). `mypy` 대상도 존재하는 경로만 넘기도록 변경(django는 `src/` 없음).
- [x] 문서 동기화(8.6) — `SKILL.md`(변형 표 + 결정 절차 2-1단계)·`README.md`(변형 매트릭스)·`manifest.md`(3루트·51+14+3=68)·`docs/analysis/{README,01,02,04}`.
- e2e 검증(8.7): 10개 조합(python 5 × go 4 × jvm 1) dry-run 각 68개 파일, `verify.sh` 3종 `bash -n` 통과, 잘못된 `ARCH`·스택 밖 변형 모두 `exit 2` 거부 확인.

### 8.0 확정된 결정 (사용자 응답)

| 항목 | 결정 |
|---|---|
| 제공 방식 | 둘 다 — `ARCH` 변수로 하나를 선택 설치(강제 설정 동반) + 각 변형 문서에 선택 기준·다른 변형 전환 가이드 병기 |
| Python 변형 | `hexagonal`(현행) · `layered` · `modular` · `django` · **`ai-service`**(사용자 추가: "AI 시스템 등 다양한 레이아웃") |
| Go 변형 | `hexagonal`(현행) · `layered` · `feature`(패키지 바이 피처=모듈 방식) · `flat`(소규모) |
| JVM | 이번 범위 밖. 구조만 `arch/hexagonal/`로 통일해 나중에 추가 가능하게 둔다 |

### 8.1 디렉터리 구조 변경

아키텍처에 종속되는 파일은 **3개뿐**이다. 이것만 변형별로 두고 나머지는 스택 안에서 공유한다.

```text
templates/stacks/<stack>/
├── agents-rules/     ← 변형 무관 7종 (tech·code-comments·api-standards·security·reliability·quality-score·guardrails)
├── kiro-steering/    ← 변형 무관 2종 (tech·code-comments)
├── root/             ← 변형 무관 4종 (AGENTS.md·CLAUDE.md·.gitignore·.github/workflows/verify.yml)
├── scripts/verify.sh ← 변형 무관 1종
└── arch/<variant>/
    ├── root/ARCHITECTURE.md         ← 변형별 아키텍처 원본(+ 강제 설정 골격)
    ├── agents-rules/structure.md    ← 변형별 레이아웃·네이밍·착수 워크플로
    └── kiro-steering/structure.md   ← 변형별 얇은 포인터
```

- 기존 3종(jvm·python·go 각각)을 `arch/hexagonal/`로 **이동**(git 없는 리포라 단순 mv).
- 신규 파일 = python 4변형×3 + go 3변형×3 = **21개**.

### 8.2 변형별 레이아웃·강제 규칙 (설계 확정본)

**Python** — 강제는 모두 `pyproject.toml`의 `[tool.importlinter]` 계약(=컴파일 강제 대체물).

| ARCH | 레이아웃 | import-linter 계약 |
|---|---|---|
| `hexagonal` | `src/<pkg>/{core,common,bootstrap}` + `<ctx>/{domain,application,primary,infra}` | 현행(layers 2종 + forbidden + independence) |
| `layered` | `src/<pkg>/{core,api,schemas,services,repositories,models}` + `main.py` | `layers = [api, services, repositories, models]` · forbidden(services·repositories·models → fastapi 금지) |
| `modular` | `src/<pkg>/shared/` + `modules/<feature>/{router,schema,service,repository,model}.py` | `independence`(모듈 간 직접 import 금지, `__init__.py` 공개 API 또는 shared 경유) + 모듈 내부 `layers` + forbidden |
| `django` | `config/settings/*` + `apps/<app>/{models,selectors,services,serializers,views,urls}.py` | `layers = [views, services : selectors, models]` · `independence`(앱 간) · forbidden(models·selectors → rest_framework 금지). services=쓰기 / selectors=읽기 분리 |
| `ai-service` | `src/<pkg>/{api,agents,prompts,llm,retrieval,pipelines,evaluation,observability,domain,core,common,bootstrap}` | `layers = [api, agents, {llm : retrieval}, domain]` · forbidden(`domain`·`prompts` → provider SDK 금지) |

`ai-service` 추가 규약(ARCHITECTURE.md에 각인): 프롬프트는 코드가 아니라 **버전 관리 자산**(변경 시 eval 필수) ·
프로바이더는 어댑터 뒤로(교체 가능) · 토큰/비용/지연 계측 필수 · **eval 회귀 게이트** · 비결정성 통제(seed·temperature 고정, 스냅샷 테스트 지양).

**Go** — 강제는 `internal/` 가시성·import 사이클(컴파일) + `.golangci.yml`의 depguard.

| ARCH | 레이아웃 | depguard 규칙 |
|---|---|---|
| `hexagonal` | `cmd/` + `internal/<ctx>/{domain,app,primary/http,infra}` | 현행 3종 |
| `layered` | `cmd/` + `internal/{config,database,logger,middleware,handler,service,repository,model}` | model·repository·service → `net/http` 금지 · handler → repository 직접 import 금지(service 경유) |
| `feature` | `cmd/` + `internal/platform/{config,db,log,httpx}` + `internal/<feature>/{handler,service,store,model}.go` | feature 패키지 간 직접 import 금지(main 조립 또는 contract 경유) · store·model → `net/http` 금지 |
| `flat` | `cmd/<binary>/main.go` + 루트(또는 `internal/app/`) 패키지 하나에 `handler.go`·`service.go`·`store.go`·`model.go` | 최소 규칙(순환 금지·`net/http`를 store에서 금지). "파일이 5~7개를 넘으면 `feature`로 승격" 기준을 문서에 각인 |

각 변형 문서에 반드시 넣을 것(사용자가 "둘 다"를 고른 이유):
1. **언제 이 변형인가 / 언제 아닌가**(선택 기준),
2. **다른 변형으로 전환하는 법**(디렉터리 이동 + 강제 규칙 교체 지점),
3. **승격 신호**(flat→feature, layered→hexagonal 등 트리거 조건).

### 8.3 setup.sh 변경안

- `ARCH` 환경변수 + `--arch=<variant>` 플래그. 기본값 `hexagonal`(모든 스택 공통).
- 복사 순서: `common/` → `stacks/<STACK>/`(단 **`arch/` 하위 제외**) → `stacks/<STACK>/arch/<ARCH>/`.
  - 제외 구현: `find "$root" -type f ! -path "*/arch/*" ! -name '.DS_Store'`.
- 유효성 검사: `templates/stacks/<STACK>/arch/<ARCH>` 미존재 시 사용 가능한 변형 목록 출력 후 `exit 2`(스택 검사와 동일 패턴).
- 요약 출력에 `아키텍처: <ARCH>` 한 줄 추가, "다음 단계"를 **스택×변형**에 맞게 분기(예: django면 `manage.py`·settings 분리, ai-service면 eval 하네스).

### 8.4 공유 규칙 중립화 (아키텍처 고정 문구 제거)

변형 무관 파일에서 헥사고날을 전제한 문구를 원본 위임으로 바꾼다.

- `root/AGENTS.md`·`root/CLAUDE.md` — "src 레이아웃 헥사고날" 등 한 줄 → "선택한 아키텍처는 `ARCHITECTURE.md` 원본".
- `agents-rules/guardrails.md` — "레이어 책임(DDD)" 절을 **변형 무관 공통 원칙**(비즈니스 규칙은 안쪽, 오케스트레이션은 바깥, 트랜잭션 경계는 한 곳, 생성자 주입, 경계에서 파싱)으로 재작성하고 구체 경로는 `structure.md`로 위임.
- `agents-rules/{api-standards,quality-score,reliability,code-comments}.md` — `primary/`·`infra/` 같은 경로 하드코딩을 역할 명칭(인바운드 경계·아웃바운드 어댑터)으로 완화.

### 8.5 verify.sh 조건부 단계 (스택 공유 유지)

변형마다 파일을 나누지 않고 **존재 감지 기반 선택 실행**으로 흡수한다.

- python: `manage.py`가 있으면 → `python manage.py makemigrations --check --dry-run`(마이그레이션 드리프트) + `manage.py check` 추가 실행(django 변형 대응).
- python: `evaluation/` 또는 `evals/`가 있고 `EVAL_ON_VERIFY=1`이면 → eval 스모크 실행(ai-service 대응, 기본은 비활성 — 비용·비결정성 때문에 nightly 권장).

### 8.6 문서 갱신 대상

`SKILL.md`(스택+변형 결정 절차) · `manifest.md`(arch 레이어·변형표) · `README.md`(변형 매트릭스) ·
`docs/analysis/{README,01,02,04}`(설치 3루트·강제 수단이 변형별로 달라짐) · 이 로드맵.

### 8.7 검증

- 전 조합 dry-run: python 5 × go 4 × jvm 1 = **10조합**, 각 68개 파일(파일 수 불변) 확인.
- 설치 후 미치환 토큰 0, `.agents/rules` 11종·kiro 11종, 문서 내부 링크 깨짐 0.
- `verify.sh` `bash -n` + 실제 실행(도구 미설치 보고 정상).
- 잘못된 `ARCH` 거부 확인.

---

## Phase 9 — tech.md 변형별 분리 + JVM 변형 추가 ✅ (완료: 이 세션)

> **배경(Phase 8의 잔여 한계)**: ① `tech.md`가 스택 공유라 python 스택의 `django`·`ai-service` 변형에서 스택 표가
> 실제와 맞지 않았다(FastAPI/SQLAlchemy 기준). ② JVM은 `hexagonal` 하나뿐이라 python·go와 형식이 어긋났다.

### 완료 요약

- [x] `tech.md` 변형별 분리 — 3스택의 `agents-rules/tech.md`를 `arch/hexagonal/agents-rules/`로 이동하고, 나머지 변형 10종(python 4 · go 3 · jvm 3)을 새로 작성했다. 변형 종속 4개 / 스택 무관 13개 / 공통 51개 → **설치 합계 68개 불변**.
- [x] python 변형 tech.md — `layered`·`modular`는 FastAPI 기준 유지 + 진입점(`{{PACKAGE_NS}}.main:app`)·설정 로더 위치 교체. `django`는 Django 5.x/DRF/Django ORM/pytest-django/Celery/django-stubs로 스택 표 전면 교체(게이트에 `manage.py check`·`makemigrations --check` 명시). `ai-service`는 애플리케이션 토대 + **AI 고유 구성요소 표**(프로바이더 SDK 격리·벡터 저장소·프롬프트 자산·구조화 출력·eval·토큰/비용/지연 계측) + `EVAL_ON_VERIFY` 규약 절.
- [x] go 변형 tech.md — 공통 도구 체인 유지 + 설정 로더 위치(`internal/config` / `internal/platform/config` / `internal/app/config.go`)·진입점·depguard 참조 섹션(§3.2)·구조 테스트 문구를 변형에 맞게 교체. `flat`은 "적게 쓴다" 스택 원칙과 승격 신호(직접 의존 10개)를 각인.
- [x] JVM 변형 3종 추가(각 4파일 = `ARCHITECTURE.md`·`agents-rules/{structure,tech}.md`·`kiro-steering/structure.md`) — 셋 다 단일 모듈(현행 `hexagonal`만 멀티모듈):
      `layered`(ArchUnit `layeredArchitecture()` + 건너뛰기 금지·엔티티 web 무의존·트랜잭션 위치) ·
      `modulith`(Spring Modulith `ApplicationModules.verify()` + 공개 표면=모듈 루트 타입·`internal/`·`@ApplicationModuleListener` 이벤트·Kotlin `package-info.java` 주의) ·
      `feature`(ArchUnit `slices().beFreeOfCycles()`·`notDependOnEachOther()` + `<feature>/api` 공개 계약).
      각 `ARCHITECTURE.md`에 **선택 기준(§0)·승격 신호·전환 절차**를 Phase 8과 같은 형식으로 각인.
- [x] JVM 공유 규칙 중립화(Phase 8.4의 JVM판) — 변형이 4개가 되면서 헥사고날 전제 문구를 원본 위임으로 교체: `guardrails.md`의 "레이어 책임" 절을 변형 무관 원칙으로 재작성, `api-standards`·`quality-score`·`reliability`·`security`·`code-comments`의 `primary/web/dto`·`infra 어댑터`·`Application Service` 하드코딩을 역할 명칭으로, `root/{AGENTS,CLAUDE}.md`와 kiro `tech.md` 포인터의 "멀티모듈 헥사고날" 문구를 변형 선택 안내로 교체.
- [x] setup.sh — 헤더의 ARCH 목록·"변형이 바꾸는 파일 4개" 문구 갱신, "다음 단계" `jvm` 분기에 `case "$ARCH"` 추가(변형별 패키지 생성 + 필요한 강제 의존성 안내). 복사·검증 로직은 디렉터리 기반이라 무변경.
- [x] **문서 동기화** — `SKILL.md`(설명 줄·변형 표 jvm 4행·다음 단계)·`README.md`(변형 매트릭스·구성 트리·6종/4종 분류)·`manifest.md`(51+13+4)·`docs/analysis/{README,01,02}`(규칙 원본 = 공통 3 + 스택별 6 + 변형별 2).
- 검증: 13조합(python 5 × go 4 × jvm 4) dry-run + 실제 설치 각 68개, 변형별 4파일 마커 확인, 미치환 토큰 0, 규칙 11종·kiro 11종, `verify.sh` 3종 `bash -n`, 잘못된 ARCH 거부.

### 9.0 확정된 결정 (사용자 응답)

| 항목 | 결정 |
|---|---|
| `tech.md` 배치 | 변형별로 분리 — `arch/<variant>/agents-rules/tech.md`. 변형 종속 파일 3→4개, 스택 무관 14→13개. 설치 합계 68개 불변(51 + 13 + 4) |
| JVM 변형 | `layered` · `modulith` · `feature` 추가(현행 `hexagonal` 포함 총 4변형) |

### 9.1 신규/이동 파일

**이동(3개)** — 각 스택의 `agents-rules/tech.md` → `arch/hexagonal/agents-rules/tech.md`.

신규 `tech.md`(10개) — 변형마다 스택 표·실행 명령·검증 명령·포트 규약을 그 변형에 맞게 확정:

| 스택 | 변형 | tech.md 에서 달라지는 것 |
|---|---|---|
| python | `layered` · `modular` | FastAPI 기준 유지 + 진입점(`<pkg>.main:app`)·레이아웃 문구만 교체 |
| python | `django` | Django 5.x · Django ORM · DRF · pytest-django · Celery. 실행 `manage.py runserver`, 게이트에 `makemigrations --check` |
| python | `ai-service` | FastAPI + LLM 프로바이더 SDK · 벡터/검색 저장소 · eval 도구 · 관측(토큰·비용·지연) 행 추가. `EVAL_ON_VERIFY` 규약 |
| go | `layered` · `feature` · `flat` | 공통 Go 도구 체인 유지 + 레이아웃·진입점·구조 테스트 문구 교체 |
| jvm | `layered` · `modulith` · `feature` | 단일 모듈 Gradle 구성(멀티모듈 아님) · ArchUnit/Spring Modulith 의존 · 실행 명령 |

**신규 JVM 변형(9개)** — 3변형 × 3파일(`root/ARCHITECTURE.md`·`agents-rules/structure.md`·`kiro-steering/structure.md`):

| ARCH | 레이아웃 | 강제 규칙 |
|---|---|---|
| `layered` | 단일 모듈 `com.<ns>.{controller,service,repository,entity,config}` | ArchUnit `layeredArchitecture()` — controller→service→repository→entity 단방향, 건너뛰기 금지, entity가 web 타입 참조 금지 |
| `modulith` | 단일 모듈 `com.<ns>.<module>/` + `@ApplicationModule` | Spring Modulith `ApplicationModules.verify()` — 모듈 간 직접 참조 금지(공개 API `<module>/api` 또는 도메인 이벤트 경유), 순환 금지 |
| `feature` | 단일 모듈 `com.<ns>.<feature>.{web,service,repository,domain}` | **ArchUnit `slices().matching("..<ns>.(*)..").should().beFreeOfCycles()`** + feature 간 직접 참조 금지 |

> 총 신규 19개 + 이동 3개. Phase 8과 같은 원칙을 유지한다: **선택 기준(§0)·승격 신호·전환 절차**를 각 `ARCHITECTURE.md`에 각인.

### 9.2 setup.sh 변경

- 코드 변경은 "다음 단계" 출력의 `jvm` 분기에 `case "$ARCH"` 추가뿐이다(변형 탐색·검증·복사는 이미 디렉터리 기반이라 자동 인식).
- `PRIMARY_LANGUAGE`·`BUILD_TOOL`·`TEST_CMD` 기본값은 스택 단위로 유지(변형이 바꿔야 하면 `tech.md`가 원본).

### 9.3 문서 갱신

`SKILL.md`(변형 표에 jvm 4종) · `README.md`(변형 매트릭스·구성 트리) · `manifest.md`(**공통 51 + 스택 13 + 변형 4**, `tech.md` 행을 "✅ 변형별"로) · `docs/analysis/{README,01,02}`(규칙 원본 11종 = 공통 3 + 스택별 6 + 변형별 2) · 이 로드맵.

### 9.4 검증

- 전 조합 dry-run + 실제 설치: python 5 × go 4 × jvm 4 = 13조합, 각 **68개 파일**.
- 설치본에서 `tech.md`·`structure.md`·`ARCHITECTURE.md` 3종이 선택한 변형의 것인지 마커로 확인.
- 미치환 토큰 0, 규칙 11종·kiro 11종, `verify.sh` 3종 `bash -n` + 실행, 잘못된 ARCH 거부.

### 9.5 작업 순서

1. 3스택 `tech.md` → `arch/hexagonal/agents-rules/`로 이동 → 13조합 dry-run 회귀(68 유지).
2. python 4 + go 3 변형의 `tech.md` 작성.
3. JVM 3변형 × 4파일 작성(`layered` → `modulith` → `feature`).
4. setup.sh jvm `case "$ARCH"` 분기 + 문서 갱신(9.3).
5. 전 조합 검증(9.4).

> **비용 주의**: Phase 8 세션이 $404에서 중단됐다. Phase 9는 신규 19개 파일이라 규모가 비슷하다.
> 새 세션으로 시작하고, GateGuard는 **파일별 최초 편집만 막으므로**(재시도 시 통과) 사실 블록을 한 번 제시한 뒤 배치로 쓰면 왕복이 준다.

---

## Phase 10 — 슬래시 커맨드 4하네스 확장 + `hx-` 접두사 ✅ (완료: 이 세션)

> **배경**: ① 킷 자체를 부르는 슬래시 커맨드가 없어 자연어로만 호출할 수 있었다. ② 설치본 SDD 커맨드가 Claude Code 전용이었고, `/plan`·`/analyze` 같은 흔한 이름이라 타 플러그인과 충돌.

### 완료 요약

- [x] 킷 호출 커맨드 — `plugins/harness-kit/commands/bootstrap.md` 신설(얇은 트리거 → `SKILL.md` 원본) + `.claude-plugin/plugin.json` 에 `"commands": ["./commands/"]`. → `/harness-kit:bootstrap`. Codex 플러그인 매니페스트는 커맨드 필드를 지원하지 않아 스킬 호출을 유지한다.
- [x] `hx-` 접두사 소급 — 설치본 SDD 커맨드 9종을 `hx-*` 로 rename하고, 참조를 전 트리에 걸쳐 치환했다(원본 `sdd-workflow.md` 절 제목 8개 · kiro 포인터 · 스크립트 안내 문구 · 템플릿 · 킷 문서). 치환은 백틱 직후 `/cmd` 와 `(/cmd 절)` 두 형태로 한정해 경로(`specs/tasks/`·`req/design/tasks`)와 리포명(`<owner>/harness-starter-kit`) 오탐을 막았다.
- [x] **4하네스 확장(36개 신규)** — Claude 원본에서 나머지 3하네스를 파생:
      `cursor/commands/hx-*.md`(9) · `kiro-steering/hx-*.md`(9, `inclusion: manual`) · `kiro-skills/hx-*/SKILL.md`(9) · `agents-skills/hx-*/SKILL.md`(9).
- [x] **재생성 도구** — `tools/sync-commands.sh`(설치 안 됨). 커맨드 본문은 `claude/commands/` 만 고치고 이 스크립트로 3하네스를 다시 만든다(드리프트 방지).
- [x] setup.sh — `remap()` 에 3경로 추가(`kiro-skills/`→`.kiro/skills/`, `agents-skills/`→`.agents/skills/`, `cursor/`→`.cursor/`). 복사·검증 로직은 디렉터리 기반이라 무변경.
- [x] **문서 동기화** — `SKILL.md`(원칙 + 파일 수)·`manifest.md`(경로 매핑 3행·산출물 4행·87+13+4=104)·킷 `README.md`(사용법·구조 트리)·스킬 `README.md`(슬래시 커맨드 절)·`docs/analysis/{README,02}`.
- 검증: python·go dry-run 각 **104개**(68+36), 실제 설치 후 5경로(claude 9 · cursor 9 · kiro/skills 9 · agents/skills 9 · kiro/steering hx- 9) 확인, 신규 트리 미치환 토큰 0, 치환 오탐 0.

### 10.0 확정된 결정 (사용자 응답)

| 항목 | 결정 |
|---|---|
| 접두사 | **`hx-`** — harness 축약. 2글자라 짧고 충돌 확률이 사실상 0 |
| 접두사 소급 | 소급한다 — Claude 기존 9종도 rename해 4하네스 이름을 일치시킴(기존 설치본과는 호환성 깨짐) |
| Codex 경로 | `.agents/skills/` — 프로젝트 로컬 `.codex/prompts/` 는 탐색 경로가 아니고(유저 홈 전용) custom prompts 자체가 deprecated. 공식 대체재인 skills 사용 |
| Kiro 범위 | IDE + CLI 둘 다 — steering(`inclusion: manual`) + `.kiro/skills/` |
| 플러그인 커맨드 수 | **1개**(`bootstrap`) — 스킬이 하나뿐이라 1:1 매핑이 정직하다 |

> **하네스별 탐색 경로 근거**: Claude Code `.claude/commands/` · Cursor `.cursor/commands/`(1.6+) ·
> Kiro IDE는 `inclusion: manual` steering이 슬래시 메뉴에 노출 · Kiro CLI는 `.kiro/skills/` ·
> Codex는 `$REPO_ROOT/.agents/skills`(`$<name>` 멘션, `/skills` 목록).

---

### 8.8 작업 순서 (Phase 8 — 완료)

1. `arch/hexagonal/`로 3스택 기존 3종 이동 → dry-run으로 순회 제외 필요성 확인.
2. setup.sh에 ARCH 지원 + `arch/` 제외 순회 추가 → hexagonal 회귀 검증(68개 유지).
3. Python 4변형 작성(layered → modular → django → ai-service).
4. Go 3변형 작성(layered → feature → flat).
5. 공유 규칙 중립화(8.4) + verify.sh 조건부 단계(8.5).
6. 문서 갱신(8.6) → 전 조합 검증(8.7).

> **주의**: 이 리포는 GateGuard(fact-forcing) 훅이 있어 파일별 최초 편집/생성만 게이트된다(재시도 시 통과).
> 신규 파일이 21개이므로, 한 턴에 짧은 더미 Write를 몰아 경로를 등록하고 다음 턴부터 본문을 쓰면 왕복이 절반으로 준다.

---

## Phase 11 — SDD 템플릿을 제품 폴더에서 분리 ✅ (완료: 이 세션)

> **배경**: 사용자 실사용 제보. bootstrap이 `.agents/docs/product-<PROJECT_SLUG>-specs/` 를 씨앗 제품 폴더로 깔고 그 안에 `_template.md` 4종을 함께 두는 구조였다. 실제 SDD를 시작하면 ① 프로젝트 슬러그로 된 가짜 제품 폴더가 남고 ② `new-feature.sh` 가 새 제품 폴더를 만들 때 기존 제품에서 템플릿을 통째로 복사해 제품 수만큼 템플릿 사본이 늘어났다. "기본 템플릿인데 이름이 바뀌어 생성된다"는 지적이 정확했다.

### 완료 요약

- [x] 템플릿 분리 — `agents-docs/product-{{PRODUCT_SLUG}}-specs/` → `agents-docs/_spec-templates/`. 제품과 무관한 복사 원본 한 벌로 승격하고, 용도를 명시하는 `_spec-templates/README.md` 를 신설했다. 씨앗 제품 폴더용 `.gitkeep` 3개는 제거.
- [x] 제품 폴더는 설치하지 않는다 — `product-<slug>-specs/` 는 `new-feature.sh <slug> <feature>`(= `/hx-specify`)가 첫 기능에서 만든다. 설치 직후 `specs-index.md` 등록표는 비어 있다.
- [x] `new-feature.sh` 재작성 — 소스를 `_spec-templates/` 로 고정. 제품 폴더가 없으면 골격(`index.md`·`tasks/README.md`·빈 하위폴더)까지 만들되 `_template.md` 는 복사하지 않는다. 복사 시점에 `{{PRODUCT_SLUG}}` 를 치환한다.
- [x] `setup.sh` — `PRODUCT_SLUG` 를 설치 치환 토큰에서 제거(`EPIC_ID`·`FEATURE_NAME` 과 같은 "스펙 시점" 토큰으로 재분류). 경로 토큰 치환 로직도 제거했다(경로에 슬러그가 박히는 대상이 사라졌다). 미치환 토큰 안내는 `| grep -v '_spec-templates/'` 로 갱신.
- [x] **문서 동기화** — `SKILL.md`(description·②축·6·7단계)·`manifest.md`(산출물 행·토큰표·85+13+4=102)·킷/스킬 `README.md`·`agents-docs/README.md` 트리·`specs-index.md`(빈 등록표 + 죽은 `new-product.sh` 참조 제거)·`sdd-workflow.md`·`hx-checklist`/`hx-specify` 5하네스 각각·`docs/analysis/{02,03}`.
- 검증: jvm·python·go 3조합 설치 각 **104개**(87+13+4, 변형 무관 불변). e2e로 제품 2개(`order`·`billing`) 생성 후 제품 폴더 내 `_template.md` 0건 · 잔여 `{{PRODUCT_SLUG}}` 0건 확인. 제품 폴더 유무 양쪽에서 `check-spec-freshness.sh`·`check-exec-plan-status.sh` 정상 종료.

### 11.0 확정된 결정 (사용자 응답)

| 항목 | 결정 |
|---|---|
| 씨앗 제품 폴더 | 아예 만들지 않는다 — 빈 껍데기 폴더가 남는 쪽보다 낫다 |
| 템플릿 설치 위치 | 프로젝트 안 `.agents/docs/_spec-templates/` — 플러그인 경로는 설치 후 사라질 수 있어 `new-feature.sh` 가 의존할 수 없다 |

---

## 작업 규칙

- 각 Phase 끝에 `scripts/verify.sh` + 사용자 승인.
- 검증은 임시 디렉터리에 `setup.sh` 설치 → `scripts/new-feature.sh <slug> <feature>` e2e로 템플릿 렌더·강제 장치 확인.
- 신규 치환 토큰을 도입하면 `setup.sh` `subst()` 목록과 `manifest.md` 토큰표에 동기화.
- **이 문서가 계획 원본**이다. (참고: `docs/analysis/*`는 초기 분석용 스크래치로, 실제 작업 기준이 아니며 곧 정리될 예정.)
