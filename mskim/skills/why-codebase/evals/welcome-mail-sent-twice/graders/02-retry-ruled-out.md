---
type: llm
focus: trace
weight: 1
---

The answer considers the @retry wrapper in app/mail/smtp.py and rules it out because it only retries on ConnectionError (and would not log send_welcome twice).
