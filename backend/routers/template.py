from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import asc, desc, func
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.dependencies.roles import require_role
from backend.models.rating import Rating
from backend.models.template import Template
from backend.models.user import User as UserModel
from backend.schemas.template import (
    TemplateCreate,
    TemplateListOut,
    TemplateOut,
    TemplateUpdate,
    TemplateWithRatingListOut,
    TemplateWithRatingOut,
)

router = APIRouter()


@router.get("/templates/", response_model=List[TemplateOut])
async def list_all_templates(db: Session = Depends(get_db)):
    templates = db.query(Template).all()
    return templates


@router.post(
    "/templates/", response_model=TemplateOut, status_code=status.HTTP_201_CREATED
)
async def create_template_v2(
    template: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    db_template = Template(**template.model_dump(), user_id=current_user.id)
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    return db_template


@router.get("/templates", response_model=TemplateListOut)
def get_templates(
    category: Optional[str] = None,
    is_public: Optional[bool] = None,
    sort_by: Optional[str] = "created_at",
    order: Optional[str] = "desc",
    limit: int = 10,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    query = db.query(Template)
    if category is not None:
        query = query.filter(Template.category == category)
    if is_public is not None:
        query = query.filter(Template.is_public == is_public)
    sort_column = getattr(Template, sort_by, None)
    if sort_column is None:
        sort_column = Template.created_at
    if order == "asc":
        query = query.order_by(asc(sort_column))
    else:
        query = query.order_by(desc(sort_column))
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return {"total": total, "items": items}


@router.post("/templates", response_model=TemplateOut)
def create_template(
    template: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(
        require_role(["owner", "admin", "manager", "user"])
    ),
):
    db_template = Template(**template.model_dump(), user_id=current_user.id)
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    return db_template


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    tpl = (
        db.query(Template)
        .filter(Template.id == template_id, Template.user_id == current_user.id)
        .first()
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(tpl)
    db.commit()
    return {"status": "deleted"}


@router.patch("/templates/{id}/publish")
def publish_template(
    id: int,
    data: dict = Body(...),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    tpl = (
        db.query(Template)
        .filter(Template.id == id, Template.user_id == user.id)
        .first()
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    is_public = data.get("is_public")
    if is_public is None:
        raise HTTPException(status_code=400, detail="is_public required")
    tpl.is_public = bool(is_public)
    tpl.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(tpl)
    return {"id": tpl.id, "is_public": tpl.is_public, "updated_at": tpl.updated_at}


@router.patch("/templates/{id}", response_model=TemplateOut)
async def update_template(
    id: int,
    template_update: TemplateUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    tpl = db.query(Template).filter(Template.id == id).first()
    if tpl is None:
        raise HTTPException(status_code=404, detail="Template not found")

    allowed_roles = {"owner", "admin", "manager_template"}
    role_attr = getattr(current_user, "roles", None)
    if role_attr is None:
        role_attr = getattr(current_user, "role", None)
    if role_attr is None:
        user_roles = set()
    elif isinstance(role_attr, str):
        user_roles = {role_attr}
    else:
        user_roles = set(role_attr)
    if tpl.user_id != current_user.id and user_roles.isdisjoint(allowed_roles):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    update_data = template_update.model_dump(exclude_unset=True)
    # Обновляем только разрешенные поля
    for field_name in ("name", "description", "is_public"):
        if field_name in update_data:
            setattr(tpl, field_name, update_data[field_name])

    db.commit()
    db.refresh(tpl)
    return tpl


@router.get("/public-templates", response_model=TemplateListOut)
def get_public_templates(
    category: Optional[str] = None,
    sort_by: Optional[str] = "created_at",
    order: Optional[str] = "desc",
    limit: int = 10,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    query = db.query(Template).filter(Template.is_public == True)
    if category is not None:
        query = query.filter(Template.category == category)
    sort_column = getattr(Template, sort_by, None)
    if sort_column is None:
        sort_column = Template.created_at
    if order == "asc":
        query = query.order_by(asc(sort_column))
    else:
        query = query.order_by(desc(sort_column))
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return {"total": total, "items": items}


@router.get("/templates-with-rating", response_model=TemplateWithRatingListOut)
def get_templates_with_rating(
    category: Optional[str] = None,
    sort_by: Optional[str] = "created_at",
    order: Optional[str] = "desc",
    limit: int = 10,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    # Базовый запрос с join рейтингов
    query = db.query(
        Template.id,
        Template.name,
        Template.category,
        Template.is_public,
        func.coalesce(func.avg(Rating.score), 0.0).label("average_rating"),
    ).outerjoin(Rating, Rating.template_id == Template.id)
    query = query.filter(Template.is_public == True)
    if category is not None:
        query = query.filter(Template.category == category)
    query = query.group_by(Template.id)
    # Сортировка
    if sort_by == "average_rating":
        sort_column = "average_rating"
    else:
        sort_column = getattr(Template, sort_by, None)
        if sort_column is None:
            sort_column = Template.created_at
    if order == "asc":
        if sort_by == "average_rating":
            query = query.order_by(asc(func.coalesce(func.avg(Rating.score), 0.0)))
        else:
            query = query.order_by(asc(sort_column))
    else:
        if sort_by == "average_rating":
            query = query.order_by(desc(func.coalesce(func.avg(Rating.score), 0.0)))
        else:
            query = query.order_by(desc(sort_column))
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    # Преобразуем к нужной схеме
    result = [
        TemplateWithRatingOut(
            id=row.id,
            name=row.name,
            category=row.category,
            is_public=row.is_public,
            average_rating=float(row.average_rating),
        )
        for row in items
    ]
    return {"total": total, "items": result}


@router.post("/templates/import", status_code=status.HTTP_201_CREATED)
def import_template(
    data: dict,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(
        require_role(["owner", "admin", "manager_template", "user"])
    ),
):
    nodes = data.get("nodes")
    edges = data.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise HTTPException(
            status_code=400, detail="Invalid structure: nodes and edges required"
        )
    # Можно добавить доп. валидацию структуры nodes/edges
    tpl = Template(
        name="Импортированный шаблон",
        description="Импорт из файла",
        category="imported",
        is_public=False,
        user_id=current_user.id,
        content={"nodes": nodes, "edges": edges},
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return {"id": tpl.id}


@router.get("/my-templates", response_model=TemplateListOut)
def get_my_templates(
    limit: int = 10,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    query = db.query(Template).filter(Template.user_id == current_user.id)
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return {"total": total, "items": items}


@router.get("/templates/{id}", response_model=TemplateOut)
async def get_template(id: int, db: Session = Depends(get_db)):
    tpl = db.query(Template).filter(Template.id == id).first()
    if tpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl

    @router.put("/templates/{id}", response_model=TemplateOut)
    async def update_template(
        id: int,
        template_update: TemplateUpdate,
        db: Session = Depends(get_db),
        current_user: UserModel = Depends(get_current_user),
    ):
        tpl = db.query(Template).filter(Template.id == id).first()
        if not tpl:
            raise HTTPException(status_code=404, detail="Template not found")
        # Только владелец шаблона или админ/менеджер шаблонов может редактировать
        if tpl.user_id != current_user.id and not set(
            current_user.roles or []
        ).intersection({"owner", "admin", "manager_template"}):
            raise HTTPException(status_code=403, detail="Not enough permissions")
        for field, value in template_update.dict(exclude_unset=True).items():
            setattr(tpl, field, value)
        tpl.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(tpl)
        return tpl

    @router.delete("/templates/{id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_template(
        id: int,
        db: Session = Depends(get_db),
        current_user: UserModel = Depends(get_current_user),
    ):
        tpl = db.query(Template).filter(Template.id == id).first()
        if not tpl:
            raise HTTPException(status_code=404, detail="Template not found")
        # Только владелец шаблона или админ/менеджер шаблонов может удалять
        if tpl.user_id != current_user.id and not set(
            current_user.roles or []
        ).intersection({"owner", "admin", "manager_template"}):
            raise HTTPException(status_code=403, detail="Not enough permissions")
        db.delete(tpl)
        db.commit()
        return
