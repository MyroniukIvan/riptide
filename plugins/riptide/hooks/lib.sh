#!/usr/bin/env sh
# Shared helpers for Riptide hooks. Sourced, never executed directly.
#
# Hook stdin is JSON. Parsing it with sed silently under-matches on any command
# containing a quote, which is exactly the sort of command worth gating — so we
# use a real parser. `jq` when present, `node` otherwise. If neither exists the
# hook no-ops rather than guessing, because a guessing guardrail is worse than
# none.

_RIPTIDE_JSON=""

json_available() {
  command -v jq >/dev/null 2>&1 || command -v node >/dev/null 2>&1
}

# read_input — slurp stdin once into _RIPTIDE_JSON
read_input() {
  _RIPTIDE_JSON=$(cat)
}

# jget <dotted.path> — print the string value at path, empty if absent
jget() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$_RIPTIDE_JSON" | jq -r "try .$1 // \"\"" 2>/dev/null
  else
    printf '%s' "$_RIPTIDE_JSON" | node -e '
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let obj;
  try { obj = JSON.parse(raw); } catch { return; }
  for (const part of process.argv[1].split(".")) {
    obj = obj && typeof obj === "object" ? obj[part] : undefined;
    if (obj === undefined || obj === null) return;
  }
  process.stdout.write(typeof obj === "string" ? obj : JSON.stringify(obj));
});
' "$1" 2>/dev/null
  fi
}

# json_escape <string> — emit a JSON-escaped string body (no surrounding quotes)
json_escape() {
  if command -v node >/dev/null 2>&1; then
    PAYLOAD="$1" node -e 'process.stdout.write(JSON.stringify(process.env.PAYLOAD).slice(1, -1))'
  else
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\n'
  fi
}

# deny <reason> — PreToolUse: block the tool call and tell the model why
deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$(json_escape "$1")"
  exit 0
}

# repo_dir — the project root, with a sane fallback
repo_dir() {
  printf '%s' "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || printf '.')}"
}

# default_branch — the integration branch this repo actually uses
default_branch() {
  d=$(git -C "$(repo_dir)" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || printf '')
  if [ -n "$d" ]; then
    printf '%s' "${d#origin/}"
  elif git -C "$(repo_dir)" show-ref --verify --quiet refs/heads/main 2>/dev/null; then
    printf 'main'
  else
    printf 'master'
  fi
}
