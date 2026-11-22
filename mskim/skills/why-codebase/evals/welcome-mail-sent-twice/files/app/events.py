_handlers = {}


def subscribe(event):
    def deco(fn):
        _handlers.setdefault(event, []).append(fn)
        return fn
    return deco


def emit(event, payload):
    for fn in list(_handlers.get(event, [])):
        fn(payload)
