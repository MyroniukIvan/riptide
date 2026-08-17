# templates

Files `install.sh` seeds into a target repo, and that you can copy by hand.

| File | Goes to | Notes |
|---|---|---|
| `settings.json` | `.claude/settings.json` | **Merge, don't copy over.** The `hooks` block is only for the copy-in install — as a plugin the hooks are already wired. |
| `CLAUDE.md` | repo root | Two sections to add *after* running the built-in `/init`. A pointer map, not documentation. |
| `INSIGHTS.md` | repo root | Seven empty sections. Module-level copies live beside the code they describe. |

## About the deny rules

`permissions.deny` with `Read(...)` patterns is the mechanism for keeping build
output out of context. There is no `.claudeignore`.

Two things to know before you paste them in:

1. **A `Read` deny rule also blocks `Edit` on the same path.** That is what you
   want for `dist/` and lockfiles — regenerate them with the package manager
   rather than hand-editing. Check it against anything first-party.
2. **Deny rules use gitignore syntax and match at any depth** below the working
   directory, so `Read(dist/**)` already covers every package in a monorepo.

Bash is unaffected: `pnpm install` still rewrites the lockfile, and vitest still
reads whatever it needs. The rules stop the *agent* from pulling these files into
context, which is where the tokens go.

Drop any line naming a directory your project uses for first-party source.

## About the allow rules

The listed test/typecheck commands run dozens of times per feature. Prompting for
each one is friction with no safety value. Trim the list to the package manager
you actually use, and add your project's own scripts.
