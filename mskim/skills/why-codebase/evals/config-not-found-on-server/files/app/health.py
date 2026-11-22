REQUIRED = ["port", "db_url"]


def check(cfg):
    missing = [k for k in REQUIRED if k not in cfg]
    if missing:
        return [f"Config not found for keys: {', '.join(missing)}"]
    return []
