---
type: llm
focus: trace
weight: 1
---

The report contains a finding that apply_discount rejects percent == 100 because of `>= 100`, although the docstring says 0-100 is allowed, at app/billing/discount.py line 3.
