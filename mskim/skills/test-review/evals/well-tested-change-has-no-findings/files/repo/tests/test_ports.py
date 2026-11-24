import pytest

from config.ports import parse_port


@pytest.mark.parametrize(
    "text, expected",
    [("80", 80), ("1", 1), ("65535", 65535), ("0080", 80)],
)
def test_parses_valid_ports(text, expected):
    assert parse_port(text) == expected


@pytest.mark.parametrize("text", ["0", "65536", "99999999999999999999"])
def test_rejects_out_of_range(text):
    with pytest.raises(ValueError, match="port must be 1-65535"):
        parse_port(text)


@pytest.mark.parametrize(
    "text",
    ["", "abc", "-1", "+80", " 80", "80 ", "80\n", "8o", "8_0", "٣"],
)
def test_rejects_non_digits(text):
    with pytest.raises(ValueError, match="port must be digits only"):
        parse_port(text)
