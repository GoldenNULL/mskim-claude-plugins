from app.users.queries import find_users


def list_users_for_admin(conn, q: str = ""):
    """Admin user management screen: shows every user, active or not."""
    return [{"id": r[0], "name": r[1], "active": bool(r[2])} for r in find_users(conn, q)]
