from app.users import repo


def get_user(user_id: int):
    user = repo.find(user_id)  # User | None
    if user is None:
        raise LookupError(user_id)
    return user


def contact_card(user_id: int) -> str:
    user = repo.find(user_id)
    return f"{user.name} <{user.phone}>"
