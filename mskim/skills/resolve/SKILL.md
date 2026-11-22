---
name: resolve
description: Carries out actual work — implementing a feature, fixing a bug, applying an improvement — from a task instruction document (such as one made by /mskim:instruction), an advice/why analysis, or a task description, in one of two modes. `extend` keeps the existing structure and implementation intact and adds new classes, functions, or modules beside it (for cases like deploying by copying code into another codebase, where a small, additive, easy-to-port diff matters). `refactor` analyzes the existing structure and redesigns it at the root when that is the right fix.
argument-hint: "[extend | refactor] [instruction doc path / task / prompt]"
disable-model-invocation: true
---

# Resolve: execute the task, in extend or refactor mode

Input: $ARGUMENTS

## Purpose

`instruction`, `why-codebase`, and `advice` prepare and decide; this skill **does the work** and changes the code. The mode decides how much of the existing code the change may move:

- **extend** — keep what exists. Existing files, class/function signatures, and call structure stay as they are; the change lands as new classes, functions, modules, overloads, subclasses, adapters, or new branches at clear extension points. Use it when the diff has to be small, additive, and easy to carry over — for example, when the change will be deployed by copying code into another copy of the codebase by hand, every edited line in an existing file is a line someone must merge by hand, while a new file just gets dropped in.
- **refactor** — analyze the existing structure first, and when the root cause or the right design lives in that structure, redesign it: move responsibilities, change signatures, merge or split modules, delete what becomes dead. Correctness and a clean end state win over a small diff, but every caller of what you change gets updated.

Both modes deliver the same thing: the task is done, the build and tests pass, and the report says exactly what changed.

## 0. Parse the arguments

- **Mode**: the first token if it is `extend` / `refactor` (also accept `확장`, `--extend`, `리팩터`, `리팩토링`, `--refactor`).
- **Task**: the rest. It can be:
  - a path to an instruction document (e.g., written by `/mskim:instruction`) or an `analysis/*-advice-*.md` / `*-why-*.md` / `*-review-*.md` file,
  - a task, bug, or change described in words,
  - nothing — then use what this conversation already established (a recent instruction document, advice, or discussion).

**If the mode is missing**: infer it from the input (an instruction document may state deployment or diff constraints; an advice report's recommended option may clearly be additive or structural). If it still is not clear and the choice would change the work — the right fix touches existing structure — ask the user (see §2) with `extend` as the recommendation, since it is the reversible, lower-risk choice. If the change is purely additive anyway, the modes coincide: just do it and say so.

## 1. Understand the task

Take the requirements from the first source that has them:

1. **An instruction document**: read all of it. Its Purpose, Scope (In/Out), Constraints, and Done criteria are the contract. Spot-check its paths and `file:line` claims against the current code — it may be older than the code.
2. **A review report** (from `/mskim:review`): fix its findings, P0 first; the task is each finding's 트리거 no longer causing its 영향. Findings marked `unverified`: confirm against the code before changing anything, and report the ones you found to be false. Leave 기각된 지적 alone.
3. **An advice or why report** (in this conversation or as a file): implement its 권장안. If the chosen mode contradicts the recommended option (e.g., advice recommends a shared-code redesign but the mode is `extend`), pick the option from that report that fits the mode, or adapt the recommendation, and say so in the report.
4. **A plain description**: read the code it touches and pin down what "done" means before editing.
5. **Nothing usable, or only a vague goal** ("이거 좀 개선해줘"): do not guess at a large change. Get direction first the way `/mskim:advice` does — find the cause or the limiting factor, weigh 2–3 options, pick one that fits the mode — keep it short, and state the chosen direction in the report. If the subject is large or the cause unclear, suggest running `/mskim:why-codebase` or `/mskim:advice` first instead of building on a guess.

Then read the code the change must reach: the entry points, every caller of anything you will touch, tests, fixtures, config, exports, and build files. This list is the scope; nothing outside it gets touched without a reason.

## 2. Decide whether to ask first

Ask (with `AskUserQuestion` if available, at most 3 questions, each with concrete options and a recommendation) only when the answer changes what you build:
- the mode, when it is missing and matters (§0),
- a requirement with two reasonable readings that lead to different code,
- a constraint you cannot read from the project: public API compatibility, supported platforms, whether a dependency or version change is allowed, how the change will be deployed.

Do not ask what the code, config, tests, or git history can tell you. If you cannot ask, take the recommended choice and record it under "가정한 사항" in the report.

## 3. Plan by mode

### extend

1. Find the **extension points** the existing design already offers: interfaces, base classes, virtual/overridable methods, registries, factories, DI registration, event hooks, strategy or config tables, partial classes. Extending through these is cheaper and safer than editing logic.
2. Put new behavior in **new units** — a new class, function, file, or module — following the surrounding naming, layering, and conventions.
3. Keep edits to existing files **minimal and wiring-only**: registering the new unit, one call site, one new branch, a new optional parameter with a default that keeps old behavior. Do not change existing signatures, rename, reformat, or reorder existing code. Existing callers must keep working without changes.
4. If the task cannot be done without changing existing structure (the bug is in the existing logic itself, or there is no seam to attach to), make the **smallest in-place change** that fixes it, keep it isolated, and flag it in the report as a deviation from extend — do not quietly turn it into a refactor.
5. Prefer self-contained new files: fewer cross-file edits means fewer merge points for anyone porting the change. List every touched existing file in the report, since that is exactly what a copy-paste deployment has to merge.

### refactor

1. **Analyze the current structure** around the task: responsibilities, dependencies, duplication, where the root cause or the friction really lives. Use CodeGraph or the usual search tools to find every caller, implementer, and test.
2. Decide the **target design** and why it is better than extending — in a few sentences, not a document. If extending would solve the problem just as well, say so and do the smaller change: refactor means *allowed* to redesign, not *required* to.
3. **Change in safe steps**: keep the build green between steps where possible; move or rename with all references updated; update every caller, test, fixture, and config the change breaks; delete code that becomes dead instead of leaving it.
4. Keep externally visible behavior unless the task says to change it. If a public API or data format must change, that needs the user's agreement (§2) and goes in the report.

### Both modes

- Do the whole task: every part of Scope (In), and the callers, tests, and fixtures your change breaks.
- Do not touch Scope (Out) or unrelated code, and do not add features, options, or abstractions nobody asked for.
- Keep error handling and validation when you move code.
- Follow the project's conventions and any rules the instruction document sets.

## 4. Implement

Make the changes. For a multi-step task, keep a task list and finish each step before the next. When the task specifies an order or checkpoints, follow them.

If you find the plan is wrong partway through (an assumption fails, the root cause is elsewhere), stop and adjust: a small correction can just be made and reported; a change of direction or scope goes back to the user.

## 5. Verify

Run what the project uses: build, type-check, lint, the tests near the change, and the instruction document's Verification steps and Done criteria. Add a small test for new non-trivial logic when the project has tests. In refactor mode, run the wider test suite, since the change reaches further.

If something cannot be run here (no runtime, hardware, external service, another OS), say exactly what was not verified and how to verify it.

Do not commit or push unless the user or the instruction document asks for it.

## 6. Report

Write the report in Korean (keep identifiers, paths, commands, and messages in original form). Use `file:line` references. Scale it to the task and drop empty sections.

```markdown
## 결과
What was done, in 1–3 sentences. Mode used (extend / refactor), and why if it was inferred.

## 변경 사항
| 파일 | 종류 | 내용 |
|------|------|------|
| path/new_file.ext | 신규 | ... |
| path/existing.ext:line | 수정 | wiring only / logic / signature |
| path/old.ext | 삭제 | ... |

(extend) Existing files touched — the merge points for a copy-paste deployment — and any deviation from extend with its reason.
(refactor) Old structure → new structure in a few lines, and every caller/API affected.

## 검증
Commands run and their results. Done criteria met / not met.

## 가정한 사항
Choices made without the user's answer.

## 미확인 / 남은 작업
What was not verified or not done, and how to finish it.
```
