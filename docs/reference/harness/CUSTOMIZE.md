# 설치 후 프로젝트 적응 체크리스트

코어를 설치하면 **골격만** 생긴다. 하네스가 실제로 값을 하려면 프로젝트 고유 지식을 채워야 한다.

이 문서는 그 목록이다. 위에서부터 순서대로 하면 된다.

---

## 0. 설치 직후 (5분)

- [ ] `node scripts/bootstrap-harness.cjs` — 심볼릭 생성
- [ ] `node scripts/verify-harness.cjs` — 통과 확인
- [ ] `.agents/harness.json`에 `{{...}}` 플레이스홀더가 남아 있지 않은지 확인
- [ ] `harness.json`의 `commands`를 하나씩 실제로 실행해 동작 확인
- [ ] `package.json`(또는 동등한 위치)에 스크립트 등록
- [ ] `.gitignore`에 로컬/산출물 경로 추가
- [ ] 어댑터 훅이 실제로 동작하는지 확인 (파일 하나 편집 후 포맷되는가)

`package.json`:

```json
{
  "scripts": {
    "bootstrap": "node scripts/bootstrap-harness.cjs",
    "precommit": "node scripts/precommit.cjs",
    "harness:verify": "node scripts/verify-harness.cjs",
    "postinstall": "node scripts/bootstrap-harness.cjs"
  }
}
```

```gitignore
.agents/local.yml
.agents/local/
.agents/artifacts/
.agents/runs/
.agents/tmp/
.agents/cache/
.claude/settings.local.json
```

---

## 1. 필수 — 비우면 하네스가 절반만 동작한다

### 1-1. `.agents/rules/golden-rules.md` §6 불변 조건 표

**가장 중요한 항목이다.**

이 프로젝트에서 **항상 참이어야 하는 조건**을 적는다. 깨지면 회귀가 되는 것들이다.

| 영역                 | 규칙                                | 검사 방법                   |
| -------------------- | ----------------------------------- | --------------------------- |
| (예) 외부 진입점     | 모든 진입점이 경계에서 입력을 검증  | `scripts/check-boundary.sh` |
| (예) 스키마 ↔ 구현   | 카탈로그와 실제 등록이 동기화       | `scripts/check-catalog.sh`  |
| (예) 리소스 수명주기 | 여는 코드에 정리 코드가 짝으로 있다 | 리뷰                        |

찾는 법:

1. 최근 6개월 회귀 버그를 훑는다. **같은 종류가 두 번 이상 났으면 불변 조건이다.**
2. "이거 빠뜨리면 터지는데"라고 구두로 전달되던 것을 적는다.
3. 짝으로 갱신해야 하는 파일 쌍을 찾는다.

기계로 검사 가능한 것은 `platform-guards` 모듈로 가드를 만들고 `harness.json#guards`에 등록한다.

### 1-2. `.agents/rules/pr-review-policy.md` — negative knowledge 표

**알지만 지금은 안 고치기로 한 것**의 목록이다.

| ❌ 지적하지 말 것               | 이유                            |
| ------------------------------- | ------------------------------- |
| (예) 특정 prefix 의 디버그 로그 | 점진 정리 대상. 일괄 지적 금지  |
| (예) 임시 방편으로 남긴 우회    | 의도된 코드. 후속 작업에서 정리 |
| (예) 레거시·신규 방식 공존      | 의도된 과도기. 통일은 별도 트랙 |

이 표가 비어 있으면 리뷰어가 매번 같은 것을 지적하고, 몇 번 반복되면 **리뷰 출력 전체가 무시된다.**

같은 표의 "중점 점검 영역"도 채운다 — 회귀가 반복되는 영역이며, 여기는 반대로 **적극적으로** 지적한다.

### 1-3. `AGENTS.md`

- [ ] Overview — 이 프로젝트가 무엇을 하는가 (2~3문장)
- [ ] Tech Stack — 언어·런타임·프레임워크·테스트·빌드
- [ ] Project Structure — 주요 디렉터리와 책임
- [ ] Domain Skills 표 — 스킬을 만들면서 채운다
- [ ] Project Invariants — §1-1과 같은 내용

250줄을 넘기지 않는다. 넘으면 `.agents/`로 옮긴다.

---

## 2. 중요 — 없으면 매번 저장소를 처음부터 탐색한다

### 2-1. `.agents/docs/architecture.md`

- [ ] 런타임 구성 — 무엇이 어디서 돌아가는가
- [ ] 디렉터리 구조와 각 디렉터리의 책임
- [ ] 데이터 흐름 — 요청/이벤트의 경로
- [ ] 경계 — 무엇이 무엇을 넘나드는가, 검증은 어디서
- [ ] 외부 의존과 실패 시 동작
- [ ] **거대 파일 목록** — `bash scripts/find-large-files.sh`로 뽑는다

### 2-2. `.agents/docs/conventions.md`

**코드에서 읽어낼 수 없는 암묵적 관례**를 적는다.

- [ ] 도메인 용어 ↔ 코드 식별자 매핑
- [ ] 자주 쓰는 패턴과 예시 위치
- [ ] **하지 않는 것** — 다른 프로젝트에선 표준이지만 여기선 의도적으로 안 쓰는 것

마지막 항목이 특히 값지다. 없으면 에이전트가 "표준"을 도입하려 든다.

### 2-3. `.agents/docs/knowledge/source-index.md`

- [ ] API 명세 위치 (없으면 `TBD` 유지 — **`TBD`면 API 작업을 시작하지 않는다**)
- [ ] 디자인/UX 기준 문서
- [ ] 사용자 매뉴얼, 요구사항 원본

### 2-4. `.agents/docs/RELIABILITY.md` — 실패 모드 표

이 시스템이 **실제로 실패하는 방식**을 적는다. 증상·감지·대응.

### 2-5. `.agents/docs/SECURITY.md`

- [ ] 자산 — 무엇을 지키는가
- [ ] 신뢰 경계
- [ ] **알려진 예외와 정리 기한** — 데모용 하드코딩 등

---

## 3. 도메인 스킬 (반복 작업이 보이면)

작업이 반복되면서 매번 같은 설명을 하고 있다면 스킬로 만든다.

```bash
cp -r .agents/skills/_TEMPLATE .agents/skills/_project/<도메인명>
# SKILL.md 작성 후
node scripts/bootstrap-harness.cjs   # 평면 심볼릭 자동 생성
```

- [ ] frontmatter의 `description`을 **"어떤 작업·파일에서 호출하는가 + 무엇을 다루는가"** 형태로
- [ ] 본문 5단: What / Why / How / Examples / Anti-patterns
- [ ] **Why에 "이 절차를 건너뛰면 무엇이 깨지는가"를 구체적 증상으로** — 증상이 있으면 모델이 스스로 검증한다
- [ ] `.agents/skills/README.md` 표에 한 줄
- [ ] `AGENTS.md` 스킬 표에 한 줄

스킬 후보를 찾는 법: **같은 실수를 두 번 이상 지적했다면 스킬이 없는 것이다.**

---

## 4. 가드 승격 (회귀가 반복되면)

`platform-guards` 모듈을 설치했다면:

- [ ] §1-1의 불변 조건 중 **기계로 검사 가능한 것**을 고른다
- [ ] `scripts/guard-template.sh`를 복사해 가드를 작성한다
- [ ] `harness.json#guards`에 **경고 단계로** 등록한다
- [ ] 기존 위반 수를 센다
- [ ] 위반을 0건으로 줄인다
- [ ] `enforceEnv`를 CI 기본값으로 켠다

**처음부터 강제하지 않는다.** 기존 위반이 전원의 커밋을 막으면 가드가 제거된다.

좋은 가드의 실패 메시지:

```text
✗ src/api/handlers/upload.ts:23: 경계 입력이 검증되지 않았습니다.
    핸들러 시작부에서 스키마 검증을 통과시킨 뒤 도메인 로직에 넘기세요.
    정책: .agents/rules/security-policy.md
```

---

## 5. 선택 모듈

### `jira-workflow`

- [ ] `.agents/issue-tracker.yml`의 `statusIds` — **표시 이름이 아니라 ID**
- [ ] `transitionIds` — 상태 ID와 다른 값이다
- [ ] `lockField` — 커스텀 필드를 못 만들면 코멘트 기반으로 대체
- [ ] `implementationQuery` — 후보 조회 질의
- [ ] `permissions.allowWrite`는 기본 `false`. 인증과 명시적 요청이 있을 때만 켠다

값을 채우지 않고 자동화를 켜면 **엉뚱한 상태로 전이시킨다.**

### `design-system`

- [ ] 기준 문서 표 — **어느 것이 최신 기준인지** 우선순위와 함께
- [ ] 토큰 owner 표 — 색상·간격·타이포·반경·모션이 코드 어디에 정의되어 있는가

---

## 6. 운영 리듬

### 매 작업

- [ ] `tasks.md` 체크박스 갱신을 코드와 같은 커밋에
- [ ] 검증 생략 시 사유와 잔여 위험 기록

### 반복 발견 시

- [ ] 같은 실수를 두 번 지적 → 스킬 또는 가드로 인코딩
- [ ] 회귀가 두 번 발생 → 불변 조건 표에 추가
- [ ] 미루기로 한 것 → `tech-debt-tracker.md`

### 분기마다

- [ ] `find-large-files.sh` 실행 — 새 거대 파일 확인
- [ ] `tech-debt-tracker.md` 훑기 — 해소된 항목 삭제
- [ ] negative knowledge 표 재검토 — 아직 유효한가
- [ ] `verify-harness` 경고 정리
- [ ] `source-index.md`의 `TBD` 확인

---

## 완료 판정

다음이 모두 참이면 하네스가 온전히 동작한다.

- [ ] `node scripts/verify-harness.cjs`가 경고 없이 통과한다
- [ ] `golden-rules.md` §6 불변 조건 표에 최소 1개 항목이 있다
- [ ] `pr-review-policy.md` negative knowledge 표가 채워져 있다
- [ ] `architecture.md`와 `conventions.md`가 스텁 상태가 아니다
- [ ] 새 세션을 열었을 때 에이전트가 **묻지 않고도** 프로젝트 관례에 맞는 코드를 낸다

마지막 항목이 진짜 판정 기준이다. 나머지는 그것을 위한 수단이다.
