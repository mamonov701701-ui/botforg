# QA Report - BotForg

Artifacts: `qa_artifacts/2026-02-04_0809/`

## 1) Summary
- **Result:** FAIL
- P0: 2 | P1: 0 | P2: 0

## Environment check

- ﻿node: v22.17.1
- npm: 10.9.2
- python: Python 3.12.0

## 2) Backend
- **Migrations:** ok
- **Pytest All:** failed — 91 failed, 29 passed, 6 skipped, 29 warnings, 3 errors in 17.80s
- **Pytest Selected:** 1 failed, 18 passed, 42 warnings in 10.45s
- **/health:** checked at startup
- **Routes:** `2026-02-04_0809/backend_routes.txt`

### Top errors (first 10)
- FAILED backend/tests/test_billing.py::test_create_free_message - AssertionErr...
- FAILED backend/tests/test_billing.py::test_create_paid_message - AssertionErr...
- FAILED backend/tests/test_billing.py::test_quota_limit_enforcement - Assertio...
- FAILED backend/tests/test_billing.py::test_get_billing_records - AssertionErr...
- FAILED backend/tests/test_billing.py::test_get_summary - AssertionError: Logi...
- FAILED backend/tests/test_billing.py::test_register_message_billing - Asserti...
- FAILED backend/tests/test_billing.py::test_register_billing_for_other_user_forbidden
- FAILED backend/tests/test_billing.py::test_update_user_quota - AssertionError...
- FAILED backend/tests/test_billing.py::test_update_nonexistent_quota - Asserti...
- FAILED backend/tests/test_billing.py::test_access_other_user_billing_forbidden

## 3) Frontend
| Route | Status | Console errors | Network errors | Screenshot |
|-------|--------|----------------|----------------|------------|
| / | NAV_FAIL | 0 | 0 | - |
| /pricing | NAV_FAIL |  | 0 | - |
| /market | NAV_FAIL |  | 0 | - |
| /features | NAV_FAIL |  | 0 | - |
| /auth/verify | NAV_FAIL |  | 0 | - |
| /auth/reset | NAV_FAIL |  | 0 | - |
| /editor/1 | NAV_FAIL |  | 0 | - |
| /dashboard | NAV_FAIL |  | 0 | - |
| /dashboard/bots | NAV_FAIL |  | 0 | - |
| /dashboard/scenarios | NAV_FAIL |  | 0 | - |
| /dashboard/templates | NAV_FAIL |  | 0 | - |
| /dashboard/balance | NAV_FAIL |  | 0 | - |
| /dashboard/analytics | NAV_FAIL |  | 0 | - |
| /dashboard/team | NAV_FAIL |  | 0 | - |
| /dashboard/messages | NAV_FAIL |  | 0 | - |
| /dashboard/bf-team | NAV_FAIL |  | 0 | - |
| /dashboard/settings | NAV_FAIL |  | 0 | - |
| /dashboard/platform | NAV_FAIL |  | 0 | - |
| /dashboard/platform/users | NAV_FAIL |  | 0 | - |
| /dashboard/platform/users/1 | NAV_FAIL |  | 0 | - |
| /dashboard/platform/analytics | NAV_FAIL |  | 0 | - |
| /dashboard/platform/settings | NAV_FAIL |  | 0 | - |
| /bf-agent | NAV_FAIL |  | 0 | - |

- Playwright report: `2026-02-04_0809/playwright_report.txt`
- Console log: `2026-02-04_0809/console_log.txt`

## 4) UI vs API
- Full reconciliation: `2026-02-04_0809/ui_api_reconciliation.txt`

## 5) Recommendations
- **P0:**
  - Backend tests failed (pytest_all: 91 failed, 3 errors) - see 2026-02-04_0809/pytest_all.txt
  - Frontend QA missing (Playwright did not run) - see frontend_stdout.log, frontend_stderr.log
- **P1:**
  - (none)
- **P2:**
  - (none)

## 6) Artifacts
- Run folder: `qa_artifacts/2026-02-04_0809/`
- backend_alembic.log, backend_stdout.log, backend_stderr.log
- frontend_stdout.log, frontend_stderr.log
- pytest_all.txt, pytest_selected.txt
- backend_routes.txt, openapi.json (if available)
- playwright_report.txt, screens/, ui_api_calls.json, console_log.txt
- ui_api_reconciliation.txt