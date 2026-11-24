---
type: llm
focus: trace
weight: 1
---

The report contains a finding that app/users/search builds SQL with an f-string from the q parameter (app/users/api.py around line 19), allowing SQL injection.
