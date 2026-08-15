# .codex/agents — Codex 서브에이전트 정의

Claude 어댑터(`.claude/agents/*.md`)와 **같은 절차**를 참조한다. 형식만 다르다.

## 형식

```toml
name = "agent-name"
description = "언제 호출하는지 한 줄"
developer_instructions = '''
(절차 — 또는 .agents/skills/<name>/SKILL.md 참조)
'''
```

## 원칙

- 절차 본문의 원본은 `.agents/`다. 여기에 복제하지 않는다.
- 두 도구의 에이전트 목록이 어긋나면 하네스가 도구별로 다르게 동작한다.
