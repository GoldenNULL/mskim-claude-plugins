---
type: llm
focus: trace
weight: 1
---

The review reports that PAYMENT_WEBHOOK_SECRET is required (os.environ[...] without a default) so the app fails at import/startup (KeyError) in any environment that does not set it.
