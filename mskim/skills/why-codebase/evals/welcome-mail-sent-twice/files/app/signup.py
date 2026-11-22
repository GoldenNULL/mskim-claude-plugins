from app import events

_users = []


def signup(email):
    user = {"id": len(_users) + 1, "email": email}
    _users.append(user)
    events.emit("user.created", user)
    return user
