---
type: llm
focus: trace
weight: 1
---

The report contains a finding that migrations/0042_add_phone_to_users.sql adds a NOT NULL column without a default or backfill, so the migration fails (or breaks inserts) on a table with existing rows.
