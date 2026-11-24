# mskim-claude-plugins

mskim 개인 Claude Code 플러그인 marketplace입니다. 플러그인 `mskim` 하나에 여러 스킬을 담고, 각 스킬은 `/mskim:<스킬 이름>`으로 호출합니다.

## 스킬 목록

| 스킬 | 사용법 | 설명 |
|---|---|---|
| `instruction` | `/mskim:instruction [작업 지침서를 만들기 위한 내용]` | 애매한 점을 먼저 질문한 뒤 작업 지침서(Markdown)를 저장하고, 함께 넘길 작업 지시문을 응답 끝에 준다 |
| `why-codebase` | `/mskim:why-codebase [현상/문제] [doc]` | 현상이 왜 일어나는지 표면×경로로 추적해 근본 원인을 분석한다 (코드·환경 포함, 수정은 제안만) |
| `advice` | `/mskim:advice [현상/문제/분석 문서 경로] [doc]` | 원인 분석(why)에 이어, 코드·환경(OS, 런타임, 의존성, 설정) 양쪽 개선안을 비교하고 권장안·검증·재발 방지를 제시한다 (적용은 하지 않음) |
| `resolve` | `/mskim:resolve [extend \| refactor] [지침서 경로/작업 내용]` | 지침서·why·advice·review 보고서나 작업 내용을 바탕으로 실제 작업을 수행한다. `extend`는 기존 구조를 유지하고 새 단위를 추가하며, `refactor`는 필요하면 구조까지 재설계한다 |

## 배포하지 않는 스킬 (`unpublished-skills/`)

아래 스킬은 저장소에만 두고 플러그인에는 넣지 않는다. 플러그인은 `mskim/` 폴더만 배포하므로 설치한 PC에서는 `/mskim:<이름>`으로 호출할 수 없다. 다시 배포하려면 폴더를 `mskim/skills/`로 옮기고 `version`을 올린다.

| 스킬 | 사용법 | 설명 |
|---|---|---|
| `pr-review` | `/mskim:pr-review <PR 번호·URL 또는 base...head> [previous=review.json] [format=json] [limit=n]` | merge-base 기준 PR 정적 리뷰. 이전 지적을 다시 확인하고 전체 지적의 심각도로 판정한다. 기본 출력은 한국어 Markdown이다. |
| `review` | `/mskim:review [대상] [reviewers=...] [vendors=codex,gemini\|none] [doc]` | 변경을 runtime·correctness·security(+필요 시 concurrency·compatibility·design·flow) 관점으로 Claude subagent와 타 벤더 모델(Codex, Gemini 등)이 병렬 리뷰하고, validator가 모든 지적을 누락 없이 검증·통합해 보고한다 (수정은 하지 않음) |
| `review-loop` | `/mskim:review-loop [대상] [extend \| refactor] [n=3] [major=0] [minor=2] [count-p3] [pre-existing | change-only] [fast] [vendors=...] [reviewers=...]` | review → resolve → re-review를 반복해, 남은 major(P0+P1)·minor(P2) 지적이 기준 이하가 되면 멈춘다. 최대 n라운드이고, 개선이 멈추거나 악화되거나 사용자 판단이 필요하면 일찍 멈춘다. 라운드마다 snapshot과 보고서를 남긴다 |
| `original-review-loop` | `/mskim:original-review-loop [대상] [extend \| refactor] [n=3] [important=0] [nits=<k>] [pre-existing] [level=medium]` | 내장 `code-review` → resolve → `code-review`를 반복해, 남은 `important` 지적(옵션으로 nit 포함)이 기준 이하가 되면 멈춘다. `review-loop`보다 라운드당 비용이 훨씬 적은 대신 리뷰어가 하나뿐이다. 멈춤 규칙·snapshot·보고서는 `review-loop`와 같다 |

## review: 벤더·모델 설정

`review`는 기본으로 Claude와 `codex`, `gemini` CLI를 함께 사용한다. 각 CLI는 미리 설치하고 로그인해 둔다. 설치되지 않았거나 실패한 벤더는 건너뛰지 않고 보고서 맨 위에 실패로 표시한다.

모델이나 벤더를 바꾸려면 덮어쓸 키만 담은 JSON을 만든다. 프로젝트별로는 `.claude/mskim-review.json`, 전역으로는 `~/.claude/mskim-review.json`에 둔다. 기본값은 `unpublished-skills/review/references/default-config.json`에 있다.

```json
{
  "vendors": {
    "codex":  { "model": "gpt-6.2-sol", "effort": "high", "split": true },
    "gemini": { "perspectives": ["security", "correctness"] },
    "qwen":   { "enabled": true, "command": "qwen -p \"Follow the review instructions given on stdin.\" < {prompt} > {out}", "timeout_sec": 1200 }
  }
}
```

`split: true`를 주면 그 벤더를 관점마다 따로 실행한다. 리뷰는 깊어지지만 실행 횟수와 비용이 관점 수만큼 늘어난다. 저장소에 `.codex/`나 `.gemini/`가 있으면 실행 전에 물어본다. 이 폴더들은 MCP 서버나 hook을 실행할 수 있기 때문이다. Gemini는 기본적으로 빈 임시 폴더에서 실행하고, 저장소는 `--include-directories`로 읽게 해서 저장소 설정을 불러오지 않는다.

한 번만 바꿀 때는 `vendors=gemini`, `vendors=none`처럼 인자로 지정한다. 새 벤더는 `command`와 `timeout_sec`만 있으면 추가된다. 명령은 headless로 실행되어야 하고, `{prompt}` 파일을 읽어 `{out}`에 결과를 써야 하며, 읽기 전용이어야 한다.

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
mskim/agents/<name>.md            스킬 전용 subagent (`mskim:<name>`)
```
