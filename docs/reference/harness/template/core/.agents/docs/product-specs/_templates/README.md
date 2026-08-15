# SDD 템플릿 색인

신규 작업 단위에 복사해서 쓰는 표준 템플릿이다.

## 사용 위치

```text
.agents/docs/product-specs/<작업단위>/
├── requirements.md
├── design.md
└── tasks.md
```

## 템플릿

| 문서                                   | 단계         | 용도                                         |
| -------------------------------------- | ------------ | -------------------------------------------- |
| [`requirements.md`](./requirements.md) | requirements | 무엇을/왜, 수용 기준, 테스트 가능한 요구사항 |
| [`design.md`](./design.md)             | design       | 어떻게, 기존 owner, 영향 범위, 위험          |
| [`tasks.md`](./tasks.md)               | tasks        | 바로 실행 가능한 구현/검증 체크리스트        |

## 시작 방법

```bash
mkdir -p .agents/docs/product-specs/<작업단위>
cp .agents/docs/product-specs/_templates/{requirements,design,tasks}.md \
   .agents/docs/product-specs/<작업단위>/
```

그리고 **같은 커밋에서 `../index.md`에 한 줄 추가한다.**

## 작성 규칙

- requirements는 "무엇을/왜"만 다룬다. 기술 선택과 구조는 design에 둔다.
- tasks는 외부 맥락 없이 재개할 수 있을 정도로 파일·요구사항 ID·검증 방법을 적는다.
- 설계와 구현이 어긋나면 먼저 `design.md`를 갱신한 뒤 구현한다.
- 본문은 {{DOC_LANGUAGE}}로 쓰되, 코드 식별자·파일 경로·명령어·이슈 키는 원문을 유지한다.
