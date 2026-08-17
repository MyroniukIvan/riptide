# ship — the hook protocol

How `hooks/ship-gate.sh` cooperates with this skill.

## What the hook is, and is not

The hook is a **thin wrapper**. A shell script cannot call a model, so it does
not run the review itself. When it sees `gh pr create`, it returns a
`permissionDecision: "deny"` whose reason re-prompts the model to invoke `/ship`
first. The model runs the skill, gets a verdict, and re-issues the original
command.

The trade-off is deliberate: the hook can never auto-pass a fresh diff, so the
first `gh pr create` on a non-trivial change always gets interrupted once. For a
pre-PR gate that is the correct default — the alternative is a hook that shells
out to a second model round-trip on every push.

## Scope

Fires **only on `gh pr create*`**. Plain `git push` flows freely: feature-branch
backups, force-pushes after a rebase, and pushing someone else's branch are not
moments that need a review gate, and gating them trains people to bypass it.

The gate is at PR-open time, where a human is about to read the diff anyway.

## Short-circuits (exit 0, no block)

- The tool is not `Bash`, or the command is not `gh pr create*`.
- The current branch is the default branch — `/ship` refuses to run there
  anyway.
- A **fresh cached verdict** exists: `.claude/cache/ship/<hash>.json`, under
  24 h old, with a top-level `verdict` of `PASS` (or `WARN` under `--draft`).
  The pass-through is logged to `pass-through.log`.

  Without this check the gate dead-loops: the skill says PASS, re-issues the
  command, and the hook blocks it again. The hash must be computed exactly as
  the skill computes it — `printf '%s'` of the captured diff, piped to
  `shasum -a 256`. A direct `git diff | shasum` includes the trailing newline
  the command substitution stripped, produces a different key, and the cache
  never hits.

- **Bypass** — `SHIP_BYPASS=1` together with a non-empty `SHIP_BYPASS_REASON`.

## Draft mode

When the intercepted command carries `--draft`, the hook appends a draft note to
the block reason. The skill downgrades `BLOCK` to `WARN` for CRITICAL findings —
but `BLOCK — incomplete review` still blocks, because an incomplete review is
not a finding about the code, it is the absence of a review.

## Bypass protocol

For an actual emergency:

```bash
SHIP_BYPASS=1 SHIP_BYPASS_REASON="prod outage, incident #412" gh pr create --fill
```

A bypass with no reason is rejected and re-blocked. Successful bypasses append a
row to `.claude/cache/ship/bypass.log` — timestamp, branch, SHA, command,
reason. The audit trail is the price of the escape hatch, and it is what keeps
the escape hatch from becoming the default path.

## Wiring

As a plugin, `hooks/hooks.json` wires this automatically. Copied into a repo
directly, use the `PreToolUse` block from `templates/settings.json`.
