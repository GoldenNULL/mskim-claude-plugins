# 로그 시스템 교체 메모 (2026-11-18 회의)

- 대상 저장소: D:\work\shop-api (Node 20, Express)
- 현재: console.log를 직접 호출. src/ 아래 약 140곳.
- 결정: pino로 교체한다. 로거 인스턴스는 src/lib/logger.ts 하나만 둔다.
- winston은 검토했지만 번들 크기와 성능 때문에 배제.
- 로그 레벨: 운영은 info, 개발은 debug. 환경변수 LOG_LEVEL로 덮어쓰기.
- 개인정보(email, phone)는 로그에 남기면 안 됨 → pino redact 옵션 사용.
- tests/ 폴더의 console.log는 이번 범위에서 제외.
- 완료 후 `npm run lint`와 `npm test` 둘 다 통과해야 함.
- 아직 미정: 로그를 파일로도 남길지 (인프라팀 답변 대기)
