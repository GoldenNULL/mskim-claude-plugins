---
name: why-codebase
description: Analyzes WHY a phenomenon, bug, error, or behavior happens in the current codebase by finding every surface where it shows up and tracing every flow that can reach each surface, then explains the root cause with evidence (analysis only; fixes are proposed, not applied). Optionally saves the analysis as a Markdown document. Always use this skill when the user asks "왜", "어째서", "왜 이래", "원인", "원인 분석", "why does", "why is", "root cause", "어디서 이 값이 나와", "이게 어떻게 호출돼" about code, errors, logs, config, or app behavior, even if they do not name the skill directly.
argument-hint: "[phenomenon / problem / question] [doc | --doc | 문서화 | --doc=<path>]"
---

# Why (codebase): surfaces × traces → root cause

Input: $ARGUMENTS

## Purpose

Answer **why** the described phenomenon happens, grounded in the actual code. A good answer does not stop at the first plausible cause. It:

1. finds **every surface** — each place in the code, config, data, or output where the phenomenon is produced or becomes visible, and
2. finds **every trace** — each flow (entry point → … → surface) by which execution or data can reach that surface,
3. then decides which traces actually explain the reported case, and why the others do not.

Stopping at the first match is the most common failure: the bug often lives in the second path that produces the same message, or in the caller nobody looked at. The surface × trace map is what makes the answer trustworthy.

This skill **analyzes only**. Do not edit project code; propose fixes in the report.

## 0. Parse the arguments

- The **phenomenon** is the input text, minus the documentation option.
- The **documentation option** is a trailing token: `doc`, `--doc`, `문서`, `문서화`, `docs`, or `--doc=<path>`. If present, also save the report as a file (§6). If absent, answer in chat only.

## 1. Decide whether to ask first

Before doing the real work, judge whether the phenomenon is specific enough to trace. Asking costs the user a round trip, so ask only when the answer would change *where you look or what counts as the cause*.

Ask (with `AskUserQuestion` if available, at most 3 questions, each with concrete options and a recommendation) when, for example:
- the symptom could mean several different things in this codebase (e.g., "로그인이 안 돼" — error message? redirect loop? wrong user?),
- the expected vs. actual behavior is not stated and cannot be inferred,
- the reproduction context matters and is unknown (which environment, which input, which build), and the code has branches that depend on it.

Do **not** ask when you can find out yourself by reading code, config, logs, or git history, or when the phenomenon is already concrete (an exact error message, a named function, a specific value). In that case start immediately and state any assumption in the report. If you cannot ask (non-interactive run), proceed with the most likely interpretation and list it under "Assumptions".

## 2. Pin down the phenomenon

Write down for yourself, from the input and what you can verify:
- the observable symptom (exact message, value, behavior),
- where it is observed (UI, log, API response, test, build output),
- expected vs. actual,
- known conditions (input, environment, timing).

Anchor on concrete, searchable artifacts: exact strings, error codes, field names, function names.

## 3. Find every surface

A surface is any place that **produces or exposes** the phenomenon. Search broadly before narrowing:

- exact text of messages, log lines, error codes, UI strings (including i18n/resource files and string concatenation that would break an exact search — also search distinctive fragments),
- the code that writes the wrong value / state / side effect, not only the code that reads or displays it,
- throw/raise sites, error handlers that rewrap or swallow errors, default/fallback values,
- config, environment variables, feature flags, build scripts, generated code, data files, and migrations that can set the same thing,
- indirect producers: reflection, dependency injection, event/observer registration, serialized references (e.g., Unity scenes/prefabs, YAML/JSON wiring), string- or convention-based lookup, external processes,
- the environment the code runs in: OS/platform differences (path separators, case sensitivity, CRLF/LF, encoding/locale, shell), runtime and toolchain versions (language runtime, SDK, engine, compiler), dependency versions (manifest vs. lockfile vs. what is actually installed, transitive dependencies, changelogs of a recent upgrade), and external state (DB/schema, network, permissions, caches, installed services).

Tools: if a CodeGraph index (`.codegraph/`) and its tools are available, use `codegraph_explore` first for symbols, callers, and call paths; then confirm with Grep/Read. Use Grep for exact text and non-code files. `git log -S` / `git blame` can show when a surface appeared.

List every surface with `file:line` and one line on what it does. If you rule a candidate out as not a real surface, keep a note of why.

## 4. Trace every flow into each surface

For each surface, walk **backwards** until you reach entry points (user action, request handler, CLI command, scheduled job, test, startup, event):

- direct callers and their callers; every override/implementation for interface or virtual calls,
- async hops: callbacks, promises, queues, events, timers, threads,
- data flow: where the value was computed, stored, cached, deserialized, or defaulted before it got there,
- the **conditions** on each hop (branches, guards, flags, try/catch) that decide whether this path is taken.

Record each trace as a chain, for example:

`POST /checkout (routes/cart.js:12) → applyCoupon (cart/coupon.js:30) → calcTotal (cart/total.js:8) → discount applied [condition: coupon.stackable !== false]`

Do not conclude "nothing else reaches this" just because a search found nothing; check the indirect mechanisms in §3 before saying so.

Text search shows call *sites*, not how many times something actually runs. For "happens twice / N times / sometimes" symptoms, count at runtime level: how many handlers are registered, how many times a module or decorator is executed (e.g., the same file imported under two names), how many instances or subscriptions exist, how many times a loop, retry, or re-render runs.

## 5. Determine the cause

- Be suspicious of the most visible candidate (a retry wrapper, an obvious loop, the first grep hit). Check that its condition actually holds in the reported situation before blaming it; if it does not, list it under 배제한 가설 with the reason.
- Match each trace's conditions against the reported situation. Which traces can produce *exactly* this symptom? Which cannot, and why (condition not met, unreachable, dead code)?
- Verify, don't guess: read the actual code on the path; when safe and cheap, confirm with a read-only check (run an existing test, a small script against a scratch copy, inspect a log). Never change project files to verify.
- Separate **root cause** (the decision or defect that makes it happen) from **trigger** (the input/condition that exposes it) and **contributing factors**.
- If more than one trace can cause it, say so — that is often the real answer.
- If the code path alone does not explain the symptom, or it happens only on some machines, builds, or deployments, compare the environments: OS, runtime/toolchain versions, installed dependency versions, config/env values. A library's behavior counts as a hop in the trace; read its source or docs for the installed version rather than assuming.
- Mark anything you could not confirm as `미확인` with what would confirm it.

## 6. Report

Write the report in Korean (keep identifiers, paths, commands, messages in original form). Use `file:line` references. Scale to the problem: a one-surface, one-trace answer can be short; do not pad.

```markdown
## 결론
Why it happens, in 1–3 sentences: root cause + trigger.

## 현상
Symptom, where observed, expected vs. actual. Assumptions, if any.

## 표면 (Surfaces)
| # | 위치 | 역할 |
|---|------|------|
| S1 | path/file.ext:line | what is produced/exposed here |

## 경로 (Traces)
For each surface: every flow reaching it, as chains with conditions.
Mark each: ✅ explains the reported case / ❌ ruled out (why) / ❓ unconfirmed.

## 근거
The specific code, data, or check results that prove the conclusion.

## 배제한 가설
Plausible causes that turned out wrong, and the evidence against them.

## 미확인 사항
What could not be confirmed, and how to confirm it.

## 수정 제안
Where and how to fix (root cause first), and which other traces the fix must also cover. Not applied.
```

**Documentation option:** if requested, save the same report as Markdown. Use the given path if `--doc=<path>`; otherwise `analysis/<YYYY-MM-DD>-why-<short-topic>.md` in the current working folder. If the file exists, confirm before overwriting. In chat, give the saved path plus the 결론 and 수정 제안 sections instead of repeating the whole report.

## When there is no relevant code

If the working folder has no code related to the phenomenon (or no project at all), say so plainly, then explain from general knowledge using the same structure: the places the phenomenon can arise and the paths that lead there, clearly labeled as not verified against code.
