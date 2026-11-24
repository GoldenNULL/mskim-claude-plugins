from app.cart.totals import cart_total


def cart_page(cart):
    return {"items": cart.items, "total": cart_total(cart.subtotal, cart.discount_rate)}
