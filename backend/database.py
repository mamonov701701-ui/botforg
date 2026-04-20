from sqlalchemy import create_engine, text, event
from sqlalchemy.orm import declarative_base, sessionmaker

from backend.settings import settings

DATABASE_URL = settings.DATABASE_URL

_is_sqlite = DATABASE_URL.startswith("sqlite")
_engine_kwargs = {}
if _is_sqlite:
    _engine_kwargs = {
        "connect_args": {"check_same_thread": False},
    }
else:
    # Защита от исчерпания пула соединений в production-нагрузке.
    _engine_kwargs = {
        "pool_size": 20,
        "max_overflow": 30,
        "pool_timeout": 30,
        "pool_pre_ping": True,
        "pool_recycle": 1800,
        "connect_args": {"connect_timeout": 5},
    }

engine = create_engine(DATABASE_URL, **_engine_kwargs)

if not _is_sqlite:
    @event.listens_for(engine, "connect")
    def _set_postgres_timeouts(dbapi_connection, connection_record):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute(f"SET statement_timeout = {max(1, int(settings.DB_STATEMENT_TIMEOUT_MS))}")
            cursor.execute(f"SET lock_timeout = {max(1, int(settings.DB_LOCK_TIMEOUT_MS))}")
            cursor.close()
        except Exception:
            # Не валим процесс из-за невозможности выставить timeout на конкретном коннекте.
            pass

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_connection() -> tuple[bool, str]:
    """Lightweight DB readiness probe."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, "ok"
    except Exception as exc:
        return False, str(exc)
