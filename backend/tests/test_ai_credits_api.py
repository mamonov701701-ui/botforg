from datetime import datetime, timedelta, timezone
import pytest
from backend.models.user import User
from backend.services.ai_credits import grant_credits, debit_credits
from backend.auth.password import hash_password
from backend.core.security import create_jwt_token
from backend.tests.conftest import TestingSessionLocal

@pytest.fixture
def db(client):
    s=TestingSessionLocal()
    try: yield s
    finally: s.close()

def test_ai_credit_api_auth_history_pagination_and_admin_rbac(client, db):
    assert client.get('/me/ai-credits').status_code == 401
    one=User(email='credit-api-one@example.com',name='One',role='user',plan_code='start',hashed_password=hash_password('TestPassword123!'))
    two=User(email='credit-api-two@example.com',name='Two',role='user',plan_code='start',hashed_password=hash_password('TestPassword123!'))
    db.add_all([one,two]); db.commit()
    first='Bearer '+create_jwt_token(one.id); second='Bearer '+create_jwt_token(two.id); first_id, second_id=one.id,two.id
    now=datetime.now(timezone.utc)
    grant_credits(db,user_id=first_id,amount=100,credit_class='purchased',source_type='addon',source_ref_type='user_addon',source_ref_id='1',idempotency_key='api-grant',expires_at=now+timedelta(days=1))
    debit_credits(db,user_id=first_id,amount=10,capability='copilot',idempotency_key='api-debit',now=now); db.commit()
    own=client.get('/me/ai-credits',headers={'Authorization':first}); assert own.status_code==200 and own.json()['total_spendable']==90
    history=client.get('/me/ai-credits/history?limit=1',headers={'Authorization':first}); assert history.status_code==200 and len(history.json()['items'])==1 and history.json()['next_cursor']
    page2=client.get('/me/ai-credits/history?limit=10&cursor='+str(history.json()['next_cursor']),headers={'Authorization':first}); assert page2.status_code==200 and all(x['id'] < history.json()['items'][0]['id'] for x in page2.json()['items'])
    assert client.get('/me/ai-credits/history',headers={'Authorization':second}).json()['items']==[]
    assert client.get('/api/admin/tariffs/ai-credits/ledger',headers={'Authorization':second}).status_code==403
    db.get(User,first_id).role='admin'; db.commit()
    admin=client.get('/api/admin/tariffs/ai-credits/ledger?user_id='+str(first_id),headers={'Authorization':first}); assert admin.status_code==200
    item=admin.json()['items'][0]; assert 'metadata' not in item and item['user_id']==first_id
