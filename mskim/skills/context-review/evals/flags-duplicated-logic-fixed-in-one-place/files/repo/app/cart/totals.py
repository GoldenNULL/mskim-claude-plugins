def cart_total(subtotal: int, discount_rate: float) -> int:
    """Amount shown in the cart before checkout."""
    return round(subtotal * (1 - discount_rate))
