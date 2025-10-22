# OAuth Authentication Implementation

**Version**: 1.0  
**Last Updated**: January 14, 2025  
**Status**: Complete

---

## Overview

BotForg implements OAuth 2.0 authentication with three providers:
- **Google** - for users with Google accounts
- **Yandex ID** - for Russian users
- **Mail.ru** - for users with Mail.ru accounts

Authentication uses HttpOnly JWT cookies for secure session management, protecting against XSS attacks while providing a smooth user experience.

---

## Architecture

### Authentication Flow

```
┌─────────┐                 ┌──────────┐                ┌──────────┐
│  User   │                 │ BotForg  │                │  OAuth   │
│ Browser │                 │ Backend  │                │ Provider │
└────┬────┘                 └────┬─────┘                └────┬─────┘
     │                           │                           │
     │ 1. Click "Login with X"   │                           │
     ├───────────────────────────>│                           │
     │                           │                           │
     │                           │ 2. Redirect to OAuth      │
     │                           ├───────────────────────────>│
     │                           │                           │
     │ 3. User authorizes        │                           │
     │<──────────────────────────┼───────────────────────────┤
     │                           │                           │
     │ 4. OAuth callback         │                           │
     ├───────────────────────────>│                           │
     │                           │                           │
     │                           │ 5. Exchange code for token│
     │                           ├───────────────────────────>│
     │                           │<───────────────────────────┤
     │                           │                           │
     │                           │ 6. Get user info          │
     │                           ├───────────────────────────>│
     │                           │<───────────────────────────┤
     │                           │                           │
     │ 7. Set HttpOnly cookie    │                           │
     │<───────────────────────────┤                           │
     │                           │                           │
     │ 8. Redirect to /account   │                           │
     │<───────────────────────────┤                           │
     │                           │                           │
```

### Security Features

1. **HttpOnly Cookies**: Session token stored in HttpOnly cookie, inaccessible to JavaScript
2. **SameSite=Lax**: CSRF protection via SameSite cookie attribute
3. **Secure Flag**: Cookie only sent over HTTPS in production
4. **OAuth State Parameter**: Prevents CSRF attacks during OAuth flow
5. **JWT Expiration**: Tokens expire after 7 days
6. **PKCE** (optional): For Google OAuth when supported

---

## Backend Implementation

### Database Schema

**Table: `users`**
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    name VARCHAR,
    avatar VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Table: `accounts`**
```sql
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    provider ENUM('google', 'yandex', 'mailru') NOT NULL,
    provider_user_id VARCHAR NOT NULL,
    email VARCHAR,
    name VARCHAR,
    avatar VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE (provider, provider_user_id)
);
```

### API Endpoints

#### `GET /auth/{provider}/login`

Initiates OAuth flow for specified provider.

**Parameters**:
- `provider`: One of `google`, `yandex`, `mailru`

**Response**: Redirect to OAuth provider authorization page

**Example**:
```bash
GET /auth/google/login
→ Redirects to Google OAuth
```

---

#### `GET /auth/{provider}/callback`

Handles OAuth callback after user authorization.

**Parameters**:
- `provider`: One of `google`, `yandex`, `mailru`
- `code`: OAuth authorization code (query param)
- `state`: CSRF state token (query param)

**Response**: 
- Sets HttpOnly session cookie
- Redirects to `/account` page

**Cookie**:
```
session=<JWT>; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=604800
```

---

#### `POST /auth/logout`

Logs out user by clearing session cookie.

**Response**:
```json
{
  "message": "Logged out successfully"
}
```

**Cookie**: Deletes `session` cookie

---

#### `GET /me`

Returns current user profile.

**Authentication**: Required (JWT cookie)

**Response**:
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "John Doe",
  "avatar": "https://example.com/avatar.jpg",
  "providers": ["google", "yandex"]
}
```

**Error** (401 if not authenticated):
```json
{
  "detail": "Not authenticated"
}
```

---

## OAuth Provider Setup

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google+ API**
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
5. Choose **Web application**
6. Add authorized redirect URIs:
   ```
   http://localhost:8000/auth/google/callback
   https://yourdomain.com/auth/google/callback
   ```
7. Copy **Client ID** and **Client Secret** to `.env`:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

**Scopes**: `openid email profile`

---

### Yandex OAuth

1. Go to [Yandex OAuth](https://oauth.yandex.ru/)
2. Click **Зарегистрировать новое приложение**
3. Fill in application details
4. In **Платформы**, select **Веб-сервисы**
5. Add callback URL:
   ```
   http://localhost:8000/auth/yandex/callback
   https://yourdomain.com/auth/yandex/callback
   ```
6. In **Доступ к данным**, select:
   - `login:email` - user email
   - `login:info` - user profile info
7. Copy **ClientID** and **Client secret** to `.env`:
   ```
   YANDEX_CLIENT_ID=your-client-id
   YANDEX_CLIENT_SECRET=your-client-secret
   ```

**Scopes**: `login:email login:info`

---

### Mail.ru OAuth

1. Go to [Mail.ru OAuth](https://o2.mail.ru/app/)
2. Click **Создать приложение**
3. Fill in application details
4. Add redirect URI:
   ```
   http://localhost:8000/auth/mailru/callback
   https://yourdomain.com/auth/mailru/callback
   ```
5. In **Права доступа**, select:
   - `userinfo` - user profile
   - `email` - user email
6. Copy **ID** and **Приватный ключ** to `.env`:
   ```
   MAILRU_CLIENT_ID=your-app-id
   MAILRU_CLIENT_SECRET=your-private-key
   ```

**Scopes**: `userinfo email`

---

## Frontend Implementation

### Auth Store (`authStore.ts`)

Zustand store managing user authentication state.

```typescript
interface User {
  id: number;
  email: string;
  name: string | null;
  avatar: string | null;
  providers: string[];
}

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  clearUser: () => void;
  setLoading: (loading: boolean) => void;
}
```

**Usage**:
```typescript
const { user, loading, setUser } = useAuthStore();
```

---

### Auth API (`auth.ts`)

API client for authentication endpoints.

**Functions**:

```typescript
// Get current user (returns null if not authenticated)
async function getMe(): Promise<User | null>

// Logout user
async function logout(): Promise<void>

// Get OAuth login URL
function getLoginUrl(provider: 'google' | 'yandex' | 'mailru'): string
```

---

### Components

#### AuthGate

Wraps protected routes, showing SignIn screen if not authenticated.

```tsx
<AuthGate>
  <AccountPage />
</AuthGate>
```

**Behavior**:
- On mount: fetches `/me` to check authentication
- If loading: shows spinner
- If not authenticated: shows SignIn screen
- If authenticated: renders children

---

#### SignIn

OAuth provider selection screen.

**Features**:
- 3 provider buttons (Google, Yandex ID, Mail.ru)
- Each button redirects to `/auth/{provider}/login`
- Styled with hover effects and provider colors

---

#### AccountPage

User profile page showing:
- User avatar, name, email
- Connected OAuth providers (badges)
- Logout button

---

## Environment Variables

Copy `backend/env.example` to `.env` and fill in:

```bash
# Required
JWT_SECRET=<generate-with-openssl-rand-hex-32>
FRONTEND_URL=http://localhost:5173

# Google OAuth
GOOGLE_CLIENT_ID=<from-google-console>
GOOGLE_CLIENT_SECRET=<from-google-console>

# Yandex OAuth
YANDEX_CLIENT_ID=<from-yandex-oauth>
YANDEX_CLIENT_SECRET=<from-yandex-oauth>

# Mail.ru OAuth
MAILRU_CLIENT_ID=<from-mailru-o2>
MAILRU_CLIENT_SECRET=<from-mailru-o2>

# Environment
ENVIRONMENT=development  # or "production"
```

**Generate JWT_SECRET**:
```bash
openssl rand -hex 32
```

---

## Testing

### Manual Testing Steps

1. **Start backend**:
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

2. **Start frontend**:
   ```bash
   cd frontend
   npm run dev
   ```

3. **Test OAuth Flow**:
   - Navigate to `http://localhost:5173/account`
   - Should see SignIn screen with 3 providers
   - Click "Войти через Google"
   - Authorize with Google
   - Should redirect back to AccountPage showing profile
   - Refresh page → session persists
   - Click "Выйти" → returns to SignIn screen

4. **Test `/me` Endpoint**:
   ```bash
   # Without cookie (should return 401)
   curl http://localhost:8000/me
   
   # After login (copy cookie from browser)
   curl -H "Cookie: session=<jwt>" http://localhost:8000/me
   ```

5. **Verify Cookie Flags**:
   - Open DevTools → Application → Cookies
   - Check `session` cookie:
     - ✅ HttpOnly: true
     - ✅ SameSite: Lax
     - ✅ Secure: true (in production)
     - ✅ Path: /

---

## Troubleshooting

### Issue: OAuth callback fails with "Invalid provider"

**Cause**: Provider name mismatch or not configured

**Solution**:
- Check provider name in URL matches `google`, `yandex`, or `mailru`
- Verify OAuth credentials in `.env`

---

### Issue: "Not authenticated" error after login

**Cause**: Cookie not being set or sent

**Solution**:
- Check CORS allows credentials: `allow_credentials=True`
- Verify frontend sends `credentials: 'include'` in fetch
- Check browser console for cookie errors
- Verify `FRONTEND_URL` matches actual frontend origin

---

### Issue: OAuth redirect URI mismatch

**Cause**: Callback URL in provider dashboard doesn't match

**Solution**:
- Update redirect URI in provider dashboard to match:
  ```
  http://localhost:8000/auth/{provider}/callback
  ```
- For production, add production URL:
  ```
  https://yourdomain.com/auth/{provider}/callback
  ```

---

### Issue: Session not persisting across page refreshes

**Cause**: Cookie expiration or SameSite issues

**Solution**:
- Check cookie `Max-Age` is set (604800 seconds = 7 days)
- Verify `SameSite=Lax` is set
- Check browser is not blocking third-party cookies

---

## Security Considerations

### JWT Token Security

- ✅ **HttpOnly**: Cannot be accessed by JavaScript
- ✅ **SameSite=Lax**: Prevents CSRF attacks
- ✅ **Secure**: Only sent over HTTPS in production
- ✅ **Short-lived**: 7-day expiration
- ✅ **Signed**: Uses HS256 with secret key

### OAuth Security

- ✅ **State Parameter**: Prevents CSRF during OAuth flow
- ✅ **PKCE** (optional): Additional security for Google OAuth
- ✅ **Redirect URI Validation**: Provider validates callback URLs
- ✅ **Scope Limitation**: Only request necessary permissions

### Best Practices

1. **Never log JWT tokens** - they grant full access
2. **Rotate JWT_SECRET regularly** - invalidates all sessions
3. **Use HTTPS in production** - required for Secure cookies
4. **Monitor failed login attempts** - detect brute force
5. **Implement rate limiting** - prevent abuse

---

## Email/Password Authentication

### Overview

In addition to OAuth, BotForg supports email/password authentication with:
- User registration with email verification
- Login with email/password
- Password reset via email link
- Rate limiting (5 attempts / 10 minutes)
- Password policy enforcement (≥8 chars, letters+digits)

### Email Auth Flow

```
Registration Flow:
1. User submits email + password → POST /auth/email/register
2. Server validates password, creates user (unverified)
3. Server generates verification token, sends email (in dev: logs link)
4. User clicks verify link → GET /auth/email/verify?token=...
5. Server marks email as verified, auto-login with JWT cookie
6. Redirect to /account

Login Flow:
1. User submits email + password → POST /auth/email/login
2. Server validates credentials, checks email_verified_at
3. If verified: set JWT cookie, return success
4. If not verified: return 403 error

Password Reset Flow:
1. User submits email → POST /auth/email/request-reset
2. Server generates reset token, sends email (in dev: logs link)
3. User clicks reset link → GET /auth/reset?token=...
4. User enters new password → POST /auth/email/reset
5. Server validates token, updates password
6. Redirect to /account (login with new password)
```

### Database Schema Updates

**Table: `users` (updated)**
```sql
ALTER TABLE users ADD COLUMN password_hash VARCHAR NULL;
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP NULL;
```

**Table: `email_verifications` (new)**
```sql
CREATE TABLE email_verifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    token VARCHAR UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Table: `password_resets` (new)**
```sql
CREATE TABLE password_resets (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    token VARCHAR UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/email/register` | No | Register new user |
| POST | `/auth/email/login` | No | Login with email/password |
| GET | `/auth/email/verify?token=...` | No | Verify email address |
| POST | `/auth/email/request-reset` | No | Request password reset |
| POST | `/auth/email/reset` | No | Reset password with token |

### Password Policy

- Minimum 8 characters
- Must contain letters (a-z, A-Z)
- Must contain digits (0-9)
- Email normalized (trim + lowercase)

### Rate Limiting

- 5 attempts per 10-minute window
- Tracked per IP + action (register/login/reset)
- Returns 429 status when exceeded
- In-memory store (production should use Redis)

### Email Service

**Development Mode**:
- Logs verification/reset links to console
- No SMTP required

**Production Mode** (TODO):
- Configure SMTP settings in .env
- Send emails via SMTP server

### Frontend Features

**Tabbed Auth UI**: `/account` shows tabs:
- **Соцсети** (Social): OAuth providers (Google, Yandex, Mail.ru)
- **Почта** (Email): Email/password forms

**Email Tab Modes**:
- **Login**: Email + password → login
- **Register**: Name (optional) + email + password → register
- **Reset**: Email → request reset link

**Verification/Reset Pages**:
- `/auth/verify?token=...` - Email verification
- `/auth/reset?token=...` - Password reset form

### Security Considerations

- ✅ Passwords hashed with bcrypt
- ✅ Tokens expire after 24 hours
- ✅ Rate limiting prevents brute force
- ✅ Email verification required for login (configurable)
- ✅ Reset tokens single-use (deleted after verification)
- ✅ Always return success for reset requests (don't reveal if email exists)

---

## Future Enhancements

### Phase 2 (Planned)

- [ ] Link multiple OAuth providers to one account
- [ ] Link email/password to existing OAuth account
- [ ] Profile editing (name, avatar)
- [ ] Account deletion
- [ ] Session management (view/revoke active sessions)
- [ ] Two-factor authentication (2FA)
- [ ] JWT refresh tokens (longer sessions)

### Phase 3 (Future)

- [ ] Social login (Facebook, Twitter, GitHub)
- [ ] Enterprise SSO (SAML, LDAP)
- [ ] Biometric authentication (WebAuthn)
- [ ] Magic links (passwordless login)

---

## API Reference

### Backend Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/auth/{provider}/login` | No | Initiate OAuth flow |
| GET | `/auth/{provider}/callback` | No | Handle OAuth callback |
| POST | `/auth/email/register` | No | Register with email/password |
| POST | `/auth/email/login` | No | Login with email/password |
| GET | `/auth/email/verify` | No | Verify email address |
| POST | `/auth/email/request-reset` | No | Request password reset |
| POST | `/auth/email/reset` | No | Reset password |
| POST | `/auth/logout` | No | Clear session cookie |
| GET | `/me` | Yes | Get current user profile |

### Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (invalid provider, weak password) |
| 401 | Unauthorized (no valid session, invalid credentials) |
| 403 | Forbidden (email not verified) |
| 429 | Too Many Requests (rate limit exceeded) |
| 500 | Server Error |

---

## Dependencies

### Backend

```txt
fastapi
authlib
python-jose[cryptography]
passlib[bcrypt]
sqlalchemy
pydantic[email]
```

### Frontend

```txt
zustand (for state management)
react-router-dom (for routing)
```

---

## Changelog

### v1.1 (2025-10-14)

- ✅ Email/password authentication
- ✅ Email verification (dev mode: logs links)
- ✅ Password reset flow
- ✅ Rate limiting (5 attempts / 10 min)
- ✅ Password policy enforcement
- ✅ Tabbed auth UI (OAuth / Email)
- ✅ Unified dark theme tokens

### v1.0 (2025-01-14)

- ✅ Initial implementation
- ✅ Google, Yandex, Mail.ru OAuth
- ✅ HttpOnly JWT cookies
- ✅ Session persistence
- ✅ User profile page
- ✅ Logout functionality

---

**Last Updated**: October 14, 2025  
**Maintained by**: BotForg Development Team

