import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database import Base, engine
from backend.models import user, template, bot, review, comment, rating, purchase, payment, tag, bonus_account, referral, team, bot_user_state, token_blacklist, user_template, bot_template, message, billing
from backend.routers import auth, template as templates, bot as bot_router, review as review_router, user_template as user_template_router, bot_template as bot_template_router, message as message_router, billing as billing_router, payment as payment_router, editor as editor_router
from backend.middleware.security import SecurityMiddleware
from backend.settings import settings

app = FastAPI()

# Добавляем security middleware
app.add_middleware(SecurityMiddleware)

# Настройка CORS - единая регистрация
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)

# Убираем Base.metadata.create_all(bind=engine) - используем Alembic

app.include_router(auth.router, prefix="/auth")
app.include_router(templates.router)  # без prefix
app.include_router(bot_router.router, prefix="/bots")
app.include_router(review_router.router)  # без prefix
app.include_router(user_template_router.router, prefix="/user-templates")
app.include_router(bot_template_router.router, prefix="/bot-templates")
app.include_router(message_router.router, prefix="/messages")
app.include_router(billing_router.router, prefix="/billing")
app.include_router(payment_router.router)
app.include_router(editor_router.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}
