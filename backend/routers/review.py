from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from models.review import Review
from schemas.review import ReviewCreate, ReviewOut
from database import get_db
from dependencies.auth import get_current_user
from models.user import User as UserModel
from sqlalchemy import func

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post('/templates/{id}/review', response_model=ReviewOut)
def add_review(id: int, review: ReviewCreate, db: Session = Depends(get_db), user: UserModel = Depends(get_current_user)):
    tpl = db.query(Template).filter(Template.id == id, Template.is_public == True).first()
    if not tpl:
        raise HTTPException(status_code=404, detail='Шаблон не найден')
    # Один отзыв на шаблон от пользователя
    existing = db.query(Review).filter(Review.template_id == id, Review.user_id == user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail='Вы уже оставили отзыв')
    r = Review(template_id=id, user_id=user.id, rating=review.rating, text=review.text)
    db.add(r)
    db.commit()
    db.refresh(r)
    # Обновить рейтинг шаблона
    avg = db.query(func.avg(Review.rating)).filter(Review.template_id == id).scalar() or 0
    count = db.query(func.count(Review.id)).filter(Review.template_id == id).scalar()
    tpl.average_rating = avg
    tpl.rating_count = count
    db.commit()
    return r

@router.get('/templates/{id}/reviews', response_model=list[ReviewOut])
def get_reviews(id: int, db: Session = Depends(get_db)):
    return db.query(Review).filter(Review.template_id == id).order_by(Review.created_at.desc()).all()

@router.get('/templates/{id}/rating')
def get_rating(id: int, db: Session = Depends(get_db)):
    avg = db.query(func.avg(Review.rating)).filter(Review.template_id == id).scalar() or 0
    count = db.query(func.count(Review.id)).filter(Review.template_id == id).scalar()
    return {'average_rating': avg, 'rating_count': count} 