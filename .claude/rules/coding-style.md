# coding-style.md

> **Scope:** All contributors — human engineers and AI coding agents.  
> **Goal:** Code that any team member can read, understand, and modify confidently — today and 2 years from now.

---

## Table of Contents

1. [Immutability](#1-immutability)
2. [File & Module Organization](#2-file--module-organization)
3. [Naming Conventions](#3-naming-conventions)
4. [Functions](#4-functions)
5. [Error Handling](#5-error-handling)
6. [Constants & Magic Values](#6-constants--magic-values)
7. [Comments & Documentation](#7-comments--documentation)
8. [TypeScript / Python Specifics](#8-typescript--python-specifics)
9. [Code Smell Reference](#9-code-smell-reference)

---

## 1. Immutability

### Rule
Prefer immutable data. Mutate in-place only when you have a documented, performance-justified reason.

### Why
Mutable state is the leading cause of bugs that are hard to reproduce. Immutable transformations are predictable, testable, and safe to compose.

### TypeScript

```typescript
// ❌ Bad — mutates the input
function applyDiscount(order: Order, pct: number): Order {
  order.total = order.total * (1 - pct);   // caller's object is changed
  order.discountApplied = true;
  return order;
}

// ✅ Good — returns a new object
function applyDiscount(order: Order, pct: number): Order {
  return {
    ...order,
    total: order.total * (1 - pct),
    discountApplied: true,
  };
}

// ❌ Bad — mutates array
function addItem(cart: CartItem[], item: CartItem): CartItem[] {
  cart.push(item);
  return cart;
}

// ✅ Good — returns new array
function addItem(cart: CartItem[], item: CartItem): CartItem[] {
  return [...cart, item];
}

// ✅ For complex state updates — use immer
import { produce } from "immer";

const nextState = produce(state, draft => {
  draft.orders[orderId].status = "shipped"; // safe mutation on a draft
});
```

### Python

```python
# ❌ Bad — mutates input list
def normalize_tags(tags: list[str]) -> list[str]:
    for i, tag in enumerate(tags):
        tags[i] = tag.lower().strip()
    return tags

# ✅ Good — returns new list
def normalize_tags(tags: list[str]) -> list[str]:
    return [tag.lower().strip() for tag in tags]

# ❌ Bad — mutates dict
def apply_fee(order: dict, fee: Decimal) -> dict:
    order["total"] += fee
    return order

# ✅ Good — returns new dict
def apply_fee(order: dict, fee: Decimal) -> dict:
    return {**order, "total": order["total"] + fee}
```

### When mutation is acceptable
- Performance-critical loops with profiling data to justify it (document it).
- In-place sort when the caller explicitly owns the data and documents the mutation.
- Builder pattern where the object is not yet "published" to outside scope.

When you choose mutation: **add a comment explaining why**.

---

## 2. File & Module Organization

### Rule
Every file has one clear responsibility. If you need "and" to describe what a file does, split it.

### Recommended structure

```
src/
  features/
    orders/
      orders.controller.ts     # HTTP layer: parse request, call service, return response
      orders.service.ts        # Business logic: orchestration, rules, transformations
      orders.repository.ts     # DB layer: queries only, no business logic
      orders.types.ts          # Types, interfaces, enums for this domain
      orders.errors.ts         # Domain-specific error classes
      orders.test.ts           # Unit tests (co-located with the module)
      orders.integration.ts    # Integration tests
    portfolio/
      ...
  shared/
    errors/
      app-error.ts             # Base error class
      http-errors.ts           # HTTP-specific errors (NotFound, Forbidden...)
    utils/
      date.ts                  # Pure date utility functions
      currency.ts              # Currency formatting, conversion
      mask.ts                  # PII masking helpers
    middleware/
      auth.middleware.ts
      correlation-id.middleware.ts
      error-handler.middleware.ts
    validation/
      schemas/                 # Reusable Zod/Pydantic schemas
  config/
    env.ts                     # THE ONLY FILE that reads process.env
    database.ts                # DB connection config
    logger.ts                  # Logger instance and configuration
  app.ts                       # Express/Fastify app setup
  server.ts                    # Server entry point
```

### Rules

**File length:** Max 300 lines. Over that: split by responsibility.

**One export per file** for domain modules (controllers, services, repositories). Utility files may export multiple pure functions.

**No circular imports.** If module A imports from B, and B imports from A, you have a design problem. Extract the shared logic into a third module.

**`config/env.ts` is the only file that reads `process.env`.** Every other file imports from `config/env.ts`. This ensures env validation happens once at startup, and invalid config fails fast.

```typescript
// ❌ Bad — scattered env access
// orders.service.ts
const apiKey = process.env.PAYMENT_API_KEY; // no validation, no type safety

// ✅ Good — centralized, validated
// config/env.ts
export const env = EnvSchema.parse(process.env); // validated on startup

// orders.service.ts
import { env } from "@/config/env";
const apiKey = env.PAYMENT_API_KEY; // typed and guaranteed non-null
```

**No barrel re-exports** that obscure the source of a symbol:

```typescript
// ❌ Bad — index.ts re-exports everything, hiding where things live
export * from "./orders.service";
export * from "./orders.controller";

// ✅ Good — import directly from the source
import { OrderService } from "@/features/orders/orders.service";
```

---

## 3. Naming Conventions

### Casing reference

| Thing | Convention | Example |
|---|---|---|
| Variables | `camelCase` | `orderTotal`, `isActive` |
| Functions | `camelCase` (verb) | `calculateDiscount`, `fetchPortfolio` |
| Classes | `PascalCase` | `OrderService`, `PortfolioRepository` |
| Interfaces / Types | `PascalCase` | `OrderSummary`, `TransferInput` |
| Enums | `PascalCase` (name), `UPPER_SNAKE` (values) | `OrderStatus.PENDING` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT`, `ONE_DAY_MS` |
| Files | `kebab-case` | `order-service.ts`, `portfolio-utils.ts` |
| DB tables | `snake_case` (plural) | `orders`, `user_portfolios` |
| DB columns | `snake_case` | `created_at`, `user_id` |
| Env vars | `UPPER_SNAKE_CASE` | `DATABASE_URL`, `JWT_SECRET` |
| React components | `PascalCase` | `OrderCard`, `PortfolioSummary` |

### Name quality rules

**Names must communicate intent.** If a comment is needed to explain a name, rename it.

```typescript
// ❌ Bad — what is d? what is f?
function proc(d: any, f: boolean): any { ... }

// ✅ Good
function processOrderForFulfillment(order: Order, forceOverride: boolean): FulfillmentResult { ... }
```

**No single-letter names** except loop counters (`i`, `j`, `k`) in short, obvious indexed loops.

**Boolean names use a predicate prefix:**

```typescript
// ❌ Bad
let active: boolean;
let permission: boolean;
let overdraft: boolean;

// ✅ Good
let isActive: boolean;
let hasPermission: boolean;
let canOverdraft: boolean;
let shouldRetry: boolean;
let wasProcessed: boolean;
```

**Avoid noise words** that add length without meaning:

```typescript
// ❌ Noise
const orderData = { ... };
const orderObject = { ... };
const orderInfo = { ... };
const theOrder = { ... };

// ✅ Direct
const order = { ... };
```

**Avoid abbreviations** unless universally understood in the domain:

```typescript
// ❌ Cryptic
const usr = getUsr(usrId);
const amt = calcAmt(ord);
const cfg = loadCfg();

// ✅ Clear
const user = getUser(userId);
const amount = calculateAmount(order);
const config = loadConfig();

// ✅ Acceptable abbreviations (domain-standard)
const dto = mapToDTO(entity);   // DTO is universal
const i18n = loadI18n();        // i18n is universal
const id = user.id;             // id is universal
```

---

## 4. Functions

### Single responsibility

One function, one job. If a function needs "and" in its description, split it.

```typescript
// ❌ Bad — does too many things
async function processUserRegistration(data: any) {
  // validates input
  if (!data.email || !data.password) throw new Error("Missing fields");
  // hashes password
  const hashed = await bcrypt.hash(data.password, 12);
  // saves to DB
  const user = await db.users.create({ email: data.email, password: hashed });
  // sends welcome email
  await emailService.sendWelcome(user.email);
  // creates default portfolio
  await portfolioService.createDefault(user.id);
  return user;
}

// ✅ Good — each function does one thing
async function registerUser(input: RegisterInput): Promise<User> {
  const validated = RegisterSchema.parse(input);
  const hashed = await hashPassword(validated.password);
  const user = await userRepository.create({ email: validated.email, password: hashed });
  await eventBus.publish("user.registered", { userId: user.id });
  return user;
}

// Downstream handlers respond to the event independently
onEvent("user.registered", async ({ userId }) => {
  await emailService.sendWelcome(userId);
  await portfolioService.createDefault(userId);
});
```

### Size limits

| Guideline | Action |
|---|---|
| Under 20 lines | Ideal |
| 20–30 lines | Acceptable |
| 30–50 lines | Review — can it be split? |
| Over 50 lines | **Mandatory refactor** |

### Parameters

```typescript
// ❌ Bad — too many positional params (hard to call correctly, breaks on reorder)
function createOrder(userId, productId, qty, discount, addr, note, priority) { ... }

// ✅ Good — options object
function createOrder(options: CreateOrderOptions): Promise<Order> { ... }

interface CreateOrderOptions {
  userId: string;
  productId: string;
  quantity: number;
  discountCode?: string;
  shippingAddress: Address;
  note?: string;
  priority?: "standard" | "express";
}
```

**Rule:** More than 3 parameters → use an options object with a named interface.

### Pure functions preferred

```typescript
// ❌ Impure — depends on external state
function getOrderFee(order: Order): number {
  const rate = globalConfig.feeRate;  // external dependency
  return order.total * rate;
}

// ✅ Pure — all inputs explicit, no side effects
function getOrderFee(order: Order, feeRate: number): number {
  return order.total * feeRate;
}
```

A pure function:
- Returns the same output for the same inputs, always
- Has no side effects (no DB calls, no logging, no mutations of external state)
- Is trivial to unit test

Extract IO (DB, HTTP, logging) into the outermost layer. Keep business logic pure.

---

## 5. Error Handling

### Rule
Never swallow errors silently. Every `catch` block must do something meaningful.

```typescript
// ❌ Bad — silent failure
try {
  await syncPortfolio(userId);
} catch (e) {}

// ❌ Bad — logs but loses the error
try {
  await syncPortfolio(userId);
} catch (e) {
  console.log("error occurred");
}

// ✅ Good — logs with context, rethrows as domain error
try {
  await syncPortfolio(userId);
} catch (error) {
  logger.error("portfolio.sync.failed", {
    error,
    userId,
    correlationId: req.correlationId,
  });
  throw new SyncFailedError("Portfolio sync failed", { cause: error });
}
```

### Typed error classes

```typescript
// base-error.ts
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// domain errors
export class OrderNotFoundError extends AppError {
  constructor(orderId: string) {
    super(`Order ${orderId} not found`, "ORDER_NOT_FOUND", 404);
  }
}

export class InsufficientFundsError extends AppError {
  constructor(available: number, required: number) {
    super(
      `Insufficient funds: available ${available}, required ${required}`,
      "INSUFFICIENT_FUNDS",
      422
    );
  }
}
```

### Never expose internal errors to users

```typescript
// ❌ Bad — exposes DB internals
app.use((error: Error, req, res, next) => {
  res.status(500).json({ message: error.message }); // "column 'xyz' does not exist"
});

// ✅ Good — maps to safe messages
app.use((error: Error, req, res, next) => {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      code: error.code,
      message: error.message,   // domain errors are safe to expose
    });
  }

  logger.error("unhandled.error", { error, path: req.path });
  res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred", // generic — never leak internals
  });
});
```

---

## 6. Constants & Magic Values

### Rule
No unexplained literals. Named constants are mandatory for all non-trivial values.

```typescript
// ❌ Bad — magic numbers, zero context
if (status === 3) { ... }
setTimeout(fn, 86400000);
if (retries > 5) { ... }
const fee = amount * 0.0035;

// ✅ Good — named, self-documenting
const ORDER_STATUS = {
  PENDING: 1,
  PROCESSING: 2,
  SHIPPED: 3,
  DELIVERED: 4,
  CANCELLED: 5,
} as const;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RETRY_ATTEMPTS = 5;
const PAYMENT_FEE_RATE = 0.0035; // 0.35% per transaction — source: payment provider contract
```

### Where to define constants

```
config/
  constants.ts     # App-wide constants
features/
  orders/
    orders.constants.ts  # Domain-specific constants
```

**Never define the same constant in multiple files.** Import from the single source of truth.

---

## 7. Comments & Documentation

### When to comment

```typescript
// ❌ Bad — comments that describe what the code does (the code already does that)
// Multiply total by discount rate
const discounted = total * rate;

// ❌ Bad — commented-out code
// const oldLogic = calculate(x, y);
const result = calculateV2(x, y);

// ✅ Good — comments that explain WHY, not WHAT
// VND has no decimal places per Vietnamese banking standard (Circular 19/2018)
// Using integer arithmetic to avoid floating-point rounding errors
const totalVND = Math.round(amountUSD * exchangeRate);

// ✅ Good — comments that document a non-obvious business rule
// Gold-tier accounts are exempt from the minimum order value rule
// per the Prime Club agreement (see: product spec KBSV-PRD-041)
if (account.tier !== "gold") {
  enforceMinimumOrderValue(order);
}

// ✅ Good — TODO with a ticket reference (so it can be tracked and closed)
// TODO(KBSV-299): Replace polling with websocket once market data service supports it
```

### JSDoc / docstrings for public APIs

```typescript
/**
 * Calculates the net asset value of a portfolio at a given point in time.
 *
 * @param portfolioId - The portfolio to value
 * @param asOf - Valuation date. Defaults to current date if not provided.
 * @returns NAV in VND, rounded to the nearest dong
 * @throws {PortfolioNotFoundError} if the portfolio does not exist
 * @throws {MarketDataUnavailableError} if price data is missing for any holding
 */
async function getPortfolioNAV(portfolioId: string, asOf?: Date): Promise<number> { ... }
```

### Prohibited
- Commented-out code — delete it. Git history preserves the old version.
- Auto-generated boilerplate comments (`// Constructor`, `// Get user`).
- Lie comments — comments that say something different from what the code does.

---

## 8. TypeScript / Python Specifics

### TypeScript

**No `any` without a comment.**

```typescript
// ❌ Bad
function processEvent(event: any) { ... }

// ✅ Better — use unknown and narrow
function processEvent(event: unknown) {
  if (!isOrderEvent(event)) throw new TypeError("Unexpected event shape");
  // event is now OrderEvent
}

// ✅ Acceptable — with documented reason
// External webhook payload shape varies — validated by Zod before use
function handleWebhook(payload: any) {
  const validated = WebhookSchema.parse(payload);
}
```

**Use strict mode.**

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

**Prefer `interface` for object shapes, `type` for unions and intersections.**

```typescript
interface User { id: string; email: string; }         // ✅ object shape
type UserOrAdmin = User | AdminUser;                   // ✅ union
type PartialUser = Partial<User>;                      // ✅ utility type
```

### Python

**Use type hints everywhere.**

```python
# ❌ Bad
def process_order(order, discount):
    ...

# ✅ Good
def process_order(order: Order, discount: Decimal) -> OrderResult:
    ...
```

**Use dataclasses or Pydantic models — not raw dicts for structured data.**

```python
# ❌ Bad — dict with no schema
def create_order(data: dict) -> dict:
    ...

# ✅ Good — typed model
from pydantic import BaseModel

class CreateOrderInput(BaseModel):
    user_id: str
    product_id: str
    quantity: int

def create_order(data: CreateOrderInput) -> Order:
    ...
```

**Use `pathlib.Path` over `os.path`.**
**Use f-strings over `.format()` or `%` formatting.**
**Use `logging` module — never `print` in production code.**

---

## 9. Code Smell Reference

Quick reference for things that require immediate attention in code review:

| Smell | Signal | Action |
|---|---|---|
| Long method | > 50 lines | Extract sub-functions |
| Long parameter list | > 3 params | Options object |
| Duplicated code | Same logic in 2+ places | Extract to shared utility |
| Deep nesting | > 3 levels of `if`/`for` | Early return, extract function |
| God class | One class that does everything | Split by responsibility |
| Feature envy | Function accesses another object's data more than its own | Move the function |
| Magic numbers | Unexplained literals | Named constant |
| Dead code | Unreachable or commented-out code | Delete it |
| Inconsistent abstraction | Mix of high-level and low-level operations in one function | Separate layers |
| Boolean flag argument | `doThing(true)` — what does `true` mean? | Named options object or separate functions |

---

*Owner: Tech Lead | Version: 1.0 — April 2026*
