import uuid
from unittest.mock import Mock, patch

from backend.models.bot import Bot
from backend.models.bot import BotInstance
from backend.models.constructor_core import (
    CtorBot,
    CtorBotUser,
    CtorBotVariableDefinition,
    PlatformUser,
)
from backend.models.template import Template
from backend.services.constructor.variable_service import VariableService
from backend.tests.conftest import (
    TestingSessionLocal,
    get_user_id,
    register_and_get_token,
)


def test_crm_list_routes_return_empty_without_ctor_linkage(client):
    auth = register_and_get_token(client)
    user_id = get_user_id(client, auth)

    db = TestingSessionLocal()
    try:
        bot = Bot(
            owner_id=user_id,
            title="CRM test bot",
            username=f"crm_test_{uuid.uuid4().hex[:8]}",
            token=f"token_{uuid.uuid4().hex}",
            is_active=True,
            content={},
        )
        db.add(bot)
        db.commit()
        db.refresh(bot)
        bot_id = bot.id

        db.query(CtorBot).filter(CtorBot.id == bot_id).delete()
        db.commit()
    finally:
        db.close()

    headers = {"Authorization": auth}
    users_res = client.get(f"/bots/{bot_id}/crm/users", headers=headers)
    assert users_res.status_code == 200
    users_json = users_res.json()
    assert users_json["total"] == 0
    assert users_json["items"] == []

    vars_res = client.get(f"/bots/{bot_id}/crm/variables", headers=headers)
    assert vars_res.status_code == 200
    assert vars_res.json() == []

    tags_res = client.get(f"/bots/{bot_id}/crm/tags", headers=headers)
    assert tags_res.status_code == 200
    assert tags_res.json() == []


def test_webhook_input_saves_variable_and_last_input(client):
    auth = register_and_get_token(client)
    user_id = get_user_id(client, auth)
    chat_id = 777001
    slug = f"crm-e2e-{uuid.uuid4().hex[:8]}"

    db = TestingSessionLocal()
    try:
        template = Template(
            name="Input CRM E2E",
            description="Webhook input test",
            category="test",
            is_public=False,
            user_id=user_id,
            content={
                "nodes": [
                    {
                        "id": "input1",
                        "type": "input",
                        "data": {
                                "is_start": True,
                            "settings": {
                                "question_text": "Какое число было?",
                                "variable_key": "roldr",
                                "variable_label": "Число из прошлого",
                                "required": True,
                                "trim": True,
                                "validation": {"type": "number"},
                            }
                        },
                    },
                    {
                        "id": "msg1",
                        "type": "message",
                        "data": {"settings": {"text": "{{roldr}} вы ввели"}},
                    },
                ],
                "edges": [
                    {"source": "input1", "target": "msg1", "sourceHandle": "success"},
                ],
            },
        )
        db.add(template)
        db.commit()
        db.refresh(template)

        inst = BotInstance(
            user_id=user_id,
            token=f"test_token_{uuid.uuid4().hex[:8]}",
            username=f"test_instance_{uuid.uuid4().hex[:8]}",
            template_id=template.id,
            is_active=True,
        )
        db.add(inst)
        db.commit()
        db.refresh(inst)

        if not db.query(PlatformUser).filter(PlatformUser.id == user_id).first():
            db.add(
                PlatformUser(
                    id=user_id,
                    email=f"platform_{user_id}@example.com",
                    name="Platform User",
                )
            )
            db.commit()

        db.add(CtorBot(id=inst.id, owner_id=user_id, name="Ctor test", slug=slug, status="draft"))
        db.add(
            CtorBotVariableDefinition(
                bot_id=inst.id,
                key="last_input",
                label="Последний ввод",
                data_type="string",
                scope="session",
                is_system=True,
            )
        )
        db.commit()
        inst_id = inst.id
    finally:
        db.close()

    with patch("requests.post") as mock_post:
        ok_resp = Mock()
        ok_resp.status_code = 200
        ok_resp.json.return_value = {"ok": True}
        mock_post.return_value = ok_resp

        start_payload = {"message": {"chat": {"id": chat_id}, "from": {"id": chat_id}, "text": "/start"}}
        start_res = client.post(f"/webhook/{inst_id}", json=start_payload)
        assert start_res.status_code == 200

        answer_payload = {"message": {"chat": {"id": chat_id}, "from": {"id": chat_id}, "text": "123"}}
        answer_res = client.post(f"/webhook/{inst_id}", json=answer_payload)
        assert answer_res.status_code == 200

    db = TestingSessionLocal()
    try:
        bu = (
            db.query(CtorBotUser)
            .filter(
                CtorBotUser.bot_id == inst_id,
                CtorBotUser.channel == "telegram",
                CtorBotUser.external_user_id == str(chat_id),
            )
            .first()
        )
        assert bu is not None

        vs = VariableService(db)
        roldr = vs.get_user_variable_by_key(bu.id, "roldr")
        assert roldr.ok and roldr.data is not None
        assert float(roldr.data.value_number) == 123.0

        last_input = vs.get_user_variable_by_key(bu.id, "last_input")
        assert last_input.ok and last_input.data is not None
        assert last_input.data.value_text == "123.0"
    finally:
        db.close()
