#!/bin/bash
# PreToolUse hook: logs every Bash command to ~/.claude/audit.log
# Both humans and agents can read this file to review command history
# before making the next decision.

LOG_FILE="$HOME/.claude/audit.log"

input=$(cat)

session_id=$(echo "$input" | jq -r '.session_id // "unknown"')
cwd=$(echo "$input" | jq -r '.cwd // "unknown"')
command=$(echo "$input" | jq -r '.tool_input.command // ""')
description=$(echo "$input" | jq -r '.tool_input.description // ""')
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

{
  echo "---"
  echo "time:    $timestamp"
  echo "session: $session_id"
  echo "cwd:     $cwd"
  [[ -n "$description" ]] && echo "desc:    $description"
  echo "cmd:     $command"
} >> "$LOG_FILE"

exit 0
