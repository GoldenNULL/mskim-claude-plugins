---
type: llm
focus: trace
weight: 1
---

The review reports that cart_total in app/cart/totals.py still applies the uncapped discount rate, i.e. the same discount logic was capped in invoice_total but not in its duplicate.
