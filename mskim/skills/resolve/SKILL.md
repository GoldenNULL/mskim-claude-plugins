---
name: resolve
description: Carries out actual work — implementing a feature, fixing a bug, applying an improvement — from a task instruction document (such as one made by /mskim:wanna), an advice/why analysis, a /mskim:review report, or a task description, in one of two modes. `extend` keeps the existing structure and implementation intact and adds new classes, functions, or modules beside it (for cases like deploying by copying code into another codebase, where a small, additive, easy-to-port diff matters). `refactor` analyzes the existing structure and redesigns it at the root when that is the right fix.
argument-hint: "[extend | refactor] [instruction doc path / task / prompt]"
disable-model-invocation: true
---

# Resolve: execute the task, in extend or refactor mode

Input: $ARGUMENTS

## Purpose

`wanna`, `why-codebase`, `advice`, and `review` prepare and decide; this skill **does the work** and changes the code. The mode decides how much of the existing code the change may move:

- **extend** — keep what exists: new behavior lands in new units at the extension points the design already offers, and edits to existing files are wiring only (§3). Use it when the diff has to be small, additive, and easy to carry over — for example, when the change is deployed by copying code into another codebase by hand, where every edited line in an existing file is a manual merge.
- **refactor** — analyze the existing structure first, and when the root cause or the right design lives in that structure, redesign it: move responsibilities, change signatures, merge or split modules, delete what becomes dead. Correctness and a clean end state win over a small diff.

## 0. Parse the arguments

- **Mode**: the first token if it is `extend` / `refactor` (also accept `확장`, `--extend`, `리팩터`, `리팩토링`, `--refactor`). If that token is the verb of the task sentence (`extend the timeout to 30s`), it is part of the task, not the mode.
- **Task**: the rest. It can be:
  - a path to an instruction document (e.g., written by `/mskim:wanna`) or an `analysis/*-advice-*.md` / `*-why-*.md` / `*-review-*.md` file (`--doc` can save under any name, so tell the kind by its top-level sections, in this order: `## Findings` → review, `## 권장안` → advice, `## 경로 (Traces)` → why; with none of these, an instruction document only if it has a Scope or Done criteria section — `## 범위 (Scope)` / `## 완료 기준 (Done criteria)`, or the English names alone in older documents — else a plain description). If a given path cannot be read, report it and ask for the right one (if you cannot ask, stop); do not treat the path as a task description,
  - a task, bug, or change described in words,
  - nothing — only then use what this conversation already established (a recent instruction document, advice, or discussion).

**If the mode is missing**: infer it from the input (an instruction document may state deployment or diff constraints; an advice report's recommended option may clearly be additive or structural). If it still is not clear and the choice would change the work — the right fix touches existing structure — ask the user (see §2) with `extend` as the recommendation, since it is the reversible, lower-risk choice. If the change is purely additive anyway, the modes coincide: just do it and say so.

## 1. Understand the task

Handle the task by kind:

1. **An instruction document**: read all of it. Its Purpose, Scope (In/Out), Work, Constraints, and Done criteria are the contract. Its Open items are unresolved: a step it leaves to the user's decision needs the user's agreement (§2).
2. **A review report** (from `/mskim:review`): fix its findings, P0 first; the task is each finding's 트리거 no longer causing its 영향. Fix only the findings you confirm (some are `unverified`), and report the false, already-fixed, and still-unverified ones (with what would settle them), plus any gaps the review itself reports. Leave 기각된 지적 alone; 이견 items need the user's decision (§2). A 수정 제안 that conflicts with the mode is handled as in item 3.
3. **An advice report**: implement its 권장안. If the chosen mode contradicts it (e.g., it recommends a shared-code redesign but the mode is `extend`), use a mode-compatible option only if it meets the same requirements; otherwise it needs the user's agreement (§2). Say what you did in the report.
4. **A why report**: implement a 수정 제안 only after establishing the cause it relies on. If the cause is open, settle it with the report's check or suggest `/mskim:advice <path>`. If several fixes fit an established cause, choose briefly as in item 6, or suggest the same command when they differ materially.
5. **A plain description**: pin down what "done" means before editing.
6. **Nothing usable, or only a vague goal** ("이거 좀 개선해줘"): if there is no subject at all, ask what should change (if you cannot ask, stop and say what input is needed). Otherwise do not guess at a large change. Get direction first the way `/mskim:advice` does — find the cause or the limiting factor, weigh 2–3 options, pick one that fits the mode — keep it short, and state the chosen direction in the report. If the subject is large or the cause unclear, suggest running `/mskim:why-codebase` or `/mskim:advice` first instead of building on a guess.

Any document input may be older than the code (compare the revision it records — a why/advice report's `> Revision:` line, a review report's 기준 revision — with the current one): before editing, check its paths, `file:line` claims, findings, and assumptions against the current code, and include the checks it names in your §5 verification.

Then read the code the change must reach: the entry points, every caller of anything you will touch, tests, fixtures, config, exports, and build files. This list guides what you read; the task (its Scope) defines what you may edit.

## 2. Decide whether to ask first

Ask (with `AskUserQuestion` if available, at most 3 questions at a time, each with concrete options and a recommendation) only when the answer changes what you build:
- the mode, when it is missing and matters (§0),
- a requirement with two reasonable readings that lead to different code,
- a constraint you cannot read from the project: public API compatibility, supported platforms, whether a dependency or version change is allowed, how the change will be deployed,
- anything this skill or the instruction document says *needs the user's agreement*.

Do not ask what the code, config, tests, or git history can tell you. If you cannot ask, take the recommended choice and record it under "가정한 사항" in the report — except where this skill or the instruction document requires the user's agreement: then leave that part undone and list it as a blocker under 미확인 / 남은 작업.

## 3. Plan by mode

### extend

1. Find the **extension points** the existing design already offers: interfaces, base classes, virtual/overridable methods, registries, factories, DI registration, event hooks, strategy or config tables, partial classes.
2. Put new behavior in **new units** — a new class, function, file, or module — following the surrounding naming, layering, and conventions.
3. Keep edits to existing files **minimal and wiring-only**: registering the new unit, one call site, one new branch, a new overload that leaves existing calls resolving as before. Do not change existing signatures, rename, reformat, or reorder existing code. Existing callers must keep working without changes.
4. If the task cannot be done without changing existing structure (the bug is in the existing logic itself, or there is no seam to attach to), make the **smallest in-place change** that fixes it, keep it isolated, and flag it in the report as a deviation from extend.
5. Prefer self-contained new files over edits spread across existing ones.

### refactor

1. **Analyze the current structure** around the task: responsibilities, dependencies, duplication, where the root cause or the friction really lives. Beyond the callers found in §1, find the implementers of any interface you may change.
2. Decide the **target design** and why it is better than extending — in a few sentences, not a document. If extending would solve the problem just as well, say so and do the smaller change.
3. **Change in safe steps**: keep the build green between steps where possible; move or rename with all references updated; delete code that becomes dead instead of leaving it.
4. Keep externally visible behavior unless the task says to change it.

### Both modes

- A change (an in-place fix in extend included) that alters a public API or data format, breaks a stated constraint, or needs edits in Scope (Out) (e.g., a caller there) needs the user's agreement (§2) before editing, unless the user or the instruction document explicitly calls for it — a suggestion in a review, advice, or why report does not count. Prefer a design that avoids it.
- A fix that makes previously accepted input fail (or previously rejected input pass), a review finding with `kind: "policy_change"` (listed under its 정책 변경 table), or a 수정 제안 that offers alternatives ("reject X, or support X by …") is a policy choice: it needs the user's agreement (§2), even when a review suggested it — the user decides what their users are allowed to do, and a reviewer's first option is not that decision. Ask with the options and their user-visible effect (which inputs change outcome, what message the user sees). If you cannot ask, leave it undone and list it as a blocker. A chosen rejection gets its own result value and message at every caller, not a generic failure.
- A review finding marked `(기존, 변경으로 악화)` (`aggravated_by_change: true`: an old defect this change made worse, with the before → after on its 악화 line) has more than one right fix, so the choice needs the user's agreement (§2). Ask with these options: (1) fix the old defect itself, which may mean edits outside the change's scope; (2) adjust the part of this change that aggravated it (the location on its 악화 line); (3) accept and record the risk. If you cannot ask, take (2) when it removes the aggravation without breaking the task's intent; otherwise leave it undone and list it as a blocker.
- Before running a destructive step (deleting data, resetting a database, a migration on a shared target), confirm the target is disposable; otherwise it needs the user's agreement (§2).
- Do the whole task: every part of Scope (In), and the callers, tests, fixtures, and config your change breaks.
- Do not touch Scope (Out) beyond what was agreed, or unrelated code, and do not add features, options, or abstractions nobody asked for.
- Keep error handling and validation when you move code.
- Follow the project's conventions and any rules the instruction document sets.

## 4. Implement

For a multi-step task, keep a task list and finish each step before the next. When the task specifies an order or checkpoints, follow them.

If you find the plan is wrong partway through (an assumption fails, the root cause is elsewhere), stop and adjust: a small correction can just be made and reported; a change of direction or scope needs the user's agreement (§2); until then, stop at the last consistent state.

## 5. Verify

Run what the project uses: build, type-check, lint, the tests near the change, and the instruction document's Verification steps and Done criteria. Add a small test for new non-trivial logic when the project has tests (in extend, in a new test file where the framework allows). When the change is structural, as a refactor usually is, run the wider test suite. Run formatters and auto-fixing linters in check mode or only on the lines you changed; never revert a file to undo them — if neither is possible, report that check as not run.

When a fix adds a rejection, also verify one input of the same kind that should still pass (e.g., the 258-char case next to the 259-char one). When a fix adds a user-visible outcome, verify the next user action after it (retry, delete, re-submit) — on the site if the project has one, or name it under 미확인 as a manual scenario. A new outcome is where leftover state (a session counter, a reserved slot) shows up, and only the next action exposes it.

If a check fails, fix what your change caused and re-run. A failure that also happens without your change is pre-existing: report it, and do not fix it outside Scope. Tell this from the failure itself or a separate clean checkout (e.g., a worktree) — never stash, reset, or revert the working tree to find out.

If something cannot be run here (no runtime, hardware, external service, another OS), say exactly what was not verified and how to verify it.

Do not commit unless the user or the instruction document asks for it; a commit holds only this task's changes, not unrelated staged ones. Do not push unless the user asks in this conversation.

## 6. Report

If the instruction document has a Reporting section, follow its form, but still include the touched existing files, any extend deviation, check results, open Done criteria, and blockers. Otherwise write the report in Korean (keep identifiers, paths, commands, and messages in original form). Use `file:line` references. Scale it to the task and drop empty sections. Redact credentials, tokens, and personal data from quoted output. End by suggesting `/mskim:review` on the change as the next step.

```markdown
## 결과
What was done, in 1–3 sentences. Mode used (extend / refactor), and why if it was inferred.

## 변경 사항
| 파일 | 종류 | 내용 |
|------|------|------|
| path/new_file.ext | 신규 | ... |
| path/existing.ext:line | 수정 | wiring only / logic / signature |
| path/old.ext | 삭제 | ... |

(extend) The 수정 rows are the merge points for a copy-paste deployment; explain any deviation from extend and its reason.
(refactor) Old structure → new structure in a few lines, and every caller/API affected.

## 검증
Commands run and their results. Done criteria met / not met.

## 가정한 사항
Choices made without the user's answer.

## 미확인 / 남은 작업
What was not verified or not done, and how to finish it.
```
