from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from backend.auth.providers import normalize_user_info, oauth
from backend.core.security import clear_auth_cookie, create_jwt_token, set_auth_cookie
from backend.database import get_db
from backend.models.auth import Account
from backend.models.user import User
from backend.settings import settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/{provider}/login")
async def oauth_login(provider: str, request: Request):
    """Initiate OAuth login flow"""
    if provider not in ["google", "yandex", "mailru"]:
        raise HTTPException(status_code=400, detail="Invalid provider")

    # Preserve next parameter for redirect after auth
    next_path = request.query_params.get("next")
    redirect_uri = request.url_for("oauth_callback", provider=provider)

    # Add next param to callback URL if present
    if next_path:
        redirect_uri = f"{redirect_uri}?next={next_path}"

    return await oauth.create_client(provider).authorize_redirect(request, redirect_uri)


@router.get("/{provider}/callback")
async def oauth_callback(
    provider: str, request: Request, response: Response, db: Session = Depends(get_db)
):
    """Handle OAuth callback"""
    if provider not in ["google", "yandex", "mailru"]:
        raise HTTPException(status_code=400, detail="Invalid provider")

    # Exchange code for token
    client = oauth.create_client(provider)
    token = await client.authorize_access_token(request)

    # Get user info from provider
    if provider == "google":
        user_info = token.get("userinfo")
    else:
        user_info = await client.userinfo(token=token)

    # Normalize user info
    normalized = normalize_user_info(provider, user_info)

    # Find or create account
    account = (
        db.query(Account)
        .filter(
            Account.provider == provider,
            Account.provider_user_id == normalized["provider_user_id"],
        )
        .first()
    )

    if account:
        # Update existing account info
        account.email = normalized["email"]
        account.name = normalized["name"]
        account.avatar = normalized["avatar"]
        user = account.user
    else:
        # Create new user and account
        user = User(
            email=normalized["email"],
            name=normalized["name"],
            avatar=normalized["avatar"],
        )
        db.add(user)
        db.flush()

        account = Account(
            user_id=user.id,
            provider=provider,
            provider_user_id=normalized["provider_user_id"],
            email=normalized["email"],
            name=normalized["name"],
            avatar=normalized["avatar"],
        )
        db.add(account)

    db.commit()

    # Create JWT and set cookie
    jwt_token = create_jwt_token(user.id)
    set_auth_cookie(response, jwt_token)

    # Get next path from query params or default to /account
    next_path = request.query_params.get("next", "/account")
    redirect_url = f"{settings.FRONTEND_URL}{next_path}"

    return RedirectResponse(url=redirect_url)


@router.post("/logout")
async def logout(response: Response):
    """Logout user by clearing session cookie"""
    clear_auth_cookie(response)
    return {"message": "Logged out successfully"}
