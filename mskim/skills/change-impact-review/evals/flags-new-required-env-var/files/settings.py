import os

# All settings come from environment variables. Per-environment values
# (dev, staging, prod) live in the infra repository's env files.

APP_NAME = "shop-api"
DATABASE_URL = os.environ["DATABASE_URL"]
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
PAYMENT_WEBHOOK_SECRET = os.environ["PAYMENT_WEBHOOK_SECRET"]


def is_production() -> bool:
    return os.getenv("APP_ENV") == "production"
