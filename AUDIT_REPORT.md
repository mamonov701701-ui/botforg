# BotForg Repository Audit Report

**Date**: October 21, 2025  
**Branch**: `chore/audit-fixes`  
**Auditor**: Automated Code Review

## Executive Summary

This audit report covers a comprehensive analysis of the BotForg repository, including backend (FastAPI/SQLAlchemy), frontend (Vite + React + TypeScript), and infrastructure components. The audit identified several categories of issues ranging from code quality to security concerns.

### Overall Status
- ✅ **Tests**: All 67 backend tests passing
- ⚠️ **Backend**: 200 flake8 issues, 251 mypy type errors, import sorting issues
- ⚠️ **Frontend**: 140+ TypeScript errors, ESLint configuration issues, missing dependencies
- ⚠️ **Security**: Hardcoded secrets in settings.py, needs environment variable enforcement
- ⚠️ **Infrastructure**: Missing npm scripts, no pre-commit hooks configured

---

## 1. Backend Audit (FastAPI/SQLAlchemy)

### 1.1 Static Analysis Results

#### Flake8 (200 issues)

**Critical Issues:**
- `F821`: Undefined name 'Request' in `routers/marketplace.py:191`
- `F811`: Redefinition of `get_db` in `routers/template.py:26`
- `E722`: Bare except clause in `middleware/security.py:113`

**Unused Imports (70 occurrences):**
- `backend.models.*` - Many model imports in `main.py` are unused (only imported for Alembic)
- `fastapi.status` - Imported but unused in `auth/email_routes.py`, `routers/auth.py`, `routers/billing.py`
- `fastapi.HTTPException` - Unused in multiple routers
- `typing.Optional` - Unused in `models/template.py`, `models/user.py`
- `typing.List` - Unused in `routers/bot.py`, `routers/user_template.py`, `schemas/analytics.py`
- `datetime.timedelta` - Unused in `routers/analytics.py`, `routers/auth.py`
- `decimal.Decimal` - Unused in `routers/billing.py`, `routers/payment.py`, test files

**Code Style Issues:**
- 61 blank lines contain whitespace (W293)
- 16 files missing blank line at end (W391)
- 23 module-level imports not at top of file (E402) in `main.py`
- 11 comparisons to `True` should use `if cond:` instead of `if cond == True:` (E712)
- 3 comparisons to `None` should use `is None` instead of `==` (E711)
- 8 lines too long (>120 characters)

**Dead Code Findings:**
- `routers/marketplace.py:69` - Variable `total` assigned but never used
- `routers/webhook.py:152` - Variable `payment_id` assigned but never used
- `routers/webhooks.py:86` - Variable `payload` assigned but never used

#### MyPy Type Issues (251 errors)

**Missing Type Annotations:**
- All Pydantic schema validators missing return type annotations
- All router endpoint functions missing return type annotations
- Missing type annotations in `schemas/payment.py` for constr usage (deprecated syntax)

**Type Mismatches:**
- Direct assignment to SQLAlchemy Column objects (should use setattr)
- Mixing `Column[T]` types with `T` types in function arguments
- `Optional` union types not properly handled (e.g., checking `template.content` without None check)

**Example Type Errors:**
```python
# routers/auth.py:51
verify_password(password, user.hashed_password)
# Error: Argument 2 has incompatible type "Column[str]"; expected "str"

# routers/marketplace.py:191
def download_template(id: int, request: Request, db: Session = Depends(get_db)):
# Error: Name "Request" is not defined (missing import)
```

#### Import Sorting (isort) - 28 files

Files with incorrect import sorting:
- `database.py` - SQLAlchemy imports not grouped
- `main.py` - Router imports scattered, models import multiline
- All `auth/*.py` files - stdlib imports mixed with local imports
- All `routers/*.py` files - inconsistent import grouping
- All `models/*.py` files - SQLAlchemy imports not sorted

### 1.2 Security Audit

#### Critical Security Issues

**1. Hardcoded Secrets** ⚠️
```python
# backend/settings.py:10-15
SECRET_KEY: str = "your_secret_key_here_change_in_production"
JWT_SECRET: str = "your-jwt-secret-here-use-openssl-rand-hex-32"
```
**Impact**: Default secrets in code allow unauthorized JWT token generation  
**Fix Required**: Remove defaults, enforce environment variables

**2. JWT Configuration**
```python
ACCESS_TOKEN_EXPIRE_MINUTES: int = 30  # ✅ Reasonable
```
**Status**: Acceptable for development

**3. CORS Configuration**
```python
# backend/main.py:62-68
allow_origins=[settings.FRONTEND_ORIGIN, settings.FRONTEND_URL]
allow_credentials=True
allow_methods=["*"]
allow_headers=["*"]
```
**Status**: ⚠️ Wildcard methods/headers acceptable for development, but should be restricted in production

**4. Session Middleware**
```python
# backend/main.py:54
secret_key=getattr(settings, "SESSION_SECRET", settings.JWT_SECRET)
```
**Issue**: Falls back to JWT_SECRET if SESSION_SECRET not set (secret reuse)

**5. Rate Limiting**
- In-memory rate limiting used (`auth/rate_limit.py`)
- **TODO**: Move to Redis for production

#### Database Security
- ✅ Using SQLAlchemy ORM (parameterized queries)
- ✅ Alembic migrations in place
- ⚠️ Using SQLite (not suitable for production)

### 1.3 Database & Alembic

**Migrations Status:**
- 1 migration file in `backend/migrations/versions/`
- ✅ No outstanding migration errors detected
- ⚠️ Using SQLite (file: `botforg.db`)

**Session Management:**
- `database.py` provides `get_db()` dependency
- ⚠️ Potential session leak: `template.py:26` redefines `get_db`

### 1.4 Testing Results

**Pytest Summary:**
```
67 tests collected
67 passed ✅
2 warnings:
  - Unknown config option: env
  - Pydantic deprecated config syntax
```

**Test Coverage:**
- ✅ Billing: 13 tests
- ✅ Bot Templates: 6 tests
- ✅ Bots: 11 tests
- ✅ Messages: 16 tests
- ✅ Payments: 7 tests
- ✅ User Templates: 14 tests

**No Flaky Tests Detected**

**Test Files with Unused Imports:**
- `tests/test_billing.py` - `Decimal`, `pytest`
- `tests/test_payment.py` - `Decimal`, `pytest`
- All test files import `pytest` but use fixtures via dependency injection

---

## 2. Frontend Audit (Vite + React + TS)

### 2.1 TypeScript Analysis

**Build Status**: ✅ `vite build` successful (382.93 kB bundle)

**TypeScript Errors**: 140+ errors from `tsc --noEmit`

#### Missing Module Declarations (Critical)

**Missing `api/client.ts`** (imported by 20+ files):
```typescript
// Error: Cannot find module './client'
import { get, post } from './client';
```

**Missing Path Aliases** (40+ errors):
```typescript
// Error: Cannot find module '@/api/client'
import { get } from '@/api/client';
```
**Cause**: `tsconfig.json` missing path mappings or base URL

**Missing Next.js Dependencies** (10+ errors):
```typescript
// Error: Cannot find module 'next/link'
import Link from 'next/link';
```
**Issue**: Project uses Vite but has Next.js imports (copy-paste artifacts?)

#### Type Annotation Issues

**Implicit `any` Types** (30+ occurrences):
```typescript
// api/auth.ts:3
export async function register(data) { // ❌ 'data' implicitly has 'any' type
  return post('/auth/register', data);
}

// components/Marketplace.tsx:37
.then((res) => { // ❌ 'res' implicitly has 'any' type
  setTemplates(res.items);
})
```

**React Flow Type Issues**:
```typescript
// components/FlowEditor.tsx:112
<ReactFlow
  viewport={viewport} // ❌ Property 'viewport' does not exist
  defaultZoom={1.5}   // ❌ Property 'defaultZoom' does not exist
/>
```
**Cause**: Using old React Flow API or incorrect version

### 2.2 ESLint Analysis

**Status**: ⚠️ Configuration error

**Issue**:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@typescript-eslint/eslint-plugin'
```

**Cause**: Missing TypeScript ESLint dependencies in `package.json`

**Current package.json** only lists:
```json
"eslint": "^8.45.0",
"eslint-plugin-react": "^7.32.0",
"eslint-plugin-react-hooks": "^4.6.0",
"eslint-plugin-react-refresh": "^0.4.0"
```

**Missing**:
- `@typescript-eslint/eslint-plugin`
- `@typescript-eslint/parser`

### 2.3 Dead Code & Unused Files

**Unused Components** (based on import analysis):
- `components/CommentList.tsx` - depends on missing `@/api/client`
- `components/TemplatePage.tsx` - uses Next.js `useRouter` (not available)
- `components/Marketplace.tsx` - depends on missing UI components

**Dead Routes** (Next.js style):
- `pages/admin/users/[id].tsx` - Next.js dynamic route (Vite doesn't support)
- `pages/analytics/template/[id].tsx` - Next.js dynamic route
- `pages/edit-template/[id].tsx` - Next.js dynamic route
- `pages/template/[id].tsx` - Next.js dynamic route

**Duplicate API Clients**:
- `api/auth.ts` exports `loginEmail()` and `registerEmail()`
- `api/useAuthApi.js` exports `login()` and `register()`
- Both call `/auth/login` and `/auth/register` but with different implementations

### 2.4 Login/Register Modal Verification

**Status**: ⚠️ No modals found, only placeholder pages

**Findings**:
- `src/pages/Login.jsx` exists but is a placeholder:
  ```jsx
  return <h1>Страница «Login» (в разработке)</h1>;
  ```
- No `Register.jsx` page found
- No modal components for Login/Register

**API Integration** (existing but unused):
```typescript
// api/auth.ts
export async function registerEmail(email, password, name?) {
  return post('/auth/register', { email, password, name, role: 'user' });
}

export async function loginEmail(email, password) {
  return fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: email, password })
  });
}
```

**Issues**:
1. ❌ `registerEmail()` calls `/auth/register` (correct endpoint but uses email/password auth endpoint which may be `/auth/email/register`)
2. ❌ `loginEmail()` uses `application/x-www-form-urlencoded` (correct for OAuth2 password flow)
3. ⚠️ Duplicate implementation in `api/useAuthApi.js` (different format)

### 2.5 API Layer Analysis

**Current Structure**:
```
api/
├── analytics.ts
├── auth.ts
├── client.ts (MISSING!)
├── comments.ts
├── marketplace.ts
├── payment.ts
├── payments.ts
├── purchases.ts
├── team.ts
├── templates.ts
├── users.ts
├── useAuthApi.js (duplicate)
└── http.ts (exists, provides get/post)
```

**Issues**:
1. ❌ Many files import from `./client` which doesn't exist
2. ❌ Some files use `@/api/client` path alias (not configured)
3. ✅ `http.ts` exists and exports `get` and `post` functions
4. ⚠️ `useAuthApi.js` duplicates functionality in `auth.ts`

**Recommendation**: Rename `http.ts` to `client.ts` or add exports

### 2.6 Dependencies Analysis

**Missing Dev Dependencies**:
```json
"@typescript-eslint/eslint-plugin": "^6.0.0",
"@typescript-eslint/parser": "^6.0.0"
```

**Suspicious Dependencies** (not in package.json but imported):
- `next/link`
- `next/router`
- `next/navigation`
- `chart.js`
- `react-chartjs-2`
- `@/components/ui/button`

**Possible Issues**:
- Code copied from Next.js project
- Missing chart library dependencies
- Missing UI component library

---

## 3. Infrastructure Audit

### 3.1 Environment Variables

**Current `.env.example` (root)**:
```env
SECRET_KEY=your_secret_key_here_change_in_production
JWT_SECRET=your-jwt-secret-here-use-openssl-rand-hex-32
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
ENVIRONMENT=development
...
```

**Issues**:
1. ⚠️ Example values look like actual secrets (should be obvious placeholders)
2. ❌ No `.env.example` in `backend/` directory
3. ⚠️ `backend/settings.py` has fallback defaults (defeats environment-based config)

**Missing Variables**:
```env
# Should add:
SESSION_SECRET=<separate-from-jwt-secret>
ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=postgresql://user:pass@localhost/botforg  # for production
REDIS_URL=redis://localhost:6379  # for rate limiting
```

### 3.2 Docker (Not Found)

**Status**: ❌ No `Dockerfile` or `docker-compose.yml` found

**Recommendation**: Add containerization for:
- Backend (FastAPI + Postgres)
- Frontend (Nginx + static build)
- Redis (rate limiting, caching)

### 3.3 NPM Scripts

**Current `frontend/package.json`**:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --host",
    "lint": "eslint src --ext js,jsx,ts,tsx ..." // ❌ Broken (--ext deprecated)
  }
}
```

**Missing Scripts**:
```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint:fix": "eslint src --fix",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "format": "prettier --write src"
  }
}
```

### 3.4 Pre-commit Hooks

**Status**: ❌ No pre-commit configuration found

**Recommendations**:

**Option 1: Python `pre-commit` Framework**
```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.1.6
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.7.0
    hooks:
      - id: mypy
        args: [--ignore-missing-imports]
        files: ^backend/(models|schemas|routers)/

  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v3.1.0
    hooks:
      - id: prettier
        files: \.(js|jsx|ts|tsx|json|css|md)$
```

**Option 2: Husky + lint-staged** (Node.js)
```json
// package.json
{
  "lint-staged": {
    "backend/**/*.py": ["ruff --fix", "ruff format", "mypy"],
    "frontend/src/**/*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write"]
  }
}
```

---

## 4. Summary of Fixes Applied

### 4.1 Backend Fixes (Minimal)

None applied yet. Recommendations:

1. **Remove unused imports** (70 occurrences)
2. **Fix import sorting** with `isort .`
3. **Fix bare except** in `middleware/security.py:113`
4. **Add missing import** `Request` in `routers/marketplace.py`
5. **Remove duplicate `get_db`** in `routers/template.py:26`
6. **Fix `== True` comparisons** to `if cond:`
7. **Add type annotations** to all router functions and schema validators

### 4.2 Frontend Fixes (Minimal)

None applied yet. Recommendations:

1. **Rename `api/http.ts` to `api/client.ts`** or add re-export
2. **Add TypeScript ESLint dependencies** to `package.json`
3. **Remove Next.js imports** or add react-router equivalents
4. **Fix ReactFlow API usage** (update to v11 API)
5. **Add type annotations** to all API functions and components
6. **Remove or update dead routes** (Next.js style dynamic routes)
7. **Consolidate auth API** (remove duplicate in `useAuthApi.js`)

### 4.3 Security Fixes (Critical)

**MUST DO**:
1. **Remove hardcoded SECRET_KEY and JWT_SECRET defaults** in `settings.py`
2. **Enforce environment variables** at startup:
   ```python
   SECRET_KEY: str = Field(..., min_length=32)  # No default
   JWT_SECRET: str = Field(..., min_length=32)  # No default
   ```
3. **Add separate SESSION_SECRET** (don't reuse JWT_SECRET)
4. **Update .env.example** with clear placeholders:
   ```env
   SECRET_KEY=CHANGE_ME_32_CHARACTERS_MINIMUM
   JWT_SECRET=CHANGE_ME_DIFFERENT_FROM_SECRET_KEY
   SESSION_SECRET=CHANGE_ME_ANOTHER_32_CHARS
   ```

### 4.4 Infrastructure Additions

**MUST DO**:
1. Add NPM scripts: `typecheck`, `lint:fix`, `format`, `test`
2. Fix `lint` script: remove `--ext` flag (use eslint.config.js)
3. Add `pre-commit` configuration (Python or Husky)
4. Add `Dockerfile` and `docker-compose.yml`

---

## 5. TODO List (Prioritized)

### Critical (Do First) 🔴

1. **Security**: Remove hardcoded secrets from `backend/settings.py`
2. **Security**: Enforce required environment variables (no defaults for secrets)
3. **Backend**: Add missing `Request` import in `routers/marketplace.py`
4. **Backend**: Fix bare except in `middleware/security.py:113`
5. **Frontend**: Fix ESLint configuration (add TS parser/plugin)
6. **Frontend**: Rename `http.ts` to `client.ts` or add re-export

### High Priority (Do Soon) 🟡

7. **Backend**: Remove 70 unused imports
8. **Backend**: Fix import sorting with `isort`
9. **Backend**: Remove duplicate `get_db` in `routers/template.py`
10. **Backend**: Add type annotations to router functions
11. **Frontend**: Add TypeScript ESLint dependencies to package.json
12. **Frontend**: Fix ReactFlow API usage
13. **Frontend**: Remove Next.js imports (or migrate to react-router)
14. **Infrastructure**: Add npm scripts (typecheck, test, format)
15. **Infrastructure**: Fix broken `lint` script

### Medium Priority (Nice to Have) 🟢

16. **Backend**: Fix all mypy errors (251 total)
17. **Backend**: Add type hints to all Pydantic validators
18. **Frontend**: Implement actual Login/Register modals
19. **Frontend**: Remove dead routes (Next.js style)
20. **Frontend**: Consolidate auth API (remove useAuthApi.js duplicate)
21. **Frontend**: Add missing dependencies (chart.js, etc.) or remove imports
22. **Infrastructure**: Add Docker setup
23. **Infrastructure**: Add pre-commit hooks
24. **Infrastructure**: Move to PostgreSQL from SQLite

### Low Priority (Later) 🔵

25. **Backend**: Move rate limiting to Redis
26. **Backend**: Restrict CORS in production
27. **Backend**: Add comprehensive logging
28. **Frontend**: Add E2E tests for auth flow
29. **Documentation**: Update API_DOCS.md with current endpoints
30. **Testing**: Increase test coverage beyond core features

---

## 6. Recommendations

### Immediate Actions (Before Merging PR)

1. ✅ **Create this report** - Done
2. ❌ **Fix critical security issues** - See section 5, items 1-2
3. ❌ **Fix blocking errors** - marketplace.py missing import, middleware bare except
4. ❌ **Fix ESLint config** - Add missing dependencies
5. ❌ **Verify tests still pass** - After fixes

### Short-term (This Sprint)

6. Add pre-commit hooks (ruff, isort, prettier)
7. Fix all unused imports
8. Add missing TypeScript types
9. Implement Login/Register modals
10. Add Docker development environment

### Long-term (Backlog)

11. Migrate to PostgreSQL
12. Add Redis for rate limiting
13. Add comprehensive E2E tests
14. Improve TypeScript strict mode compliance
15. Add API versioning strategy

---

## 7. Files Modified (Tracking for PR)

### Created
- `AUDIT_REPORT.md` (this file)

### Will Modify (in follow-up commits)
- `backend/settings.py` - Remove hardcoded secrets
- `backend/routers/marketplace.py` - Add Request import
- `backend/routers/template.py` - Remove duplicate get_db
- `backend/middleware/security.py` - Fix bare except
- `frontend/package.json` - Add npm scripts, add TS ESLint deps
- `frontend/api/http.ts` - Rename to client.ts or add exports
- `.pre-commit-config.yaml` - Add pre-commit hooks (new file)
- `env.example` - Update with better placeholders

### Will Delete (dead code)
- `frontend/api/useAuthApi.js` - Duplicate of auth.ts
- `frontend/pages/admin/users/[id].tsx` - Next.js route (not used)
- Various Next.js style routes in `pages/`

---

## 8. Testing Verification

### Backend
```bash
cd backend
python -m pytest -v
# Result: 67 passed ✅
```

### Frontend
```bash
cd frontend
npm run build
# Result: Build successful, 382.93 kB bundle ✅
```

### After Fixes (TODO)
- [ ] Run `flake8` - should have <50 issues
- [ ] Run `mypy` - should have <100 errors
- [ ] Run `pytest` - all tests pass
- [ ] Run `npm run typecheck` - should have <50 errors
- [ ] Run `npm run lint` - should complete without config error
- [ ] Manual test: Login/Register flow works E2E

---

## Conclusion

The BotForg repository is functional but has significant technical debt in code quality and security. The most critical issues are:

1. **Security**: Hardcoded secrets in source code
2. **Frontend**: Missing module configuration and Next.js artifacts
3. **Code Quality**: 200+ backend linting issues, 140+ frontend type errors
4. **Infrastructure**: No pre-commit hooks, missing npm scripts

**Estimated effort to resolve critical issues**: 4-6 hours  
**Estimated effort for all high-priority items**: 16-24 hours  
**Recommended timeline**: Address critical issues before next deployment

---

**Audit completed**: October 21, 2025  
**Branch**: `chore/audit-fixes`  
**Next steps**: See section 5 (TODO List) for prioritized action items

