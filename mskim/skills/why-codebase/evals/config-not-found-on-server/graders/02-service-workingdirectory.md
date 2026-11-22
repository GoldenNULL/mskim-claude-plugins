---
type: llm
focus: trace
weight: 1
---

The answer connects the server-only failure to deploy/app.service setting WorkingDirectory=/ (while locally the app is run from the repository root), and notes APP_CONFIG is not set there.
