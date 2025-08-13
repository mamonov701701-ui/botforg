from yookassa import Configuration, Payment as YooPayment
from config import YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, YOOKASSA_REDIRECT_URL

Configuration.account_id = YOOKASSA_SHOP_ID
Configuration.secret_key = YOOKASSA_SECRET_KEY

def create_yookassa_payment(user, template, amount: int):
    payment = YooPayment.create({
        "amount": {
            "value": f"{amount / 100:.2f}",
            "currency": "RUB"
        },
        "confirmation": {
            "type": "redirect",
            "return_url": YOOKASSA_REDIRECT_URL
        },
        "capture": True,
        "description": f"Оплата шаблона {template.name} пользователем {user.email}"
    })
    return payment.confirmation.confirmation_url 