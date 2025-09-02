from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from backend.database import SessionLocal
from backend.models.tag import Tag
from backend.models.template import Template
from backend.schemas.tag import TagCreate, TagOut
from backend.schemas.template import TemplateOut
from backend.dependencies.roles import require_role

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/tags", response_model=TagOut)
def create_tag(tag: TagCreate, db: Session = Depends(get_db), current_user=Depends(require_role(["owner", "admin", "manager_template"]))) :
    db_tag = Tag(name=tag.name)
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    return db_tag

@router.get("/tags", response_model=List[TagOut])
def get_tags(db: Session = Depends(get_db)):
    return db.query(Tag).all()

@router.post("/templates/{id}/tags", response_model=List[TagOut])
def add_tags_to_template(id: int, tag_ids: List[int], db: Session = Depends(get_db), current_user=Depends(require_role(["owner", "admin", "manager_template"]))) :
    template = db.query(Template).filter(Template.id == id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    tags = db.query(Tag).filter(Tag.id.in_(tag_ids)).all()
    template.tags = tags
    db.commit()
    return tags

@router.get("/templates-by-tag/{tag_id}", response_model=List[TemplateOut])
def get_templates_by_tag(tag_id: int, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag.templates 
