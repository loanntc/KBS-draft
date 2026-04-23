#!/bin/bash
# PreToolUse hook: reads ~/.claude/business-rules.md before allowing Bash commands.
# Blocks high-risk patterns with the relevant rule as context for Claude.

RULES_FILE="$HOME/.claude/business-rules.md"
input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // ""')

# No rules file — allow everything
if [[ ! -f "$RULES_FILE" ]]; then
  exit 0
fi

BLOCKED=""

# G-3: No force-push to main or develop
if echo "$command" | grep -qE 'git\s+push\s+.*--force'; then
  BLOCKED="[G-3] Force-push to main/develop is prohibited. See .claude/rules/git-workflow.md §8."
fi

# A-1: Agents may not run or write DB migrations
if echo "$command" | grep -qiE '\b(DROP\s+TABLE|TRUNCATE\s+TABLE|CREATE\s+TABLE|ALTER\s+TABLE)\b'; then
  BLOCKED="[A-1] Agents may not run DB migrations. This requires human review. See .claude/rules/agents.md §1."
fi

# Recursive delete from root or home (no rule code — pure safety)
if echo "$command" | grep -qE 'rm\s+(-rf|-fr)\s+[/~]'; then
  BLOCKED="Recursive deletion from root or home is prohibited."
fi

# G-3: Hard git reset wipes uncommitted work — treat like force-push
if echo "$command" | grep -qE 'git\s+reset\s+--hard'; then
  BLOCKED="[G-3] git reset --hard discards uncommitted work. Confirm this is intentional. See .claude/rules/git-workflow.md §8."
fi

# G-2: CI hooks enforce quality gates — skipping requires justification
if echo "$command" | grep -qE 'git\s+commit\s+.*--no-verify'; then
  BLOCKED="[G-2] Skipping pre-commit hooks (--no-verify) is prohibited without explicit approval. See .claude/rules/git-workflow.md §5."
fi

# A-2: Agents may not commit or push to main or develop
if echo "$command" | grep -qE 'git\s+(push|commit).*(main|develop)'; then
  BLOCKED="[A-2] Agents may not commit or push directly to main or develop. Use a feature branch + PR. See .claude/rules/agents.md §1."
fi

if [[ -n "$BLOCKED" ]]; then
  echo "BLOCKED by business rules: $BLOCKED" >&2
  echo "" >&2
  echo "Active rules file: $RULES_FILE" >&2
  echo "---" >&2
  cat "$RULES_FILE" >&2
  exit 2
fi

exit 0
