# Product Specs 색인

작업 단위 명세의 **단일 카탈로그**다. `scripts/verify-harness.cjs`가 이 파일과 실제 폴더의 정합성을 검사한다.

> **새 작업 단위 폴더를 만들면 같은 커밋에서 여기에 한 줄 추가한다.**

## 통계

| 항목             | 수  |
| ---------------- | --- |
| 전체 작업 단위   | 0   |
| 잔여 태스크 없음 | 0   |
| 잔여 태스크 있음 | 0   |

## 작업 단위

| 작업 단위     | 상태 | 잔여 태스크 | 요약 |
| ------------- | ---- | ----------- | ---- |
| _(아직 없음)_ |      |             |      |

## 상태 값

- `active` — 진행 중이거나 잔여 태스크가 있음
- `review` — 구현 완료, 사람 검토 대기
- `completed` — 검증과 병합까지 끝남

## 추가 방법

```bash
mkdir -p .agents/docs/product-specs/<작업단위>
cp .agents/docs/product-specs/_templates/{requirements,design,tasks}.md \
   .agents/docs/product-specs/<작업단위>/
```

그다음 위 표에 한 줄 추가하고 통계를 갱신한다.
