function recalcSubtotal(cart) {
  cart.subtotal = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
}

function calcTotal(cart) {
  return Math.max(0, cart.subtotal - cart.discount);
}

module.exports = { recalcSubtotal, calcTotal };
