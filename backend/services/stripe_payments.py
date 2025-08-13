import stripe
from config import STRIPE_API_KEY, STRIPE_SUCCESS_URL, STRIPE_CANCEL_URL

stripe.api_key = STRIPE_API_KEY

def create_stripe_checkout_session(user, template, amount: int):
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[
            {
                "price_data": {
                    "currency": "rub",
                    "unit_amount": amount,
                    "product_data": {
                        "name": template.name,
                        "description": f"Шаблон от {template.user.name}"
                    },
                },
                "quantity": 1,
            },
        ],
        metadata={
            "user_id": user.id,
            "template_id": template.id
        },
        mode="payment",
        success_url=STRIPE_SUCCESS_URL,
        cancel_url=STRIPE_CANCEL_URL,
    )
    return session.url 