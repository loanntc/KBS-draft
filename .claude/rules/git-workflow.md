# git-workflow.md

> **Scope:** All contributors — human engineers and AI coding agents.  
> **Goal:** A clean, readable, bisect-able history where every commit and PR tells a clear story.

---

## Table of Contents

1. [Branch Strategy](#1-branch-strategy)
2. [Branch Naming](#2-branch-naming)
3. [Commit Message Format](#3-commit-message-format)
4. [Writing Good Commits](#4-writing-good-commits)
5. [PR Process](#5-pr-process)
6. [PR Description Template](#6-pr-description-template)
7. [Code Review — Reviewer Rules](#7-code-review--reviewer-rules)
8. [Merge Strategy](#8-merge-strategy)
9. [Release & Tagging](#9-release--tagging)
10. [What Is Prohibited in Git History](#10-what-is-prohibited-in-git-history)
11. [Hotfix Process](#11-hotfix-process)

---

## 1. Branch Strategy

### Main branches

| Branch | Purpose | Direct push allowed |
|---|---|---|
| `main` | Production-ready code. Always deployable. | ❌ Never |
| `develop` | Integration branch. Staging deploys from here. | ❌ Never |

### Supporting branches

All work happens in short-lived feature branches, created from `develop` (or `main` for hotfixes), merged back via PR.

```
main ─────────────────────────────────────────────► production
  │
develop ──────────────────────────────────────────► staging
  │          │              │
  feat/...   fix/...    refactor/...
```

**Rules:**
- Every branch has a finite lifespan. Merge and delete within the same sprint.
- Branches open for more than 5 business days with no PR require a check-in with the tech lead.
- Never rebase a branch that has been pushed and reviewed — it rewrites history others have seen.

---

## 2. Branch Naming

### Format

```
<type>/<ticket-id>-<short-description>
```

### Types

| Type | When |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Restructure without behavior change |
| `test` | Adding or updating tests only |
| `chore` | Tooling, deps, config — no production code change |
| `docs` | Documentation only |
| `perf` | Performance improvement |
| `ci` | CI/CD pipeline changes |
| `hotfix` | Urgent production fix — branches from `main` |

### Examples

```bash
feat/KBSV-142-prime-club-tier-display
fix/KBSV-201-order-total-rounding-error
refactor/KBSV-188-extract-portfolio-service
test/KBSV-210-add-transfer-edge-case-coverage
chore/KBSV-300-upgrade-zod-to-v4
docs/KBSV-099-update-api-readme
hotfix/KBSV-350-fix-null-balance-crash
```

### Rules
- Use hyphens, not underscores or spaces.
- Keep the description short — 3 to 5 words.
- Always include the ticket ID. No ticket = create one first.
- Lowercase only.

---

## 3. Commit Message Format

### Conventional Commits

```
<type>(<scope>): <short summary>

[optional body — explain WHY, not WHAT the code does]

[optional footer: BREAKING CHANGE, Closes #ticket, Co-authored-by...]
```

### Types (same as branch types)

| Type | Triggers version bump |
|---|---|
| `feat` | Minor (1.x.0) |
| `fix` | Patch (1.0.x) |
| `perf` | Patch |
| `refactor`, `test`, `chore`, `docs`, `ci` | No bump |
| `BREAKING CHANGE` in footer | Major (x.0.0) |

### Scope (optional but recommended)

The scope is the module or domain affected: `orders`, `auth`, `portfolio`, `payments`, `api`, `db`, `ci`.

```
feat(orders): add discount calculation for gold-tier accounts
fix(auth): prevent token refresh race condition on concurrent requests
perf(portfolio): replace N+1 query with single JOIN
refactor(payments): extract fee calculation into PaymentFeeService
```

### Summary line rules

- Max **72 characters**.
- **Imperative mood**: "add", "fix", "remove" — not "added", "fixing", "removed".
- No period at the end.
- Lowercase after the colon.

```
# ✅ Good
feat(orders): add minimum order value validation for retail accounts

# ❌ Too long
feat(orders): added the minimum order value validation logic for retail tier accounts as per PRD-041

# ❌ Wrong mood
fix(auth): fixed the token refresh race condition

# ❌ Vague
fix: bug fix
chore: updates
```

---

## 4. Writing Good Commits

### One logical change per commit

```bash
# ❌ Bad — one commit bundles unrelated work
git commit -m "feat: add order discount + fix auth bug + update README"

# ✅ Good — each commit is atomic and independently reversible
git commit -m "feat(orders): add discount calculation for gold-tier accounts"
git commit -m "fix(auth): prevent token refresh race condition"
git commit -m "docs: update authentication section in README"
```

### The body — explain WHY

The diff shows what changed. The commit body explains why.

```
fix(orders): round VND totals to nearest integer

VND has no decimal places per Vietnamese banking standards (Circular 19/2018).
Floating-point arithmetic was producing values like 999999.9999999 which caused
validation failures at the payment gateway.

Using Math.round() at the final calculation step rather than throughout to avoid
compounding rounding errors in intermediate calculations.

Closes #KBSV-201
```

### Commit hygiene

```bash
# Stage precisely — don't git add .
git add src/orders/orders.service.ts
git add src/orders/orders.service.test.ts
# Review what you're committing before committing
git diff --staged

# Amend the last commit if you forgot something (before push only)
git add forgotten-file.ts
git commit --amend --no-edit

# Interactive rebase to clean up before PR (local only — never after push)
git rebase -i HEAD~4
```

---

## 5. PR Process

### Before opening a PR

```
[ ] All tests pass locally: npm test / pytest
[ ] Coverage threshold met: npm run test:coverage
[ ] Linter passes with zero warnings: npm run lint
[ ] Type checker passes: npm run typecheck / mypy src/
[ ] Self-review done: read your own diff as if you were the reviewer
[ ] PR description filled in (see template below)
[ ] No console.log / print / debug statements
[ ] No commented-out code
[ ] No .env or secrets files
[ ] Branch is up to date with develop: git rebase develop
```

### PR size rules

| PR size | Lines changed | Review target |
|---|---|---|
| Small | < 200 lines | < 30 minutes to review |
| Medium | 200–500 lines | 45–60 minutes |
| Large | > 500 lines | Requires split or justification |

**PRs over 500 lines must be split** unless the change is genuinely indivisible (e.g., a single large migration). If you cannot split it, explain why in the PR description.

### Review SLA

| Role | Obligation | Timeline |
|---|---|---|
| Reviewer | First response (approve, request changes, or ask for discussion) | Within 1 business day |
| Author | Address all review comments | Within 1 business day of receiving review |

- PRs unreviewed for 2+ business days: author pings reviewer in the team channel.
- PRs with unaddressed comments for 2+ business days: reviewer pings author.

### Approval requirements

| Change type | Approvals required |
|---|---|
| Standard feature / fix | 1 approval |
| Auth, payments, security-related | 2 approvals |
| DB schema migration | 2 approvals + tech lead sign-off |
| Infrastructure / CI changes | Tech lead approval |

---

## 6. PR Description Template

Copy this into every PR. Delete sections that don't apply.

```markdown
## What and Why
<!-- 2–3 sentences: what changed, and why this change is needed now -->

## Changes
<!-- List the key files changed and the reason for each -->
- `src/orders/orders.service.ts` — added discount logic for gold-tier accounts
- `src/orders/orders.service.test.ts` — added 6 test cases covering discount tiers

## How to Test
<!-- Step-by-step instructions for the reviewer to verify the behavior -->
1. Create a user with `tier: "gold"`
2. Place an order with total > 1,000,000 VND
3. Confirm `discountedTotal` in the response is 10% less than `total`

## Screenshots / Output
<!-- For UI changes, include before/after screenshots -->
<!-- For API changes, include example request/response -->

## Risk & Notes
<!-- Anything the reviewer should pay extra attention to, or known trade-offs -->

## Checklist
- [ ] Tests added / updated
- [ ] No debug statements
- [ ] No hardcoded values (constants used)
- [ ] Self-reviewed
- [ ] Docs updated if behavior changed publicly
- [ ] Migration is reversible (if applicable)
```

---

## 7. Code Review — Reviewer Rules

### Mindset

A review is a collaboration, not a gate. The goal is shipping correct, maintainable code — not winning arguments.

### What to check

**Must block merge (leave "Request Changes"):**
- Logic errors or incorrect behavior
- Missing tests for new business logic
- Security issues (hardcoded secrets, missing auth checks, SQL injection risk)
- Breaking API changes without versioning
- Dependency added without review
- Code that doesn't follow non-negotiable rules

**Should comment but not block:**
- Style preferences (if not in the linter)
- Alternative approaches that are roughly equivalent
- Naming improvements
- Performance observations without data

**Purely optional (use "Nit:" prefix):**
- Minor readability suggestions
- Personal preferences

```
# Comment labels
# Use these to communicate the weight of a comment clearly

[BLOCKING] Missing auth check on /orders/:id — any user can access any order
[QUESTION] Why are we not using the existing DiscountService here?
[SUGGESTION] Consider extracting this into a helper for reusability
Nit: Could rename `d` to `discountRate` for clarity
```

### Rules

- **Approve only what you understand.** If you cannot explain what a piece of code does, ask before approving.
- **Ask questions before blocking.** "Why did you choose X?" is better than "This should be Y."
- **Respond to every comment you leave.** If the author addresses it, resolve it.
- If a PR is too large to review properly, ask the author to split it — this is a valid review action.

> Approval = you are co-responsible for what merges. Do not rubber-stamp.

---

## 8. Merge Strategy

### How to merge

```bash
# ✅ Squash merge to main/develop (default for feature branches)
# — keeps history clean, one commit per PR
git merge --squash feat/KBSV-142-prime-club-tier-display

# ✅ Merge commit for release branches (preserves the branch history)
git merge --no-ff release/1.4.0

# ❌ Never force-push to main or develop
# ❌ Never rebase main or develop
```

### After merge
- The author deletes the feature branch immediately after merge.
- GitHub branch protection should enforce this automatically.

### Resolving merge conflicts

```bash
# Always rebase feature branch onto develop before merge (not the reverse)
git checkout feat/KBSV-142-prime-club-tier-display
git fetch origin
git rebase origin/develop

# If conflicts arise — resolve, then:
git add <resolved-files>
git rebase --continue

# Run tests after every rebase
npm test
```

---

## 9. Release & Tagging

### Semantic versioning

```
MAJOR.MINOR.PATCH
  │      │     └── Bug fixes, patches (fix commits)
  │      └──────── New features, backward-compatible (feat commits)
  └─────────────── Breaking changes (BREAKING CHANGE footer)
```

### Tagging

```bash
# Create an annotated tag (not lightweight)
git tag -a v1.4.0 -m "Release 1.4.0 — Prime Club tier display"

# Push the tag
git push origin v1.4.0
```

### Release checklist

```
[ ] All tests pass on main
[ ] CHANGELOG.md updated with this version's changes
[ ] Version bumped in package.json / pyproject.toml
[ ] Release branch merged to main AND develop
[ ] Tag created and pushed
[ ] GitHub Release created with changelog notes
[ ] Deployment pipeline triggered and verified
```

---

## 10. What Is Prohibited in Git History

These must never appear in any commit, on any branch:

| Prohibited | Why | What to do instead |
|---|---|---|
| Secrets, credentials, API keys | Irreversible exposure risk | Use `.env` + secrets manager |
| Compiled artifacts (`dist/`, `build/`) | Bloat, generated automatically | Add to `.gitignore` |
| `node_modules/`, `.venv/` | Enormous, regenerated from lockfile | Add to `.gitignore` |
| `.env` files | Contains secrets | `.gitignore`, use `.env.example` |
| Personal IDE config (`.idea/`, `.vscode/`) | Not team-wide, causes conflicts | `.gitignore` |
| Large binaries (images, PDFs, videos) | Bloats repo permanently | Use object storage, reference by URL |
| Commented-out code | Dead weight, use git history instead | Delete it — git remembers |

### `.gitignore` baseline

```gitignore
# Dependencies
node_modules/
.venv/
__pycache__/
*.pyc

# Build output
dist/
build/
*.egg-info/

# Environment
.env
.env.*
!.env.example

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Test artifacts
coverage/
.pytest_cache/
```

---

## 11. Hotfix Process

For production incidents requiring an immediate fix:

```bash
# 1. Branch from main (not develop)
git checkout main
git checkout -b hotfix/KBSV-350-fix-null-balance-crash

# 2. Make the fix — keep it minimal and targeted
# 3. Add a regression test
# 4. Open a PR to main (expedited review — 1 approval minimum, tech lead aware)
# 5. After merge to main, immediately merge main back into develop
git checkout develop
git merge main

# 6. Tag the release
git tag -a v1.3.1 -m "Hotfix: fix null balance crash on portfolio load"
git push origin v1.3.1
```

**Hotfix rules:**
- Hotfixes are for production-breaking issues only. "Nice to have" fixes go through the normal process.
- Hotfix scope must be minimal — fix the bug, add the test, nothing else.
- Tech lead must be aware before a hotfix is deployed.
- A post-mortem is expected within 2 business days for any hotfix that caused user-facing impact.

---

*Owner: Tech Lead | Version: 1.0 — April 2026*
