from datetime import datetime, timedelta, timezone
from decimal import Decimal
import pytest

from backend.auth.password import hash_password
from backend.models.checkout import CheckoutIntent, CheckoutIntentStatus, CheckoutProductType, PaymentAttempt, PaymentAttemptStatus
from backend.models.tariff import AddonPackage, AddonPackageType, UserAddon, UserAddonSource, UserAddonStatus
from backend.models.user import User
from backend.services.ai_credits import debit_credits, grant_credits
from backend.services.refund_submit import RefundSubmitError, create_refund_request
from backend.tests.conftest import TestingSessionLocal

@pytest.fixture
def db(client):
    s=TestingSessionLocal()
    try: yield s
    finally: s.close()

def _paid_addon(db, user, kind, key):
    now=datetime.now(timezone.utc)
    pkg=AddonPackage(code=f'{kind.value}-{key}',name_ru='pack',type=kind,amount=100,price=Decimal('10.00'),currency='RUB',duration_type='fixed',is_active=True,is_public=False)
    db.add(pkg); db.flush()
    addon=UserAddon(user_id=user.id,addon_package_id=pkg.id,amount=100,period_start=now-timedelta(days=1),period_end=now+timedelta(days=30),status=UserAddonStatus.ACTIVE.value,source=UserAddonSource.PURCHASE.value,provider_ref=f'ref-{key}')
    db.add(addon); db.flush()
    intent=CheckoutIntent(user_id=user.id,product_type=CheckoutProductType.ADDON.value,product_code=pkg.code,product_name=pkg.name_ru,amount=Decimal('10.00'),currency='RUB',status=CheckoutIntentStatus.FULFILLED.value,idempotency_key=f'i-{key}',fulfilled_addon_id=addon.id)
    db.add(intent); db.flush(); attempt=PaymentAttempt(checkout_intent_id=intent.id,user_id=user.id,provider='test',amount=Decimal('10.00'),currency='RUB',status=PaymentAttemptStatus.SUCCEEDED.value,idempotency_key=f'p-{key}')
    db.add(attempt); db.commit(); return addon,intent,attempt

@pytest.mark.parametrize('spent', [0, 40, 100])
def test_ai_credit_addon_refund_is_manual_for_all_consumption_states(db, spent):
    user=User(email=f'ai-refund-{spent}@x.test',name='u',role='user',plan_code='start',hashed_password=hash_password('TestPassword123!')); db.add(user); db.commit()
    addon,intent,attempt=_paid_addon(db,user,AddonPackageType.AI_CREDITS,f'ai-{spent}')
    grant_credits(db,user_id=user.id,amount=100,credit_class='purchased',source_type='addon',source_ref_type='user_addon',source_ref_id=addon.id,idempotency_key=f'g-{spent}',expires_at=addon.period_end)
    if spent: debit_credits(db,user_id=user.id,amount=spent,capability='test',idempotency_key=f'd-{spent}')
    db.commit()
    with pytest.raises(RefundSubmitError) as exc:
        create_refund_request(db,user_id=user.id,checkout_intent_id=intent.id,payment_attempt_id=attempt.id,reason_category='other',idempotency_key=f'r-{spent}')
    assert exc.value.code == 'ai_credits_refund_manual_review'
    db.refresh(addon); assert addon.amount == 100

def test_non_ai_addon_refund_submit_remains_available(db):
    user=User(email='normal-refund@x.test',name='u',role='user',plan_code='start',hashed_password=hash_password('TestPassword123!')); db.add(user); db.commit()
    _,intent,attempt=_paid_addon(db,user,AddonPackageType.MESSAGES,'normal')
    request=create_refund_request(db,user_id=user.id,checkout_intent_id=intent.id,payment_attempt_id=attempt.id,reason_category='other',idempotency_key='normal-refund')
    assert request.id is not None
