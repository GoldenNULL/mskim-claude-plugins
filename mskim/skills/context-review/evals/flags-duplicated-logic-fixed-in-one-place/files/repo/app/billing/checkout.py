from app.billing.invoice import invoice_total


def charge(cart, payment):
    payment.charge(invoice_total(cart.subtotal, cart.discount_rate))
