from shop.pricing import final_price


def test_member_gets_five_percent_off():
    assert final_price(10_000, True) == 9_500


def test_non_member_pays_full_price():
    assert final_price(10_000, False) == 10_000
