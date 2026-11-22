# mskim-claude-plugins

mskim 개인 Claude Code 플러그인 marketplace입니다. 플러그인 `mskim` 하나에 여러 스킬을 담고, 각 스킬은 `/mskim:<스킬 이름>`으로 호출합니다.

## 스킬 목록

| 스킬 | 사용법 | 설명 |
|---|---|---|
| `instruction` | `/mskim:instruction [작업 지침서를 만들기 위한 내용]` | 애매한 점을 먼저 질문한 뒤 작업 지침서(Markdown)를 저장하고, 함께 넘길 작업 지시문을 응답 끝에 준다 |
| `why-codebase` | `/mskim:why-codebase [현상/문제] [doc]` | 현상이 왜 일어나는지 표면×경로로 추적해 근본 원인을 분석한다 (코드·환경 포함, 수정은 제안만) |
| `advice` | `/mskim:advice [현상/문제/분석 문서 경로] [doc]` | 원인 분석(why)에 이어, 코드·환경(OS, 런타임, 의존성, 설정) 양쪽 개선안을 비교하고 권장안·검증·재발 방지를 제시한다 (적용은 하지 않음) |
| `resolve` | `/mskim:resolve [extend \| refactor] [지침서 경로/작업 내용]` | 지침서·advice·작업 내용을 바탕으로 실제 작업을 수행한다. `extend`는 기존 구조를 유지하고 새 단위를 추가하며, `refactor`는 필요하면 구조까지 재설계한다 |

## 설치 (새 PC / 새 환경)

Claude Code가 설치되어 있으면 터미널에서:

```shell
claude plugin marketplace add HomebodyDevil/mskim-claude-plugins
claude plugin install mskim@mskim-claude-plugins --scope user
```

`--scope user`는 그 PC의 모든 프로젝트에서 쓰도록 전역 설치한다. Claude Code 안에서는 `/plugin marketplace add HomebodyDevil/mskim-claude-plugins` 후 `/plugin install mskim@mskim-claude-plugins`로도 된다.

## 업데이트

```shell
claude plugin marketplace update mskim-claude-plugins
claude plugin update mskim@mskim-claude-plugins
```

업데이트 후 새 세션을 열거나 `/reload-skills`를 실행한다.

## 스킬 추가하기

1. `mskim/skills/<스킬 이름>/SKILL.md`를 만든다 (frontmatter에 `name`, `description`, 필요하면 `argument-hint`).
2. `mskim/.claude-plugin/plugin.json`의 `version`을 올린다. 버전이 같으면 설치된 PC가 변경을 받지 않는다.
3. commit 후 push하고, 각 PC에서 위 업데이트 명령을 실행한다.

폴더 이름이 곧 호출 이름이 된다: `mskim/skills/review/` → `/mskim:review`.

## 구조

```
.claude-plugin/marketplace.json   marketplace 정의
mskim/.claude-plugin/plugin.json  플러그인 정의 (version)
mskim/skills/<name>/SKILL.md      스킬 본문
mskim/skills/<name>/evals/        스킬 테스트 케이스 (claude plugin eval 형식)
```
