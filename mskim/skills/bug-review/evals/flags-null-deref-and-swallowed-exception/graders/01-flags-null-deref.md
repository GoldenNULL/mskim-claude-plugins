---
type: llm
focus: trace
weight: 1
---

The review reports that getShippingLabel uses the result of orderRepo.findById without a null check, so an order id that does not exist causes a TypeError (or equivalent crash) when reading order.customer / order.address.
