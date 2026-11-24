# 문서 공유: 편집자 권한 + 삭제 API

- 소유자 외에 editor로 공유받은 사용자도 편집 가능하도록 `canEdit` 확장 (shares 테이블 조회)
- `DELETE /docs/:id` 추가: 편집 권한이 있는 사용자만 삭제 가능
