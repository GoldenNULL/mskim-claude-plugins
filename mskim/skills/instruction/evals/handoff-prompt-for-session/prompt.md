---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

/mskim:instruction 다른 Claude 세션에 넘길 작업 지시문 써줘. 내용: 사내 위키 마이그레이션 스크립트 이어서 작성. 스크립트는 C:\tools\wiki-migrate\migrate.py 이고 Confluence export(XML)를 Markdown으로 바꾸는 거야. 지금까지 페이지 본문 변환은 끝났고 첨부파일 처리랑 내부 링크 변환이 남았어. pandoc 쓰는 방법은 표가 깨져서 버렸고, 지금은 lxml로 직접 파싱해. 결과물은 C:\tools\wiki-migrate\out\ 에 나와야 하고, 원본 export 폴더는 절대 수정하면 안 돼.
