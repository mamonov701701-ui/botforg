from config import TELEGRAM_PAYMENT_PROVIDER_TOKEN

def create_telegram_invoice(template, user, price_in_cents: int) -> dict:
    """
    Возвращает данные для отправки счета пользователю в Telegram.
    """
    return {
        "title": template.name,
        "description": template.description or "",
        "payload": f"template_{template.id}_user_{user.id}",
        "provider_token": TELEGRAM_PAYMENT_PROVIDER_TOKEN,
        "currency": "RUB",
        "prices": [{"label": "Шаблон", "amount": price_in_cents}],
        "start_parameter": f"buy_template_{template.id}",
        "photo_url": "https://your-image-url.com",
        "photo_width": 512,
        "photo_height": 512,
        "need_email": True,
    } 