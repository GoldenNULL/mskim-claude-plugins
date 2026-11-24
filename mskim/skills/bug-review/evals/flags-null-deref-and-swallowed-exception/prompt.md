---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

order-service.diff 에 주문 배송 라벨이랑 주문 취소 기능 추가했어. 머지 전에 버그 있는지 봐줘. 특히 null 처리랑 예외 처리 쪽.

Input files: order-service.diff, orderService.ts
