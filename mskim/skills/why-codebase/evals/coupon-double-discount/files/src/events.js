const bus = require('./bus');
const { applyCoupon } = require('./cart/coupon');
const { recalcSubtotal } = require('./cart/total');

// keep cart numbers in sync whenever the cart changes
bus.on('cart:updated', (cart) => {
  recalcSubtotal(cart);
  if (cart.coupon) applyCoupon(cart);
});
