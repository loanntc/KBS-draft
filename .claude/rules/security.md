# security.md

> **Scope:** All contributors — human engineers and AI coding agents.  
> **Violations:** Block merge. No exceptions without documented tech lead approval.

---

## Table of Contents

1. [No Hardcoded Secrets](#1-no-hardcoded-secrets)
2. [Input Validation](#2-input-validation)
3. [Authentication & Authorization](#3-authentication--authorization)
4. [Sensitive Data Handling](#4-sensitive-data-handling)
5. [Dependency Security](#5-dependency-security)
6. [OWASP Top 10 Reference](#6-owasp-top-10-reference)
7. [Principle of Least Privilege](#7-principle-of-least-privilege)
8. [Incident Response Checklist](#8-incident-response-checklist)

---

## 1. No Hardcoded Secrets

### Rule
Secrets never appear in source code, config files, comments, or commit history — ever. This includes development, staging, and test environments.

### What counts as a secret
- Database connection strings with credentials
- API keys, tokens, client secrets
- JWT signing secrets
- Private keys and certificates
- SMTP/email credentials
- Third-party service passwords
- Internal service-to-service tokens

### How to do it correctly

```bash
# ❌ BLOCKED — fails CI secret scan
DATABASE_URL = "postgres://admin:s3cr3t@prod-db:5432/app"
PAYMENT_API_KEY = "sk-live-abc123xyz"
JWT_SECRET = "my-super-secret-key"

# ✅ CORRECT — load from environment at runtime
DATABASE_URL = os.environ["DATABASE_URL"]
PAYMENT_API_KEY = os.environ["PAYMENT_API_KEY"]
JWT_SECRET = os.environ["JWT_SECRET"]
```

```typescript
// ✅ Centralize env access — one file reads process.env, everything else imports from it
// config/env.ts
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  PAYMENT_API_KEY: z.string().startsWith("sk-"),
  NODE_ENV: z.enum(["development", "staging", "production"]),
});

export const env = EnvSchema.parse(process.env); // fails fast on startup if misconfigured
```

### Local development
- Use `.env` files loaded via `dotenv`. Never commit them.
- `.env` must be in `.gitignore` — verify before first commit.
- Provide a `.env.example` with placeholder values and instructions for every required variable.
- Use a team secrets manager (Vault, AWS Secrets Manager, 1Password Secrets Automation) for shared dev secrets.

### CI enforcement
- CI runs `gitleaks` or `truffleHog` on every push and PR.
- A detected secret = **build fails immediately**. No bypass without tech lead sign-off.
- Pre-commit hook recommended: `gitleaks protect --staged`

### If a secret is accidentally committed
1. **Rotate the secret immediately** — before anything else.
2. Purge from history: `git filter-repo --path <file> --invert-paths`
3. Force-push all affected branches.
4. Notify affected service owners.
5. Document the incident in the security log.

> Rotation comes first. History cleanup second. Never the reverse.

### Checklist — before every commit
- [ ] No credentials, tokens, or API keys in any file
- [ ] No passwords in test fixtures, seed files, or migration scripts
- [ ] `.env` is in `.gitignore`
- [ ] New secrets are added to the team vault and `.env.example`
- [ ] CI secret scan passes

---

## 2. Input Validation

### Rule
Validate all inputs at every trust boundary. There are no "safe" internal services — validate everywhere.

### Trust boundaries that require validation
- HTTP API endpoints (user-facing and service-to-service)
- Message queue consumers
- Webhook receivers
- File upload handlers
- Database write operations (before insert/update)
- CLI tool arguments

### Schema validation

Use a schema library — never hand-roll validators for structured input.

```typescript
// ❌ Bad — manual, incomplete, error-prone
function validateTransfer(body: any) {
  if (!body.fromAccount || !body.toAccount) throw new Error("Missing fields");
  if (body.amount <= 0) throw new Error("Invalid amount");
}

// ✅ Good — declarative, complete, type-safe
import { z } from "zod";

const TransferSchema = z.object({
  fromAccount: z.string().length(10).regex(/^\d+$/, "Must be 10 digits"),
  toAccount: z.string().length(10).regex(/^\d+$/, "Must be 10 digits"),
  amount: z.number()
    .positive("Amount must be positive")
    .max(500_000_000, "Exceeds single transfer limit"),
  currency: z.enum(["VND", "USD"]),
  note: z.string().max(200).optional(),
});

type TransferInput = z.infer<typeof TransferSchema>;

app.post("/transfer", async (req, res) => {
  const result = TransferSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ errors: result.error.flatten() });
  }
  await transferService.execute(result.data);
});
```

```python
# Python — use Pydantic
from pydantic import BaseModel, Field, validator
from decimal import Decimal

class TransferInput(BaseModel):
    from_account: str = Field(regex=r'^\d{10}$')
    to_account: str = Field(regex=r'^\d{10}$')
    amount: Decimal = Field(gt=0, le=500_000_000)
    currency: Literal["VND", "USD"]
    note: Optional[str] = Field(max_length=200)

    @validator("to_account")
    def accounts_must_differ(cls, v, values):
        if "from_account" in values and v == values["from_account"]:
            raise ValueError("Cannot transfer to the same account")
        return v
```

### SQL injection prevention

```typescript
// ❌ Never — raw string concatenation
const query = `SELECT * FROM users WHERE email = '${email}'`;
await db.raw(query);

// ✅ Always — parameterized queries
const user = await db("users").where({ email }).first();

// ✅ Raw SQL when needed — still parameterized
const result = await db.raw(
  "SELECT * FROM orders WHERE user_id = ? AND status = ?",
  [userId, status]
);
```

### File upload validation

```typescript
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

async function validateUpload(file: Express.Multer.File): Promise<void> {
  // ✅ Check MIME type server-side using file magic bytes, not just extension
  const { fileTypeFromBuffer } = await import("file-type");
  const detected = await fileTypeFromBuffer(file.buffer);

  if (!detected || !ALLOWED_MIME_TYPES.includes(detected.mime)) {
    throw new ValidationError(`File type not allowed: ${detected?.mime ?? "unknown"}`);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(`File exceeds maximum size of 5MB`);
  }
}

// ✅ Store outside webroot — never serve directly from upload path
// Store to: object storage (S3, GCS) or /var/uploads (not /public/)
```

---

## 3. Authentication & Authorization

### The distinction

| Concept | Question it answers | Example |
|---|---|---|
| **Authentication** | Who are you? | Valid JWT with userId |
| **Authorization** | Are you allowed to do this? | Does userId own this resource? |

Being authenticated does not mean being authorized. Check both, every time.

### Authorization on every resource

```typescript
// ❌ Bad — only checks authentication
async function getPortfolio(req: AuthenticatedRequest) {
  return db.portfolios.findByPk(req.params.id); // any logged-in user can access any portfolio
}

// ✅ Good — checks ownership after authentication
async function getPortfolio(req: AuthenticatedRequest) {
  const portfolio = await db.portfolios.findByPk(req.params.id);

  if (!portfolio) {
    throw new NotFoundError("Portfolio not found");
  }

  if (portfolio.userId !== req.user.id && !req.user.hasRole("admin")) {
    throw new ForbiddenError("You do not have access to this portfolio");
  }

  return portfolio;
}
```

### JWT configuration

```typescript
// Access token — short-lived
const accessToken = jwt.sign(
  { userId: user.id, roles: user.roles },
  env.JWT_SECRET,
  { expiresIn: "15m", algorithm: "HS256" }
);

// Refresh token — longer-lived, stored server-side for revocation
const refreshToken = jwt.sign(
  { userId: user.id, tokenFamily: uuidv4() }, // token family for rotation detection
  env.JWT_REFRESH_SECRET,
  { expiresIn: "7d", algorithm: "HS256" }
);

// Store refresh tokens in DB — enables revocation
await db.refreshTokens.create({
  userId: user.id,
  token: hashToken(refreshToken), // store hash, not plaintext
  expiresAt: addDays(new Date(), 7),
});
```

### Token storage

| Storage | XSS Risk | CSRF Risk | Recommendation |
|---|---|---|---|
| `localStorage` | High | None | ❌ Avoid for sensitive tokens |
| `sessionStorage` | High | None | ❌ Avoid for sensitive tokens |
| `httpOnly` cookie | None | Medium | ✅ Use with CSRF protection |
| Memory (JS variable) | Low | None | ✅ For SPAs (lost on refresh) |

```typescript
// ✅ Set tokens as httpOnly cookies
res.cookie("access_token", accessToken, {
  httpOnly: true,
  secure: true,         // HTTPS only
  sameSite: "strict",   // CSRF protection
  maxAge: 15 * 60 * 1000, // 15 minutes in ms
});
```

### Role-based access control (RBAC)

```typescript
// Define roles and permissions centrally
const PERMISSIONS = {
  "orders:read":   ["user", "analyst", "admin"],
  "orders:write":  ["user", "admin"],
  "orders:delete": ["admin"],
  "reports:read":  ["analyst", "admin"],
} as const;

function requirePermission(permission: keyof typeof PERMISSIONS) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const allowed = PERMISSIONS[permission];
    const hasPermission = req.user.roles.some(role => allowed.includes(role));
    if (!hasPermission) throw new ForbiddenError(`Requires permission: ${permission}`);
    next();
  };
}

// Usage
router.delete("/orders/:id", requirePermission("orders:delete"), deleteOrderHandler);
```

---

## 4. Sensitive Data Handling

### What is sensitive data

- PII: full name + identifier together, email + sensitive context, national ID, phone number
- Financial: account numbers, card numbers, CVV, transaction history
- Credentials: passwords (even hashed), tokens, session IDs
- Health or legal data

### Never log sensitive data

```typescript
// ❌ Never
logger.info("User login", { email, password });
logger.info("Payment processed", { cardNumber, cvv, amount });
logger.debug("User data", { user }); // 'user' object may contain sensitive fields

// ✅ Safe — mask or omit sensitive fields
logger.info("User login attempt", {
  userId,
  email: maskEmail(email),   // "l***@example.com"
  success: true,
});

logger.info("Payment processed", {
  userId,
  orderId,
  maskedCard: `**** **** **** ${last4}`,
  amount,
  currency,
});

// ✅ Helper: strip sensitive fields before logging
function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE_KEYS = ["password", "token", "secret", "cvv", "cardNumber", "nationalId"];
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !SENSITIVE_KEYS.includes(key))
  );
}
```

### Password handling

```typescript
import bcrypt from "bcrypt";

const SALT_ROUNDS = 12; // never below 10

// ✅ Hash before storing
async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

// ✅ Constant-time comparison — prevents timing attacks
async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ❌ Never
const hash = md5(password);         // weak
const hash = sha256(password);      // no salt, not a password hash
if (storedHash === hash(input)) {}  // timing attack risk
```

### Data at rest and in transit

- All production databases: encrypted at rest (AES-256 minimum).
- All HTTP traffic: TLS 1.2 minimum, TLS 1.3 preferred. No plaintext HTTP in production.
- Sensitive fields in DB (national ID, card data): encrypt at the application layer in addition to disk encryption.
- Encryption keys: stored in secrets manager, never in code or DB.

---

## 5. Dependency Security

### Before adding a dependency

Ask these questions:
1. Is this actively maintained? (last commit < 6 months)
2. How many open CVEs does it have?
3. Does it have a large, well-known maintainer base or is it a single-person project?
4. Do I actually need this, or can I implement it in < 50 lines?

```bash
# Check before installing
npm info <package> | grep -E "version|maintainers|last publish"
npx is-my-node-vulnerable  # quick check
```

### Ongoing audit process

```bash
# Run in CI on every PR
npm audit --audit-level=high
pip-audit --require-hashes  # Python

# Do not suppress findings without a documented decision in the PR
```

**Finding severity response:**

| Severity | Required action | Timeline |
|---|---|---|
| Critical | Fix immediately or remove dependency | Same sprint |
| High | Fix or document mitigation | Within 2 sprints |
| Medium | Track in backlog | Quarterly review |
| Low | Review in quarterly cleanup | Best effort |

### Version pinning

```json
// package.json — always use exact versions in production
{
  "dependencies": {
    "zod": "3.22.4",        // ✅ pinned
    "express": "^4.18.2"    // ❌ range — can silently upgrade
  }
}
```

```bash
# Commit lock files — always
git add package-lock.json
git add poetry.lock
```

### Removing unused dependencies

```bash
# Quarterly cleanup
npx depcheck           # find unused packages
pip-autoremove         # Python

# Remove before the quarterly release cycle
```

---

## 6. OWASP Top 10 Reference

Every engineer must know these exist. For every feature touching these surfaces, run the checklist.

| Risk | Our control | How to verify |
|---|---|---|
| **A01 Broken Access Control** | Ownership check on every resource fetch (§3) | Code review — look for missing `.userId` check |
| **A02 Cryptographic Failures** | TLS everywhere, bcrypt for passwords, encrypted PII at rest (§4) | Config review in CI |
| **A03 Injection** | Parameterized queries, schema validation on all inputs (§2) | No `.raw()` without `?` placeholders |
| **A04 Insecure Design** | Mini design doc for all changes > 0.5 days | PR template requirement |
| **A05 Security Misconfiguration** | No default credentials, secrets manager, reviewed env config | Config checklist in deployment runbook |
| **A06 Vulnerable Components** | `npm audit` / `pip-audit` in CI, pinned versions (§5) | CI gate |
| **A07 Auth Failures** | Short-lived JWT, httpOnly cookies, RBAC (§3) | Auth test suite |
| **A08 Data Integrity Failures** | Signed tokens, dependency pinning, CI integrity checks | Automated |
| **A09 Logging Failures** | Structured logging, no PII in logs, correlation IDs | Log review in QA |
| **A10 SSRF** | Allowlist outbound domains, validate URLs before fetch | Code review |

---

## 7. Principle of Least Privilege

### Application-level

```typescript
// ❌ Bad — service can read/write/delete everything
const dbClient = createClient({ user: "root", password: env.DB_ROOT_PASSWORD });

// ✅ Good — scoped DB user per service
const orderDbClient = createClient({
  user: "order_service",          // can only access orders schema
  password: env.ORDER_DB_PASSWORD,
});
```

### Infrastructure-level

- Each service has its own DB user with permissions limited to the tables it owns.
- IAM roles: services get only the AWS/GCP permissions they need — no `*` actions in production policies.
- API tokens are scoped to the minimum required operations.
- Admin access to production DBs requires MFA and is time-limited.

### Team-level

- Developers do not have direct write access to the production database by default.
- Production access is granted on a per-incident basis and revoked after.
- All production access is logged and auditable.

---

## 8. Incident Response Checklist

If a security incident is suspected (secret exposure, unauthorized access, data breach):

```
1. [ ] Alert the tech lead and security contact immediately
2. [ ] Do NOT attempt to cover up or self-remediate in silence
3. [ ] Rotate any potentially exposed credentials FIRST
4. [ ] Preserve logs — do not delete or modify anything
5. [ ] Identify the blast radius: what data, which users, which services
6. [ ] Contain: revoke tokens, disable affected accounts if needed
7. [ ] Document a timeline of what happened and when
8. [ ] Notify affected parties per legal/compliance requirements
9. [ ] Post-mortem: root cause, what failed, what we're changing
```

> Speed of rotation > speed of diagnosis. Rotate first, investigate second.

---

*Owner: Tech Lead | Version: 1.0 — April 2026*
