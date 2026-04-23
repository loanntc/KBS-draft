# BUSINESS_RULES.md

> **Scope:** All contributors — human engineers and AI coding agents (Claude, Cursor, Copilot, etc.).  
> **Structure:** This is the master index. Each rule domain lives in its own file under `rules/`.  
> **Authority:** Violations block merges. Questions → open a discussion in the team channel.  
> **Last updated:** April 2026 | Owner: Tech Lead

---

## Rule Files

| Domain | File | What it covers |
|---|---|---|
| 🔒 Security | [`rules/security.md`](rules/security.md) | Secrets, input validation, auth/authz, sensitive data, dependency security, OWASP |
| 🎨 Coding Style | [`rules/coding-style.md`](rules/coding-style.md) | Immutability, file organization, naming, functions, error handling, constants, comments |
| 🧪 Testing | [`rules/testing.md`](rules/testing.md) | TDD workflow, coverage floors, test structure, factories, mocking, CI gates |
| 🌿 Git Workflow | [`rules/git-workflow.md`](rules/git-workflow.md) | Branch strategy, commit format, PR process, review rules, merge strategy, hotfixes |
| 🤖 AI Agent Behavior | [`rules/agents.md`](rules/agents.md) | Autonomy scope, when to delegate, subagent usage, output quality, transparency |
| ⚡ Performance | [`rules/performance.md`](rules/performance.md) | Model selection, context budgets, DB queries, async patterns, caching, HTTP, monitoring |

---

## Non-Negotiables

These rules are **never flexible**. A PR that violates any of them will not be merged, regardless of urgency or justification. Exceptions require documented tech lead approval before proceeding — not after.

### Security

| # | Rule | Reference |
|---|---|---|
| S-1 | No hardcoded secrets in any file, any environment, ever | [security.md §1](rules/security.md) |
| S-2 | No raw SQL string concatenation — always parameterized queries | [security.md §2](rules/security.md) |
| S-3 | Authorization checked on every resource fetch — "logged in" ≠ "allowed" | [security.md §3](rules/security.md) |
| S-4 | No PII, passwords, or tokens in log output | [security.md §4](rules/security.md) |

### Coding Style

| # | Rule | Reference |
|---|---|---|
| C-1 | No silent `catch` blocks — every error is logged and/or rethrown | [coding-style.md §5](rules/coding-style.md) |
| C-2 | No `any` type in TypeScript without a documented reason in a comment | [coding-style.md §8](rules/coding-style.md) |
| C-3 | No magic literals — all non-trivial values are named constants | [coding-style.md §6](rules/coding-style.md) |

### Testing

| # | Rule | Reference |
|---|---|---|
| T-1 | Tests required for all new business logic — untested logic does not merge | [testing.md §1](rules/testing.md) |
| T-2 | Coverage must not decrease on any PR | [testing.md §2](rules/testing.md) |
| T-3 | `it.only` is never committed — it silently disables the rest of the suite | [testing.md §10](rules/testing.md) |

### Git Workflow

| # | Rule | Reference |
|---|---|---|
| G-1 | No direct commits to `main` or `develop` — PRs only | [git-workflow.md §1](rules/git-workflow.md) |
| G-2 | CI must pass before any merge | [git-workflow.md §5](rules/git-workflow.md) |
| G-3 | No force-push to `main` or `develop` | [git-workflow.md §8](rules/git-workflow.md) |

### AI Agent Behavior

| # | Rule | Reference |
|---|---|---|
| A-1 | Agents may not run or write DB migrations | [agents.md §1](rules/agents.md) |
| A-2 | Agents may not commit or push to `main` or `develop` | [agents.md §1](rules/agents.md) |
| A-3 | Agents may not modify auth, payments, or security code without human review | [agents.md §1](rules/agents.md) |
| A-4 | All agent assumptions must be documented in code and PR description | [agents.md §7](rules/agents.md) |

### Performance

| # | Rule | Reference |
|---|---|---|
| P-1 | No N+1 queries in new code — blocked in code review | [performance.md §3](rules/performance.md) |
| P-2 | All external HTTP calls must have an explicit timeout | [performance.md §4](rules/performance.md) |
| P-3 | All list endpoints must be paginated — no unbounded result sets | [performance.md §3](rules/performance.md) |

---

## Quick Reference Card

For fast lookups during code review or development:

```
Committing?
  → No secrets (S-1) | Named constants (C-3) | Tests added (T-1) | Lint passes (G-2)

Writing a function?
  → Single responsibility | < 30 lines target | No silent catch (C-1) | Pure if possible

Writing a query?
  → No N+1 (P-1) | Index on filter columns | Paginated results (P-3) | In a transaction if multi-step

Opening a PR?
  → Description filled | CI green (G-2) | Self-reviewed | Coverage unchanged (T-2)

AI agent task?
  → Plan before executing | Document assumptions (A-4) | No migrations (A-1) | Self-check before handing off
```

---

## How to Update These Rules

1. Open a PR against this file and/or the relevant `rules/*.md` file.
2. Describe what you're changing and why.
3. Get tech lead approval.
4. Announce changes in the team channel with a summary.

Rules should evolve with the team's experience. If a rule is causing more friction than value, raise it — don't just ignore it.

---

*Owner: Tech Lead | Version: 1.0 — April 2026*
