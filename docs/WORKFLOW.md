# Workflow

```
/grill                   align before building        ← cheapest step
   ↓
/plan                    planner agent → docs/plans/<slug>.md
   ↓
/impl                    branch → implementer waves → coverage → structure
   ↓
/ship                    pre-PR gate → gh pr create
   ↓
/retro                   what did that run actually cost?
```

There is no setup step. Run the built-in `/init` once if the repo has no
`CLAUDE.md` — that produces the description, commands, and layout — then add the
`## Contracts` section from [templates/CLAUDE.md](../templates/CLAUDE.md), which
is what the `reviewer` agent enforces.

Each arrow is a real handoff: one step's output file is the next step's input.
You can enter at any point and skip any step — the pipeline is a default, not a
cage.

## Where the facts come from

Nothing is generated ahead of time. Agents read what already exists:

| Need | Source |
|---|---|
| Verify commands | `package.json` `scripts`, taken verbatim |
| Package manager | the lockfile — `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, else npm |
| Test conventions | the existing test files next to the code being changed |
| Contracts | `CLAUDE.md` `## Contracts`, `docs/ARCHITECTURE.md`, `docs/adr/` |
| Known traps | the nearest `INSIGHTS.md` |
| Which skills apply to a path | each project skill's own `paths:` frontmatter |

## The steps

### `/grill` — align before building

A relentless one-question-at-a-time interview until every branch of the decision
tree is resolved, with a recommended answer attached to each question.

Skippable when the requirement is genuinely unambiguous. It usually isn't. Ten
minutes here routinely saves a full re-plan and re-implement, which makes it the
highest-leverage step in the sequence.

### `/plan` — requirements to an executable plan

Runs the `planner` agent. Produces `docs/plans/<slug>.md` with requirement IDs,
tasks with disjoint owned paths, a dependency DAG, measurable acceptance
criteria, per-task verify commands copied from `package.json`, and test intents.

The planner **stops and returns questions** rather than guessing. `/plan` relays
them to you and re-invokes it with your answers.

Choose the execution mode up front:

- **Sequential** — one agent, ordered steps. Default below ~4 tasks.
- **Parallel** — N concurrent implementers over disjoint paths. Buys wall-clock,
  costs a DAG that has to be right.

### `/impl` — execute the plan

```
branch → implementer waves (cap 3) → coverage gate → gap-fix (≤2)
       → reviewer → arch-fix (≤3) → insights → hand off to /ship
```

Runs in the main session, because that is where questions can be asked and hooks
fire predictably.

Three things are deliberate and worth knowing:

**Coverage runs before structure.** A coverage gap means a follow-up change is
coming, so anything reviewed before that gets reviewed twice — and a structural
review of an incomplete diff produces findings that evaporate.

**The coverage check scales with the plan.** Four requirements or fewer, and
`/impl` maps them to the diff inline. More than that, or parallel mode, and it
spawns `plan-verifier` — because locating evidence across many requirements is
grep-heavy work that belongs in a context you throw away.

**Every loop has a cap.** Gap-fix at 2, arch-fix at 3. When a cap is hit, you
decide: accept, keep fixing manually, or abort. Unbounded fix loops thrash
expensively and quietly.

### `/ship` — the pre-PR gate

Splits the diff into buckets — UI, server, data, shared logic, tests, AI
surfaces, config — reviews each in a parallel subagent, runs cross-cutting
checks no single bucket can see, promotes anything matching a known
`INSIGHTS.md` trap to CRITICAL, and returns one verdict.

Blocks `gh pr create` on any CRITICAL. Plain `git push` flows freely — gating
pushes trains people to bypass gates, and the moment that matters is PR-open.

Verdicts are cached by diff hash, so the hook honours a fresh PASS and the
second `gh pr create` goes straight through.

### `/retro` — what did that cost?

Token, tool-call, duration, and parallelism metrics including nested subagents,
turned into specific recommendations, appended to a trend ledger. See
[COST.md](COST.md).

## Alongside the pipeline

| Skill | When |
|---|---|
| `diagnose` | Something is broken, flaky, or slow and the cause is not obvious. Build a feedback loop before forming a theory. |
| `tdd` | Building test-first, or turning a plan's test intents into real tests. |
| `untangle` | A merge or rebase has stopped with conflicts. |
| `insights` | Something non-obvious surfaced. Fires automatically at session end when the tree is dirty. |
| `handoff` | Context is running out, or you are parking the work. |
| `skill-forge` | Teaching the harness something project-specific. This is how Riptide specialises. |
| `eval-harness` | The project ships an LLM feature. Paired with the `ai-reliability` agent. |

## Agents

You do not invoke these. `/plan`, `/impl`, and `/ship` spawn them and discard
their context — that is the point, and it is why the main session stays cheap.
`@riptide:<name>` works if you want one directly.

| Agent | Writes? | Role |
|---|---|---|
| `planner` | plan file only | Requirements → executable plan |
| `implementer` | its owned paths only | One task, to a green verify command |
| `reviewer` | no | Structure: layering, boundaries, coupling |
| `ai-reliability` | eval harness | Detect AI surfaces, build the regression detector |
| `plan-verifier` | no | Coverage matrix — only on large or parallel plans |

For broad codebase search, Riptide uses Claude Code's built-in `Explore` agent
rather than shipping its own.

## When AI is part of the product

```
@riptide:ai-reliability
```

It enumerates the AI surfaces, writes golden cases, builds the three-tier
harness (free static gate, deterministic scoring, LLM judge), wires the free
tier into CI as a required check, and reports a real baseline pass rate —
including the failures, and the variance, because one run is not a measurement.

A prompt edit that silently destroys behaviour passes every type check and every
unit test you have. That gap is what this closes.
