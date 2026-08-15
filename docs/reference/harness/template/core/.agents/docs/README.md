# .agents/docs — 하네스 지식 베이스

이 디렉터리는 에이전트가 **점진적으로 읽는** 저장소 내 지식 베이스다. 루트 `AGENTS.md`는 목차 역할만 하고, 상세한 정책·설계·제품 맥락·실행 계획은 이곳과 `.agents/rules/`, `.agents/skills/`에 둔다.

## 디렉터리 구조

```text
.agents/docs/
├── product-specs/     # 작업 단위별 requirements/design/tasks (단일 위치)
├── design-docs/       # 반복 적용되는 방법론, 운영 의사결정
├── exec-plans/        # active/completed 실행 계획 + 기술 부채
├── knowledge/         # 외부 근거의 Source ID 색인
├── references/        # 외부 문서 캐시·요약
├── generated/         # 코드/스키마에서 재생성 가능한 문서
├── architecture.md    # 현재 코드 구조와 런타임 아키텍처
├── conventions.md     # 프로젝트 구현 관례
├── SECURITY.md        # 보안 기준
├── RELIABILITY.md     # 안정성 기준
└── QUALITY_SCORE.md   # 품질 점검 기준
```

## 어디에 무엇을 쓰는가

| 쓰려는 것                   | 위치                                                          |
| --------------------------- | ------------------------------------------------------------- |
| 새 정책                     | `.agents/rules/`                                              |
| 새 도메인 절차              | `.agents/skills/_project/`                                    |
| 개별 기능/티켓 명세         | `.agents/docs/product-specs/<작업단위>/`                      |
| 여러 티켓·장기 rollout 계획 | `.agents/docs/exec-plans/active/`                             |
| 반복 적용 방법론            | `.agents/docs/design-docs/`                                   |
| 외부 자료 요약              | `.agents/docs/references/` + `knowledge/source-index.md` 등록 |

**개별 티켓마다 `design-docs/<ticket>`이나 `exec-plans/<ticket>`을 만들지 않는다.** 요구사항·설계·실행 계획은 기본적으로 `product-specs/<작업단위>/`에 함께 둔다.

## 원칙

- **저장소 밖 정보는 존재하지 않는 것과 같다.** 반복 참조할 외부 자료는 여기로 끌어온다.
- **`AGENTS.md`는 목차, 여기가 system of record.** 진입점이 비대해지면 아무도 읽지 않는다.
- **재생성 가능한 문서는 `generated/`에.** 손으로 유지하는 문서와 섞지 않는다.
