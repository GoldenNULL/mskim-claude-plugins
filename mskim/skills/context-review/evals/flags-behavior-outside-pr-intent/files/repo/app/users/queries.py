def find_users(conn, keyword: str):
    cur = conn.cursor()
    cur.execute(
        "SELECT id, name, is_active FROM users WHERE name LIKE ? AND is_active = 1 ORDER BY id",
        (f"%{keyword}%",),
    )
    return cur.fetchall()
