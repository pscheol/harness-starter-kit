# .claude/agents — 서브에이전트 정의

이 디렉터리는 Claude Code 전용 서브에이전트를 둔다.

## 원칙

- **절차 본문은 `.agents/`에 둔다.** 여기에는 진입점과 도구 제한만 남긴다.
- 같은 역할의 Codex 어댑터(`.codex/agents/*.toml`)와 **같은 절차를 참조**한다.
- read-only 에이전트는 프론트매터의 tools에서 Write/Edit를 제외한다.

## 형식

```markdown
---
name: agent-name
description: 언제 호출하는지 한 줄
tools: Read, Grep, Glob, Bash
---

(절차 — 또는 .agents/skills/<name>/SKILL.md 참조)
```
