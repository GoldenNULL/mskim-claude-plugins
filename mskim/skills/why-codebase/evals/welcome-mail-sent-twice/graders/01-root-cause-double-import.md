---
type: llm
focus: trace
weight: 1
---

The answer identifies as root cause that app/mail/welcome.py is executed twice as two different modules (app.mail.welcome and mail.welcome), because settings.yaml lists both under plugins and main.py puts the app/ folder on sys.path, so @subscribe registers send_welcome twice.
