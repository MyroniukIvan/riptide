#!/usr/bin/env sh
# PreToolUse — intercept `gh pr create` and require /ship first.
#
# A shell script cannot call a model, so this does not run the review. It denies
# the tool call with a reason that re-prompts the model to invoke /ship, get a
# verdict, and re-issue the command. See skills/ship/gate.md.
#
# Fires only on `gh pr create`. Plain `git push` flows freely — gating pushes
# trains people to bypass gates, and the moment that matters is PR-open.

# No `set -e`: a hook that aborts mid-way silently becomes a no-op, which for a
# guardrail is the worst failure mode. Each step handles its own errors.
set -u

DIR=$(dirname "$0")
. "$DIR/lib.sh"

read_input
json_available || exit 0

[ "$(jget tool_name)" = "Bash" ] || exit 0

command=$(jget tool_input.command)
case "$command" in
  "gh pr create"*) ;;
  *) exit 0 ;;
esac

repo=$(repo_dir)
base=$(default_branch)
branch=$(git -C "$repo" symbolic-ref --short HEAD 2>/dev/null || printf '')

# On the integration branch /ship refuses to run anyway; blocking here would
# be an unbreakable loop.
[ -n "$branch" ] && [ "$branch" != "$base" ] || exit 0

# --- bypass ---------------------------------------------------------------
if [ "${SHIP_BYPASS:-}" = "1" ]; then
  if [ -z "${SHIP_BYPASS_REASON:-}" ]; then
    deny "SHIP_BYPASS=1 was set without SHIP_BYPASS_REASON. A bypass needs a recorded reason. Either drop the bypass and run /ship, or retry with SHIP_BYPASS_REASON='<justification>'."
  fi
  log_dir="$repo/.claude/cache/ship"
  mkdir -p "$log_dir"
  printf '%s\tbranch=%s\tsha=%s\tcmd=%s\treason=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$branch" \
    "$(git -C "$repo" rev-parse --short HEAD 2>/dev/null || printf '?')" \
    "$command" "$SHIP_BYPASS_REASON" >> "$log_dir/bypass.log"
  exit 0
fi

# --- draft mode -----------------------------------------------------------
draft=""
case "$command" in
  *" --draft"*|*" -d "*|*" -d") draft=" Draft mode: CRITICAL findings downgrade to WARN, but an incomplete review still blocks." ;;
esac

# --- honour a fresh cached PASS ------------------------------------------
# Without this the gate dead-loops: /ship says PASS, re-issues the command, and
# the hook blocks it again. The hash must match the skill's formula exactly —
# printf '%s' of the captured diff, because command substitution already
# stripped the trailing newline a direct pipe would include.
merge_base=$(git -C "$repo" merge-base HEAD "$base" 2>/dev/null || printf '')
if [ -n "$merge_base" ] && command -v shasum >/dev/null 2>&1; then
  diff_full=$(git -C "$repo" diff --no-color "$merge_base"...HEAD 2>/dev/null || printf '')
  hash=$(printf '%s' "$diff_full" | shasum -a 256 | awk '{print $1}')
  cache="$repo/.claude/cache/ship/$hash.json"
  if [ -f "$cache" ] && [ -n "$(find "$cache" -mmin -1440 2>/dev/null)" ]; then
    # First occurrence only: the artifact writes the top-level verdict first, so
    # a greedy match could pick one echoed inside a finding.
    verdict=$(grep -oE '"verdict"[[:space:]]*:[[:space:]]*"[^"]*"' "$cache" 2>/dev/null | head -n1 | sed 's/.*"\([^"]*\)"$/\1/')
    if [ "$verdict" = "PASS" ] || { [ "$verdict" = "WARN" ] && [ -n "$draft" ]; }; then
      printf '%s\tverdict=%s\thash=%s\tcmd=%s\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$verdict" "$hash" "$command" \
        >> "$repo/.claude/cache/ship/pass-through.log"
      exit 0
    fi
  fi
fi

deny "Run the \`ship\` skill on the current diff before \`gh pr create\`.${draft} Follow its 8-step procedure. On PASS (or WARN under --draft), re-issue this command — the hook honours the cached verdict. On BLOCK, fix the CRITICAL findings, or add a justified inline \`ship: allow ... — reason: ...\` suppression or a \`.ship-ignore\` entry with an expiry. Emergency only: prefix SHIP_BYPASS=1 SHIP_BYPASS_REASON='<reason>' (it is logged)."
