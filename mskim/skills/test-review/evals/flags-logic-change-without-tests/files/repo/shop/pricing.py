MEMBER_RATE = 0.05
BULK_RATE = 0.10
BULK_THRESHOLD = 100_000


def final_price(subtotal: int, is_member: bool) -> int:
    """Price in won after discounts. Bulk and member discounts stack."""
    rate = 0.0
    if subtotal >= BULK_THRESHOLD:
        rate += BULK_RATE
    if is_member:
        rate += MEMBER_RATE
    return round(subtotal * (1 - rate))
