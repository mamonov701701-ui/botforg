from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from backend.database import SessionLocal
from backend.models.team import TeamMember
from backend.models.user import User
from backend.schemas.team import TeamMemberCreate, TeamMemberOut
from backend.dependencies.auth import get_current_user
from backend.dependencies.roles import require_role

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/team/add-member", response_model=TeamMemberOut)
def add_team_member(member: TeamMemberCreate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["owner"]))):
    # Проверка, что участник не добавлен дважды
    exists = db.query(TeamMember).filter(TeamMember.owner_id == current_user.id, TeamMember.user_id == member.user_id).first()
    if exists:
        raise HTTPException(status_code=400, detail="User already in team")
    team_member = TeamMember(owner_id=current_user.id, user_id=member.user_id, role=member.role)
    db.add(team_member)
    db.commit()
    db.refresh(team_member)
    return team_member

@router.put("/team/{member_id}", response_model=TeamMemberOut)
def update_team_member_role(member_id: int, update: TeamMemberCreate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["owner"]))):
    member = db.query(TeamMember).filter(TeamMember.id == member_id, TeamMember.owner_id == current_user.id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    member.role = update.role
    db.commit()
    db.refresh(member)
    return member

@router.delete("/team/{member_id}", response_model=dict)
def delete_team_member(member_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_role(["owner"]))):
    member = db.query(TeamMember).filter(TeamMember.id == member_id, TeamMember.owner_id == current_user.id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    db.delete(member)
    db.commit()
    return {"detail": "Team member removed"}

@router.get("/my-team", response_model=List[TeamMemberOut])
def get_my_team(db: Session = Depends(get_db), current_user: User = Depends(require_role(["owner"]))):
    return db.query(TeamMember).filter(TeamMember.owner_id == current_user.id).all()

@router.get("/team-me", response_model=List[TeamMemberOut])
def get_team_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(TeamMember).filter(TeamMember.user_id == current_user.id).all() 
