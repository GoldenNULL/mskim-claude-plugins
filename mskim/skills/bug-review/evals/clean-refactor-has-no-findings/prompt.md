---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

알림 발송 배치 나누는 부분을 chunked 헬퍼로 리팩터링했어. chunked-refactor.diff 보고 버그 생길 만한 데 없는지 확인해줘.

Input files: chunked-refactor.diff
