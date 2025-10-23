# Dev DB Reset (SQLAlchemy "Table 'users' is already defined")

If you see:
`sqlalchemy.exc.InvalidRequestError: Table 'users' is already defined`

Follow these steps:

1. Ensure `backend/models/auth.py` has:

   ```python
   class User(Base):
       __tablename__ = "users"
       __table_args__ = {"extend_existing": True}
   ```

2. Stop the backend server (Ctrl+C).

3. Run the dev reset script (PowerShell):

   ```
   scripts\reset_dev_db.ps1
   ```

4. Start backend from the REPO ROOT (to avoid double imports):

   ```
   uvicorn backend.main:app --reload --port 8000
   ```

5. Verify:
   - Console shows "Application startup complete."
   - GET http://localhost:8000/healthz responds with {"ok": true}

Notes:

- The reset is for development only. Do not run it on production data.
