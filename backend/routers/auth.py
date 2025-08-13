from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from database import get_db
from models.user import User, ROLES
from schemas.auth import Token, UserRegister
from security import verify_password, create_access_token, get_password_hash
from config import SECRET_KEY

router = APIRouter()

@router.post("/register", response_model=Token)
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    role = user_in.role or "user"
    if role not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    hashed_password = get_password_hash(user_in.password)
    user = User(email=user_in.email, name=user_in.name, hashed_password=hashed_password, role=role)
    db.add(user)
    db.commit()
    print("✅ После коммита, id пользователя:", user.id)
    db.refresh(user)
    print("🧩 User in session:", user.email, user.hashed_password)
    print("🔐 Зарегистрирован пользователь:")
    print("Email:", user.email)
    print("Хеш пароля:", user.hashed_password)
    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    print("🔑 Попытка логина:")
    print("Email (username):", form_data.username)
    print("Пароль (введённый):", form_data.password)
    print("Пользователь в базе:", user.email if user else "Не найден")
    print("Хеш в базе:", user.hashed_password if user else "Нет данных")
    if not user or not verify_password(form_data.password, user.hashed_password):
        print("✅ Результат сверки пароля:", False)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    print("✅ Результат сверки пароля:", True)
    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"} 