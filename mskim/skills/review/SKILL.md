---
name: review
description: Reviews a change (current diff, commit, branch, paths, or a /mskim:resolve result) from several perspectives — runtime, correctness, security, and, when the change calls for it, concurrency, compatibility, design — using Claude subagents and other vendors' models (Codex, Gemini, or any configured CLI) in parallel, then validates and merges every finding without dropping any into one severity-ranked report (review only; nothing is fixed). Optionally saves the report as a Markdown document for /mskim:resolve.
argument-hint: "[target] [reviewers=<perspectives>] [vendors=<names>|none] [doc | --doc=<path>]"
disable-model-invocation: true
---

# Review: multi-perspective, multi-vendor, nothing dropped

Input: $ARGUMENTS

## Purpose

Find real defects in a change by looking at it through separate perspectives and through models from different vendors, then merge everything into one report where **every raw finding is accounted for** — kept, merged into another, or rejected with a code-based reason. Different models miss different things; the value is lost if their findings are silently dropped, truncated, or summarized away.

This skill **reviews only**. Nothing is edited, formatted, committed, or fixed. To fix, save the report (`doc`) and pass it to `/mskim:resolve`.

Files used (paths relative to this skill's directory, `${CLAUDE_SKILL_DIR}`):
- `references/perspectives.md` — perspective checklists and selection rules
- `references/finding-schema.md` — reviewer rules, Finding JSON schema, severity and verification definitions
- `references/finding.schema.json` — the same schema as JSON Schema, for vendors that can enforce it
- `references/default-config.json` — default vendor settings
- `scripts/check-ledger.js` — bookkeeping: `split` raw findings into validator batches, `join` the results, `check` that every raw finding (and, with `--report`, every id in the final report) is accounted for

`LEDGER` below means `node "${CLAUDE_SKILL_DIR}/scripts/check-ledger.js"`.

## 0. Parse the arguments

- **Target** (the first non-option tokens). One of:
  - nothing → the working-tree diff (`git diff HEAD` plus untracked files); if that is empty, the last commit,
  - a commit, range (`A..B`), or branch (→ `git diff <merge-base>...<branch>`),
  - file or directory paths → review those files as they are,
  - a `/mskim:resolve` report or an instruction document → the files it lists as changed, with its stated intent as the expectation,
  - a previous review report (`*-review-*.md`) → **re-review**: check whether each of its findings is resolved, and look for regressions in the code changed since. Write its findings to `<workdir>/previous.json` as `{"findings":[{"id":"prev-F1","title":...,"location":...}, ...]}` — every finding in its Findings table and every `disputed` item, none skipped (§4 creates the work directory).
- `reviewers=a,b` — perspectives to run; overrides the automatic selection.
- `vendors=codex,gemini` — external vendors to run; overrides the config's `enabled` flags. `vendors=none` runs Claude only.
- `doc`, `--doc`, `문서`, `문서화`, `docs`, or `--doc=<path>` — also save the report (§7).

## 1. Load the configuration

Read, in order, and merge per key (later wins; within `vendors`, merge per vendor name):
1. `${CLAUDE_SKILL_DIR}/references/default-config.json`
2. `~/.claude/mskim-review.json` (user)
3. `.claude/mskim-review.json` in the project root (project)

Top level: `validator_batch_max` (raw findings per validator batch, §5).

Each vendor entry: `enabled`, `model` (empty = the CLI's default), `effort` (optional), `perspectives` (`"all"` or a list), `split` (`true` = one run per perspective instead of one run for all), `timeout_sec`, `project_config_dir` (the vendor's per-project config folder, §4), `command`, `model_flag` / `effort_flag` (each used only when `model` / `effort` is set, with `{model}` / `{effort}` replaced; otherwise the placeholder becomes empty). Command placeholders:

| Placeholder | Value |
|---|---|
| `{prompt}` | `<workdir>/<run>.prompt.md` |
| `{out}` | `<workdir>/<run>.out` |
| `{schema}` | `${CLAUDE_SKILL_DIR}/references/finding.schema.json` |
| `{repo}` | the project root |
| `{workdir}` | the work directory |
| `{isolated}` | an empty directory `<workdir>/<run>.cwd`, created before the run — for CLIs that must not load the project's own config |
| `{model_flag}`, `{effort_flag}` | as above |

Substitute absolute paths in the shell's native form and quote them (on Windows Git Bash, `cygpath -w`, since the CLIs are native Windows programs). The `claude` entry has `model` (an Agent model alias such as `opus`, or `inherit`) and `effort` (`low`…`max`, or empty to inherit). A vendor name not in the defaults is fine if it has a `command` — that is how a new vendor is added. `claude.enabled: false` skips the Claude subagents (the validator still runs on Claude).

Then apply `vendors=` from the arguments. For each enabled vendor, check that the CLI the command runs resolves (`command -v codex`, …). A vendor that is enabled but not installed is **not silently skipped**: record it as failed (§4).

## 2. Determine the scope

1. Get the diff or file list for the target. Note its size.
2. Find the code the change reaches: callers of every changed function/class/export, callees whose contract the change relies on, tests and fixtures, config and build files. If CodeGraph is available (see the user's global instructions), use `codegraph affected` / `impact` / `callers`; otherwise grep.
3. Write a **scope note** (a few lines): target, the command to see the diff, changed files, related files to read, and the change's intent if known (commit message, resolve report, instruction doc).

If the diff is empty and no target was given, say so and stop.

## 3. Select perspectives

Follow `references/perspectives.md`: `runtime`, `correctness`, `security` always; add `concurrency`, `compatibility`, `design` when their signals appear in the changed code or its direct neighbors; `refactor` mode adds `design`. `reviewers=` overrides all of this. State the selection and the signal that triggered each optional one.

## 4. Run all reviewers in parallel

Create a work directory outside the project (`mktemp -d`), with `raw/` inside it. Build one **reviewer prompt** per run from: the scope note, the run's perspective sections from `perspectives.md` (copied in full), the full text of `finding-schema.md`, and the source name the run must use in `source` and as the id prefix.

**Before starting any vendor**, check the project for each enabled vendor's `project_config_dir` (`.codex/`, `.gemini/`, …). Those folders can start MCP servers or hooks — i.e., run code from the reviewed repository. The default commands avoid loading them (Codex ignores project config for untrusted projects; Gemini runs from `{isolated}`), but a project the user trusted earlier, or a custom command, may not. If such a folder exists, ask the user before running that vendor (options: run anyway / skip this vendor), and note the answer in the report. If you cannot ask, skip that vendor and report it as skipped with this reason.

Start everything **in the same message** so it runs concurrently:

- **Claude** (if enabled): one subagent per selected perspective, `subagent_type: "mskim:reviewer"` (fall back to `general-purpose` with the rules' no-modification line repeated, if that agent type is not available). Source name `claude-<perspective>`. Pass `model` from the config unless it is `inherit`, and pass `effort` from the config when it is set (the user configured it explicitly). Use the same `model` and `effort` for the validators in §5.
- **Each enabled vendor**: its perspectives are its configured list intersected with the selection (`"all"` = every selected one; skip a vendor whose list shares nothing with the selection, and say so). With `split: false`, one run covering all of them, source name = the vendor name. With `split: true`, one run per perspective, source name `<vendor>-<perspective>`. For each run, write its prompt to `{prompt}`, substitute the placeholders, and run the command with Bash `run_in_background: true` and the configured timeout. These CLIs call their vendor's API, so they need network access.

When each run finishes:

- **Parse** `{out}`. If it is a JSON wrapper with a string `response` field and no `findings` (Gemini `-o json`), use `response`. Accept the schema's JSON object, tolerating a Markdown fence or stray text around it. Save it as `<workdir>/raw/<source>.json`, assigning `<source>-<n>` ids to findings that lack one.
- **Unparseable output**: copy it to `<workdir>/raw/<source>.txt`, then transcribe it into `raw/<source>.json` with `"transcribed": true` at the top level — one finding per distinct issue it raises, wording kept, nothing merged or judged yet, and each finding's `excerpt` set to a sentence copied **verbatim** from the original (`LEDGER check` rejects excerpts that are not in the `.txt`). The validator re-reads the original to catch anything the transcription missed.
- **Failure** (not installed, auth error, network error, timeout, non-zero exit, empty output, schema rejected): retry once if the cause looks transient; if the error is about `--output-schema`, retry once without that flag. If it still fails, record the source as **failed** with the last lines of its error output. Do not substitute another model's review for it, and do not hide it: failed sources go at the top of the report.

If every external vendor failed, the review is Claude-only — say so prominently. If everything failed, stop and report the failures.

## 5. Validate and merge

1. **Split**: `LEDGER split <workdir> --max <validator_batch_max>`. Raw findings are grouped by file, so duplicates at the same place land in one batch. If there are no raw findings at all, skip to §6 (No findings).
2. **Validate batches in parallel**: one read-only subagent per batch, `subagent_type: "mskim:review-validator"` (fallback: `general-purpose` with that agent file's instructions pasted in), all in the same message. Give each: the work directory, its batch number, the scope note, `finding-schema.md`, the instruction to write `<workdir>/merged/<n>.json`, and its check command `LEDGER check <workdir> --batch <n>` (with the path expanded). Do not summarize or pre-filter findings for them — they read the batch file and check each finding against the code.
3. **Join**: `LEDGER join <workdir>` → `merged.json`, sorted P0 → P3 and renumbered `F1…`.
4. **Final pass** (only when there were several batches, or `previous.json` exists): one more `mskim:review-validator` subagent with the task "final pass" and the check command `LEDGER check <workdir>` — it merges cross-batch duplicates and, in re-review, records a status for every previous finding.
5. **Check**: `LEDGER check <workdir>`. If it fails, send the problems to the validator responsible (the batch that owns the missing id, or the final pass) and repeat until `LEDGER OK`. If a validator reported issues missing from a transcription, add them to that source's raw file (with `excerpt`), and re-validate them. If you cannot get the check to pass, list the unaccounted ids explicitly in the report rather than leaving them out.

## 6. Report

Write the report in Korean (keep identifiers, paths, commands, messages in original form), from `merged.json` and the raw files. Use `file:line`. Include **every** merged finding — do not cut P3s or "minor" ones to shorten the report; shorten the wording instead.

```markdown
## 요약
Target, perspectives run, reviewers run (source → model), counts: raw N → merged M (P0 a, P1 b, P2 c, P3 d), disputed D, rejected K.
**실행하지 못한 리뷰어**: source, reason, error tail — or "없음".

## Findings
| ID | 심각도 | 관점 | 위치 | 제목 | 검증 | 출처 |
|----|--------|------|------|------|------|------|
(all merged findings, P0 → P3; 출처 = which sources reported it, e.g. claude-security, codex)

### F1. <title>
- 위치 / 트리거 / 영향 / 근거 / 수정 제안
- 재평가·이견 (if any)

## 이견 (사용자 판단 필요)
| 원본 ID | 출처 | 리뷰어 주장 | validator 반론 |
(every disputed raw finding — the validator could not prove it wrong from the code, so neither side is taken)

## 기각된 지적
| 원본 ID | 출처 | 내용 | 기각 사유 |
(every rejected raw finding)

## (re-review) 이전 지적 상태
| 이전 ID | 상태 | 근거 |

## 리뷰 범위
| 출처 | 관점 | 확인한 것 (`coverage`) |
(one row per source × perspective; flag a perspective that a source covered thinly or not at all)

## 검증하지 못한 것
Reviewer `limits`, unverified findings, failed or skipped sources, anything not run (tests, other platforms).

## 원본 대조표
| 원본 ID | 출처 | → | 결과 (F# / 이견 / 기각) |
(one row per raw finding; the ledger result line)
```

If there are no findings, write **No findings** with the list of perspectives and reviewers that ran — and do not claim the code is defect-free.

**Check the report before showing it.** Write it to `<workdir>/report.md` (or the §7 path) and run `LEDGER check <workdir> --report <that file>`: it fails if any `F#`, raw id, or previous id is not mentioned. Fix the report until it passes, then show it. Paste the final ledger line under 원본 대조표.

## 7. Save (doc option)

Save the checked report as Markdown at `--doc=<path>` or `analysis/<YYYY-MM-DD>-review-<short-topic>.md` in the working folder. Confirm before overwriting an existing file. In chat, give the path, the 요약, and the Findings table instead of the whole report. Suggest `/mskim:resolve extend <path>` (or `refactor`) as the next step when there are findings to fix.

The work directory is temporary; mention its path so raw outputs can be inspected.

## Configuring vendors

Tell the user this when they ask how to change models or vendors. Create `.claude/mskim-review.json` (project) or `~/.claude/mskim-review.json` (all projects) with only the keys to override:

```json
{
  "vendors": {
    "codex":  { "model": "gpt-6.2-sol", "effort": "high" },
    "gemini": { "enabled": false },
    "qwen":   { "enabled": true, "command": "qwen -p \"Follow the review instructions given on stdin.\" < {prompt} > {out}", "perspectives": ["security", "correctness"] }
  }
}
```

A vendor command must run headless, read the prompt from `{prompt}`, write its final answer to `{out}` (or stdout redirected there), and run read-only (Codex: `-s read-only`; Gemini headless has no write tools without `--yolo`). If the CLI loads per-project config (MCP servers, hooks), run it from `{isolated}` and give it the repository with an include-directory flag, or set `project_config_dir` so §4 asks first. Set `"split": true` to give a vendor one run per perspective (deeper, but one CLI run and its cost per perspective).
