---
key: HK-13
area: cli
type: feat
title: 하네스 어댑터와 복사본 배치(mirror · render · merge)로 손 유지 파일을 없앤다
status: approved
created: 2026-11-23
---

# Requirements — HK-13 배치 엔진 (P18 첫 조각, v2.0.0)

근거: [설계 03](../../../../docs/design/03-projection-and-hooks.md) §1 · §2 · §3.1~§3.3 · §3.5~§3.9 · §3.12, [12](../../../../docs/design/12-model-routing.md)의 역할 파일 모델 · effort(P18 몫), [README 원칙 1 · 8 · 10](../../../../docs/design/README.md). 사용자 결정: 링크 · 포인터 대신 실제 복사본, 규칙은 `paths`로 자동 로드.

- **R1** 하네스 어댑터 4개(Claude Code · Codex · Cursor · Kiro)가 03 §3.2 표대로 작업 목록을 낸다. 엔진은 `mirror` · `render` · `merge` 작업을 쓰고 lock에 기록한다. 하네스 폴더의 킷 몫 파일은 모두 이 세 작업이고 심볼릭 링크 0개, "원본을 읽어라" 포인터 파일 0개다(03 R1.1).
- **R2** 규칙 원본 frontmatter `paths`로 Claude `.claude/rules/*.md`(mirror) · Cursor `.cursor/rules/*.mdc`(render, `globs`) · Kiro `.kiro/steering/*.md`(render, `fileMatch`)를 만든다. `paths`가 없는 규칙은 늘 싣는다(03 R4.4, §3.7).
- **R3** 역할 원본 `.agents/roles/<이름>.md` 하나에서 Claude md · Codex toml · Kiro json을 만든다(03 R3.1, §3.6). 사람이 연 세션의 모델 · effort는 바꾸지 않고, 위임 역할에만 모델 · effort를 넣는다(README 원칙 8, 12).
- **R4** `CLAUDE.md`는 `@AGENTS.md` + 킷 블록(merge)이다(03 §3.8). 킷 블록은 1.5KB 이하.
- **R5** `update` · `repair` · `uninstall` · `doctor`가 `mirror` · `render` · `merge`를 다룬다(02 §3.10~§3.13, HK-11이 남긴 자리). 상태 `stale` · `drifted` · `symlink-found` · `merge-missing`.
- **R6** `scripts/harness/check_layout.py`(Python 표준 라이브러리)가 fast 검증에서 lock을 읽어 배치를 검사한다(03 §3.9). 킷 원본의 `../` 상대 참조는 오류.
- **R7** `.gitattributes`에 생성 경로를 `linguist-generated=true`로 병합한다(03 §3.12).
- **R8** v1 설치본을 `update`하면 v1 포인터(`.claude/commands/hx-*.md` 등 78개)가 복사본 · 생성물로 바뀐다. 사람이 고친 포인터는 `.new`로 둔다.
- **R9** 세션마다 실리는 양(진입 파일 + `paths` 없는 규칙 + 스킬 설명)이 v1.0.8 설치본보다 늘지 않는다. 시험이 바이트를 잰다(README 원칙 10).
