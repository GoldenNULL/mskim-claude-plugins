from app.health import check


def serve(cfg):
    problems = check(cfg)
    if problems:
        raise SystemExit("; ".join(problems))
    print(f"listening on {cfg['port']}")
