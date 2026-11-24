# 변경 기록

`scripts/release.sh <버전>` 은 이 파일에 `## <버전>` 절이 있어야 돈다(설계 11 §3.5). 버전 규칙은 설계 11 §3.6.

## 2.0.0-alpha.0

v2 첫 사전 릴리스. 아래는 이 판에 들어 있는 이슈다. 자세한 것은 `.agents/docs/issues/<키>/` 에 있다.

- 킷 모노레포와 Node CLI(`harness-kit`): `init` · `plan` · `add` · `remove` · `update` · `repair` · `outdated` · `uninstall` · `doctor` · `list` (HK-1 · HK-8 · HK-11 · HK-12)
- lock v2 · v1 lock(TSV) 읽기와 첫 `update` 병합(HK-25) · 플러그인 스킬의 `setup.sh` 대체 경로(`kit.sh`)
- `.agents/` 원본에서 하네스 폴더로 만드는 배치 엔진과 훅(HK-13 · HK-24) · 확장 층(HK-14) · worktree(HK-15)
- 검증 `changed` · `affected` · 정적 분석 · 품질 관문(HK-5 · HK-16)
- 관리 페이지 서버 `harness-kit dashboard`(HK-17)와 화면(HK-18 · HK-26)
- 설계 단계: 접수 · Intent · 질문 · 역공학 · from-unit · 몹 정리(HK-19), 리뷰 · 승인(HK-23)
- 선택 모듈 엔진 · `aidlc` · `entire` · 세션 적재량 측정(HK-20a)
- 배포 기록 · 배포 게이트 · 운영 기록 · 전달 지표(HK-21)
- 이전 · 릴리스(HK-22a): `scripts/release.sh`, 두 구성 e2e(`tests/e2e/two_configs.py`), 이전 안내서(`docs/migration-guide.md`)

### 세션 적재량(외부 도구 모듈, 실제 도구 e2e 측정)

릴리스 때 `python3 tests/e2e/two_configs.py --mode real` 이 낸 표를 여기에 붙인다. 값은 `.agents/docs/issues/HK-22-migration-release-e2e/tasks.md` 의 실측 기록을 본다.

## 1.0.8

SDLC 단계형 SDD · 기능 문서 · 하네스 흡수(v1 마지막 판).
