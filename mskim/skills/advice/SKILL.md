---
name: advice
description: Proposes HOW to fix or improve a phenomenon, bug, error, or weak spot in the current codebase, continuing from a cause analysis (such as one made by /mskim:why-codebase). Weighs options that change the code and options that change the environment (OS/platform, runtime and toolchain versions, dependencies and lockfiles, config, CI, infrastructure), compares their trade-offs, and recommends one with concrete steps, verification, and prevention (advice only; nothing is applied). Optionally saves the advice as a Markdown document. Always use this skill when the user asks "어떻게 고쳐", "어떻게 해결", "개선 방법", "해결책", "대안", "어떻게 하면 좋을까", "방지하려면", "how do I fix", "how should I fix", "how to improve", "what's the best fix", or follows a why/root-cause analysis with "그럼 어떻게 해?", even if they do not name the skill directly.
argument-hint: "[phenomenon / problem / why-analysis doc path] [doc | --doc | 문서화 | --doc=<path>]"
disable-model-invocation: true
---

# Advice (codebase): cause → options → recommendation

Input: $ARGUMENTS

## Purpose

Answer **how** to fix or improve the described phenomenon, grounded in the actual code and the environment it runs in. A good answer:

1. starts from the **root cause**, not the symptom — a fix that only hides the symptom on one path leaves the other paths broken,
2. considers **where** the fix can live — in the code, or in the environment (OS, runtime, dependencies, config, build, deployment) — because the cheapest correct fix is often not in the file where the error shows up,
3. compares **several options** honestly (effort, risk, blast radius, what they leave unfixed) and recommends one,
4. says how to **verify** the fix and how to **prevent** the same class of problem.

This skill **advises only**. Do not edit project code, config, or installed packages. Show changes as snippets or diffs in the report.

## 0. Parse the arguments

- The **subject** is the input text, minus the documentation option. It can be a phenomenon, a question, or a path to an existing analysis document (e.g., `analysis/2026-11-20-why-*.md`).
- The **documentation option** is a trailing token: `doc`, `--doc`, `문서`, `문서화`, `docs`, or `--doc=<path>`. If present, also save the advice as a file (§7). If absent, answer in chat only.

## 1. Get the cause

Improvement advice is only as good as the cause it targets. Take the cause from the first source that has it:

1. **This conversation** already contains a why/root-cause analysis of this phenomenon (for example from `/mskim:why-codebase`): reuse its surfaces, traces, root cause, and 미확인 items. Do not redo it; re-read only the code you are about to recommend changing, to make sure it still matches.
2. **A document** is given or obviously referenced (an `analysis/*-why-*.md` file): read it, then spot-check its key `file:line` claims against the current code — the code may have changed since it was written.
3. **Neither**: do a compact cause analysis yourself, following the same method as `why-codebase` — find every surface where the phenomenon is produced, trace every flow that reaches it, check the environment (OS, runtime, dependency versions, config). Keep it short in the report; the advice is the point. If the cause is genuinely unclear and large, say so and suggest running `/mskim:why-codebase` first rather than advising on a guess.

If the request is an improvement rather than a defect ("이 부분 더 빠르게", "이 구조 개선하려면"), the "cause" is what limits the current design: the bottleneck, the coupling, the missing abstraction. Measure or locate it the same way before advising.

## 2. Decide whether to ask first

Ask (with `AskUserQuestion` if available, at most 3 questions, each with concrete options and a recommendation) only when the answer would change which option you recommend, for example:
- constraints you cannot read from the project: "OS/런타임/의존성 버전을 바꿀 수 있는가?", "배포 환경을 건드릴 수 있는가?", "public API 호환성을 지켜야 하는가?",
- the priority between conflicting goals: quick hotfix now vs. a proper fix, minimal diff vs. cleanup,
- which of several distinct problems the user means.

Do not ask what you can find out from code, config, lockfiles, CI files, or git history. If you cannot ask, assume the most common constraints (keep the public API, keep supported platforms, prefer the smaller change) and list them under "전제".

## 3. Map where a fix can live

For the root cause and each contributing factor, list the places a change could break the chain. Cover both kinds:

**Code**
- the root cause itself (the wrong decision, value, or assumption),
- shared code that every trace passes through — fixing it once there beats patching each caller,
- each trace that reaches the surface: a fix on one path must not leave another path still producing the symptom (list which traces each option covers),
- boundaries: input validation, error handling, defaults and fallbacks, retries, timeouts.

**Environment**
- OS/platform: path handling, case sensitivity, CRLF/LF and `.gitattributes`, encoding/locale, shell differences, file permissions, line-ending or path assumptions in scripts,
- runtime and toolchain: required versions (`engines`, `.nvmrc`, `.python-version`, `global.json`, `rust-toolchain`, Unity/SDK version), compiler flags, build tooling,
- dependencies: manifest vs. lockfile vs. what is installed, pinning or upgrading a version, a known bug or fix in a library's changelog for the installed version, transitive dependencies, replacing a dependency, removing one that is not needed,
- config and deployment: env vars, feature flags, config files per environment, containers or VMs, CI matrix, caches, permissions, external services.

Check facts before relying on them: read the installed library's source or the changelog for the exact version, read the actual CI and lockfile. Mark anything you could not verify as `미확인`.

## 4. Build and compare options

Write 2–4 distinct options (one is fine when there is honestly only one sensible fix). Distinct means a different place or approach, not the same fix worded twice. Typical spread: a minimal targeted fix, a root-cause fix in shared code, an environment fix, and — if relevant — a short-term workaround to unblock now.

For each option, state:
- **what changes** (files, versions, settings) and a concrete snippet or diff,
- **which traces/causes it covers**, and which it leaves,
- **effort** and **risk** (what could break: callers, other platforms, data, performance, public API),
- **side effects on other environments**: does it fix one OS and break another? does a version bump pull in other breaking changes?

Prefer, in this order, when they solve the problem fully: removing the cause over adding a guard; one change in shared code over many in callers; using what the project or platform already has over adding code or dependencies; the smaller change over the larger one. A workaround that hides the symptom is allowed only when labeled as such, with the real fix next to it.

## 5. Recommend

Pick one option (or a short sequence: e.g., "지금은 B로 막고, 다음에 A"). Explain why it wins against the others in this project's situation, in a few sentences. Then give:
- **steps** in order, specific enough to execute (file, change, command),
- **verification**: how to confirm the fix — the reproduction to rerun, the test to add or run, the environments to check (each OS / runtime version / dependency version the problem involved),
- **prevention**: what keeps this class of problem from coming back — a test, a lint rule, a pinned version or lockfile check, a CI matrix entry, a `.gitattributes` rule, a type or assertion. Only what is worth it here; skip if nothing is.

## 6. Report

Write the report in Korean (keep identifiers, paths, commands, messages in original form). Use `file:line` references. Scale to the problem: a one-line fix needs a short answer; do not pad, and drop sections that would be empty.

```markdown
## 결론
The recommended fix in 1–3 sentences, and why.

## 원인 요약
Root cause, trigger, contributing factors (code and environment) — brief.
Source: this conversation / <doc path> / own analysis. 전제, if any.

## 개선 지점
| # | 위치 | 종류 | 끊는 원인/경로 |
|---|------|------|----------------|
| P1 | path/file.ext:line | 코드 | root cause, traces T1·T2 |
| P2 | package.json / lockfile | 의존성 | contributing factor |

## 대안 비교
### A. <name>
변경 내용 (snippet/diff), 커버하는 경로, 공수, 위험, 다른 환경에 미치는 영향.
### B. ...

| | A | B | C |
|---|---|---|---|
| 근본 원인 해결 | | | |
| 공수 | | | |
| 위험 | | | |

## 권장안
Which option and why. Steps in order.

## 검증 방법
How to confirm, per environment involved.

## 재발 방지
Tests, checks, pinning, CI — only what is worth it.

## 미확인 사항
What could not be confirmed, and how to confirm it.
```

**Documentation option:** if requested, save the same report as Markdown. Use the given path if `--doc=<path>`; otherwise `analysis/<YYYY-MM-DD>-advice-<short-topic>.md` in the current working folder. If the advice continues a saved why document, link it at the top. If the file exists, confirm before overwriting. In chat, give the saved path plus the 결론 and 권장안 sections instead of repeating the whole report.

## When there is no relevant code

If the working folder has no code related to the subject (or no project at all), say so plainly, then advise from general knowledge using the same structure — code-side and environment-side options, trade-offs, a recommendation — clearly labeled as not verified against code.
