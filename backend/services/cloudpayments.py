import httpx
import base64
from config import CLOUDPAYMENTS_PUBLIC_ID, CLOUDPAYMENTS_SECRET_KEY, CLOUDPAYMENTS_PAYMENT_URL

async def create_cloudpayments_invoice(user, template, amount: int):
    headers = {
        "Authorization": "Basic " + base64.b64encode(
            f"{CLOUDPAYMENTS_PUBLIC_ID}:{CLOUDPAYMENTS_SECRET_KEY}".encode()
        ).decode()
    }
    payload = {
        "Amount": amount / 100,
        "Currency": "RUB",
        "Description": f"Покупка шаблона: {template.name}",
        "AccountId": str(user.id),
        "InvoiceId": f"template-{template.id}-{user.id}",
        "Email": user.email,
        "Skin": "mini",
        "Data": {
            "TemplateId": template.id
        }
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(CLOUDPAYMENTS_PAYMENT_URL, json=payload, headers=headers)
        if response.status_code != 200:
            raise Exception("Ошибка CloudPayments")
        return response.json() 
