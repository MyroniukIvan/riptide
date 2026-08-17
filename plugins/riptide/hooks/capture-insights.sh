#!/usr/bin/env sh
# Stop — prompt once per session to capture non-obvious findings.
#
# Blocking Stop costs one extra model turn, so this is gated hard. It fires only
# when all of the following hold:
#   * the working tree has changes (a read-only session learned nothing to write)
#   * it has not already fired this session (one marker file per session id)
#   * stop_hook_active is not already true (otherwise: infinite loop)
#
# Disable with RIPTIDE_INSIGHTS_PROMPT=0.

# No `set -e`: a hook that aborts mid-way silently becomes a no-op, which for a
# guardrail is the worst failure mode. Each step handles its own errors.
set -u

DIR=$(dirname "$0")
. "$DIR/lib.sh"

[ "${RIPTIDE_INSIGHTS_PROMPT:-1}" = "0" ] && exit 0

read_input
json_available || exit 0

# Already continuing because of a previous stop block — let the turn end.
[ "$(jget stop_hook_active)" = "true" ] && exit 0

repo=$(repo_dir)

# Nothing changed on disk → nothing durable was learned worth writing down.
[ -n "$(git -C "$repo" status --porcelain 2>/dev/null)" ] || exit 0

# Once per session. Without this the prompt fires on every turn that ends with
# a dirty tree, which is most of them.
session=$(jget session_id)
[ -n "$session" ] || exit 0
marker_dir="$repo/.claude/cache/insights"
marker="$marker_dir/$session"
[ -f "$marker" ] && exit 0
mkdir -p "$marker_dir" 2>/dev/null || exit 0
: > "$marker"

# Prune markers older than a week so the directory does not grow forever.
find "$marker_dir" -type f -mtime +7 -delete 2>/dev/null || true

cat <<'JSON'
{"decision":"block","reason":"Before finishing: if this session uncovered something a future session would NOT re-derive from the code — a failure mode that surprised you, a library or tool quirk, a decision made for a reason the code does not show, or an error you have now hit twice — invoke the `insights` skill once and append a single dated entry to the nearest INSIGHTS.md. Skip anything obvious from reading the code, anything git blame explains, and anything already in CLAUDE.md. Zero findings is a valid and common outcome — say so and stop."}
JSON
