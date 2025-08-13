from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, or_
from typing import List, Optional
from database import SessionLocal
from models.template import Template
from models.rating import Rating
from models.purchase import Purchase
from models.tag import Tag
from schemas.marketplace import MarketplaceTemplateOut, MarketplaceTemplateDetailOut
from schemas.tag import TagOut
from schemas.comment import CommentOut
from dependencies.auth import get_current_user
from models.comment import Comment
from models.user import User
from models.payment import Payment
from models.referral import Referral
from sqlalchemy import or_, and_
from models.bonus_account import UserBonusAccount

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/marketplace", response_model=List[MarketplaceTemplateOut])
def get_marketplace(
    category: Optional[str] = None,
    tag_id: Optional[int] = None,
    search: Optional[str] = None,
    sort_by: str = "created_at",
    order: str = "desc",
    limit: int = 10,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    query = db.query(Template).filter(Template.is_public == True)
    if category:
        query = query.filter(Template.category == category)
    if tag_id:
        query = query.join(Template.tags).filter(Tag.id == tag_id)
    if search:
        query = query.filter(or_(Template.name.ilike(f"%{search}%"), Template.description.ilike(f"%{search}%")))
    # Сортировка
    if sort_by == "average_rating":
        query = query.outerjoin(Rating).group_by(Template.id)
        sort_col = func.coalesce(func.avg(Rating.score), 0.0)
    elif sort_by == "price":
        sort_col = Template.price
    else:
        sort_col = getattr(Template, sort_by, Template.created_at)
    query = query.order_by(asc(sort_col) if order == "asc" else desc(sort_col))
    total = query.count()
    templates = query.offset(offset).limit(limit).all()
    result = []
    user_id = getattr(current_user, "id", None)
    for t in templates:
        avg_rating = db.query(func.coalesce(func.avg(Rating.score), 0.0)).filter(Rating.template_id == t.id).scalar()
        tags = [TagOut.from_orm(tag) for tag in t.tags]
        is_purchased = False
        if user_id:
            is_purchased = db.query(Purchase).filter(Purchase.user_id == user_id, Purchase.template_id == t.id).first() is not None
        result.append(MarketplaceTemplateOut(
            id=t.id,
            name=t.name,
            description=t.description,
            category=t.category,
            tags=tags,
            average_rating=float(avg_rating),
            price=getattr(t, "price", 0),
            is_purchased=is_purchased
        ))
    return result

@router.get("/marketplace/{template_id}", response_model=MarketplaceTemplateDetailOut)
def get_marketplace_template(template_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    t = db.query(Template).filter(Template.id == template_id, Template.is_public == True).first()
    if not t:
        return None
    avg_rating = db.query(func.coalesce(func.avg(Rating.score), 0.0)).filter(Rating.template_id == t.id).scalar()
    rating_count = db.query(Rating).filter(Rating.template_id == t.id).count()
    tags = [TagOut.from_orm(tag) for tag in t.tags]
    comments = [CommentOut.from_orm(c) for c in db.query(Comment).filter(Comment.template_id == t.id).all()]
    user_id = getattr(current_user, "id", None)
    is_purchased = False
    if user_id:
        is_purchased = db.query(Purchase).filter(Purchase.user_id == user_id, Purchase.template_id == t.id).first() is not None
    return MarketplaceTemplateDetailOut(
        id=t.id,
        name=t.name,
        description=t.description,
        category=t.category,
        tags=tags,
        average_rating=float(avg_rating),
        comments=comments,
        rating_count=rating_count,
        price=getattr(t, "price", 0),
        is_purchased=is_purchased
    )

@router.post('/marketplace/template/{id}/copy')
def copy_template(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tpl = db.query(Template).filter(Template.id == id, Template.is_public == True).first()
    if not tpl:
        raise HTTPException(status_code=404, detail='Шаблон не найден')
    # Если платный — проверка покупки
    if tpl.price and tpl.price > 0:
        payment = db.query(Payment).filter(Payment.template_id == tpl.id, Payment.user_id == user.id, Payment.status == 'paid').first()
        if not payment:
            raise HTTPException(status_code=403, detail='Шаблон не куплен')
    # Копируем шаблон
    new_tpl = Template(
        name=tpl.name + ' (копия)',
        description=tpl.description,
        category=tpl.category,
        is_public=False,
        user_id=user.id,
        content=tpl.content,
        price=tpl.price
    )
    db.add(new_tpl)
    db.commit()
    db.refresh(new_tpl)
    return {'id': new_tpl.id}

@router.post('/marketplace/template/{id}/purchase')
def purchase_template(id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tpl = db.query(Template).filter(Template.id == id, Template.is_public == True).first()
    if not tpl or not tpl.price or tpl.price <= 0:
        raise HTTPException(status_code=404, detail='Платный шаблон не найден')
    payment = db.query(Payment).filter(Payment.template_id == tpl.id, Payment.user_id == user.id, Payment.status == 'paid').first()
    if payment:
        return {'ok': True, 'already_purchased': True}
    # Реферал
    referrer_id = None
    if 'ref' in request.query_params:
        try:
            referrer_id = int(request.query_params['ref'])
        except Exception:
            referrer_id = None
    if referrer_id and referrer_id != user.id:
        existing = db.query(Referral).filter_by(referrer_user_id=referrer_id, referred_user_id=user.id, template_id=tpl.id).first()
        if not existing:
            referral = Referral(referrer_user_id=referrer_id, referred_user_id=user.id, template_id=tpl.id, reward=50)
            db.add(referral)
    # Использование бонусов
    use_bonus = request.query_params.get('use_bonus') == '1'
    bonus_acc = db.query(UserBonusAccount).filter_by(user_id=user.id).first()
    if not bonus_acc:
        bonus_acc = UserBonusAccount(user_id=user.id)
        db.add(bonus_acc)
        db.commit()
    used_bonus = 0
    paid_real = tpl.price
    if use_bonus and bonus_acc.available_balance > 0:
        used_bonus = min(bonus_acc.available_balance, tpl.price)
        paid_real = tpl.price - used_bonus
        bonus_acc.available_balance -= used_bonus
        bonus_acc.total_spent += used_bonus
        db.commit()
    # Создаём платеж
    payment = Payment(
        user_id=user.id,
        template_id=tpl.id,
        amount=tpl.price,
        currency='RUB',
        status='paid',
        reference=f'marketplace:{user.id}:{tpl.id}',
        used_bonus=used_bonus,
        paid_real=paid_real
    )
    db.add(payment)
    db.commit()
    return {'ok': True, 'already_purchased': False, 'used_bonus': used_bonus, 'paid_real': paid_real}

@router.get('/marketplace/templates')
def marketplace_templates(
    db: Session = Depends(get_db),
    category: str = Query(None),
    tag: str = Query(None),
    price: str = Query(None),  # 'free'/'paid'
    search: str = Query(None),
    sort: str = Query('new'),  # 'new', 'price', 'rating'
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    q = db.query(Template).filter(Template.is_public == True)
    if category:
        q = q.filter(Template.category == category)
    if tag:
        q = q.filter(Template.tags.any(name=tag))
    if price == 'free':
        q = q.filter(or_(Template.price == 0, Template.price == None))
    elif price == 'paid':
        q = q.filter(Template.price > 0)
    if search:
        q = q.filter(or_(Template.name.ilike(f'%{search}%'), Template.description.ilike(f'%{search}%')))
    if sort == 'price':
        q = q.order_by(Template.price.asc())
    elif sort == 'rating':
        q = q.order_by(Template.average_rating.desc())
    else:
        q = q.order_by(Template.created_at.desc())
    total = q.count()
    items = q.offset((page-1)*page_size).limit(page_size).all()
    return {
        'total': total,
        'items': [
            {
                'id': t.id,
                'name': t.name,
                'description': t.description,
                'category': t.category,
                'tags': [tag.name for tag in getattr(t, 'tags', [])],
                'author': t.user_id,
                'price': t.price,
                'is_public': t.is_public,
                'created_at': t.created_at,
                'average_rating': getattr(t, 'average_rating', 0),
                'rating_count': getattr(t, 'rating_count', 0),
            } for t in items
        ]
    }

@router.get('/marketplace/template/{id}')
def marketplace_template(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tpl = db.query(Template).filter(Template.id == id, Template.is_public == True).first()
    if not tpl:
        raise HTTPException(status_code=404, detail='Шаблон не найден')
    # Проверка покупки
    purchased = False
    if tpl.price and tpl.price > 0:
        payment = db.query(Payment).filter(Payment.template_id == tpl.id, Payment.user_id == user.id, Payment.status == 'paid').first()
        purchased = bool(payment)
    return {
        'id': tpl.id,
        'name': tpl.name,
        'description': tpl.description,
        'category': tpl.category,
        'tags': [tag.name for tag in getattr(tpl, 'tags', [])],
        'author': tpl.user_id,
        'price': tpl.price,
        'is_public': tpl.is_public,
        'created_at': tpl.created_at,
        'average_rating': getattr(tpl, 'average_rating', 0),
        'rating_count': getattr(tpl, 'rating_count', 0),
        'blocks': (tpl.content or {}).get('nodes', []),
        'purchased': purchased
    } 