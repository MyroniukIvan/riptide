#!/usr/bin/env sh
# PreToolUse — block irreversible commands before they run.
#
# Scope is deliberately narrow: only things that destroy work with no undo. A
# guardrail that fires on ordinary commands gets disabled within a day, and then
# it protects nothing. Everything blocked here is either unrecoverable or
# recoverable only via the reflog, which an agent will not think to use.
#
# Opt out per pattern with RIPTIDE_GUARD_ALLOW (comma-separated ids):
#   RIPTIDE_GUARD_ALLOW=force-push,hard-reset
# Disable entirely with RIPTIDE_GUARD=0.

# No `set -e`: a hook that aborts mid-way silently becomes a no-op, which for a
# guardrail is the worst failure mode. Each step handles its own errors.
set -u

DIR=$(dirname "$0")
. "$DIR/lib.sh"

[ "${RIPTIDE_GUARD:-1}" = "0" ] && exit 0

read_input
json_available || exit 0

[ "$(jget tool_name)" = "Bash" ] || exit 0
command=$(jget tool_input.command)
[ -n "$command" ] || exit 0

allowed() {
  case ",${RIPTIDE_GUARD_ALLOW:-}," in
    *",$1,"*) return 0 ;;
    *) return 1 ;;
  esac
}

# id | extended regex | why it is blocked and what to do instead
check() {
  id=$1; pattern=$2; message=$3
  allowed "$id" && return 0
  printf '%s' "$command" | grep -qE "$pattern" || return 0
  deny "Blocked (\`$id\`): $message Override for this session with RIPTIDE_GUARD_ALLOW=$id, or run it yourself."
}

check hard-reset \
  'git +reset +(--hard|--merge)' \
  'git reset --hard discards uncommitted work irreversibly. Use `git stash` first, or `git reset --soft` / `git restore --staged` if you only meant to unstage.'

check force-push \
  'git +push +[^|;&]*(--force([^-]|$)|-f( |$))' \
  'A force push can destroy commits on the remote for everyone. Use `--force-with-lease`, and only after confirming nobody else has pushed.'

check clean \
  'git +clean +[^|;&]*-[a-zA-Z]*[fdx]' \
  'git clean deletes untracked files permanently — including .env files and scratch work git never saw. Run `git clean -n` first and review the list.'

check branch-delete \
  'git +branch +[^|;&]*-D' \
  'git branch -D deletes an unmerged branch. Use -d, which refuses when the work is not merged.'

check checkout-discard \
  'git +(checkout|restore) +[^|;&]*(\.|--)( |$)' \
  'This discards all local modifications. Stash them first if there is any chance they matter.'

check rm-recursive-root \
  'rm +[^|;&]*-[a-zA-Z]*[rR][a-zA-Z]* +(/|~|\$HOME|\.)( |$)' \
  'A recursive delete of the home, root, or current directory. Name the specific path instead.'

check volume-wipe \
  '(docker +compose +[^|;&]*down +[^|;&]*(-v|--volumes)|docker +volume +rm)' \
  'This wipes database volumes — local data and any seeded fixtures go with it. Use `docker compose down` without -v, or say explicitly that the data is disposable.'

check destructive-sql \
  '(psql|mysql|sqlite3|mongosh)[^|;&]*(DROP +(TABLE|DATABASE|SCHEMA)|TRUNCATE +TABLE|DELETE +FROM +[a-zA-Z_]+ *;)' \
  'A schema-destroying or unfiltered statement against a live database. Run it yourself if it is genuinely intended.'

check history-rewrite \
  'git +(filter-branch|filter-repo|push +[^|;&]*--mirror)' \
  'This rewrites published history for every collaborator. It is a coordinated operation, not an agent action.'

exit 0
