---
type: llm
focus: trace
weight: 1
---

The review reports that the admin user management screen (list_users_for_admin in app/admin/user_admin.py) also calls find_users and therefore no longer shows inactive users, contradicting the PR description's requirement that it keep showing all users.
