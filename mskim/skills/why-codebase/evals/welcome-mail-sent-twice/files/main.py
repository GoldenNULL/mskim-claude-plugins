import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
# legacy modules still import "mail.*" / "db" without the app. prefix
sys.path.insert(0, os.path.join(BASE, "app"))

from app.settings import load_settings
from app.plugins import load_plugins
from app.signup import signup


def main():
    settings = load_settings(os.path.join(BASE, "settings.yaml"))
    load_plugins(settings)
    signup(sys.argv[1] if len(sys.argv) > 1 else "user@example.com")


if __name__ == "__main__":
    main()
