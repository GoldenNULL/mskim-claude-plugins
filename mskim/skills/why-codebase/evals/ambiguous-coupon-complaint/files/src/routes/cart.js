const router = require('express').Router();
const bus = require('../bus');
const { getCart } = require('../store');
const { applyCoupon } = require('../cart/coupon');
const { calcTotal } = require('../cart/total');

router.post('/:id/coupon', (req, res) => {
  const cart = getCart(req.params.id);
  cart.coupon = req.body.code;
  applyCoupon(cart);
  bus.emit('cart:updated', cart);
  res.json({ subtotal: cart.subtotal, discount: cart.discount, total: calcTotal(cart) });
});

router.get('/:id', (req, res) => {
  const cart = getCart(req.params.id);
  res.json({ subtotal: cart.subtotal, discount: cart.discount, total: calcTotal(cart) });
});

module.exports = router;
