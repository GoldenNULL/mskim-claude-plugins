# PR 리뷰 보고서 규약 v3

## 심각도와 판정

| 심각도 | 기준 |
|---|---|
| `blocker` | 주요 서비스 중단, 광범위한 데이터 손실, 중대한 보호 경계 위반처럼 병합 전에 해결해야 할 영향 |
| `major` | 지원되는 흐름에서 주요 기능 실패, 잘못된 데이터 처리, 데이터 공개 또는 권한·정책 위반 |
| `minor` | 영향이 제한적이고 우회가 가능한 구체적 결함 |

아래에서 처음 성립하는 조건을 적용한다.

1. PR base/head가 바뀌었거나 검토 기준을 고정할 수 없으면 `COMMENT`.
2. 사용자가 지정한 이전 보고서가 `unusable`이면 `COMMENT`. 현재 지적은 심각도와 함께 계속 보고한다.
3. 반증 검토를 완료한 `static_supported` 지적 중 `blocker` 또는 `major`가 있으면 `REQUEST CHANGES`.
4. `diff_complete=false`, `required_context_complete=false`, `validation=not_completed` 중 하나라도 해당하면 `COMMENT`. 이전 지적의 `unverified` 상태는 확인하지 못한 자료가 현재 판정에 필수인 경우에만 판정에 반영한다.
5. 나머지는 `APPROVE`. `minor`는 보고하되 병합 판정을 막지 않는다. 판정은 보고서 안에서만 사용한다.

반증을 완료하지 않은 후보에는 `static_supported`를 부여하지 않는다. 실행 전체의 반증 검토에 누락이 있으면 `not_completed`를 사용한다.
- 현재 지적은 심각도, 앵커 경로와 행, ID 순으로 정렬한다. Markdown에 상한이 있으면 이전 지적 상태와 검토 범위는 그대로 표시하며, 판정에는 전체 현재 지적을 사용한다.

## Markdown

제목에 PR 또는 ref를 표시하고 판정, 검토 SHA, 정적 검토 방식과 결과 요약을 적는다. 각 지적에 ID, 심각도, 분류, 앵커와 결함 위치, 발생 조건, 근거, 영향, 구체적인 수정안과 수정 후 기대 상태를 적는다. 규칙 위반에는 문서 위치, 원문 인용과 적용 이유를 포함한다. 이어서 이전 지적의 상태와 검토 범위를 표시한다. 표시 상한 때문에 생략한 지적이 있으면 총 건수와 심각도별 건수를 적는다.

반환 전에 검토 SHA와 관측 SHA, 판정 조건, 두 지적 배열의 ID를 대조한다. 각 배열에서 ID는 고유해야 하며 이전 상태가 `open`인 지적에는 같은 ID의 현재 `static_supported` 지적이 있어야 한다. 이전 입력에 중복 ID나 모순된 `open` 상태가 있으면 `unusable`로 처리한다.

## JSON

필수 필드, 타입, 열거값은 [JSON Schema](review.schema.json)에 정의한다. 확인할 수 없는 선택 정보는 `null`, 항목이 없는 배열은 `[]`로 표현한다. SHA는 전체 길이로 기록한다. 파일 위치의 `revision`은 전체 SHA이며 `line`은 1부터 시작한다. 저장소 식별자는 자격 증명, 쿼리, 프래그먼트를 제거한 호스트·소유자·이름을 우선하며, 원격 정보가 없다면 로컬 저장소 루트로 기록한다.

| 필드 | 값 |
|---|---|
| `schema_version`, `rules_version` | 각각 정수 `3` |
| `target` | 저장소와 PR 식별자, 검토에 사용한 base/head/merge base, 마지막으로 관측한 base/head. 확인할 수 없는 값은 null |
| `verdict`, `summary` | `REQUEST CHANGES`, `COMMENT`, `APPROVE` 중 하나와 한국어 요약 |
| `findings` | 전체 현재 지적 배열. 현재 근거와 최초 근거(`origin`)를 포함 |
| `previous` | 입력 상태, 이전 head, 이력 관계(`same_head`, `ancestor`, `rewritten` 또는 null), 이전 지적별 상태·현재 근거·최초 근거 |
| `coverage` | diff 검토 여부와 필수 주변 코드 검토 여부, 변경·검토·주변 파일, 제외·미검토 이유, 제한 사항 |
| `metadata` | `mode`(`static`), `validation`(`same_session`, `independent`, `not_completed`), `engine`, `engine_version`, `model`, `effort`(확인된 문자열 또는 null) |

`category`는 지적의 직접적인 근거로 정한다. 문서 규칙 위반을 근거로 삼으면 `repository_rule`과 `rule_citation`이 필수다. 그 외 분류의 `rule_citation`은 null이다. 모든 현재 지적은 `introduced`와 `static_supported`를 사용한다. `fix_direction`에는 적용 가능한 수정안을, `expected_outcome`에는 수정으로 성립할 동작이나 조건을 적는다. 확인할 수 없는 코드 위치는 null이다. `diff_complete`는 범위를 확정하고 모든 변경 본문을 읽었을 때만 true다. 본문을 읽지 못한 변경은 이유와 함께 기록한다.

이전 리뷰에서 `findings`와 `previous.findings`의 미종결 항목(`open`, `unverified`)을 ID 기준으로 합쳐 확인한다. 겹치면 `findings`의 현재 근거를 우선한다. 최초 위치, 발생 조건, 근거, 영향은 신규 지적의 `origin`에 복사하고 같은 ID를 이어갈 때 변경 없이 전파한다. `unverified`가 여러 회차 이어져도 이전 상태 설명으로 최초 근거를 덮어쓰지 않는다.

신규 ID는 해당 리뷰의 고정 base/head SHA와 저장소·PR 식별자에 일련번호를 붙여 구성한다. 일련번호는 이어받은 ID를 모두 확인한 뒤 충돌 없이 배정한다. 같은 원인과 영향이면 위치가 이동해도 이전 ID를 사용한다. 이전 입력은 선언 버전에 맞춰 [v2 스키마](review-v2.schema.json) 또는 [v3 스키마](review.schema.json)로 검증한다. v2 지적에도 현재 기준을 다시 적용하며 기존 결함, 약한 근거, 수정안 누락을 그대로 넘기지 않는다. 그 외 버전은 `unusable`로 표시한다.

호출자가 저장하거나 게시할 경우 중복 제거에는 저장소 식별자, PR 번호, base SHA, head SHA, 규칙 버전을 사용한다. 게시 댓글의 갱신 여부와 실행 메타데이터 보관은 호출자가 관리한다.
