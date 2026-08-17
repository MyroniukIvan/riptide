# CLAUDE.md

<!--
Run the built-in `/init` first — it writes the project description, the commands,
and the layout. Then add the two sections below, which /init does not produce and
Riptide's agents read.

Keep the whole file a pointer map. Every line is loaded before every turn, on
every request, forever. Procedures belong in skills (loaded only when used).
Target: under 400 tokens.
-->

## Contracts

<One line per rule that must hold, each enforceable and checkable against a diff.
This is the section the `reviewer` agent enforces; anything vague here produces
noise instead of findings. "None documented." is an honest value.>

- <e.g. Nothing under `packages/core` imports from `apps/` or `services/`.>
- <e.g. Route handlers validate their input at the edge; handlers never parse
  a raw body themselves.>
- <e.g. `any` and `as unknown as` need a comment saying why.>

## Read when…

- **`INSIGHTS.md`** (root, and the one nearest the code you are touching) —
  before solving anything non-obvious. These are traps this project already hit.
- **`docs/ARCHITECTURE.md`** — before moving code between modules.

## Workflow

`/grill` → `/plan` → `/impl` → `/ship`.
