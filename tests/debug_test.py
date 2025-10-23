from backend.main import app

def test_routes():
    print("\nRegistered routes:")
    for route in app.routes:
        print(f"{route.path} [{route.methods}]")
