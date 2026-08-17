# CLAUDE.md — working on Riptide itself

Riptide is a Claude Code harness distributed two ways from one source. This file
is for editing Riptide; [README.md](README.md) is for using it.

## Single source of truth

Everything lives in `plugins/riptide/`. Nothing is duplicated at the repo root —
`install.sh` copies from there into a target repo's `.claude/`, and the plugin
install reads the same directory. A change made in one place is a change made in
both.

| Path | What |
|---|---|
| `plugins/riptide/agents/*.md` | subagents |
| `plugins/riptide/skills/*/SKILL.md` | skills, with supporting files beside them |
| `plugins/riptide/hooks/*.sh` | hooks; `lib.sh` is sourced, not executed |
| `templates/` | files `install.sh` seeds into a target repo |
| `docs/` | user-facing documentation |

## Before committing

```bash
node plugins/riptide/skills/skill-forge/scripts/lint-skills.mjs plugins/riptide/skills
claude plugin validate ./plugins/riptide --strict
```

Both are free and deterministic. CI runs them.

## Constraints that are easy to break

- **TypeScript and JavaScript only, and no framework names.** Riptide assumes a
  TS/JS repo — `package.json`, a lockfile, a JS test runner — and nothing
  narrower. Do not name React, Next, Fastify, Prisma, or anything else in a
  skill or agent body; match on file shape (`**/*.tsx`, `**/routes/**`) instead,
  so the harness works on a repo it has never seen.
- **No Python.** Scripts are Node, no dependencies. A TS/JS shop has node on
  every machine; assuming python3 as well is one more thing to break.
- **There is no setup step.** Verify commands come from `package.json`, the
  package manager from the lockfile, conventions from neighbouring files. Do not
  reintroduce a discovery phase — the built-in `/init` already covers what it
  would produce.
- **Hooks use `set -u`, never `set -e`.** A hook that aborts mid-way becomes a
  silent no-op, which for a guardrail is the worst outcome. Handle errors
  explicitly.
- **The `/ship` diff hash formula appears in two places** — `skills/ship/SKILL.md`
  step 2 and `hooks/ship-gate.sh`. They must stay identical or the gate
  dead-loops: the skill writes a cache key the hook never finds. `printf '%s'`
  of the captured diff, not a direct pipe.
- **Skills are namespaced under the plugin** (`/riptide:plan`) but unprefixed in
  a copy-in install (`/plan`). Never reference a skill by its prefixed name
  inside another skill's body.
- **Every loop needs a cap**, and the cap needs a stated reason. Uncapped agent
  loops fail quietly and expensively.
- **`disable-model-invocation: true`** on anything the model should not reach for
  on its own — the workflow orchestrators. Discipline skills stay
  model-invocable.

## Adding a component

New skill or agent: write it, add it to the tables in `README.md` and
`docs/WORKFLOW.md`, and run the linter. A component nobody can discover from the
docs does not exist.

New hook: add it to `plugins/riptide/hooks/hooks.json` **and** to the `hooks`
block in `templates/settings.json` — the plugin and copy-in paths are wired
separately.
