import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine
from models import user, template, bot, review, comment, rating, purchase, payment, tag, bonus_account, referral, team, bot_user_state
from routers import auth, template as templates, bot as bot_router, review as review_router

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # или ["*"] на время разработки
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

app.include_router(auth.router, prefix="/auth")
app.include_router(templates.router)  # без prefix
app.include_router(bot_router.router, prefix="/bots")
app.include_router(review_router.router)  # без prefix

@app.get("/health")
def health_check():
    return {"status": "ok"}
