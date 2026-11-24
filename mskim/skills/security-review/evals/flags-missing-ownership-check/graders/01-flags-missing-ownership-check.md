---
type: llm
focus: trace
weight: 1
---

The review reports that the new /invoices/:id/pdf route does not check that the invoice belongs to the requesting user (no ownerId vs req.user.id check), so a logged-in user can fetch another user's invoice PDF by id.
