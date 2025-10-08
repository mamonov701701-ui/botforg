from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.dependencies.auth import get_current_user
from backend.models.comment import Comment
from backend.models.user import User as UserModel
from backend.schemas.comment import CommentCreate, CommentOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/comments", response_model=CommentOut)
def create_comment(
    comment: CommentCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    db_comment = Comment(
        user_id=current_user.id,
        template_id=comment.template_id,
        content=comment.content,
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    return db_comment


@router.get("/templates/{template_id}/comments", response_model=List[CommentOut])
def get_template_comments(template_id: int, db: Session = Depends(get_db)):
    return db.query(Comment).filter(Comment.template_id == template_id).all()


@router.get("/my-comments", response_model=List[CommentOut])
def get_my_comments(
    db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)
):
    return db.query(Comment).filter(Comment.user_id == current_user.id).all()
