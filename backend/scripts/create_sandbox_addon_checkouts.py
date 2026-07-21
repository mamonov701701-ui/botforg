"""
Dev/test-only: create sandbox addon checkout + YooKassa payment confirmation URL.

Не эмулирует succeeded / fulfillment. Не работает в production.

Запуск (из корня репозитория):

  backend\\venv\\Scripts\\python.exe -m backend.scripts.create_sandbox_addon_checkouts \\
    --user-id 1 --count 2 --addon-code msg_1000

Выводит confirmation_url для оплаты тестовой картой ЮKassa.
"""
from __future__ import annotations

import argparse
import sys
import uuid
from datetime import datetime, timezone

from backend.database import SessionLocal
from backend.models.checkout import CheckoutProductType
from backend.models.user import User
from backend.services.checkout_intents import CheckoutIntentError, create_checkout_intent
from backend.services.checkout_pay import CheckoutPayError, start_checkout_payment
from backend.services.payment_provider_connections import resolve_default_connection
from backend.settings import settings


def _assert_non_production() -> None:
    env = (settings.ENVIRONMENT or "").strip().lower()
    if env == "production":
        raise SystemExit(
            "refusing to run: ENVIRONMENT=production "
            "(sandbox checkout helper is development/test only)"
        )


def _redact_url(url: str | None) -> str:
    """Pass-through confirmation URL (public); never print secrets."""
    return (url or "").strip()


def create_one(
    db,
    *,
    user_id: int,
    addon_code: str,
    label: str,
) -> dict:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    uniq = uuid.uuid4().hex[:10]
    intent_key = f"sandbox-{label}-{stamp}-{uniq}"
    pay_key = f"sandbox-pay-{label}-{stamp}-{uniq}"

    intent = create_checkout_intent(
        db,
        user_id=user_id,
        product_type=CheckoutProductType.ADDON,
        code=addon_code,
        idempotency_key=intent_key,
        commit=True,
    )
    result = start_checkout_payment(
        db,
        user_id=user_id,
        intent_id=int(intent.id),
        idempotency_key=pay_key,
    )
    return {
        "label": label,
        "intent_id": int(intent.id),
        "intent_status": intent.status,
        "attempt_id": int(result.attempt.id) if result.attempt is not None else None,
        "amount": str(intent.amount),
        "currency": intent.currency,
        "product_code": intent.product_code,
        "confirmation_url": _redact_url(result.confirmation_url),
    }


def main(argv: list[str] | None = None) -> int:
    _assert_non_production()

    parser = argparse.ArgumentParser(
        description="Create sandbox YooKassa addon checkouts (dev/test only)"
    )
    parser.add_argument("--user-id", type=int, required=True, help="Buyer user id")
    parser.add_argument(
        "--count",
        type=int,
        default=2,
        help="Number of independent checkouts (default 2)",
    )
    parser.add_argument(
        "--addon-code",
        type=str,
        default="msg_1000",
        help="Public addon package code (default msg_1000)",
    )
    parser.add_argument(
        "--labels",
        type=str,
        default="full-refund,partial-refund",
        help="Comma-separated labels for idempotency keys",
    )
    args = parser.parse_args(argv)

    if args.count < 1 or args.count > 10:
        print("error: --count must be 1..10", file=sys.stderr)
        return 2

    labels = [x.strip() for x in (args.labels or "").split(",") if x.strip()]
    while len(labels) < args.count:
        labels.append(f"purchase-{len(labels) + 1}")
    labels = labels[: args.count]

    db = SessionLocal()
    try:
        user = db.get(User, int(args.user_id))
        if user is None:
            print(f"error: user_id={args.user_id} not found", file=sys.stderr)
            return 2

        conn = resolve_default_connection(db)
        if conn is None:
            print(
                "error: no default enabled+verified payment connection",
                file=sys.stderr,
            )
            return 2
        mode = (getattr(conn, "mode", None) or "").strip().lower()
        if mode not in {"test", "sandbox"}:
            print(
                f"error: default payment connection mode={mode!r} "
                "(expected test/sandbox)",
                file=sys.stderr,
            )
            return 2

        print(f"environment={settings.ENVIRONMENT}")
        print(f"user_id={int(args.user_id)}")
        print(f"addon_code={args.addon_code}")
        print(f"connection_mode={mode}")
        print("---")

        rows: list[dict] = []
        for label in labels:
            try:
                row = create_one(
                    db,
                    user_id=int(args.user_id),
                    addon_code=args.addon_code,
                    label=label,
                )
            except (CheckoutIntentError, CheckoutPayError) as exc:
                print(
                    f"error[{label}]: {getattr(exc, 'code', 'error')}: {exc}",
                    file=sys.stderr,
                )
                return 1
            rows.append(row)
            print(f"label={row['label']}")
            print(f"  intent_id={row['intent_id']} status={row['intent_status']}")
            print(f"  attempt_id={row['attempt_id']}")
            print(f"  amount={row['amount']} {row['currency']} code={row['product_code']}")
            print(f"  confirmation_url={row['confirmation_url']}")
            print("---")

        print("Pay each confirmation_url with a YooKassa TEST card.")
        print("Do not mark succeeded manually; wait for webhook/fulfillment.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
