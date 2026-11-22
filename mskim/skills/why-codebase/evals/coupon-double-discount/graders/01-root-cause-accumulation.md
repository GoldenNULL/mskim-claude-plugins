---
type: llm
focus: trace
weight: 1
---

The answer identifies as root cause that applyCoupon in src/cart/coupon.js adds to cart.discount with += (non-idempotent), so each call stacks another discount.
