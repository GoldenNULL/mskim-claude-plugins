const COUPONS = {
  WELCOME10: { rate: 0.1 },
  VIP20: { rate: 0.2 },
};

function applyCoupon(cart) {
  const c = COUPONS[cart.coupon];
  if (!c) return;
  cart.discount += Math.round(cart.subtotal * c.rate);
}

module.exports = { applyCoupon, COUPONS };
