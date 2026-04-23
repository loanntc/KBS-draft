# performance.md

> **Scope:** All contributors — human engineers and AI coding agents.  
> **Goal:** Systems that are fast, predictable, and cost-efficient — by design, not by accident.

---

## Table of Contents

1. [Model Selection (AI/LLM Tasks)](#1-model-selection-aillm-tasks)
2. [Context Window Management](#2-context-window-management)
3. [Database Performance](#3-database-performance)
4. [Async & Concurrency](#4-async--concurrency)
5. [Caching](#5-caching)
6. [HTTP & External Service Calls](#6-http--external-service-calls)
7. [Memory Management](#7-memory-management)
8. [Performance Budgets & Monitoring](#8-performance-budgets--monitoring)
9. [Profiling Before Optimizing](#9-profiling-before-optimizing)

---

## 1. Model Selection (AI/LLM Tasks)

When the product calls an LLM internally (text generation, classification, summarization, extraction), model choice directly impacts latency, cost, and user experience.

### Selection guide

| Task type | Model tier | Examples |
|---|---|---|
| Classification, yes/no decisions, short extraction | Lightweight / fast (Haiku-class) | Tag classification, intent detection, status extraction |
| Summarization, explanation, moderate reasoning | Mid-tier (Sonnet-class) | Document summary, code explanation, Q&A |
| Complex multi-document reasoning, long-form synthesis | Full-capability (Opus-class) | Investment analysis, research synthesis, complex code generation |
| Real-time streaming responses (chat) | Mid-tier minimum | User-facing chat, interactive assistance |

### Rules

**Rule 1: Benchmark before defaulting to a larger model.**

```typescript
// Document the decision at the call site
// Using Haiku: benchmarked on 100 samples, accuracy was 94% — acceptable for this use case.
// Switching to Sonnet only increased accuracy to 96% at 4x the cost and 2x the latency.
const response = await anthropic.messages.create({
  model: "claude-haiku-4-5-20251001",  // documented reason above
  max_tokens: 100,
  messages: [{ role: "user", content: classificationPrompt }],
});
```

**Rule 2: Cost and latency are product requirements, not optimizations.**

```typescript
interface LLMCallBudget {
  maxInputTokens: number;
  maxOutputTokens: number;
  targetLatencyMs: number;
  costPerCallCap: number; // in USD
}

// Define budgets per feature — document them in the feature spec
const PORTFOLIO_SUMMARY_BUDGET: LLMCallBudget = {
  maxInputTokens: 4000,
  maxOutputTokens: 500,
  targetLatencyMs: 2000,
  costPerCallCap: 0.01,
};
```

**Rule 3: Use streaming for user-facing responses over ~200 tokens.**

```typescript
// ✅ Stream long responses — reduces perceived latency
const stream = await anthropic.messages.stream({
  model: "claude-sonnet-4-6",
  max_tokens: 1000,
  messages: [{ role: "user", content: prompt }],
});

for await (const event of stream) {
  if (event.type === "content_block_delta") {
    res.write(event.delta.text);
  }
}
```

**Rule 4: Cache LLM responses for identical inputs where freshness allows.**

```typescript
// For deterministic tasks (classification, extraction from static data)
// cache the result — don't call the LLM twice for the same input
const cacheKey = `llm:classification:${hashContent(input)}`;
const cached = await cache.get(cacheKey);
if (cached) return cached;

const result = await callLLM(input);
await cache.set(cacheKey, result, { ttl: 3600 }); // 1 hour
return result;
```

---

## 2. Context Window Management

### Rule
Never pass unbounded input to an LLM. Define explicit token budgets for every feature.

### Prompt construction

```typescript
// ❌ Bad — grows unbounded, unpredictable cost and latency
const response = await callLLM({
  messages: allConversationHistory,  // could be thousands of tokens
  context: fullDocumentText,         // might be 100k tokens
});

// ✅ Good — explicit budget, controlled input
const MAX_HISTORY_TOKENS = 2000;
const MAX_CONTEXT_TOKENS = 3000;
const MAX_OUTPUT_TOKENS = 500;

const response = await callLLM({
  messages: windowHistory(allConversationHistory, MAX_HISTORY_TOKENS),
  context: extractRelevantChunks(documentText, userQuery, MAX_CONTEXT_TOKENS),
  maxTokens: MAX_OUTPUT_TOKENS,
});
```

### Conversation history windowing

```typescript
function windowHistory(
  history: Message[],
  maxTokens: number,
  tokenizer: Tokenizer,
): Message[] {
  // Always keep the system message
  const system = history.filter(m => m.role === "system");

  // Keep the most recent messages that fit within the budget
  const conversation = history.filter(m => m.role !== "system").reverse();
  let totalTokens = countTokens(system, tokenizer);
  const kept: Message[] = [];

  for (const message of conversation) {
    const tokens = tokenizer.count(message.content);
    if (totalTokens + tokens > maxTokens) break;
    totalTokens += tokens;
    kept.unshift(message);
  }

  return [...system, ...kept];
}
```

### RAG — Retrieve, don't paste

```typescript
// ❌ Bad — pasting entire document into context
const prompt = `
  Here is our entire policy document (50,000 words):
  ${fullPolicyDocument}
  
  Question: What is the fee for gold-tier accounts?
`;

// ✅ Good — retrieve only the relevant chunks
const relevantChunks = await vectorStore.similaritySearch(
  query,
  { topK: 5, minScore: 0.7 }
);

const prompt = `
  Based on the following relevant sections of our policy:
  ${relevantChunks.map(c => c.text).join("\n---\n")}
  
  Question: ${query}
`;
```

### Token usage logging

```typescript
// Log token usage for every LLM call in production
const response = await callLLM(payload);

logger.info("llm.call.completed", {
  model: payload.model,
  inputTokens: response.usage.input_tokens,
  outputTokens: response.usage.output_tokens,
  totalTokens: response.usage.input_tokens + response.usage.output_tokens,
  durationMs: Date.now() - startTime,
  feature: "portfolio-summary",  // tag by feature for cost attribution
  estimatedCostUSD: calculateCost(response.usage, payload.model),
});
```

---

## 3. Database Performance

### N+1 Queries — Zero Tolerance

```typescript
// ❌ Bad — N+1: 1 query for orders, then 1 per order for items
const orders = await db.orders.findAll({ where: { userId } });
for (const order of orders) {
  order.items = await db.orderItems.findAll({ where: { orderId: order.id } });
}

// ✅ Good — 1 query with JOIN
const orders = await db.orders.findAll({
  where: { userId },
  include: [{ model: db.orderItems, as: "items" }],
});

// ✅ Also good — batched lookup for complex cases
const orderIds = orders.map(o => o.id);
const items = await db.orderItems.findAll({ where: { orderId: orderIds } });
const itemsByOrderId = groupBy(items, "orderId");
```

**Rule:** Any new code that queries inside a loop is blocked in code review. No exceptions.

### Indexes

```typescript
// Before writing a query that filters/sorts on a column, check the index
// ✅ Add a migration for missing indexes

// migration: 20260415_add_orders_user_id_status_idx.ts
await queryInterface.addIndex("orders", ["user_id", "status"], {
  name: "orders_user_id_status_idx",
  concurrently: true, // non-blocking in Postgres
});
```

**Rule:** Every column used in `WHERE`, `ORDER BY`, `JOIN ON`, or `GROUP BY` must have an index. New queries on unindexed columns require a migration as part of the same PR.

### Pagination

```typescript
// ❌ Bad — returns everything, unbounded
async function getOrders(userId: string): Promise<Order[]> {
  return db.orders.findAll({ where: { userId } });
}

// ✅ Good — cursor-based pagination
async function getOrders(
  userId: string,
  cursor?: string,
  limit = 20,
): Promise<{ orders: Order[]; nextCursor: string | null }> {
  const where: WhereOptions = { userId };
  if (cursor) {
    where.id = { [Op.lt]: cursor }; // cursor = last seen ID
  }

  const orders = await db.orders.findAll({
    where,
    order: [["id", "DESC"]],
    limit: limit + 1, // fetch one extra to detect if there's a next page
  });

  const hasNext = orders.length > limit;
  return {
    orders: hasNext ? orders.slice(0, limit) : orders,
    nextCursor: hasNext ? orders[limit - 1].id : null,
  };
}
```

**Rule:** No endpoint returns unbounded results. All list endpoints are paginated. Default page size: 20. Maximum: 100.

### Query performance thresholds

| Query duration | Required action |
|---|---|
| < 50ms | Acceptable |
| 50–100ms | Monitor — add to slow query log |
| > 100ms | Profile and optimize before merging |
| > 500ms | Blocked — must be resolved before merge |

```bash
# Enable slow query logging in development
# PostgreSQL: log_min_duration_statement = 100  (in postgresql.conf)
# MySQL: slow_query_log = ON, long_query_time = 0.1
```

### Transactions

```typescript
// Wrap multi-step writes in a transaction — always
async function transferFunds(fromId: string, toId: string, amount: number): Promise<void> {
  await db.transaction(async (t) => {
    const from = await db.accounts.findByPk(fromId, { transaction: t, lock: true });
    const to = await db.accounts.findByPk(toId, { transaction: t, lock: true });

    if (!from || from.balance < amount) throw new InsufficientFundsError();

    await from.decrement("balance", { by: amount, transaction: t });
    await to.increment("balance", { by: amount, transaction: t });

    await db.transactions.create({
      fromAccountId: fromId,
      toAccountId: toId,
      amount,
      status: "completed",
    }, { transaction: t });
  });
  // If any step throws, the entire transaction is rolled back automatically
}
```

---

## 4. Async & Concurrency

### Parallelize independent operations

```typescript
// ❌ Bad — sequential when operations are independent
const userProfile = await fetchUserProfile(userId);       // waits
const portfolio = await fetchPortfolio(userId);           // waits unnecessarily
const notifications = await fetchNotifications(userId);   // waits unnecessarily
// Total: sum of all three durations

// ✅ Good — parallel
const [userProfile, portfolio, notifications] = await Promise.all([
  fetchUserProfile(userId),
  fetchPortfolio(userId),
  fetchNotifications(userId),
]);
// Total: max of all three durations
```

**Rule:** Independent async operations must use `Promise.all`. Sequential `await` without a data dependency is a performance bug.

### Handling partial failure in parallel calls

```typescript
// When some failures are acceptable — use Promise.allSettled
const results = await Promise.allSettled([
  fetchPortfolio(userId),
  fetchMarketData(portfolioId),
  fetchAlerts(userId),
]);

const portfolio = results[0].status === "fulfilled" ? results[0].value : null;
const marketData = results[1].status === "fulfilled" ? results[1].value : null;
// Handle each result independently
```

### Timeouts on all external calls

```typescript
// ❌ Bad — can block forever
const data = await fetch("https://market-data-api.example.com/prices");

// ✅ Good — explicit timeout
async function fetchWithTimeout<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new ExternalServiceError(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new TimeoutError(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Usage
const data = await fetchWithTimeout("https://market-data-api.example.com/prices", 5000);
```

**Rule:** Every external HTTP call has a timeout. Default: 5 seconds. Document if using a different value.

### Rate limiting outbound calls

```typescript
import { RateLimiter } from "limiter";

// Token bucket — allows burst up to limit, then throttles
const marketDataLimiter = new RateLimiter({
  tokensPerInterval: 10,
  interval: "second",
});

async function fetchPrice(symbol: string): Promise<number> {
  await marketDataLimiter.removeTokens(1); // waits if rate limit is hit
  return marketDataClient.getPrice(symbol);
}
```

### Background jobs must be idempotent

```typescript
// ❌ Bad — running twice creates duplicate records
async function processEndOfDayStatement(userId: string, date: string): Promise<void> {
  const statement = await generateStatement(userId, date);
  await db.statements.create(statement); // duplicate if job runs twice
}

// ✅ Good — idempotent: safe to run multiple times
async function processEndOfDayStatement(userId: string, date: string): Promise<void> {
  const existing = await db.statements.findOne({ where: { userId, date } });
  if (existing) {
    logger.info("statement.already.exists", { userId, date });
    return; // no-op — already processed
  }

  const statement = await generateStatement(userId, date);
  await db.statements.create(statement);
}
```

---

## 5. Caching

### Cache decision guide

| Data type | Cache? | TTL | Invalidation |
|---|---|---|---|
| Real-time market prices | Yes — very short | 30–60 seconds | Time-based expiry |
| User session data | Yes | 15 minutes (matches token expiry) | On logout / permission change |
| Reference data (market codes, fund list) | Yes — long | 1–24 hours | On admin update |
| Computed aggregates (portfolio NAV) | Yes | 1–5 minutes | On underlying position change |
| Static config / feature flags | Yes | 5–30 minutes | On config deploy |
| Per-request computed data | No | — | — |
| User-specific financial data | Yes — with caution | 1–5 minutes | On data change event |

### Implementation rules

```typescript
// ✅ Cache at the service layer — not in controllers or repositories
class PortfolioService {
  async getPortfolioNAV(portfolioId: string): Promise<number> {
    const cacheKey = `portfolio:${portfolioId}:nav`; // namespaced key
    const cached = await cache.get(cacheKey);

    if (cached !== null) {
      return Number(cached);
    }

    const nav = await this.calculateNAV(portfolioId);
    await cache.set(cacheKey, nav.toString(), { ttl: 60 }); // 60 seconds
    return nav;
  }
}
```

**Rules:**
- Every cached value has a TTL. No indefinite caches.
- Cache keys are namespaced: `{domain}:{id}:{data-type}`.
- Document every cache in the service file: what's cached, why, and TTL.
- Do not cache sensitive PII directly — cache IDs and re-fetch if needed.
- Implement cache stampede protection for high-traffic keys (stale-while-revalidate or locking).

```typescript
// Protect against cache stampede on high-traffic keys
async function getWithStampedeProtection<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number,
): Promise<T> {
  const cached = await cache.get(key);
  if (cached !== null) return JSON.parse(cached);

  // Acquire a lock before computing — only one process computes at a time
  const lock = await acquireLock(`lock:${key}`, { ttl: 10_000 });
  try {
    // Double-check after acquiring lock
    const doubleChecked = await cache.get(key);
    if (doubleChecked !== null) return JSON.parse(doubleChecked);

    const value = await fetchFn();
    await cache.set(key, JSON.stringify(value), { ttl });
    return value;
  } finally {
    await lock.release();
  }
}
```

---

## 6. HTTP & External Service Calls

### Retry with exponential backoff

```typescript
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts: number; baseDelayMs: number } = { maxAttempts: 3, baseDelayMs: 500 },
): Promise<T> {
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === options.maxAttempts;
      const isRetryable = error instanceof TimeoutError || isTransientError(error);

      if (isLastAttempt || !isRetryable) throw error;

      const delay = options.baseDelayMs * Math.pow(2, attempt - 1); // 500, 1000, 2000...
      const jitter = Math.random() * 200; // prevent thundering herd
      logger.warn("request.retrying", { attempt, delay, error });
      await sleep(delay + jitter);
    }
  }
  throw new Error("Unreachable");
}
```

### Circuit breaker

```typescript
// Use a circuit breaker for external services to prevent cascade failures
import CircuitBreaker from "opossum";

const breaker = new CircuitBreaker(fetchMarketData, {
  timeout: 5000,          // 5s timeout per call
  errorThresholdPercentage: 50, // open after 50% failures
  resetTimeout: 30_000,   // try again after 30s
});

breaker.fallback(() => getCachedMarketData()); // serve stale data when open

breaker.on("open", () => logger.warn("circuit.breaker.open", { service: "market-data" }));
breaker.on("close", () => logger.info("circuit.breaker.closed", { service: "market-data" }));
```

---

## 7. Memory Management

### Avoid memory leaks in long-running processes

```typescript
// ❌ Bad — event listener added but never removed
class OrderMonitor {
  start() {
    eventBus.on("order.created", this.handleOrder); // added every time start() is called
  }
}

// ✅ Good — remove listeners when no longer needed
class OrderMonitor {
  private handler = this.handleOrder.bind(this);

  start() {
    eventBus.on("order.created", this.handler);
  }

  stop() {
    eventBus.off("order.created", this.handler); // always clean up
  }
}
```

### Stream large data — don't load into memory

```typescript
// ❌ Bad — loads entire file into memory
const data = fs.readFileSync("/large-export.csv"); // could be GB
processCSV(data);

// ✅ Good — stream processing
import { createReadStream } from "fs";
import { parse } from "csv-parse";

createReadStream("/large-export.csv")
  .pipe(parse({ columns: true }))
  .on("data", (row) => processRow(row))
  .on("end", () => logger.info("export.processing.complete"));
```

---

## 8. Performance Budgets & Monitoring

### API response time budgets

| Endpoint type | Target P95 | Max P99 |
|---|---|---|
| Read — simple lookup | < 100ms | < 200ms |
| Read — aggregation or join | < 300ms | < 500ms |
| Write — single record | < 200ms | < 400ms |
| Write — complex (multi-table) | < 500ms | < 1000ms |
| LLM-powered endpoint | < 3000ms (streaming) | < 5000ms |

### Metrics to track in production

```typescript
// Wrap all service calls with performance tracking
async function trackedCall<T>(
  name: string,
  fn: () => Promise<T>,
  labels: Record<string, string> = {},
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    metrics.histogram("service.call.duration", Date.now() - start, { ...labels, name, status: "success" });
    return result;
  } catch (error) {
    metrics.histogram("service.call.duration", Date.now() - start, { ...labels, name, status: "error" });
    throw error;
  }
}
```

**Alerts — minimum set:**
- P95 response time exceeds budget for any endpoint
- Error rate spike > 5% above baseline
- DB query duration > 500ms (alert, not page)
- LLM token spend > daily budget threshold

---

## 9. Profiling Before Optimizing

### Rule
Do not optimize code without profiling data. Premature optimization creates complexity for no measured gain.

```
1. Measure — identify the actual bottleneck with a profiler or APM tool
2. Set a goal — what does "fast enough" look like? (refer to §8 budgets)
3. Change one thing — make one optimization at a time
4. Measure again — confirm the improvement is real and the trade-off is worth it
5. Document — explain what was optimized, why, and what the measured improvement was
```

```typescript
// ✅ Document optimizations with measurements
// OPTIMIZATION: Replaced sequential portfolio valuation with batched query.
// Before: avg 1,400ms for 20-stock portfolio (N+1 queries to market data service)
// After: avg 180ms (single batched request)
// Profiled: 2026-04-15 on staging with p95 load
const prices = await marketDataService.getPricesBatch(stockIds); // replaces loop
```

---

*Owner: Tech Lead | Version: 1.0 — April 2026*
