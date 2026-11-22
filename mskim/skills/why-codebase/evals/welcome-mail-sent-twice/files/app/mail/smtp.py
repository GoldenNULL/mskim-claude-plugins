import functools
import logging

log = logging.getLogger("mail")


def retry(times=2):
    def deco(fn):
        @functools.wraps(fn)
        def wrapper(*a, **kw):
            for attempt in range(times):
                try:
                    return fn(*a, **kw)
                except ConnectionError:
                    log.warning("smtp retry %d", attempt + 1)
            raise ConnectionError("smtp failed")
        return wrapper
    return deco


@retry(times=2)
def send_mail(to, subject, body):
    # stub transport: prints instead of talking to SMTP
    print(f"MAIL to={to} subject={subject!r}")
