import sys
from app import config
from app.server import serve


def main():
    try:
        cfg = config.load()
    except FileNotFoundError as e:
        print(f"Config not found: {e}", file=sys.stderr)
        sys.exit(2)
    serve(cfg)


if __name__ == "__main__":
    main()
