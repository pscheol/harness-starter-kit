# Codex

이 하네스 루트(`AGENTS.md`가 있는 폴더)에서 Codex를 시작한다. `config.toml`이 다섯 역할을 `agents/*.toml`로 등록한다.

- Codex는 신뢰한 프로젝트의 `.codex/`만 읽는다. 프로젝트 루트(가장 가까운 `.git` — 도메인 리포 안이면 그 리포)부터 이 폴더까지 `.codex/`가 있는 폴더마다 `config.toml`·`hooks.json`을 읽고, 같은 키·같은 이름의 역할은 이 폴더 것이 이긴다. 도메인 리포 안에서 연 세션은 메인 리포 `.codex/`를 읽지 않는다.
- `hooks.json`은 SessionStart(하네스 안내) · PreToolUse(`apply_patch|Bash` — 보호 경로 쓰기 차단) · Stop(changed 게이트) 셋이다. 최상위 키는 `description`·`hooks`만 쓴다 — 다른 키가 있으면 Codex 가 파일 전체를 버린다.
- 명령은 세션 작업 디렉터리에서 돈다. 그래서 위로 올라가며 가장 가까운 `.agents/harness.json`을 찾아 그 하네스의 `scripts/hooks/`를 부른다.
- 새로 생기거나 바뀐 hook은 `/hooks`에서 승인하기 전까지 건너뛴다. 신뢰와 승인은 리포 루트에서 한다 — 절차는 [하네스 설명서](../.agents/docs/guides/harness-engineering.md) §6 "클라이언트별로 사람이 할 일". hook이 돈다고 가정하지 않고 작업 중 `HARNESS_VERIFY_LEVEL=fast bash scripts/verify.sh`, 마칠 때 `bash scripts/verify.sh`를 직접 실행한다.
- 사용자 전역 설정과 자격증명을 설치하거나 덮어쓰지 않는다.

새 코드·리팩토링은 `.agents/rules/code-maintenance.md`, 공동 세션은 `.agents/rules/session-collaboration.md`를 읽는다.
변경 검증은 `bash scripts/verify.sh --files <paths> --tests <tests> --plan`, MR 전에는 `--affected`, 전체(full)는 CI가 돈다.
