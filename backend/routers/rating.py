from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.dependencies.auth import get_current_user
from backend.models.rating import Rating
from backend.models.template import Template
from backend.models.user import User
from backend.models.user import User as UserModel
from backend.schemas.rating import RatingCreate, RatingOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/ratings", response_model=RatingOut)
def create_rating(
    rating: RatingCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    if not (1 <= rating.score <= 5):
        raise HTTPException(status_code=400, detail="Score must be between 1 and 5")
    template = db.query(Template).filter(Template.id == rating.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.user_id == current_user.id:
        raise HTTPException(status_code=403, detail="You can't rate your own template")
    db_rating = (
        db.query(Rating)
        .filter(
            Rating.user_id == current_user.id, Rating.template_id == rating.template_id
        )
        .first()
    )
    if db_rating:
        db_rating.score = rating.score
        db_rating.created_at = func.now()
        db.commit()
        db.refresh(db_rating)
        return db_rating
    db_rating = Rating(
        user_id=current_user.id, template_id=rating.template_id, score=rating.score
    )
    db.add(db_rating)
    db.commit()
    db.refresh(db_rating)
    return db_rating


@router.get("/templates/{template_id}/ratings", response_model=List[RatingOut])
def get_template_ratings(template_id: int, db: Session = Depends(get_db)):
    return db.query(Rating).filter(Rating.template_id == template_id).all()


@router.get("/templates/{template_id}/average-rating")
def get_template_average_rating(template_id: int, db: Session = Depends(get_db)):
    avg = (
        db.query(func.avg(Rating.score))
        .filter(Rating.template_id == template_id)
        .scalar()
    )
    return {"average": float(avg) if avg is not None else 0.0}
