import re

MIN_PORT = 1
MAX_PORT = 65535


def parse_port(value: str) -> int:
    """Parse a TCP port from config text. Raises ValueError for anything else."""
    if not re.fullmatch(r"[0-9]+", value):
        raise ValueError(f"port must be digits only, got {value!r}")
    port = int(value)
    if not MIN_PORT <= port <= MAX_PORT:
        raise ValueError(f"port must be {MIN_PORT}-{MAX_PORT}, got {port}")
    return port
