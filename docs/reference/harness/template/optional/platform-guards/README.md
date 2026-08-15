# optional / platform-guards

**프로젝트 고유 불변 조건을 기계로 검사**하는 가드 스크립트 모듈이다.

## 왜 필요한가

문서에 적힌 규칙은 지켜지지 않는다. 회귀가 반복되는 불변 조건은 **스크립트로 검사**해야 한다.

`.agents/rules/golden-rules.md`의 불변 조건 표에서 **기계로 검사 가능한 항목**을 골라 여기에 스크립트로 만들고, `.agents/harness.json`의 `guards`에 등록한다.

## 설치되는 것

```text
scripts/find-large-files.sh        # 거대 파일 임계 검사 (범용)
scripts/guard-template.sh          # 새 가드 작성 템플릿
.agents/rules/platform-invariants.md  # 가드 작성 가이드
```

## 등록 방법

`.agents/harness.json`:

```json
{
  "guards": [
    {
      "name": "large files",
      "command": "bash scripts/find-large-files.sh",
      "enforceEnv": "ENFORCE_LARGE_FILES",
      "skipEnv": "SKIP_LARGE_FILES"
    }
  ]
}
```

## 승격 정책

가드는 **경고로 시작해서 강제로 승격**한다.

1. 도입: 경고만. 기존 위반 수를 센다.
2. 정리: 기존 위반을 줄인다.
3. 승격: 0건이 되면 `enforceEnv`를 CI 기본값으로 켠다.

처음부터 강제하면 전원의 커밋이 막히고, 가드는 제거된다.
