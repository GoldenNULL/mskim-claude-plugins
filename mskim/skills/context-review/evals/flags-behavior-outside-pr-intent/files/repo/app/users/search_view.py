from app.users.queries import find_users


def search(conn, q: str):
    return [{"id": r[0], "name": r[1]} for r in find_users(conn, q)]
