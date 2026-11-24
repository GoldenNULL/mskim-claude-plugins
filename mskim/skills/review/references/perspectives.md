# Review perspectives

Each perspective is one lens. A reviewer assigned a perspective reports only what that lens finds; overlap with other lenses is fine — the validator merges duplicates.

## runtime (always)
Crashes, unhandled exceptions, null/undefined access, out-of-range indexing, resource leaks (files, handles, sockets, memory, GPU objects), missing cleanup on error paths, infinite loops, unbounded growth, wrong error propagation, swallowed errors, timeouts and retries that never end or never happen.
- For every external call or process the change touches, follow each outcome, not only the one the change was written for: succeeded; **finished but failed** (non-zero exit code, exception, error output, partial or empty result); timed out or hung; never started. Is the exit code or error read before the result is used, and before the handle is closed or disposed (e.g., `ExitCode` read before `Close()`)? Does each failure outcome reach the caller, or does the code go on as if the step had worked?
- For each pre-existing bug you find on a path the change reaches: did the change make its outcome worse, open a new path to it, or make it reached more often? If so, mark it aggravated (Rules 8).

## correctness (always)
Logic that does not do what the change intends: wrong conditions, off-by-one, wrong operator, inverted branch, missing case, wrong default, wrong unit or type conversion, state updated in the wrong order. **Regression**: existing behavior or callers that this change breaks — read every caller of each changed symbol.
- **Removed-behavior audit**: for every replaced call, flag, branch, or default, name the property the old code guaranteed, and find where the new code guarantees it again (the scope note's "Removed or replaced behavior" is your starting list). A comment or commit message saying why the change is safe ("prevents paths over 260 chars") is a claim, not evidence: check what the new code actually does, including the behavior it newly creates.
- For each pre-existing bug you find on a path the change reaches: did the change make its outcome worse, open a new path to it, or make it reached more often? If so, mark it aggravated (Rules 8).

## security (always)
Untrusted input reaching queries, shells, paths, deserializers, templates, or eval; missing validation at trust boundaries; authentication/authorization gaps; secrets in code, logs, or errors; unsafe defaults; path traversal; injection; insecure crypto or randomness; data exposed to the wrong user.
- Review every item in the scope note's "Security checks in the change" first and in full, however small its diff — this is where a short edit in a big change hides.
- **Fail closed**: for each check, follow every non-success outcome of what it depends on (the tool or call failed, timed out, returned partial output, or produced names the check did not expect). Each must end in a rejection, not in the unchecked input being accepted. A check that runs on a tool's output inherits that tool's renames and failure modes.
- Boundary inputs of the check itself: case, trailing dots or spaces, double extensions, no extension, Unicode look-alikes, alternate data streams, very long names — as the library function the check uses actually treats them.
- For each pre-existing bug you find on a path the change reaches: did the change make its outcome worse, open a new path to it, or make it reached more often? If so, mark it aggravated (Rules 8).

## concurrency (signal: threads, locks, async/await, callbacks, events, atomics, shared mutable state, job systems, coroutines)
Data races, deadlocks, lock ordering, missing await, fire-and-forget errors lost, re-entrancy, check-then-act, cancellation not honored or leaving partial state, retries that duplicate side effects, ordering assumptions between threads or frames.
- For each pre-existing bug you find on a path the change reaches: did the change make its outcome worse, open a new path to it, or make it reached more often? If so, mark it aggravated (Rules 8).

## compatibility (signal: public headers/APIs, exported symbols, serialized formats, save files, network protocols, config schemas, DB migrations, CLI flags, version bumps)
Breaking changes to callers outside the change, old data that no longer loads, protocol mismatch between old and new peers, removed or renamed config keys, platform/OS/runtime differences (paths, case sensitivity, line endings, encodings), dependency version constraints.
- For each pre-existing bug you find on a path the change reaches: did the change make its outcome worse, open a new path to it, or make it reached more often? If so, mark it aggravated (Rules 8).

## design (signal: new module, new dependency, structural change over ~50 lines, `refactor` mode)
Responsibility in the wrong layer, duplicated logic that should be shared, abstraction nobody needs, tight coupling, dead code left behind, naming that misleads, performance traps (N+1, quadratic loops, per-frame allocation, blocking I/O on hot paths), code that is hard to test or change.

## flow (signal: new reject/error branch, new or changed user-visible message, session/cookie/counter use, quota or limit checks, multi-step UI flows)
Follow the user, not the function: what happens on the *next* action after each new outcome. State incremented, reserved, or written before a rejection and never restored; a message that tells the user to retry when the retry is then blocked by leftover state; a client that has no handler for a new response (no cleanup, no message, stale UI); a server and a client disagreeing on which requests "count"; inputs that used to succeed and now fail (positive regression) — report those with `"kind": "policy_change"` unless the intent states the new rule. Trace the client code that consumes the response, not only the server; the scope note's "State before the change point" and "Consumers of changed output" sections are your starting list. For each user flow you could not check from the code (it needs the running site, a browser, or another repository), add a `limits` entry starting with `manual scenario:` that a person could run, e.g. `manual scenario: 거절 직후 같은 창에서 정상 파일 첨부 (첨부 한도 1)`.

## External tool checklist (every perspective, when the scope note lists an external tool or library edge)
Do not treat the tool as a black box that "just works". For each listed tool or call, and for the arguments the change gives it:
1. **Output shape**: what exactly it produces for the inputs the code will feed it — names, renames on conflict (e.g., `-aou` appends a suffix to a duplicate name), overwrites, flattened or kept folders, path length, encoding. Does the code that reads the output (and any check on it) expect that shape?
2. **Failure behavior**: its exit codes and what each means, what it leaves behind on failure (partial files), and what it does when it hits a limit (path length, disk, size).
3. **What changed from the old arguments**: the guarantees the old invocation gave and the new one drops (the removed-behavior audit, applied to flags).
4. **Library edges**: the documented result of the library functions involved on the boundary inputs above.
Say where each answer comes from (documentation, `--help` output, a run). If you cannot settle one by reading, report the suspected defect anyway as a finding with `verification: "unverified"` and end its `evidence` with the experiment that would settle it (finding-schema.md, Experiments).

## Selecting perspectives

- `runtime`, `correctness`, `security` always run.
- Add the others when their signal appears in the changed code or its direct callers/callees.
- Add `flow` whenever the change adds a reject/error outcome or a user-visible message, even if the rest of the change is library code, or when the scope note lists any state before the change point, consumer of changed output, or policy change.
- `refactor`-mode changes (from `/mskim:resolve refactor`) always add `design`, and the correctness reviewer must weight regression.
- `reviewers=<list>` in the arguments overrides the selection entirely.
