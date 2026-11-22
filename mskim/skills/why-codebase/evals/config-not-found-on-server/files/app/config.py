import os
import yaml

DEFAULT_CONFIG = "config.yaml"


def load(path=None):
    path = path or os.environ.get("APP_CONFIG") or DEFAULT_CONFIG
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}
