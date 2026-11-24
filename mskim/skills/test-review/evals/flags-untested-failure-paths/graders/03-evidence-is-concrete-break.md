---
type: llm
focus: trace
weight: 1
---

Each failure-path finding states a concrete break (for example removing the cache fallback, or returning a stale value instead of throwing) and that the only existing test, which mocks a 200 response, would still pass.
