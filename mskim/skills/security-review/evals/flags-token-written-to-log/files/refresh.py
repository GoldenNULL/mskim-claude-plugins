import logging

from app.auth.tokens import issue_access_token, verify_refresh_token

logger = logging.getLogger(__name__)


def refresh(refresh_token: str) -> dict:
    user_id = verify_refresh_token(refresh_token)
    access_token = issue_access_token(user_id)
    logger.info("token refreshed user=%s refresh=%s access=%s", user_id, refresh_token, access_token)
    return {"access_token": access_token}
