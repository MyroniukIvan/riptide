#!/usr/bin/env bash
# Copy Riptide into a repository's .claude/ directory.
#
#   ./install.sh /path/to/repo      copy in
#   ./install.sh /path/to/repo -n   dry run
#
# The alternative is the plugin install, which nothing here duplicates — see
# docs/ADOPTING.md for which one you want. Use this when you intend to edit the
# skills; use the plugin when you want a managed, always-current bundle.

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN="$SRC/plugins/riptide"
TARGET="${1:-}"
DRY=""
[ "${2:-}" = "-n" ] || [ "${2:-}" = "--dry-run" ] && DRY=1

die() { printf 'error: %s\n' "$1" >&2; exit 1; }
say() { printf '%s\n' "$1"; }
run() { if [ -n "$DRY" ]; then printf '  would: %s\n' "$*"; else "$@"; fi; }

[ -n "$TARGET" ] || die "usage: ./install.sh /path/to/repo [-n]"
[ -d "$TARGET" ] || die "not a directory: $TARGET"
[ -d "$PLUGIN" ] || die "plugin source missing at $PLUGIN"

TARGET="$(cd "$TARGET" && pwd)"
[ "$TARGET" = "$SRC" ] && die "refusing to install Riptide into itself"

DEST="$TARGET/.claude"
say "Installing Riptide → $DEST${DRY:+  (dry run)}"

# --- components -----------------------------------------------------------
for part in agents skills hooks; do
  run mkdir -p "$DEST/$part"
  if [ -n "$DRY" ]; then
    printf '  would: copy %s/ (%s files)\n' "$part" "$(find "$PLUGIN/$part" -type f | wc -l | tr -d ' ')"
  else
    cp -R "$PLUGIN/$part/." "$DEST/$part/"
    # The eval-harness template is a real npm package; someone may have run
    # `npm install` in it. Never carry that into a target repo.
    find "$DEST/$part" -type d -name node_modules -prune -exec rm -rf {} + 2>/dev/null || true
    say "  $part/"
  fi
done
run chmod +x "$DEST/hooks/guard.sh" "$DEST/hooks/ship-gate.sh" "$DEST/hooks/capture-insights.sh"

# --- settings: merge, never clobber ---------------------------------------
SETTINGS="$DEST/settings.json"
TEMPLATE="$SRC/templates/settings.json"

if [ -n "$DRY" ]; then
  if [ -f "$SETTINGS" ]; then
    printf '  would: merge templates/settings.json into existing %s\n' "$SETTINGS"
  else
    printf '  would: create %s from templates/settings.json\n' "$SETTINGS"
  fi
elif [ ! -f "$SETTINGS" ]; then
  cp "$TEMPLATE" "$SETTINGS"
  say "  settings.json (created)"
else
  # Union the permission arrays and add only absent top-level keys. Existing
  # values always win: this file is the user's, and silently rewriting someone's
  # permissions is not something an installer gets to do.
  node -e '
const fs = require("node:fs");
const [targetPath, templatePath] = process.argv.slice(1);
const target = JSON.parse(fs.readFileSync(targetPath, "utf8"));
const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
const added = [];

target.permissions ??= {};
for (const key of ["deny", "allow", "ask"]) {
  const incoming = template.permissions?.[key] ?? [];
  if (incoming.length === 0) continue;
  target.permissions[key] ??= [];
  for (const rule of incoming) {
    if (!target.permissions[key].includes(rule)) {
      target.permissions[key].push(rule);
      added.push(`permissions.${key}: ${rule}`);
    }
  }
}

if (!target.hooks) {
  target.hooks = template.hooks;
  added.push("hooks (all three)");
} else {
  added.push("hooks: SKIPPED — you already have a hooks block; merge it by hand from templates/settings.json");
}

for (const key of ["includeCoAuthoredBy", "cleanupPeriodDays", "$schema"]) {
  if (key in template && !(key in target)) {
    target[key] = template[key];
    added.push(key);
  }
}

fs.writeFileSync(targetPath, JSON.stringify(target, null, 2) + "\n");
console.log("  settings.json (merged)");
for (const line of added) console.log(`    + ${line}`);
' "$SETTINGS" "$TEMPLATE"
fi

# --- seed docs, never overwrite -------------------------------------------
[ -f "$TARGET/INSIGHTS.md" ] || run cp "$SRC/templates/INSIGHTS.md" "$TARGET/INSIGHTS.md"

if [ -z "$DRY" ]; then
  cat <<'EOF'

Done. There is no setup command. Next:

  1. No CLAUDE.md yet? Run the built-in  /init  in the repo.
  2. Add a "## Contracts" section to CLAUDE.md — see templates/CLAUDE.md.
     That section is what the reviewer agent enforces.
  3. Try it:  /plan <something small>   then read the plan before /impl.

  docs/WORKFLOW.md   the pipeline
  docs/COST.md       what makes it cheap, and how to measure it
EOF
fi
