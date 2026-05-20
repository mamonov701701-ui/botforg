from starlette.routing import Mount
from starlette.routing import Route

from backend.main import app


def test_routes():
    """Smoke: перечисление маршрутов приложения (включая Mount без methods)."""
    print("\nRegistered routes:")
    for route in app.routes:
        if isinstance(route, Route):
            methods = ",".join(sorted(route.methods or []))
            print(f"{route.path} [{methods}]")
        elif isinstance(route, Mount):
            print(f"{route.path} [MOUNT -> {route.name}]")
        else:
            print(f"{getattr(route, 'path', '?')} [{type(route).__name__}]")
    assert len(app.routes) > 0
