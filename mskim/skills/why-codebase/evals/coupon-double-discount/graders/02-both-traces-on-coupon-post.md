---
type: llm
focus: trace
weight: 1
---

The answer identifies both flows reached on POST /cart/:id/coupon: the direct applyCoupon call in src/routes/cart.js and the cart:updated listener in src/events.js that calls applyCoupon again.
