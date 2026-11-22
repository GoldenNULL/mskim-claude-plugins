const carts = new Map();
function getCart(id) {
  if (!carts.has(id)) carts.set(id, { id, items: [], subtotal: 0, coupon: null, discount: 0 });
  return carts.get(id);
}
module.exports = { getCart };
