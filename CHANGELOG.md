# 변경 기록

`scripts/release.sh <버전>` 은 이 파일에 `## <버전>` 절이 있어야 돈다(설계 11 §3.5). 버전 규칙은 설계 11 §3.6.

## 2.0.0-alpha.1

- `npx github:<owner>/harness-starter-kit#<태그> <명령>` 으로 CLI 를 부를 수 있게 했다(결정 D3 · 설계 02 R1.1 — alpha.0 에서 빠졌다). 루트 package.json 에 bin `knots-sync` 와 담을 파일(`plugins/kns/`, 약 1.8MB)을 지정하고, 묶어서 npx 로 도는지 보는 시험(`tests/test_npx_package.py`)을 더했다. README · 안내서 · 이전 안내서의 CLI 안내를 이 방식으로 바꿨다. npm 의 `kns` 는 다른 사람 패키지라 쓰지 않는다
- 설계 문서 승인 대기 15개를 사람 검토 · 지시로 approved 로 바꿨다

## 2.0.0-alpha.0

v2 첫 사전 릴리스. 아래는 이 판에 들어 있는 이슈다. 자세한 것은 `.agents/docs/issues/<키>/` 에 있다.

- 킷 모노레포와 Node CLI(`knots-sync`, 별칭 `kns`): `init` · `plan` · `add` · `remove` · `update` · `repair` · `outdated` · `uninstall` · `doctor` · `list` (HK-1 · HK-8 · HK-11 · HK-12)
- lock v2 · v1 lock(TSV) 읽기와 첫 `update` 병합(HK-25) · 플러그인 스킬의 `setup.sh` 대체 경로(`kit.sh`)
- `.agents/` 원본에서 하네스 폴더로 만드는 배치 엔진과 훅(HK-13 · HK-24) · 확장 층(HK-14) · worktree(HK-15)
- 검증 `changed` · `affected` · 정적 분석 · 품질 관문(HK-5 · HK-16)
- 관리 페이지 서버 `knots-sync dashboard`(HK-17)와 화면(HK-18 · HK-26)
- 설계 단계: 접수 · Intent · 질문 · 역공학 · from-unit · 몹 정리(HK-19), 리뷰 · 승인(HK-23)
- 선택 모듈 엔진 · `aidlc` · `entire` · 세션 적재량 측정(HK-20a)
- 배포 기록 · 배포 게이트 · 운영 기록 · 전달 지표(HK-21)
- 이전 · 릴리스(HK-22a): `scripts/release.sh`, 두 구성 e2e(`tests/e2e/two_configs.py`), 이전 안내서(`docs/migration-guide.md`)
- 선택 모듈 jira-workflow v2 · 접수 출처 jira · notion · notion 모듈 · multi-harness `sync units`(HK-20b)
- **이름 바꾸기(HK-22b)**: 제품 이름 harness-kit → **knots-sync**(약어 `kns`). CLI `knots-sync`(별칭 `kns` · 옛 `harness-kit`), 플러그인 `kns`(스킬 `/kns:bootstrap` …, 옛 `commands/` 세 개는 스킬과 이름이 겹쳐 뺐다), 프로젝트 스킬 `kns-*`, 상태 파일 `.agents/knots-sync.{json,lock}`, 설정 폴더 `~/.config/knots-sync/`, 환경 변수 `KNS_*` · `KNOTS_SYNC_*`, schema `knots-sync.*`. 옛 이름 리포는 `update` 가 상태 파일을 옮기고 고치지 않은 `hx-*` 킷 스킬을 지운다(`doctor` 는 `legacy-names` 로 알린다). Kiro 는 `kns-<명령>` 으로 깔린다
- 두 구성 e2e 를 사람 터미널에서 끝까지 돌려(stub 107 · real 106 통과) 찾은 킷 버그 5개를 고쳤다: 템플릿 안내문의 `[NEEDS CLARIFICATION` 때문에 새 이슈 문서를 승인하지 못하던 것(표지는 콜론 · 백틱 밖만 센다), 이슈를 만든 뒤 `update` · `uninstall` 이 SDD 보드 구간 때문에 충돌 · 실패하던 것, 병합 뒤 done 승인이 지우지 않은 로컬 이슈 브랜치로 막히던 것, 모듈 `remove` 가 지운 파일 때문에 affected 검증이 incomplete 로 끝나던 것. `scripts/harness/check_external.py`(외부 도구 파일 불변 점검) 추가

### 세션 적재량(외부 도구 모듈, 실제 도구 e2e 측정)

릴리스 때 `python3 tests/e2e/two_configs.py --mode real` 이 낸 표를 여기에 붙인다. 값은 `.agents/docs/issues/HK-22-migration-release-e2e/tasks.md` 의 실측 기록을 본다.

## 1.0.8

SDLC 단계형 SDD · 기능 문서 · 하네스 흡수(v1 마지막 판).
