MAX_DISCOUNT_RATE = 0.3


def invoice_total(subtotal: int, discount_rate: float) -> int:
    """Amount charged on the invoice."""
    rate = min(discount_rate, MAX_DISCOUNT_RATE)
    return round(subtotal * (1 - rate))
