---
key: HK-25
area: cli
type: feat
title: v1.0.8 설치본 첫 업데이트의 구별 불가 파일을 병합하고, 빈 platform-guards 모듈을 없앤다
status: approved
created: 2026-11-23
---

# Requirements — HK-25 첫 업데이트 병합 · platform-guards 정리

근거: HK-12 R12.6(v1 lock으로는 설치 전 사람 파일과 킷 파일을 구별 못 함), HK-10(platform-guards 파일이 공통 층과 같아짐). 사용자 결정(2026-11-23 밤): "새 판으로 쓰면서 겹치는 부분은 빼고 병합 형식으로", "안 쓰는 모듈이면 지워도 된다".

- **R1** v1.0.8 lock에서 처음 `update`할 때 구별이 안 되는 파일(sha(C) = B ≠ sha(D), 설치 전 표시 없음)은 파일 종류에 따라 처리한다(update.sh · CLI 같은 결과).
  - 문서(`.md` · `.txt`): 킷 새 판을 쓰고, 사람 파일에만 있던 줄 묶음을 원래 순서에 맞는 자리에 끼운다. 두 판에 같은 줄은 한 번만 둔다. 끼운 묶음은 `<!-- harness-kit: 설치 전 내용(병합) -->` · `<!-- /harness-kit -->` 주석으로 감싼다. 병합 전 원본은 `.agents/state/merge-backup/<시각>/`에 둔다.
  - 설정(`.json`): 키 단위로 합친다. 사람이 넣은 키 · 값은 남기고 킷 키는 새 판 값으로. 해석할 수 없으면 `.new`.
  - 코드 · 그 밖(`.sh` · `.py` · `.ts` · `.yml` 등): 지금처럼 `.new`.
  - 업데이트 끝에 병합한 파일 목록을 한 번 출력한다(`--json`에도). 병합 결과에 같은 줄이 두 번 나오지 않는다(시험).
- **R2** `platform-guards` 모듈을 없앤다. 모듈 목록 · layout · manifest · 문서에서 뺀다. 이미 켠 리포는 `update`가 메타 `modules`에서 지우고 한 줄 알린다(파일은 공통 층에 그대로라 지우지 않는다). `add platform-guards`는 "공통 층에 포함됨"과 exit 0. setup.sh `--modules=platform-guards`도 같은 안내로 받아 넘긴다.
- **R3** 동일성 시험(설치 · update · add/remove)에 R1 병합 사례와 R2 이전 사례를 더한다.
