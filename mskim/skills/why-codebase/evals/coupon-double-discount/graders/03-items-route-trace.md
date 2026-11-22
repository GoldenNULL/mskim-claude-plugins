---
type: llm
focus: trace
weight: 1
---

The answer notes that adding an item via src/routes/items.js also emits cart:updated, so the discount stacks again on every item add after a coupon is applied.
