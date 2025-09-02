from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.models.user import User
from backend.schemas.user import UserCreate, UserOut
from backend.database import get_db
from dependencies.auth import get_current_user
from dependencies.roles import require_role
from backend.schemas.user import UserRoleUpdate
from backend.models.bonus_account import UserBonusAccount
from typing import List

router = APIRouter()

@router.get("/users", response_model=List[UserOut])
def get_users(db: Session = Depends(get_db), current_user=Depends(require_role(["owner", "admin"]))) :
    return db.query(User).all()

@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db), current_user=Depends(require_role(["owner", "admin"]))) :
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.delete("/users/{user_id}", response_model=dict)
def delete_user(user_id: int, db: Session = Depends(get_db), current_user=Depends(require_role(["owner", "admin"]))) :
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"detail": "User deleted"}

@router.put("/users/{user_id}/role", response_model=UserOut)
def update_user_role(user_id: int, update: UserRoleUpdate, db: Session = Depends(get_db), current_user=Depends(require_role(["owner"]))):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = update.role
    db.commit()
    db.refresh(user)
    return user

@router.get("/team", response_model=List[UserOut])
def get_team(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(User).filter(User.role != "owner").all()

@router.get("/me", response_model=UserOut)
def get_me(current_user=Depends(get_current_user)):
    return current_user 

@router.get('/user/balance')
def get_user_balance(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    acc = db.query(UserBonusAccount).filter_by(user_id=user.id).first()
    return {'available_bonus': acc.available_balance if acc else 0} 
