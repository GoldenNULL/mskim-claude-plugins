from app.events import subscribe

_log = []


@subscribe("user.created")
def record(user):
    _log.append(("user.created", user["id"]))
