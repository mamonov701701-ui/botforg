from authlib.integrations.starlette_client import OAuth

from backend.settings import settings

oauth = OAuth()

# Google OAuth
oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

# Yandex OAuth
oauth.register(
    name="yandex",
    client_id=settings.YANDEX_CLIENT_ID,
    client_secret=settings.YANDEX_CLIENT_SECRET,
    authorize_url="https://oauth.yandex.ru/authorize",
    access_token_url="https://oauth.yandex.ru/token",
    userinfo_endpoint="https://login.yandex.ru/info",
    client_kwargs={"scope": "login:email login:info"},
)

# Mail.ru OAuth
oauth.register(
    name="mailru",
    client_id=settings.MAILRU_CLIENT_ID,
    client_secret=settings.MAILRU_CLIENT_SECRET,
    authorize_url="https://oauth.mail.ru/login",
    access_token_url="https://oauth.mail.ru/token",
    userinfo_endpoint="https://oauth.mail.ru/userinfo",
    client_kwargs={"scope": "userinfo"},
)


def normalize_user_info(provider: str, user_info: dict) -> dict:
    """Normalize user info from different providers to common format"""
    if provider == "google":
        return {
            "provider_user_id": user_info["sub"],
            "email": user_info.get("email"),
            "name": user_info.get("name"),
            "avatar": user_info.get("picture"),
        }
    elif provider == "yandex":
        return {
            "provider_user_id": user_info["id"],
            "email": user_info.get("default_email"),
            "name": user_info.get("display_name") or user_info.get("real_name"),
            "avatar": user_info.get("default_avatar_id")
            and f"https://avatars.yandex.net/get-yapic/{user_info['default_avatar_id']}/islands-200",
        }
    elif provider == "mailru":
        return {
            "provider_user_id": user_info["id"],
            "email": user_info.get("email"),
            "name": user_info.get("name") or user_info.get("nickname"),
            "avatar": user_info.get("image"),
        }
    raise ValueError(f"Unknown provider: {provider}")
