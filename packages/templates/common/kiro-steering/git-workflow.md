---
inclusion: always
---
# Git 워크플로 (포인터)

원본: `.agents/rules/git-workflow.md` — 브랜치·커밋·PR 규약.

요약:

- 작업 단위는 SDD 기능 하나다. 브랜치 하나 = requirements·design·tasks 한 벌 = PR 하나.
- 브랜치는 `<종류>/<이슈키>-<이름>` — 이슈 폴더 `.agents/docs/issues/<이슈키>-<이름>/` 와 같다. 예: `feat/KNOTS-17-desktop-parity`.
  이 형식으로 push 할 때 커밋에 그 키의 이슈 폴더가 없으면 pre-push 가 막는다. `exp/` 는 보지 않는다.
- 도메인 리포는 메인 리포의 submodule 이다. 도메인 리포에서 커밋·push 한 뒤 메인 리포에서 포인터를 올려 커밋한다.
- 버그도 세 문서를 만든다. `fix`는 문서를 건너뛰는 통로가 아니다.
- 기능 브랜치는 `develop`에서 따고 `develop`으로 되돌린다. `main`은 릴리스만 받는다.
- 커밋 메시지는 `<종류>: <무엇을 왜>`. 파일 목록을 쓰지 않는다.
- 커밋은 사용자가 요청할 때 한다. 에이전트가 임의로 커밋하지 않는다.
