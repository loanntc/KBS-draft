# agents.md

> **Scope:** AI coding agents (Claude, Cursor, Copilot, and any other AI assistant operating in this codebase).  
> **Purpose:** Define when agents act autonomously, when they pause, how they communicate uncertainty, and how they hand off to humans.

---

## Table of Contents

1. [Scope of Autonomy](#1-scope-of-autonomy)
2. [When to Delegate to a Human](#2-when-to-delegate-to-a-human)
3. [When to Use a Subagent](#3-when-to-use-a-subagent)
4. [Output Quality Requirements](#4-output-quality-requirements)
5. [How to Communicate Uncertainty](#5-how-to-communicate-uncertainty)
6. [Prohibited Actions](#6-prohibited-actions)
7. [Transparency & Attribution](#7-transparency--attribution)
8. [Agentic Task Workflow](#8-agentic-task-workflow)
9. [Context Management](#9-context-management)
10. [Self-Check Before Submitting](#10-self-check-before-submitting)

---

## 1. Scope of Autonomy

Agents have different permission levels depending on the action's reversibility and risk.

### Permission table

| Action | Autonomous | With confirmation | Never |
|---|---|---|---|
| Read files, logs, documentation | ✅ | — | — |
| Search codebase, grep, list directories | ✅ | — | — |
| Run tests, linters, type checkers | ✅ | — | — |
| Run build commands | ✅ | — | — |
| Write new files in the correct module | ✅ | — | — |
| Edit existing non-critical files | ✅ | — | — |
| Install dependencies (approved registry only) | — | ✅ Flag + proceed | — |
| Modify business logic in existing files | — | ✅ Describe plan first | — |
| Create new DB migrations | — | — | ❌ Human only |
| Run DB migrations in any environment | — | — | ❌ Human only |
| Modify auth / payments / security code | — | — | ❌ Human only |
| Delete files | — | ✅ Propose and wait | — |
| Add pre-release or unvetted dependencies | — | — | ❌ Never |
| Push commits to `main` or `develop` | — | — | ❌ Never |
| Merge PRs | — | — | ❌ Never |
| Modify `.github/workflows`, `Dockerfile`, infra-as-code | — | — | ❌ Human only |
| Make external API calls in production | — | — | ❌ Never |
| Access or process real user data | — | — | ❌ Never |

### What "With confirmation" means

The agent must state its intended action clearly before executing:

```
I plan to:
1. Add zod@3.22.4 as a dependency
2. Create src/features/orders/orders.validator.ts with the new schema

Reason: The orders endpoint currently has no input validation.
Proceeding unless you object.
```

---

## 2. When to Delegate to a Human

An agent must **stop and ask** — not guess, not proceed — in any of these situations:

### 2.1 — Ambiguous task

The instruction has more than one valid interpretation.

```
# Ambiguous — stop and ask
"Update the order service"
→ What aspect? Add a feature? Fix a bug? Refactor? Which order service?

# Clear — proceed
"Add a discount calculation function to OrderService that applies 10% for gold-tier accounts"
```

When stopping, the agent states:
- What it understood
- What the ambiguity is
- What options exist
- Which option it would choose if forced — and why

### 2.2 — Irreversible consequences

Any action that cannot be undone without significant effort:
- Deleting data or files
- Running DB migrations
- Sending notifications to real users
- Deploying to production

### 2.3 — Non-negotiable area

Changes to: authentication logic, authorization rules, payment processing, rate limiting, cryptography, API contracts used by external consumers.

### 2.4 — Business rule interpretation required

The implementation requires a judgment call the agent cannot make from the codebase alone:
- "What should happen when X edge case occurs?"
- "Which of these two approaches fits the product intent?"
- "Is this behavior intentional or a bug?"

### 2.5 — Confidence below threshold

If the agent cannot verify its output is correct with reasonable confidence:

```
I've implemented the transfer validation, but I'm not certain about:
- The correct VND minimum transfer amount (I used 10,000 — please confirm)
- Whether the same-account check should apply to sub-accounts

The code is ready, but I recommend reviewing these two points before merging.
```

**The correct behavior:** State what is uncertain, why, and what needs human judgment. Then stop.

---

## 3. When to Use a Subagent

### Delegate to a subagent when:

| Situation | Rationale |
|---|---|
| Task can be cleanly parallelized (e.g., write tests for 5 independent modules) | Speed and focus |
| Task requires a different specialized skill (e.g., deep security audit, SQL optimization) | Use the right tool |
| Task is long and stateless (e.g., generate documentation for 20 files) | Prevents context pollution in the main agent |
| Task is exploratory and may fail (e.g., try 3 different approaches to an algorithm) | Isolates failures |

### Do NOT delegate to a subagent when:

- The task requires shared context that the subagent won't have
- The task has sequential dependencies (step 2 depends on step 1's output)
- The task is short (< 15 minutes of work) — overhead is not worth it
- You haven't defined clear inputs and success criteria for the subagent

### Subagent handoff format

When spawning a subagent, the instruction must include:

```markdown
## Task
[Single, specific task — one sentence]

## Context
[What the subagent needs to know to complete the task, including relevant file paths, types, and constraints]

## Inputs
[What files, data, or state to start from]

## Expected Output
[Exact format: file path + content, function signature, test output, etc.]

## Constraints
- Must follow rules in: coding-style.md, testing.md
- Must not modify: [list of files the subagent should not touch]
- Must not call external services
```

### Collecting subagent results

The orchestrating agent is responsible for:
- Reviewing each subagent's output before integrating it
- Verifying outputs are consistent with each other
- Running the full test suite after combining results
- Not shipping subagent output it cannot explain

---

## 4. Output Quality Requirements

All code produced by an agent must meet the same bar as code written by a human engineer.

### Non-negotiable quality gates

Before considering a task complete, the agent must verify:

```
[ ] Passes linter with zero warnings: npm run lint / ruff check .
[ ] Passes type checker with zero errors: npm run typecheck / mypy src/
[ ] All existing tests still pass: npm test
[ ] New tests written for any new logic (coverage rules from testing.md apply equally)
[ ] No console.log / print / debug statements
[ ] No hardcoded secrets or magic values (use constants and env vars)
[ ] No silent catch blocks
[ ] No use of `any` type without a documented reason
[ ] Error handling follows error-handling rules (coding-style.md §5)
```

### Self-run verification

```bash
# Run this sequence before declaring a task complete
npm run lint && npm run typecheck && npm test

# If any step fails — fix it before handing off, not after
```

---

## 5. How to Communicate Uncertainty

### Uncertainty levels

```
[CONFIDENT] — The agent is sure this is correct.
Example: "This implements the discount logic as specified."

[LIKELY] — The agent believes this is correct but recommends a review of a specific aspect.
Example: "The fee calculation looks correct, but I'd recommend verifying the VND rounding
         behavior with the finance team — I based it on Circular 19/2018."

[UNCERTAIN] — The agent has a plausible implementation but cannot verify correctness.
Example: "I've implemented what I think the spec requires, but the behavior for 
         sub-account transfers is not specified. I've added a TODO with the open question."

[BLOCKED] — The agent cannot proceed without human input.
Example: "I need clarification on whether canceled orders should be soft-deleted or 
         hard-deleted before I can complete the repository layer."
```

### Rules
- Never present uncertain output as confident output.
- Never silently make an assumption — document it inline and in the PR description.
- A `TODO` with a ticket reference is better than a wrong implementation.

---

## 6. Prohibited Actions

```
❌ Hardcode secrets, credentials, or environment-specific values
❌ Bypass validation logic to make tests pass (e.g., commenting out a validator)
❌ Silently swallow errors in generated code
❌ Use `any` type in TypeScript without a documented reason
❌ Generate code with unverified assumptions about external APIs or services
❌ Add new dependencies without flagging them for human review
❌ Paste or reference sensitive business data, PII, or customer records in prompts or comments
❌ Modify .github/workflows, Dockerfile, or any infrastructure-as-code without a human in the loop
❌ Run DB migrations in any environment
❌ Commit or push to main or develop
❌ Auto-merge a PR regardless of review status
❌ Remove or disable tests to improve coverage numbers artificially
❌ Write tests that only verify code runs (no meaningful assertion)
❌ Use deprecated or unvetted packages from outside the approved registry
❌ Make decisions about breaking API changes without flagging them as breaking
```

---

## 7. Transparency & Attribution

### Commit messages

Commit messages from AI-assisted work must accurately describe the change — not attribute it to the tool.

```bash
# ❌ Bad — doesn't describe the change
git commit -m "AI-generated code"
git commit -m "Claude wrote this"

# ✅ Good — describes the change regardless of how it was generated
git commit -m "feat(orders): add discount calculation for gold-tier accounts"
```

### When the agent made an assumption

Document it — both in code and in the PR description.

```typescript
// ASSUMPTION: Transfers below 10,000 VND are treated as invalid per business rules.
// Source: verbal discussion with PM on 2026-04-10. Ticket to formalize: KBSV-311.
const MINIMUM_TRANSFER_AMOUNT_VND = 10_000;
```

And in the PR description:
```
## Assumptions Made
- Minimum transfer amount set to 10,000 VND based on verbal PM discussion (KBSV-311).
  Please confirm before merge.
```

### Code review accountability

Human reviewers may ask any contributor — human or AI-assisted — to explain any line of code. The human who accepted the commit owns it fully.

"The agent wrote it" is not an explanation. It is a signal the PR is not ready.

---

## 8. Agentic Task Workflow

For multi-step tasks that require planning before execution:

### Step 1 — Understand the task

```
Before doing anything:
- What is the exact goal?
- What does "done" look like?
- What are the constraints?
- What could go wrong?
- What do I not know yet?
```

### Step 2 — Plan and communicate the plan

```
My plan:
1. Read [relevant files] to understand the current structure
2. Create [new file] with [purpose]
3. Modify [existing file] to [do X]
4. Write tests in [test file] covering [cases]
5. Run linter and tests to verify

Estimated scope: ~3 files, ~150 lines added, ~80 lines modified.
Flagging: This touches the auth middleware — I'll proceed with extra care and note any concerns.
```

### Step 3 — Execute in small, verifiable steps

Do not make all changes at once. Make one logical change, verify it, then proceed.

```bash
# After each meaningful step
npm run lint && npm run typecheck && npm test
```

### Step 4 — Hand off clearly

```
Completed:
- Created src/features/orders/orders.validator.ts with Zod schema for TransferInput
- Updated orders.controller.ts to use the validator (line 24–31)
- Added 8 test cases covering valid input, each invalid field, and boundary values
- All tests pass, lint clean, types check

Open questions / follow-up:
- KBSV-311: Confirm minimum transfer amount of 10,000 VND
- The existing orders.controller.ts test file had a skipped test (line 87) — 
  I left it as-is but it should be addressed in a follow-up ticket
```

---

## 9. Context Management

### Rule
Agents operate within a context window. Long-running tasks require deliberate context management.

### What to include in context

```
✅ The specific file(s) being modified
✅ Directly related types and interfaces
✅ The test file for the module under change
✅ Relevant business rules or specs
✅ Error messages from failed commands

❌ The entire codebase
❌ Long conversation history unrelated to the current task
❌ Compiled output or generated files
```

### When context grows too large

- Summarize completed work into a brief status note before starting the next subtask.
- Split the task: complete and hand off the first part before starting the second.
- If switching between unrelated modules, clear context and start fresh.

### Loading context efficiently

```bash
# Read only what you need
cat src/features/orders/orders.service.ts   # the file under change
cat src/features/orders/orders.types.ts     # types it depends on
cat src/features/orders/orders.test.ts      # existing tests

# Don't read the entire src/ tree unless you need to understand structure
```

---

## 10. Self-Check Before Submitting

Run this checklist before handing any work to a human:

```
Code quality
[ ] Linter passes with zero warnings
[ ] Type checker passes with zero errors
[ ] No console.log, print, or debug statements
[ ] No hardcoded secrets or magic values
[ ] No silent catch blocks
[ ] No `any` types without comments

Testing
[ ] Tests exist for all new logic
[ ] Tests cover at least the happy path and key error paths
[ ] All existing tests still pass
[ ] No tests were skipped or removed

Logic & behavior
[ ] I can explain every line I wrote
[ ] I did not make undocumented assumptions
[ ] I flagged any uncertain parts clearly
[ ] Breaking changes are labeled as such

Communication
[ ] All assumptions are documented in code comments and/or PR description
[ ] Open questions are listed with ticket references
[ ] The PR description accurately describes what changed and why
```

---

*Owner: Tech Lead | Version: 1.0 — April 2026*
