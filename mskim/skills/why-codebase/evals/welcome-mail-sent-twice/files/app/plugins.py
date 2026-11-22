import importlib


def load_plugins(settings):
    for name in settings.get("plugins", []):
        importlib.import_module(name)
