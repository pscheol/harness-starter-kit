# 변경 기록

`scripts/release.sh <버전>` 은 이 파일에 `## <버전>` 절이 있어야 돈다(설계 11 §3.5). 버전 규칙은 설계 11 §3.6.

## 2.0.0-alpha.3

knots-ai 에 alpha.2 를 깔고 관리 페이지를 열어 본 사람이 "말을 모르겠다 · 배열이 깨졌다 · 기록 · 사용량이 안 열린다 · 실시간인지 모르겠다"고 했다(2026-11-25). 화면을 모두 다시 다듬었다. 고칠 것은 디자인 스킬(impeccable) 점검과 화면마다 찍은 스크린샷(기본 · 빈 상태, 1440 · 375px)으로 골랐다.

- **기록 · 사용량 화면이 흰 화면으로 열리지 않았다.** 사용량 합계가 없는 응답에서 화면이 멈췄다. 이제 없는 값은 비워 보인다. 화면 하나가 그리다 실패하면 그 화면 자리에 안내와 다시 읽기 단추를 보이고 나머지 메뉴는 그대로 쓴다
- **대화 기록 읽기를 기본으로 켠다.** 설치하자마자 세션 컨텍스트 · 토큰 사용량 · 프롬프트 기록이 보인다(설계 06 DB-R28 · README 원칙 7, 사용자 결정 2026-11-26 — 이전 "기본 꺼짐"을 뒤집었다). 끄려면 `~/.config/knots-sync/config.json` 에 `{ "history": "off" }` 를 쓴다. 켜져 있어도 복사본 · 집계 파일을 남기지 않는다
- **모든 화면이 5초마다 새로 읽고, 언제 읽었는지 보인다**("방금 읽음 · 5초마다 새로 읽습니다"). 새로 읽을 때 화면이 깜박이지 않고, 읽기에 실패하면 이전 값을 두고 실패를 알린다
- **여백 · 배열**: 테마 간격을 한 단계 넓히고 본문 글자를 15px 로 키웠다. 패널 안 좌우 여백 · 숫자 카드 격자를 모든 화면에서 같게 맞췄다. 한글이 단어 중간에서 줄을 바꾸지 않는다. 운영 화면 배포 표를 다섯 칸으로 줄여 넘치지 않게 했다
- **내부 용어를 풀었다**: Intent · Unit · Bolt · 관문 · 병합 요청 · 작업 공간 · 설치 점검(doctor) · 하네스 · 읽기 전용 옆에 ? 풀이를 달았다. Intent 가 없는 리포는 Intent · Bolt 칸과 흐름 화면을 숨긴다. 파일 경로 · 명령은 '자세히' 안으로 접었다. 할 일 · 운영 기록(`ops_report.py`) 글을 쉬운 말로 바꿨다
- **설치 점검 결과를 '손볼 것'과 '참고'로 나눴다.** 내가 고친 킷 파일(`drifted`)은 정상이라 참고로 보인다. 항목마다 쉬운 이름과 풀이가 붙는다. 홈의 빨간 배지는 내가 정할 일(1~6순위)만 센다
- 세션 컨텍스트 카드가 값(% · 꺼짐 · —)과 기록 · 사용량 화면으로 가는 길을 보인다. 왼쪽 메뉴 아래에 읽기 전용 여부와 서버 주소를 보인다
- 읽기 전용으로 연 화면은 승인 · 답 칸을 숨기고 "승인 · 답은 자기 터미널에서 연 관리 페이지에서 합니다" 한 줄을 보인다. 끝난 이슈에는 승인 칸이 없다
- 화면 부품(astryx) 안의 글도 한국어로 보인다
- 화면 파일 크기 상한: 첫 화면 JS 524 → 560KB, 파일 하나 450 → 500KB(다듬기 뒤 553KB · 461KB, 시험 주석에 근거)
- 알려진 것: 접수 · 승인 · 답 입력 칸은 사람 터미널에서만 열려(에이전트 세션은 읽기 전용으로 강제) 이 판의 화면 확인에서 빠졌다

## 2.0.0-alpha.2

실제 리포(v1.0.7 로 설치한 knots-ai)를 올려 보다 찾은 것을 고쳤다(2026-11-25). alpha.1 로 올리지 않은 리포는 이 판으로 올린다.

- **v1.0.7 이하에서 올리면 지운 훅 스크립트를 설정이 계속 불렀다.** v1.0.2~1.0.7 은 훅 스크립트를 `.claude/hooks/` · `.codex/hooks/` 에 두었고(v1.0.8 부터 `scripts/hooks/`), update 는 고치지 않은 그 스크립트를 지우면서 설정의 호출 줄은 사람 줄로 보고 남겼다 — 세션을 열 때마다 훅 오류가 났고 턴 끝 검증이 두 번 돌았다. 이제 update 가 지우는 파일로 끝나는 훅 줄은 킷 줄로 보고 새 훅으로 바꾼다. 사람이 고쳐 남긴 옛 훅은 줄도 남기고 이유를 알린다(CLI · `update.sh` 같은 판정, `tests/test_projection_upgrade_v107.py`)
- **CI 진입 파일은 선택 모듈 `ci` 다.** `.gitlab-ci.yml` · `.github/workflows/harness-verify.yml` · 스택별 `.github/actions/harness-setup/action.yml` 은 `knots-sync add ci` 로 켤 때만 깐다 — 회사 GitLab 리포가 킷 갱신만으로 다음 push 부터 파이프라인을 돌렸다. 단계 템플릿(`ci/`)은 그대로 깔린다. alpha.1 까지 받은 리포는 update 가 그 파일을 '킷에서 빠짐'으로 알린다(계속 쓰려면 `add ci`, 지우려면 `update --prune`). 이전 안내서 1.2 절
- **안내 문구의 `npx knots-sync …` 를 `knots-sync …` 로 바꿨다.** npm 에 없는 이름이라 따라 치면 남이 올린 패키지를 받을 수 있었다(CLI · 관리 페이지 · 템플릿 규칙 · 스킬 · `verify.sh` · 하네스 스크립트 63개 파일). 판 고정은 `npx -y github:pscheol/harness-starter-kit#v<판>`. 다시 들어오지 않게 `tests/test_no_npx_hint.py`
- **승인 훅이 다른 이름으로 부른 승인 명령을 막지 못했다.** `kns approve` · `harness-kit approve` · `npx github:… approve` 도 막는다
- `doctor` 에 `hook-script-missing` 을 더했다 — 훅이 리포에 없는 스크립트를 부르면 오류
- 리포 밖에서 `knots-sync dashboard` 를 열면 리포 안에서 열거나 `--root` · `--all` 을 쓰라고 안내한다
- 안내서 · README 설치 절을 플러그인 먼저로 다시 썼다(리포 폴더에서 `/kns:update` · `/kns:bootstrap`, 상위 폴더에서 열면 안 되는 이유). 터미널 CLI 는 GitHub 묶음 주소 전역 설치(`npm i -g https://codeload.github.com/…/tar.gz/refs/tags/<태그>`) — `npm i -g github:…` 는 npm 11 에서 명령 링크가 깨진다. zsh 별칭 주의
- CLI · 관리 페이지 시험 제한 60초 → 180초 — 다른 시험 묶음과 겹쳐 부하가 높을 때 무거운 통합 시험이 넘어 릴리스를 멈췄다
- 알려진 것: 안내서 화면 캡처는 alpha.1 화면이라 명령 복사 칸에 `npx knots-sync` 가 보인다

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
