# testing.md

> **Scope:** All contributors — human engineers and AI coding agents.  
> **Rule:** Tests are not optional. Untested business logic does not merge.

---

## Table of Contents

1. [TDD Workflow](#1-tdd-workflow)
2. [Coverage Requirements](#2-coverage-requirements)
3. [Test Structure & Naming](#3-test-structure--naming)
4. [What Makes a Good Test](#4-what-makes-a-good-test)
5. [Test Data — Factories & Builders](#5-test-data--factories--builders)
6. [Mocking Strategy](#6-mocking-strategy)
7. [Test Types & When to Use Each](#7-test-types--when-to-use-each)
8. [Testing Async Code](#8-testing-async-code)
9. [Testing Error Paths](#9-testing-error-paths)
10. [CI Test Gates](#10-ci-test-gates)
11. [Anti-Patterns Reference](#11-anti-patterns-reference)

---

## 1. TDD Workflow

### The cycle

```
1. RED   — Write a test that describes the expected behavior. Run it. It must fail.
2. GREEN — Write the minimum code to make the test pass. No more.
3. REFACTOR — Clean up the code without breaking the test.
4. Repeat.
```

### When TDD is mandatory
- All business logic (calculations, validations, state transitions, rules)
- All edge cases identified during design
- All bug fixes — write a failing test that reproduces the bug first, then fix it

### When TDD is optional (but still recommended)
- Boilerplate CRUD endpoints with no business logic
- Pure infrastructure wiring (DB connection setup, middleware)
- Exploratory code that will be replaced

### Practical example

```typescript
// Step 1 — RED: write the test first
describe("applyOrderDiscount", () => {
  it("applies 10% discount to gold-tier orders above 1,000,000 VND", () => {
    const order = buildOrder({ tier: "gold", total: 2_000_000 });
    const result = applyOrderDiscount(order);
    expect(result.discountedTotal).toBe(1_800_000);
    expect(result.discountRate).toBe(0.1);
  });
});

// Run it — it fails because applyOrderDiscount doesn't exist yet. Good.

// Step 2 — GREEN: write minimum code to pass
function applyOrderDiscount(order: Order): DiscountResult {
  if (order.tier === "gold" && order.total > 1_000_000) {
    return {
      ...order,
      discountRate: 0.1,
      discountedTotal: order.total * 0.9,
    };
  }
  return { ...order, discountRate: 0, discountedTotal: order.total };
}

// Run it — it passes. Now refactor if needed.
```

---

## 2. Coverage Requirements

### Minimums by layer

| Layer | Minimum | Rationale |
|---|---|---|
| Business logic / services | **80%** | Hard CI gate — fails below this |
| Utility / helper functions | **90%** | Pure functions — easy to test fully |
| Controllers / HTTP layer | **60%** | Integration tests cover the rest |
| Repository / DB layer | **50%** | Integration/E2E tests carry the weight |
| Configuration / setup files | Excluded | Not meaningful to unit test |

### How to measure

```bash
# TypeScript — Jest
npx jest --coverage --coverageThresholds='{"global":{"lines":80}}'

# Python
pytest --cov=src --cov-fail-under=80 --cov-report=term-missing
```

### Coverage philosophy

> 80% with meaningful assertions beats 100% with assertions that only verify the code runs.

Coverage is a **floor**, not a target. A test that does `expect(result).toBeDefined()` adds coverage but zero confidence. The question is: *if this code breaks, will a test tell us?*

### Tracking coverage over time

- Coverage must not decrease on any PR. A PR that drops coverage is blocked.
- Coverage reports are uploaded to CI artifacts on every build.
- A PR comment showing before/after coverage is auto-generated.

---

## 3. Test Structure & Naming

### File location

```
features/
  orders/
    orders.service.ts
    orders.service.test.ts      # co-located unit tests
    orders.integration.test.ts  # integration tests
e2e/
  order-flow.e2e.test.ts        # end-to-end tests in a separate directory
```

### Naming pattern

```typescript
// Format: it('does X when Y') or it('returns X when Y given Z')
// Read as a specification — should be meaningful on its own

// ✅ Good names
it("applies 10% discount to gold-tier orders above 1,000,000 VND")
it("throws InsufficientFundsError when account balance is below transfer amount")
it("returns empty array when user has no open orders")
it("sends confirmation email after successful order placement")

// ❌ Bad names
it("works correctly")
it("test 1")
it("handles the edge case")
it("calculateDiscount")  // just the function name
```

### Describe blocks for grouping

```typescript
describe("OrderService", () => {

  describe("createOrder", () => {
    it("creates an order with the correct initial status", async () => { ... });
    it("deducts the amount from the user balance", async () => { ... });
    it("throws ProductNotFoundError when productId is invalid", async () => { ... });
  });

  describe("cancelOrder", () => {
    it("cancels a pending order", async () => { ... });
    it("throws InvalidStateError when order is already shipped", async () => { ... });
    it("refunds the amount to user balance on cancellation", async () => { ... });
  });

});
```

### AAA pattern — Arrange, Act, Assert

```typescript
it("returns the correct discounted total for a gold-tier order", () => {
  // Arrange
  const order = buildOrder({ tier: "gold", total: 2_000_000 });
  const service = new OrderService(mockRepository);

  // Act
  const result = service.applyDiscount(order);

  // Assert
  expect(result.discountedTotal).toBe(1_800_000);
  expect(result.appliedDiscount).toBe(200_000);
});
```

---

## 4. What Makes a Good Test

### Tests behavior, not implementation

```typescript
// ❌ Bad — tests implementation (brittle, breaks on refactor)
it("calls calculateDiscount with correct arguments", () => {
  const spy = jest.spyOn(service, "calculateDiscount");
  service.processOrder(order);
  expect(spy).toHaveBeenCalledWith(order.total, 0.1);
  // This test breaks if we rename calculateDiscount, even if behavior is correct
});

// ✅ Good — tests observable behavior
it("applies 10% discount to gold-tier orders", () => {
  const order = buildOrder({ tier: "gold", total: 1_000_000 });
  const result = service.processOrder(order);
  expect(result.discountedTotal).toBe(900_000);
  // This test survives any refactor as long as behavior is correct
});
```

### One logical assertion per test

```typescript
// ❌ Bad — multiple behaviors in one test
it("processes the order", async () => {
  const result = await service.processOrder(order);
  expect(result.status).toBe("processing");
  expect(result.fee).toBe(3500);
  expect(result.estimatedDelivery).toBeDefined();
  expect(mockEmailService.send).toHaveBeenCalled();
  expect(mockInventory.reserve).toHaveBeenCalledWith(order.productId, order.qty);
  // If this fails, which behavior is broken?
});

// ✅ Good — each behavior has its own test
it("sets status to processing after order creation", async () => { ... });
it("calculates the correct transaction fee", async () => { ... });
it("sends a confirmation email to the user", async () => { ... });
it("reserves inventory for the ordered product", async () => { ... });
```

### Tests are independent

- No test depends on another test's execution or side effects.
- Each test sets up its own state.
- Tests can run in any order and still pass.

```typescript
// ❌ Bad — depends on global state modified by previous test
let sharedOrder: Order;
it("creates an order", async () => {
  sharedOrder = await service.create(input); // sets shared state
});
it("cancels the order", async () => {
  await service.cancel(sharedOrder.id);      // depends on previous test
});

// ✅ Good — each test owns its state
it("cancels a pending order", async () => {
  const order = await orderFactory.createPending(); // self-contained setup
  await service.cancel(order.id);
  const updated = await service.findById(order.id);
  expect(updated.status).toBe("cancelled");
});
```

---

## 5. Test Data — Factories & Builders

### Rule
Never repeat raw object literals across test files. Use factories.

```typescript
// ❌ Bad — duplicated across 15 test files, breaks everywhere when shape changes
const order = {
  id: "ord-001",
  userId: "usr-001",
  productId: "prd-001",
  total: 1_000_000,
  status: "pending",
  createdAt: new Date(),
};

// ✅ Good — factory with sensible defaults, overridable
// test/factories/order.factory.ts
export function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: overrides.id ?? `ord-${ulid()}`,
    userId: overrides.userId ?? `usr-${ulid()}`,
    productId: overrides.productId ?? `prd-${ulid()}`,
    total: overrides.total ?? 1_000_000,
    status: overrides.status ?? "pending",
    tier: overrides.tier ?? "standard",
    createdAt: overrides.createdAt ?? new Date(),
    ...overrides,
  };
}

// Usage — override only what the test cares about
const goldOrder = buildOrder({ tier: "gold", total: 5_000_000 });
const cancelledOrder = buildOrder({ status: "cancelled" });
```

### Database factories (integration tests)

```typescript
// test/factories/order.db-factory.ts
export async function createOrderInDb(overrides: Partial<Order> = {}): Promise<Order> {
  const user = await createUserInDb();
  return db.orders.create({
    userId: user.id,
    ...buildOrder(overrides),
  });
}
```

### Factories location

```
test/
  factories/
    order.factory.ts
    user.factory.ts
    portfolio.factory.ts
  helpers/
    db-cleaner.ts      # truncate tables between integration tests
    mock-server.ts     # mock HTTP servers for external services
```

---

## 6. Mocking Strategy

### What to mock vs. what to use real

| Dependency | Strategy | Reason |
|---|---|---|
| External HTTP APIs | Mock (MSW or Jest mock) | Prevent real calls, control responses |
| Database | Real in integration tests, mock in unit tests | Test real SQL in integration layer |
| Email / SMS service | Mock always | Never send real messages in tests |
| Time (`Date.now()`) | Mock in unit tests | Make time-dependent logic deterministic |
| Logger | Spy or mock | Verify log calls without output noise |
| Internal services (same codebase) | Mock in unit tests, real in integration | Isolate the unit under test |

### Mocking HTTP — use MSW

```typescript
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const server = setupServer(
  http.post("https://payment-api.example.com/charge", () => {
    return HttpResponse.json({ status: "success", transactionId: "txn-123" });
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it("processes a successful payment", async () => {
  const result = await paymentService.charge({ amount: 100_000, userId: "usr-001" });
  expect(result.status).toBe("success");
});

// Test the failure path by overriding the handler
it("throws PaymentFailedError when gateway returns 422", async () => {
  server.use(
    http.post("https://payment-api.example.com/charge", () => {
      return HttpResponse.json({ error: "card_declined" }, { status: 422 });
    }),
  );
  await expect(paymentService.charge({ amount: 100_000, userId: "usr-001" }))
    .rejects.toThrow(PaymentFailedError);
});
```

### Mocking time

```typescript
describe("token expiry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => jest.useRealTimers());

  it("rejects tokens older than 15 minutes", () => {
    const token = generateToken({ issuedAt: new Date("2026-01-01T00:00:00Z") });
    jest.advanceTimersByTime(16 * 60 * 1000); // advance 16 minutes
    expect(() => verifyToken(token)).toThrow(TokenExpiredError);
  });
});
```

---

## 7. Test Types & When to Use Each

### Unit tests

**Scope:** One function or class in isolation. All dependencies mocked.  
**Speed:** Milliseconds.  
**Run on:** Every commit (pre-push hook + CI).

```typescript
// Pure function — no mocking needed
it("formats currency to VND with thousand separators", () => {
  expect(formatVND(1_500_000)).toBe("1.500.000 ₫");
});

// Service with mocked dependencies
it("throws OrderNotFoundError when order does not exist", async () => {
  mockRepository.findById.mockResolvedValue(null);
  await expect(service.getOrder("ord-999")).rejects.toThrow(OrderNotFoundError);
});
```

### Integration tests

**Scope:** A module + its real dependencies (real DB, real Redis).  
**Speed:** Seconds.  
**Run on:** Every PR push.

```typescript
// Tests the full repository → DB roundtrip
it("persists an order and retrieves it with correct status", async () => {
  const created = await orderRepository.create(buildOrder({ status: "pending" }));
  const fetched = await orderRepository.findById(created.id);
  expect(fetched?.status).toBe("pending");
  expect(fetched?.id).toBe(created.id);
});
```

**Setup for integration tests:**

```typescript
// jest.integration.config.ts
export default {
  testMatch: ["**/*.integration.test.ts"],
  globalSetup: "./test/setup/db-setup.ts",    // run migrations
  globalTeardown: "./test/setup/db-teardown.ts",
  setupFilesAfterFramework: ["./test/setup/db-cleaner.ts"], // truncate between tests
};
```

### E2E / API tests

**Scope:** Full HTTP request → response cycle. Real app instance, real DB, mocked external services.  
**Speed:** Seconds to minutes.  
**Run on:** Merge to `main`, pre-release.

```typescript
// Supertest — test the full HTTP layer
it("POST /orders returns 201 with created order", async () => {
  const payload = {
    productId: "prd-001",
    quantity: 2,
    shippingAddress: buildAddress(),
  };

  const response = await request(app)
    .post("/orders")
    .set("Authorization", `Bearer ${testUserToken}`)
    .send(payload);

  expect(response.status).toBe(201);
  expect(response.body.status).toBe("pending");
  expect(response.body.id).toBeDefined();
});
```

---

## 8. Testing Async Code

```typescript
// ❌ Bad — test exits before promise resolves
it("sends email after order created", () => {
  service.createOrder(input); // not awaited — test always passes
  expect(mockEmail.send).toHaveBeenCalled(); // checked before async work completes
});

// ✅ Good — always await async operations
it("sends email after order created", async () => {
  await service.createOrder(input);
  expect(mockEmail.send).toHaveBeenCalledOnce();
});

// ✅ Good — testing rejected promises
it("throws when product is out of stock", async () => {
  mockInventory.check.mockResolvedValue({ available: 0 });
  await expect(service.createOrder(input)).rejects.toThrow(OutOfStockError);
});

// ✅ Good — testing events / callbacks
it("emits order.created event with correct payload", async () => {
  const emitted: unknown[] = [];
  eventBus.on("order.created", (payload) => emitted.push(payload));

  await service.createOrder(input);

  expect(emitted).toHaveLength(1);
  expect(emitted[0]).toMatchObject({ userId: input.userId });
});
```

---

## 9. Testing Error Paths

Error paths are as important as the happy path. Every known failure mode must have a test.

```typescript
describe("transferFunds", () => {
  it("transfers funds between accounts successfully", async () => { ... }); // happy path

  // Error paths — all of these must exist
  it("throws InsufficientFundsError when balance is below transfer amount", async () => { ... });
  it("throws AccountNotFoundError when source account does not exist", async () => { ... });
  it("throws AccountNotFoundError when destination account does not exist", async () => { ... });
  it("throws ValidationError when amount is zero", async () => { ... });
  it("throws ValidationError when amount is negative", async () => { ... });
  it("throws SameAccountError when source and destination are identical", async () => { ... });
  it("rolls back the debit if the credit fails", async () => { ... }); // transactional integrity
});
```

### Checklist for error path coverage

For every function with failure modes, verify:
- [ ] Input validation failures (each invalid field)
- [ ] Not-found cases
- [ ] Permission / authorization failures
- [ ] External service failures (timeout, 5xx)
- [ ] Transactional rollback on partial failure

---

## 10. CI Test Gates

Tests are enforced at three stages:

| Stage | What runs | Blocks |
|---|---|---|
| Pre-push hook | Unit tests for changed files | Local push |
| PR opened / updated | All unit + integration tests, coverage check | PR merge |
| Merge to `main` | Full suite including E2E | Deployment |

```yaml
# .github/workflows/test.yml (excerpt)
jobs:
  test:
    steps:
      - name: Run unit tests
        run: npx jest --testPathPattern="(?<!integration|e2e).test.ts" --coverage

      - name: Check coverage threshold
        run: npx jest --coverage --coverageThresholds='{"global":{"lines":80,"branches":75}}'

      - name: Run integration tests
        run: npx jest --testPathPattern="integration.test.ts"
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
```

**Rules:**
- Tests that are flaky (intermittently fail without code changes) must be fixed or deleted within 1 sprint. Flaky tests erode trust in the entire suite.
- A skipped test (`it.skip`) must have a linked ticket comment explaining why.
- `it.only` is never committed — it silently disables the rest of the suite.

---

## 11. Anti-Patterns Reference

| Anti-pattern | Problem | Fix |
|---|---|---|
| Testing implementation | Breaks on refactor, not on bugs | Test observable behavior |
| Shared mutable state across tests | Tests pass in one order, fail in another | Each test owns its setup |
| Raw object literals for test data | Breaks everywhere when shape changes | Use factories |
| No assertion (`expect` missing) | Test always passes regardless of behavior | Always assert the outcome |
| `expect(fn).not.toThrow()` as only assertion | Confirms code runs, not that it's correct | Assert the returned value |
| Mocking the thing under test | You're testing the mock, not the code | Mock dependencies, not the SUT |
| Over-mocking | Tests pass but real integration is broken | Use real dependencies in integration tests |
| Sleeping in tests (`setTimeout`) | Slow, fragile | Use fake timers or `waitFor` |
| Ignoring test output noise | Warnings hide real problems | Fix or suppress warnings explicitly |
| `console.log` in test files | Pollutes CI output | Remove before committing |

---

*Owner: Tech Lead | Version: 1.0 — April 2026*
