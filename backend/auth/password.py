from passlib.context import CryptContext
import re

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify password against hash"""
    return pwd_context.verify(plain, hashed)


def validate_password(password: str) -> tuple[bool, str]:
    """
    Validate password strength
    Returns (is_valid, error_message)
    """
    if len(password) < 8:
        return False, "Пароль должен содержать минимум 8 символов"
    if not re.search(r"[a-zA-Z]", password):
        return False, "Пароль должен содержать буквы"
    if not re.search(r"\d", password):
        return False, "Пароль должен содержать цифры"
    return True, ""


def normalize_email(email: str) -> str:
    """Normalize email address (trim and lowercase)"""
    return email.strip().lower()

