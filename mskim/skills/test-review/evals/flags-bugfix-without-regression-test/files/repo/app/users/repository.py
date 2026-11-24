PAGE_SIZE = 20


def list_users(conn, page: int):
    """Return one page of users. `page` is 1-based: page 1 is the first page."""
    cur = conn.cursor()
    cur.execute(
        "SELECT id, name, email FROM users ORDER BY id LIMIT ? OFFSET ?",
        (PAGE_SIZE, (page - 1) * PAGE_SIZE),
    )
    return cur.fetchall()


def page_count(conn) -> int:
    """Number of pages list_users can serve."""
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM users")
    (total,) = cur.fetchone()
    return (total + PAGE_SIZE - 1) // PAGE_SIZE
