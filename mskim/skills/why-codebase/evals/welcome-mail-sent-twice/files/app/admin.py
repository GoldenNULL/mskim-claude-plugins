from app.mail.welcome import send_welcome


def resend_welcome(user):
    """Admin console: manually resend the welcome mail."""
    send_welcome(user)
