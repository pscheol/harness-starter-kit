---
key: HK-16
area: verify
type: feat
title: 오픈소스 정적 분석 · SARIF · 새 문제만 막는 품질 게이트 · CI 템플릿
status: approved
created: 2026-11-23
---

# Requirements — HK-16 정적 분석과 품질 게이트 (P23 첫 조각)

근거: [설계 09](../../../../docs/design/09-verification-quality.md) §3.2~§3.7 · §3.9, 결정 D8(SonarQube 대신 오픈소스 조합). 사용자 요청: "소나큐브처럼 코드 적합성 조회", "오픈소스 정적 분석, 언어 상관없이".

## 요구사항 — 설계 09의 아래 ID 전부

- VQ-R5 · VQ-R6 · VQ-R7: `.agents/analyzers.json`에 등록된 분석기만, 레벨이 맞을 때만 돈다. 의존성 분석기는 lock 파일이 바뀐 changed · affected와 full에서만. `required` 분석기가 없으면 로컬 `incomplete`, CI 실패.
- VQ-R8 · VQ-R10: 결과는 SARIF 2.1.0으로 `.agents/reports/sarif/`에 모으고, SARIF를 못 내는 도구는 킷 변환기가 바꾼다. 줄 번호가 바뀌어도 같은 문제는 같은 지문.
- VQ-R9: 품질 게이트(`.agents/quality-gate.json`)는 기준선(`quality-baseline.json`)에 없는 새 문제만 막는다.
- VQ-R11: MR 파이프라인은 검증 코드 · 설정을 병합 대상(base) 브랜치에서 꺼내 판정한다.
- VQ-R16: CI 템플릿 셋(GitHub Actions · GitLab CI · GoCD)의 검증 단계는 `scripts/verify.sh`만 부른다.
- VQ-R18: Semgrep 공식 규칙은 킷에 넣지 않고 실행할 때 받는다.
- VQ-R19: 검증 실행마다 분석기별 문제 수(전체 · 새 것) · 중복률 · 복잡도 초과 함수 수 · 소요 시간을 지표 파일에 남긴다.
- `/hx-scan` 스킬(§3.2).

## 범위 밖

- `/hx-review` 리뷰 에이전트와 승인 강제(VQ-R1~R4 · R12~R15 · R17)는 HK-23.
- 분석기 도구 자체 설치는 하지 않는다. 없으면 설치 안내와 `incomplete`(required) 또는 건너뜀.

## 공통 제약

- 설치되는 스크립트는 Python 3.11+ 표준 라이브러리와 bash. 킷은 모델을 부르지 않는다. 화면 출력은 요약(40줄 이하).
