# Review perspectives

Each perspective is one lens. A reviewer assigned a perspective reports only what that lens finds; overlap with other lenses is fine — the validator merges duplicates.

## runtime (always)
Crashes, unhandled exceptions, null/undefined access, out-of-range indexing, resource leaks (files, handles, sockets, memory, GPU objects), missing cleanup on error paths, infinite loops, unbounded growth, wrong error propagation, swallowed errors, timeouts and retries that never end or never happen.

## correctness (always)
Logic that does not do what the change intends: wrong conditions, off-by-one, wrong operator, inverted branch, missing case, wrong default, wrong unit or type conversion, state updated in the wrong order. **Regression**: existing behavior or callers that this change breaks — read every caller of each changed symbol.

## security (always)
Untrusted input reaching queries, shells, paths, deserializers, templates, or eval; missing validation at trust boundaries; authentication/authorization gaps; secrets in code, logs, or errors; unsafe defaults; path traversal; injection; insecure crypto or randomness; data exposed to the wrong user.

## concurrency (signal: threads, locks, async/await, callbacks, events, atomics, shared mutable state, job systems, coroutines)
Data races, deadlocks, lock ordering, missing await, fire-and-forget errors lost, re-entrancy, check-then-act, cancellation not honored or leaving partial state, retries that duplicate side effects, ordering assumptions between threads or frames.

## compatibility (signal: public headers/APIs, exported symbols, serialized formats, save files, network protocols, config schemas, DB migrations, CLI flags, version bumps)
Breaking changes to callers outside the change, old data that no longer loads, protocol mismatch between old and new peers, removed or renamed config keys, platform/OS/runtime differences (paths, case sensitivity, line endings, encodings), dependency version constraints.

## design (signal: new module, new dependency, structural change over ~50 lines, `refactor` mode)
Responsibility in the wrong layer, duplicated logic that should be shared, abstraction nobody needs, tight coupling, dead code left behind, naming that misleads, performance traps (N+1, quadratic loops, per-frame allocation, blocking I/O on hot paths), code that is hard to test or change.

## flow (signal: new reject/error branch, new or changed user-visible message, session/cookie/counter use, quota or limit checks, multi-step UI flows)
Follow the user, not the function: what happens on the *next* action after each new outcome. State incremented, reserved, or written before a rejection and never restored; a message that tells the user to retry when the retry is then blocked by leftover state; a client that has no handler for a new response (no cleanup, no message, stale UI); a server and a client disagreeing on which requests "count"; inputs that used to succeed and now fail (positive regression) — report those with `"kind": "policy_change"` unless the intent states the new rule. Trace the client code that consumes the response, not only the server; the scope note's "State before the change point" and "Consumers of changed output" sections are your starting list. For each user flow you could not check from the code (it needs the running site, a browser, or another repository), add a `limits` entry starting with `manual scenario:` that a person could run, e.g. `manual scenario: 거절 직후 같은 창에서 정상 파일 첨부 (첨부 한도 1)`.

## Selecting perspectives

- `runtime`, `correctness`, `security` always run.
- Add the others when their signal appears in the changed code or its direct callers/callees.
- Add `flow` whenever the change adds a reject/error outcome or a user-visible message, even if the rest of the change is library code, or when the scope note lists any state before the change point, consumer of changed output, or policy change.
- `refactor`-mode changes (from `/mskim:resolve refactor`) always add `design`, and the correctness reviewer must weight regression.
- `reviewers=<list>` in the arguments overrides the selection entirely.
