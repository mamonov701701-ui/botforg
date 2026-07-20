"""
CLI: notification outbox worker (Этап 6.14.10Б).

Запуск (из корня репозитория):

  backend\\venv\\Scripts\\python.exe -m backend.scripts.run_notification_outbox_worker --once
  backend\\venv\\Scripts\\python.exe -m backend.scripts.run_notification_outbox_worker --loop --interval 5

Не запускается автоматически из uvicorn.
"""
from __future__ import annotations

import argparse
import logging
import sys
import time

from backend.database import SessionLocal
from backend.services.notification_outbox_worker import run_outbox_once

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("notification_outbox_worker")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="BotForg notification outbox worker")
    parser.add_argument("--once", action="store_true", help="Process one batch and exit")
    parser.add_argument("--loop", action="store_true", help="Run continuously")
    parser.add_argument("--interval", type=float, default=5.0, help="Sleep between batches")
    parser.add_argument("--batch-size", type=int, default=None)
    parser.add_argument("--worker-id", type=str, default=None)
    args = parser.parse_args(argv)

    if not args.once and not args.loop:
        args.once = True

    while True:
        db = SessionLocal()
        try:
            stats = run_outbox_once(
                db,
                worker_id=args.worker_id,
                batch_size=args.batch_size,
                commit=True,
            )
            logger.info("outbox_batch %s", stats)
        except Exception:
            logger.exception("outbox_batch_failed")
            db.rollback()
        finally:
            db.close()

        if args.once or not args.loop:
            return 0
        time.sleep(max(0.5, float(args.interval)))


if __name__ == "__main__":
    sys.exit(main())
