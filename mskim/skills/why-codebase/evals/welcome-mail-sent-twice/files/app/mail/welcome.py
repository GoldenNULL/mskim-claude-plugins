import logging

from app.events import subscribe
from app.mail.smtp import send_mail

log = logging.getLogger("mail")


@subscribe("user.created")
def send_welcome(user):
    log.info("send_welcome user=%s", user["id"])
    send_mail(user["email"], "환영합니다!", "가입해 주셔서 감사합니다.")
