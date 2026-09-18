from datetime import datetime, timedelta, timezone
import pytest

from backend.auth.password import hash_password
from backend.models.ai_credit import AiCreditBucket, AiCreditDebitAllocation
from backend.models.user import User
from backend.models.plan import Plan
from backend.models.tariff import GiftGrant, GiftGrantStatus, GiftType, SubscriptionStatus, UserSubscription
from backend.services.ai_credits import AiCreditError, debit_credits, expire_due_buckets, get_balance, grant_credits, revoke_bucket
from backend.services.ai_credit_cutover import run_ai_credit_cutover
from backend.services.ai_credit_gift_lifecycle import sync_effective_plan_gift_ai_credits

UTC = timezone.utc

@pytest.fixture
def db(client):
    from backend.tests.conftest import TestingSessionLocal
    s = TestingSessionLocal()
    try: yield s
    finally: s.close()

def user(db):
    u = User(email="credits@example.com", name="Credits", plan_code="start", role="user", hashed_password=hash_password("TestPassword123!"))
    db.add(u); db.commit(); return u

def test_included_is_spent_before_purchased_and_allocated(db):
    u = user(db); now = datetime.now(UTC)
    included = grant_credits(db, user_id=u.id, amount=50, credit_class="included", source_type="subscription", source_ref_type="subscription", source_ref_id="1", idempotency_key="included", expires_at=now + timedelta(days=1))
    first = grant_credits(db, user_id=u.id, amount=100, credit_class="purchased", source_type="addon", source_ref_type="addon", source_ref_id="1", idempotency_key="first", expires_at=now + timedelta(days=30))
    last = grant_credits(db, user_id=u.id, amount=500, credit_class="purchased", source_type="addon", source_ref_type="addon", source_ref_id="2", idempotency_key="last", expires_at=now + timedelta(days=365))
    entry = debit_credits(db, user_id=u.id, amount=120, capability="generator", idempotency_key="debit-1", now=now); db.commit()
    got = {a.bucket_id: a.amount for a in db.query(AiCreditDebitAllocation).filter_by(debit_ledger_entry_id=entry.id)}
    assert got == {included.id: 50, first.id: 70}
    assert db.get(AiCreditBucket, included.id).remaining_amount == 0
    assert db.get(AiCreditBucket, first.id).remaining_amount == 30
    assert db.get(AiCreditBucket, last.id).remaining_amount == 500
    assert get_balance(db, user_id=u.id, now=now).total_spendable == 530

def test_idempotency_and_insufficient_never_debit_twice(db):
    u=user(db); now=datetime.now(UTC)
    grant_credits(db,user_id=u.id,amount=100,credit_class="purchased",source_type="addon",source_ref_type="addon",source_ref_id="x",idempotency_key="grant",expires_at=None)
    a=debit_credits(db,user_id=u.id,amount=80,capability="copilot",idempotency_key="request",now=now)
    assert debit_credits(db,user_id=u.id,amount=80,capability="copilot",idempotency_key="request",now=now).id == a.id
    with pytest.raises(AiCreditError, match="different payload"): debit_credits(db,user_id=u.id,amount=79,capability="copilot",idempotency_key="request",now=now)
    with pytest.raises(AiCreditError, match="Insufficient"): debit_credits(db,user_id=u.id,amount=21,capability="copilot",idempotency_key="request-2",now=now)
    assert get_balance(db,user_id=u.id,now=now).total_spendable == 20

def test_expired_and_revoked_are_not_used(db):
    u=user(db); now=datetime.now(UTC)
    expired=grant_credits(db,user_id=u.id,amount=30,credit_class="included",source_type="subscription",source_ref_type="subscription",source_ref_id="x",idempotency_key="expired",expires_at=now-timedelta(seconds=1))
    active=grant_credits(db,user_id=u.id,amount=40,credit_class="purchased",source_type="addon",source_ref_type="addon",source_ref_id="y",idempotency_key="active",expires_at=None)
    expire_due_buckets(db,user_id=u.id,now=now); revoke_bucket(db,bucket_id=active.id,idempotency_key="revoke",reason_code="test",now=now); db.commit()
    balance=get_balance(db,user_id=u.id,now=now)
    assert balance.included_used == 0 and balance.included_expired == 30
    assert balance.purchased_used == 0 and balance.purchased_revoked == 40 and balance.total_spendable == 0

def test_plan_gift_is_granted_only_without_subscription(db):
    u=user(db); now=datetime.now(UTC); plan=db.query(Plan).first(); assert plan is not None
    plan.limits={**(plan.limits or {}), "ai_credits": 25}; db.commit()
    gift=GiftGrant(target_user_id=u.id, gift_type=GiftType.PLAN, plan_id=plan.id, starts_at=now-timedelta(days=1), ends_at=now+timedelta(days=2), granted_by_user_id=u.id, status=GiftGrantStatus.ACTIVE)
    db.add(gift); db.commit(); sync_effective_plan_gift_ai_credits(db,user_id=u.id,now=now); db.commit()
    assert get_balance(db,user_id=u.id,now=now).included_remaining == 25
    sub=UserSubscription(user_id=u.id,plan_id=plan.id,status=SubscriptionStatus.ACTIVE,current_period_start=now-timedelta(hours=1),current_period_end=now+timedelta(days=1)); db.add(sub); db.commit()
    sync_effective_plan_gift_ai_credits(db,user_id=u.id,now=now); db.commit()
    assert get_balance(db,user_id=u.id,now=now).included_remaining == 0

def test_cutover_is_idempotent_and_legacy_is_manual(db):
    u=user(db); now=datetime.now(UTC); plan=db.query(Plan).first(); assert plan is not None
    plan.limits={**(plan.limits or {}), "ai_credits": 11}; db.commit()
    sub=UserSubscription(user_id=u.id,plan_id=plan.id,status=SubscriptionStatus.ACTIVE,current_period_start=now-timedelta(days=1),current_period_end=now+timedelta(days=1)); db.add(sub)
    legacy=User(email="legacycredits@example.com",name="Legacy",plan_code="business",role="user",hashed_password=hash_password("TestPassword123!")); db.add(legacy); db.commit()
    first=run_ai_credit_cutover(db,now=now); db.commit(); second=run_ai_credit_cutover(db,now=now); db.commit()
    assert first.created == 1 and second.already_existed >= 1
    assert legacy.id in second.legacy_manual
    assert get_balance(db,user_id=u.id,now=now).included_remaining == 11

def test_two_independent_sqlite_sessions_cannot_double_spend(client, db):
    u=user(db); now=datetime.now(UTC)
    grant_credits(db,user_id=u.id,amount=100,credit_class='purchased',source_type='addon',source_ref_type='addon',source_ref_id='race',idempotency_key='race-grant',expires_at=None); db.commit()
    from backend.tests.conftest import TestingSessionLocal
    first, second = TestingSessionLocal(), TestingSessionLocal()
    try:
        debit_credits(first,user_id=u.id,amount=80,capability='race',idempotency_key='race-one',now=now); first.commit()
        with pytest.raises(AiCreditError):
            debit_credits(second,user_id=u.id,amount=80,capability='race',idempotency_key='race-two',now=now)
        second.rollback()
    finally:
        first.close(); second.close()
    balance=get_balance(db,user_id=u.id,now=now)
    assert balance.total_spendable == 20
    assert db.query(AiCreditDebitAllocation).filter(AiCreditDebitAllocation.amount > 0).count() == 1
