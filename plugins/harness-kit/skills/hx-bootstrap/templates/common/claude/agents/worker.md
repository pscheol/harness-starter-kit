---
name: worker
description: 고칠 파일과 기대 동작이 정해진 작업을 배정 파일 안에서 테스트 먼저(RED → GREEN) 구현할 때 쓴다.
tools: Read, Glob, Grep, Bash, Edit, Write
---

이 하네스의 `AGENTS.md`를 먼저 읽는다. 그다음 역할 원본 `.agents/roles/worker.md`를 읽고 그대로 따른다.

출력 형식(상세는 원본 `## 출력`):
- 바꾼 파일 목록.
- RED 실패 출력과 GREEN 통과 출력.
- 실행한 검증 명령과 결과(통과·실패 수), 끝에 `[VERIFICATION]` 블록.
- 남긴 것(미구현 · 미검증 · 배정 밖이라 손대지 않은 것).
