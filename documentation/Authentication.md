# PeerLink Authentication System — Deep Dive

> This document explains every aspect of the authentication system in PeerLink.  
> It is written for developers of all skill levels — from beginners to experienced engineers.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack & Why](#2-tech-stack--why)
3. [Database Schema (Firestore)](#3-database-schema-firestore)
4. [Email/Password Registration](#4-emailpassword-registration)
5. [Email/Password Login](#5-emailpassword-login)
6. [Google OAuth Flow](#6-google-oauth-flow)
7. [Token Refresh Flow](#7-token-refresh-flow)
8. [Logout Flow](#8-logout-flow)
9. [Password Reset Flow](#9-password-reset-flow)
10. [JWT Deep Dive](#10-jwt-deep-dive)
11. [Security Measures](#11-security-measures)
12. [Session Management](#12-session-management)
13. [Rate Limiting](#13-rate-limiting)
14. [File Map](#14-file-map)

---

## 1. Architecture Overview

At the highest level, the authentication system is split into three layers:

```mermaid
graph TB
    subgraph Client["Browser (React)"]
        UI[Auth Pages]
        AC[AuthContext]
        API[Axios API Layer]
    end

    subgraph Server["Node.js (Express)"]
        R[Auth Routes]
        M[Middleware Stack]
        S[Auth Services]
        T[Token Service]
    end

    subgraph External["External Services"]
        FB[Firebase Firestore]
        RD[Redis]
        GO[Google OAuth API]
        RE[Resend Email API]
    end

    UI --> AC
    AC --> API
    API -->|HTTP Requests| R
    R --> M
    M --> S
    S --> T
    S --> FB
    S --> RE
    S --> GO
    T --> RD
```

**How the layers interact:**

| Layer | Responsibility | Example |
|-------|----------------|---------|
| **Client** | Renders forms, stores access token in memory, attaches it to requests | Login page, AuthContext, Axios interceptor |
| **Server** | Validates input, runs business logic, issues tokens, persists data | Auth routes, services, middleware |
| **External** | Stores data, caches tokens, verifies Google identity, sends emails | Firestore, Redis, Google APIs, Resend |

---

## 2. Tech Stack & Why

```mermaid
graph LR
    A[Node.js + Express] --> B[Why?]
    B --> C["Async I/O — handles 1000s of concurrent connections"]
    B --> D["Huge ecosystem — JWT, bcrypt, validation libraries"]
    B --> E["Same language as frontend (JavaScript/TypeScript)"]

    F[Firebase Firestore] --> G[Why?]
    G --> H["Serverless — no DB servers to manage"]
    G --> I["Auto-scales to millions of documents"]
    G --> J["Realtime sync capability (future meetings)"]

    K[Redis] --> L[Why?]
    L --> M["In-memory — sub-millisecond reads"]
    L --> N["Distributed rate limiting across servers"]
    L --> O["Token blacklist & OAuth state store"]

    P["JWT (RS256)"] --> Q[Why?]
    Q --> R["Stateless — no session lookup on every request"]
    Q --> S["Asymmetric keys — microservices can verify without private key"]
    Q --> T["Industry standard — every language has a JWT library"]
```

### Key Decisions

| Decision | Why |
|----------|-----|
| **Fully custom auth** (not Firebase Auth) | Full control, no vendor lock-in, works with any database |
| **httpOnly cookies for refresh tokens** | Immune to XSS attacks — JavaScript cannot read them |
| **RS256 (asymmetric) JWT** | Private key signs, public key verifies. Microservices can verify tokens without access to the private key |
| **Refresh token rotation** | Every refresh issues a new refresh token + revokes the old one. This limits the damage if a token is stolen |
| **Redis for rate limiting** | When you have multiple server instances, rate limit state must be shared — not possible with in-memory storage |

---

## 3. Database Schema (Firestore)

Firestore is a NoSQL document database. Data is organized into **collections** containing **documents**.

```mermaid
erDiagram
    USERS ||--o{ REFRESH_TOKENS : has
    USERS ||--o{ EMAIL_VERIFICATION_TOKENS : has
    USERS ||--o{ PASSWORD_RESET_TOKENS : has
    EMAIL_MAPPINGS ||--|| USERS : maps_to
    GOOGLE_MAPPINGS ||--|| USERS : maps_to

    USERS {
        string id "Auto-generated UUID"
        string email "Unique (enforced via mapping)"
        string displayName "User's visible name"
        string photoURL "Avatar URL (nullable)"
        string authProvider "'email' | 'google' | 'both'"
        string passwordHash "bcrypt hash (nullable)"
        string googleId "Google's user ID (nullable)"
        boolean emailVerified "Has user verified?"
        boolean isActive "Soft-deactivate account"
        int failedLoginAttempts "Incremented on failure"
        timestamp lockedUntil "Account lock expiry"
        int refreshTokenVersion "Increment to revoke all sessions"
        int activeSessionCount "Current logged-in devices"
        timestamp lastLoginAt
        timestamp createdAt
        timestamp updatedAt
    }

    REFRESH_TOKENS {
        string userId "Owner of this token"
        string familyId "Same across rotations"
        int sequence "Rotation counter"
        string tokenHash "SHA-256 of the raw token"
        string deviceInfo "Browser info"
        string ipAddress "Login IP"
        string userAgent "Full user-agent string"
        timestamp expiresAt "Auto-expiry (7 days)"
        timestamp lastUsedAt "For session eviction"
        timestamp createdAt
        boolean revoked "Manually revoked?"
    }

    EMAIL_MAPPINGS {
        string userId "Links email to user"
    }

    GOOGLE_MAPPINGS {
        string userId "Links Google ID to user"
    }
```

### Why separate email/google mapping collections?

Firestore **does not have a built-in `UNIQUE` constraint** like SQL databases. If two users somehow registered with the same email, we'd have data corruption.

To enforce uniqueness, we use **separate mapping documents** that act as uniqueness locks:

```
/emailMappings/{base64("user@example.com")} → { userId: "abc123" }
```

When registering, we do this inside a **Firestore transaction**:

```mermaid
sequenceDiagram
    participant S as Server
    participant T as Firestore Transaction
    participant E as emailMappings
    participant U as users

    S->>T: Begin transaction
    T->>E: Read /emailMappings/{encoded-email}
    E-->>T: Exists? → ABORT with "EMAIL_ALREADY_EXISTS"
    T->>U: Create /users/{newId} with user data
    T->>E: Create /emailMappings/{encoded-email} → { userId }
    T-->>S: Commit
```

This pattern guarantees that no two users can have the same email, even under concurrent signup requests.

---

## 4. Email/Password Registration

```mermaid
sequenceDiagram
    actor U as User
    participant C as React Client
    participant S as Express Server
    participant V as Zod Validator
    participant F as Firestore
    participant E as Email Service (Resend)

    U->>C: Fills form: email, password, displayName
    C->>C: Client-side validation
    
    C->>S: POST /api/auth/register { email, password, displayName }
    S->>V: Validate input
    V-->>S: ✅ Valid
    
    S->>S: Hash password (bcrypt, cost=12)
    Note over S: bcrypt.hash(password, 12) takes ~250ms — intentionally slow to defeat brute force
    
    S->>F: Firestore transaction: create user + email mapping
    F-->>S: ✅ User created
    
    S->>S: Generate email verification token (crypto.randomBytes(32))
    S->>F: Store verification token in Firestore
    
    S->>E: Send verification email
    E-->>U: 📧 "Please verify your email"
    
    S-->>C: 201 { message, user }
    C-->>U: Show success message
```

### Password Hashing — Why bcrypt?

When you store passwords, you **never** store the actual password. You store a **hash** — a one-way mathematical transformation.

```
Password "MySecret123!"
        │
        ▼
  bcrypt.hash(password, 12)
        │
        ▼
  $2b$12$LJ3m...8xHu (60-character hash)
```

- **bcrypt is intentionally slow** — cost factor 12 means ~250ms per hash
- **It includes a random salt** — same password produces different hashes each time
- **Slow hashing defeats brute force** — trying 1000 passwords takes 4+ minutes

### Password Requirements (enforced by Zod)

```javascript
// Regex validation on the server
/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/
```

| Rule | Why |
|------|-----|
| Minimum 8 characters | Prevents short, guessable passwords |
| At least 1 uppercase | Increases entropy |
| At least 1 lowercase | Increases entropy |
| At least 1 digit | Increases entropy |
| At least 1 special character | Greatly increases entropy |
| Maximum 128 characters | Prevents hash-length denial-of-service attacks |

---

## 5. Email/Password Login

```mermaid
sequenceDiagram
    actor U as User
    participant C as React Client
    participant S as Express Server
    participant R as Rate Limiter
    participant F as Firestore
    participant D as Redis

    U->>C: Enters email + password
    C->>S: POST /api/auth/login { email, password }
    
    S->>R: Check rate limit (5 attempts / 15 min)
    R->>D: INCR ratelimit:login:{ip}
    D-->>R: Count = 1 (or exceeds?)
    R-->>S: ✅ Proceed
    
    S->>F: Find user by email (via emailMapping)
    F-->>S: ✅ User found
    
    S->>S: Check if account is locked (lockedUntil > now?)
    Note over S: If locked → return error with remaining minutes
    
    S->>S: bcrypt.compare(password, storedHash)
    
    alt Invalid Password
        S->>F: Increment failedLoginAttempts
        S->>F: If >= 5 → set lockedUntil = now + 15min
        S-->>C: 401 "Invalid credentials" or "Account locked"
    end
    
    alt Valid Password
        S->>F: Reset failedLoginAttempts = 0
        S->>F: Update lastLoginAt
        
        S->>F: Count active sessions
        F-->>S: N sessions
        
        alt N >= 10
            S->>F: Revoke oldest session (by lastUsedAt)
        end
        
        S->>S: Generate accessToken (15 min expiry)
        S->>S: Generate refreshToken (7 day expiry)
        S->>F: Store refresh token hash
        
        S-->>C: 200 { accessToken, user }
        Note over C: Set-Cookie: refreshToken (httpOnly, secure, sameSite)
        
        C->>C: Store accessToken in memory (React state)
        C-->>U: ✅ Redirect to /dashboard
    end
```

### What happens on the client after login?

```mermaid
graph TD
    A[Login successful] --> B[Server sets httpOnly cookie: refreshToken]
    A --> C[Response body: accessToken + user]
    C --> D[React stores accessToken in memory<br>NOT localStorage]
    D --> E[Axios interceptor reads accessToken]
    E --> F[Every API request gets header:<br>Authorization: Bearer <accessToken>]
    
    B --> G[Cookie sent automatically with every request to /api/*]
    
    subgraph Session Persistence
        H[Page refresh]
        H --> I[React app starts, no token in memory]
        I --> J[Axios calls POST /api/auth/refresh]
        J --> K[Cookie sent automatically]
        K --> L[Server validates, returns new accessToken]
        L --> M[App is logged in again]
    end
```

**Critical**: Access tokens are stored in React state (memory), not localStorage. This means:
- ✅ An XSS attack cannot steal the access token
- ✅ The refresh token is in an httpOnly cookie (inaccessible to JavaScript)
- ❌ Page refresh loses the access token — but the interceptor automatically refreshes it via the cookie

---

## 6. Google OAuth Flow

This is the most complex flow. It uses the **Authorization Code Grant** (the gold standard of OAuth flows).

```mermaid
sequenceDiagram
    actor U as User
    participant C as React Client
    participant S as Express Server
    participant D as Redis
    participant G as Google
    participant F as Firestore

    U->>C: Click "Continue with Google"
    C->>S: GET /api/auth/google
    S->>S: Generate random state string
    S->>D: Store state in Redis (5 min TTL): SET google_oauth_state:{state} "valid" EX 300
    S-->>C: { url: "https://accounts.google.com/o/oauth2/v2/auth?...&state=..." }
    C-->>U: Redirect browser to Google
    
    U->>G: See Google login screen, pick account
    G-->>U: Redirect to /api/auth/google/callback?code=...&state=...
    Note over U: This redirect happens in the browser
    
    C->>S: Browser hits Google callback endpoint
    S->>S: Validate state parameter against Redis
    Note over S: This prevents CSRF attacks — only our app could have generated this state
    
    S->>G: Exchange authorization code for tokens
    G-->>S: { id_token, access_token, refresh_token }
    
    S->>S: Verify id_token signature + audience + issuer
    Note over S: This proves Google actually authenticated this user
    
    S->>F: Check googleMappings/{googleId}
    
    alt Existing User
        S->>F: Update profile (photoURL, displayName)
        S->>F: Update emailVerified = true (Google emails are pre-verified)
    else New User
        S->>F: Create user in Firestore
        S->>F: Create googleMapping + emailMapping
        S->>E: Send welcome email (optional)
    end
    
    S->>S: Enforce session limit (max 10)
    S->>S: Generate JWT tokens
    
    S-->>C: Set-Cookie: refreshToken (httpOnly)
    S-->>C: Redirect to /auth/callback?accessToken=...&isNewUser=...
    
    C->>C: Read accessToken from URL
    C->>C: Store in memory
    C-->>U: ✅ Redirect to /dashboard
```

### Why the "state" parameter matters

Without the state parameter, an attacker could:

1. Create their own PeerLink login URL
2. Trick you into clicking it
3. You authenticate with Google
4. The attacker's server intercepts the code
5. They log into YOUR account

The state parameter prevents this because:

```mermaid
graph LR
    A[App generates random state] --> B[Stores in Redis]
    A --> C[Sends to Google]
    C --> D[Google includes state in callback]
    D --> E[Server checks: does state exist in Redis?]
    E -->|Yes ✅| F[Continue login]
    E -->|No ❌| G[Reject - CSRF attack detected]
```

---

## 7. Token Refresh Flow

Access tokens expire after 15 minutes. When they do, the client's Axios interceptor automatically refreshes them.

```mermaid
sequenceDiagram
    participant C as React Client
    participant I as Axios Interceptor
    participant S as Express Server
    participant F as Firestore
    participant D as Redis

    C->>I: API request with expired accessToken
    I->>S: Try request
    S-->>I: 401 Unauthorized (token expired)
    
    I->>I: Is a refresh already in progress?
    Note over I: If yes, queue this request instead of duplicating refresh
    
    I->>S: POST /api/auth/refresh (cookie sent automatically)
    Note over S: Cookie contains httpOnly refreshToken
    
    S->>S: Hash the refresh token
    S->>F: Find token by hash in refreshTokens collection
    F-->>S: ✅ Token found, not revoked
    
    S->>S: Check expiresAt > now
    
    alt Token Expired
        S-->>I: 401 "Refresh token expired"
        I-->>C: Clear auth state, redirect to /login
    end
    
    S->>F: Revoke OLD refresh token
    
    S->>S: Generate NEW accessToken + NEW refreshToken
    Note over S: This is "rotation" — old token dies, new token lives
    
    S->>F: Store new refresh token hash
    S-->>I: 200 { accessToken }
    Note over I: Set-Cookie: new refreshToken
    
    I->>I: Store new accessToken in memory
    I->>C: Retry original request with new token
    C-->>C: ✅ Request succeeds
```

### Why rotate refresh tokens?

```mermaid
graph TD
    subgraph Without Rotation
        A[Token stolen] --> B[Attacker can refresh indefinitely]
        B --> C[Attacker stays logged in forever]
    end
    
    subgraph With Rotation
        D[Token stolen] --> E[Legitimate user refreshes]
        E --> F[Old token revoked, new token issued]
        F --> G[Attacker's stolen token is now useless]
        
        E --> H[If attacker uses token BEFORE user]
        H --> I[User's refresh fails + token theft detected]
        I --> J[All sessions revoked, user must re-login]
    end
```

### Token Reuse Detection

This is an advanced security feature:

```mermaid
sequenceDiagram
    participant A as Attacker
    participant U as Legitimate User
    participant S as Server

    A->>S: POST /auth/refresh using stolen token
    S->>S: Token valid → issue new tokens
    S-->>A: New tokens
    
    U->>S: POST /auth/refresh using now-stale token
    S->>S: Token hash exists but was revoked!
    S->>S: 🚨 Token reuse detected!
    S->>S: Increment user.refreshTokenVersion
    S->>F: Revoke ALL sessions for this user
    S-->>U: 401 "Session revoked — please login again"
    S-->>A: Works, but user is alerted when they try to use it
```

---

## 8. Logout Flow

```mermaid
sequenceDiagram
    actor U as User
    participant C as React Client
    participant S as Server
    
    U->>C: Click "Logout"
    C->>S: POST /api/auth/logout (with cookie + Authorization header)
    S->>S: Verify accessToken from header
    S->>S: Hash the refreshToken from cookie
    S->>F: Set revoked=true on the refresh token document
    S->>F: Decrement activeSessionCount
    S-->>C: Clear-Cookie: refreshToken
    S-->>C: 200 { message: "Logged out" }
    C->>C: Clear accessToken from memory
    C->>C: Clear user from AuthContext
    C-->>U: Redirect to /login
```

---

## 9. Password Reset Flow

```mermaid
sequenceDiagram
    actor U as User
    participant C as React Client
    participant S as Express Server
    participant F as Firestore
    participant E as Email (Resend)

    U->>C: Clicks "Forgot Password" on login page
    C->>S: POST /api/auth/forgot-password { email }
    
    S->>F: Find user by email
    
    alt User not found
        S-->>C: 200 "If account exists, email sent"
        Note over S: Same message regardless — prevents email enumeration
    end
    
    S->>S: crypto.randomBytes(32) → reset token
    S->>F: Store passwordResetToken (with hash)
    S->>E: Send email with link: /reset-password?token=<token>
    E-->>U: 📧 "Reset your password"
    
    S-->>C: 200 "If account exists, email sent"
    
    Note over U: User clicks link in email
    
    U->>C: Opens /reset-password?token=xxx
    C->>S: POST /api/auth/reset-password { token, newPassword }
    
    S->>F: Find reset token by hash
    F-->>S: ✅ Valid, not expired, not used
    
    S->>S: bcrypt.hash(newPassword, 12)
    S->>F: Update user.passwordHash
    S->>F: Increment user.refreshTokenVersion
    Note over S: This invalidates ALL existing sessions
    S->>F: Revoke ALL refresh tokens for user
    S->>F: Mark reset token as used
    S-->>C: 200 "Password reset successfully"
    
    C-->>U: Redirect to /login
    U->>C: Login with new password ✅
```

---

## 10. JWT Deep Dive

### What is a JWT?

A JSON Web Token is a self-contained token that looks like this:

```
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.          ← Header (base64)
eyJ1c2VySWQiOiI4YjNjIiwidG9rZW5WZXJzaW9uIjoxfQ.  ← Payload (base64)
[n8E3...signature]                                  ← Signature
```

### Anatomy of a PeerLink Access Token

```json
{
  "alg": "RS256",
  "typ": "JWT"
}
```

```json
{
  "userId": "8ebfdfc9-849d-43a2-ae91-cf3edc7d696a",
  "email": "user@example.com",
  "displayName": "John Doe",
  "tokenVersion": 3,
  "iat": 1712345678,
  "exp": 1712346578,
  "iss": "peerlink"
}
```

### RS256 Signing (Asymmetric)

```mermaid
graph LR
    subgraph Server["Backend Server"]
        PK[Private Key<br>Keep SECRET]
        S[JWT.sign(payload, privateKey)]
    end
    
    subgraph Client["Browser"]
        T[JWT Token]
    end
    
    subgraph AnyService["Any Microservice / API Gateway"]
        PubK[Public Key<br>Safe to share]
        V[JWT.verify(token, publicKey)]
    end
    
    PK --> S
    S --> T
    T --> V
    PubK --> V
    V --> R{Valid?}
    R -->|Yes| Allow[✅ Allow request]
    R -->|No| Deny[❌ Reject request]
```

**Why asymmetric (RS256) over symmetric (HS256)?**

| | HS256 (symmetric) | RS256 (asymmetric) |
|---|---|---|
| One secret signs AND verifies | ✅ Simple | ❌ Shared secret is a risk |
| Separate keys for sign/verify | ❌ Not possible | ✅ Private signs, public verifies |
| Microservice verification | ❌ Must trust the secret to every service | ✅ Public key is safe to distribute |
| Key rotation | ❌ All services need new secret simultaneously | ✅ Just rotate the key pair |
| **Our choice** | | ✅ **RS256** |

---

## 11. Security Measures

### Defense in Depth

```mermaid
graph TD
    subgraph Network Layer
        H[Helmet - Security Headers]
        C[CORS - Origin Whitelist]
        S[HTTPS only in production]
    end
    
    subgraph Application Layer
        V[Zod Input Validation]
        RL[Rate Limiting]
        RL2[Account Lockout]
    end
    
    subgraph Authentication Layer
        BC[bcrypt - Slow Hashing]
        RT[Refresh Token Rotation]
        TD[Token Theft Detection]
        SV[Session Versioning]
    end
    
    subgraph Client Layer
        HC[httpOnly Cookies]
        ML[Memory-only Access Token]
        X[XSS Protection]
    end
    
    H --> RL
    C --> RL2
    S --> BC
    V --> RT
    RL --> TD
    BC --> SV
    RT --> HC
    TD --> ML
    HC --> X
```

### Each measure explained

| # | Measure | What it does | How it works |
|---|---------|-------------|--------------|
| 1 | **bcrypt cost=12** | Makes password cracking expensive | ~250ms per hash — 1000 attempts = 4 minutes |
| 2 | **Account lockout** | Prevents brute force on specific accounts | 5 failed attempts → 15 minute lock |
| 3 | **Rate limiting** | Prevents brute force across accounts | 5 login attempts per 15 min per IP |
| 4 | **httpOnly cookies** | Protects refresh token from XSS | JavaScript cannot read httpOnly cookies |
| 5 | **Memory-only access token** | Protects access token from XSS | React state (not localStorage) = gone on tab close |
| 6 | **Refresh token rotation** | Limits stolen token window | Old token revoked on every refresh |
| 7 | **Token versioning** | Force logout all devices instantly | Increment `refreshTokenVersion` → all old JWTs rejected |
| 8 | **CSRF via state param** | Protects Google OAuth | Random state stored in Redis, verified on callback |
| 9 | **Zod validation** | Prevents injection attacks | Schema enforcement on every endpoint |
| 10 | **Helmet** | Security HTTP headers | Sets CSP, X-Frame-Options, etc. |
| 11 | **Password strength rules** | Ensures strong passwords | Regex: uppercase + lowercase + number + special + 8+ chars |
| 12 | **Same response for unknown email** | Prevents email enumeration | Forgot password returns same message whether email exists or not |

---

## 12. Session Management

### Session Limit (Max 10 Devices)

```mermaid
graph TD
    A[User logs in on device #11] --> B[Count active sessions]
    B --> C{Active sessions >= 10?}
    C -->|No ✅| D[Allow login]
    C -->|Yes ❌| E[Find session with oldest lastUsedAt]
    E --> F[Revoke that session]
    F --> D
```

### Session Versioning

Every user has a `refreshTokenVersion` field. This is included in the JWT payload:

```
JWT Payload: { userId, email, tokenVersion: 3 }
User Document: { refreshTokenVersion: 3 }
```

When the server verifies a JWT, it checks:

```
jwt.tokenVersion === user.refreshTokenVersion ? ✅ Allow : ❌ Reject
```

This means we can **instantly invalidate all sessions** by incrementing `refreshTokenVersion`. This happens when:

- User changes password
- Password reset is completed
- Token theft is detected
- Admin deactivates account

---

## 13. Rate Limiting

Rate limiting prevents abuse by limiting how many requests a client can make in a given time window.

### Configuration

| Endpoint | Window | Max requests | Why this limit |
|----------|--------|-------------|----------------|
| `/register` | 1 hour | 3 | Prevents mass account creation |
| `/login` | 15 min | 5 | Prevents brute force password guessing |
| `/forgot-password` | 1 hour | 3 | Prevents spamming someone's inbox |
| `/refresh` | 15 min | 10 | Prevents excessive token rotation |
| `/change-password` | 1 hour | 3 | Limits password change attempts |
| `/verify-email` | 1 hour | 5 | Prevents abuse of verification endpoint |
| Global | 1 min | 60 | General DDoS protection |

### How it works (with Redis)

```mermaid
sequenceDiagram
    participant C as Client
    participant R as Rate Limiter
    participant D as Redis

    C->>R: POST /api/auth/login
    R->>D: INCR ratelimit:login:203.0.113.42
    D-->>R: 1 (this is request #1)
    R->>D: EXPIRE ratelimit:login:203.0.113.42 900
    D-->>R: OK (will auto-delete after 15 min)
    R-->>C: ✅ Proceed to login handler

    C->>R: POST /api/auth/login (6th attempt)
    R->>D: INCR ratelimit:login:203.0.113.42
    D-->>R: 6 (> 5 max)
    R-->>C: 429 Too Many Requests
    R-->>C: Retry-After: 467 (seconds remaining in window)
```

In development (single server), rate limiting uses an **in-memory store**. In production (multiple servers), it uses Redis so that all servers share the same rate limit state.

---

## 14. File Map

```
server/src/
├── config/
│   ├── env.ts              # Environment variable validation (Zod)
│   ├── firebase.ts         # Firebase Admin SDK initialization
│   └── redis.ts            # Redis client (rate limiting, state store)
│
├── models/
│   ├── userModel.ts        # Firestore CRUD for users + email/google mappings
│   └── tokenModel.ts       # Firestore CRUD for refresh + verification tokens
│
├── services/
│   ├── authService.ts      # Core business logic (register, login, logout, etc.)
│   ├── tokenService.ts     # JWT issue, verify, rotate, blacklist
│   ├── googleService.ts    # Google OAuth URL generation + token verification
│   └── emailService.ts     # Resend integration for verification + reset emails
│
├── middleware/
│   ├── authenticate.ts     # JWT verification + user status check (Redis cached)
│   ├── rateLimiter.ts      # Per-endpoint rate limiting
│   └── validate.ts         # Generic Zod schema runner
│
├── routes/
│   └── authRoutes.ts       # 12 auth endpoints
│
├── validators/
│   └── authValidators.ts   # Zod schemas for every request body/query
│
├── types/
│   └── index.ts            # Shared TypeScript interfaces
│
├── utils/
│   ├── errors.ts           # Custom error classes (AppError, AuthError, etc.)
│   └── helpers.ts          # Utility functions (hash, encode, sanitize)
│
└── app.ts                  # Express entry point

client/src/
├── context/
│   └── AuthContext.tsx      # React context: user state, login, logout, refresh
├── hooks/
│   └── useAuth.ts          # Shortcut hook to access AuthContext
├── services/
│   ├── api.ts              # Axios instance with auto-refresh interceptor
│   └── authApi.ts          # Typed API functions for every auth endpoint
├── pages/
│   ├── Login.tsx           # Login form + Google button
│   ├── Register.tsx        # Registration form + Google button
│   └── AuthCallback.tsx    # Google OAuth redirect handler
├── components/
│   └── ProtectedRoute.tsx  # Redirects to /login if not authenticated
├── utils/
│   └── validators.ts       # Client-side input validation
└── index.css               # Auth page styles
```

---

## Summary

The PeerLink authentication system implements industry-standard security practices:

- **Passwords** are hashed with bcrypt (cost 12)
- **Tokens** use RS256 JWT with short-lived access tokens (15 min) and rotated refresh tokens (7 days)
- **Sessions** are capped at 10 devices with automatic eviction of least-recently-used sessions
- **Rate limiting** protects every endpoint against abuse
- **httpOnly cookies** protect refresh tokens from XSS
- **Memory-only storage** protects access tokens from XSS
- **Asymmetric signing** allows any microservice to verify tokens without the private key
- **Atomic Firestore transactions** guarantee email uniqueness at any scale
- **Redis** provides shared state for rate limiting, token blacklisting, and OAuth CSRF protection

This design scales to hundreds of thousands of users without architectural changes.
