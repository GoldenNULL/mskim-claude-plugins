const router = require('express').Router();
const bus = require('../bus');
const { getCart } = require('../store');

router.post('/:cartId', (req, res) => {
  const cart = getCart(req.params.cartId);
  cart.items.push({ sku: req.body.sku, price: req.body.price, qty: req.body.qty || 1 });
  bus.emit('cart:updated', cart);
  res.json({ ok: true, count: cart.items.length });
});

module.exports = router;
