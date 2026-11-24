from app.users.repository import page_count


class FakeCursor:
    def __init__(self, total):
        self.total = total

    def execute(self, sql, params=()):
        pass

    def fetchone(self):
        return (self.total,)


class FakeConn:
    def __init__(self, total):
        self.total = total

    def cursor(self):
        return FakeCursor(self.total)


def test_page_count_exact_multiple():
    assert page_count(FakeConn(40)) == 2


def test_page_count_no_users():
    assert page_count(FakeConn(0)) == 0
