---
key: HK-22
area: release
type: feat
title: v1 → v2 이전 · 릴리스 스크립트 · 두 구성 e2e · knots · hdr 복사본 실측
status: approved
created: 2026-11-23
---

# Requirements — HK-22 이전 · 릴리스 · 실측 (전 단계 마무리)

근거: [설계 11](../../../../docs/design/11-migration-and-release.md) MG-R 전부, [13](../../../../docs/design/13-aidlc-coverage.md), [01 R1.6](../../../../docs/design/01-v1.1-verify-and-issues.md)(affected 15분), 결정 D3(배포 경로). 사용자 허용: knots · hdr를 `/tmp`에 복사해 실측(원본은 읽기만).

- 설계 11 MG-R 전부: 단계별 이전 절차와 도구, `scripts/release.sh`(다섯 매니페스트 버전 · 생성물 · 시험), 두 구성 e2e(킷만 / 모두 켬, MG-R7), 되돌리기.
- 실측: knots-platform · hdr-vision-3d `/tmp` 복사본에서 v2 `update`(v1 → v2 이전), `migrate --dry-run`(옛 이슈 141건 지도), affected 검증 시간, 세션 시작 출력 바이트(v1.0.8 대비)를 재고 결과를 `docs/analysis/`에 남긴다. 복사본은 끝나면 지운다.
- 13의 AI-DLC 대응표에서 "구현됨"으로 바뀐 항목을 확인한다.
