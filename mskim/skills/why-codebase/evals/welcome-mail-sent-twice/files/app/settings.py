import yaml


def load_settings(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}
