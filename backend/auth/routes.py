from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from backend.auth.providers import normalize_user_info, oauth
from backend.core.security import clear_auth_cookie, create_jwt_token, get_token_from_cookie, read_access_payload, set_auth_cookie
from backend.database import get_db
from backend.models.auth import Account, UserTotp
from backend.models.user import User
from backend.services.account_security import audit, create_session, issue_action_token, revoke_sessions, utcnow
from backend.settings import settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/{provider}/login")
async def oauth_login(provider: str, request: Request):
    """Initiate OAuth login flow"""
    if provider not in ["google", "yandex", "mailru"]:
        raise HTTPException(status_code=400, detail="Invalid provider")

    # Preserve next parameter for redirect after auth
    next_path = request.query_params.get("next")
    if next_path and (not next_path.startswith("/") or next_path.startswith("//") or "\\" in next_path):
        next_path = None
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
        # Stage 8 stops new OAuth registrations. Existing linked users keep access
        # until their verified-email/password transition is complete.
        raise HTTPException(status_code=403, detail="Новая регистрация через соцсети недоступна")

    db.commit()
    if user.email_verification_required and not user.email_verified_at:
        raise HTTPException(status_code=403, detail="Подтвердите email перед входом")

    totp = db.get(UserTotp, user.id)
    if totp and totp.enabled_at:
        challenge = issue_action_token(db, user, "totp_login", user.email, hours=5 / 60)
        db.commit()
        redirect = RedirectResponse(url=f"{settings.FRONTEND_URL}/auth/two-factor")
        redirect.set_cookie("totp_challenge", challenge, httponly=True, secure=settings.ENVIRONMENT == "production", samesite="lax", max_age=300)
        return redirect
    session = create_session(db, user, request.headers.get("user-agent"))
    audit(db, user.id, "oauth_login")
    db.commit()
    next_path = request.query_params.get("next", "/account")
    if not next_path.startswith("/") or next_path.startswith("//") or "\\" in next_path:
        next_path = "/account"
    redirect = RedirectResponse(url=f"{settings.FRONTEND_URL}{next_path}")
    set_auth_cookie(redirect, create_jwt_token(user.id, user.token_version, session_id=session.id))
    return redirect


@router.post("/logout")
async def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """Logout user by clearing session cookie"""
    token = get_token_from_cookie(request)
    if not token:
        header = request.headers.get("authorization", "")
        token = header[7:] if header.lower().startswith("bearer ") else None
    payload = read_access_payload(token) if token else None
    if payload and payload.get("sid"):
        from backend.models.auth import AccountSession
        session = db.get(AccountSession, payload["sid"])
        if session and str(session.user_id) == payload.get("sub"):
            session.revoked_at = utcnow()
            db.commit()
    clear_auth_cookie(response)
    return {"message": "Logged out successfully"}
