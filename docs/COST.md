# Cost

Riptide's cost position is structural, not a set of tips: the expensive things
happen once, the cheap things happen every time, and the harness never pays a
model to determine something a file already records.

Measure before and after any change here with `/retro`. Everything below is a
lever, not a law.

---

## 1. Read the facts, don't re-derive them

Verify commands come from `package.json` `scripts`, verbatim. The package
manager comes from the lockfile. Test conventions come from the test files
sitting next to the code. Contracts come from `CLAUDE.md`.

That is three or four small reads. The failure mode this avoids is an agent
exploring the repo to work out how to run the tests — which costs thousands of
tokens and still gets it wrong often enough to matter.

If a fact is genuinely non-obvious and keeps being re-derived, that is what
`INSIGHTS.md` is for. Write it once.

## 2. Keep `CLAUDE.md` a pointer map

`CLAUDE.md` is loaded before every turn, on every request, for the life of the
project. A 5,000-token instruction file costs 5,000 tokens before you have typed
anything.

- **Facts that agents need sometimes** → `INSIGHTS.md`, read only when solving
  something non-obvious.
- **Procedures** → a skill. A skill's body loads only when it fires; until then
  it costs its description line.
- **Pointers** → `CLAUDE.md`. Target under ~400 tokens.

Moving a 900-token procedure out of `CLAUDE.md` into a skill is a straight
saving on every request from then on.

## 3. Keep build output out of context

There is no `.claudeignore`. The mechanism is `permissions.deny` with `Read(…)`
patterns — see [templates/settings.json](../templates/settings.json).

One accidental read of a bundled `dist/` file or a 4 MB lockfile can cost more
than an entire planning session. The deny list makes that impossible rather than
unlikely.

Notes:
- A `Read` deny also blocks `Edit` on the same path. Desirable for `dist/` and
  lockfiles; check it against anything first-party.
- Rules are gitignore syntax and match at any depth, so one entry covers every
  package in a monorepo.
- Bash is unaffected. `pnpm install` still writes the lockfile; the *agent* just
  never pulls it into context.

## 4. Isolate heavy reading in subagents

A subagent's context is discarded when it returns; only its report enters the
main session. Anything that means reading widely and reporting narrowly belongs
in one.

This is why `/ship` fans out to per-bucket subagents instead of reviewing in the
main session, and why `/plan` delegates broad search to `Explore`. A grep-heavy
lookup that would add 20k tokens to your main context adds a 300-token report
instead — and the main context stays cheap for the rest of the session, which
compounds.

## 5. Diff fragments, never whole files

`/ship` passes each reviewer `git diff -- <file>`, not the file. A reviewer only
needs the changed regions plus a few lines of context; sending the file is
typically 10–50× the tokens for no additional finding.

The same applies when you hand context to any subagent: send the smallest thing
that answers the question.

## 6. Load skills by name, not by preloading everything

Agents preload nothing by default. A task's skill list comes from the plan —
derived from each project skill's own `paths:` frontmatter — and is loaded at
task start.

Preloading every skill "so nothing is missed" is a trap: a large body of mostly
irrelevant guidance dilutes attention on the actual code *and* costs the tokens.
An explicit per-task list keeps the guarantee — nothing is left to conditional
discovery — at a fraction of the price.

## 7. Free tier before paid tier

- `/ship` caches its verdict by diff hash. An unchanged diff is never reviewed
  twice.
- `/ship` downgrades any finding typecheck, lint, or the test suite would catch.
  Do not pay a model to find what CI finds for free.
- The eval harness runs a deterministic grounding gate before the LLM judge. A
  case that fails on substrings never reaches the judge.
- `skill-forge`'s linter and the eval static gate cost zero tokens and belong in
  CI as required checks.

Reach for a script whenever the work is mechanical. A script that always gives
the same answer costs nothing and never drifts.

## 8. Bound the loops

Every loop in the harness has a cap: gap-fix at 2, arch-fix at 3, implementer
concurrency at 3, eval turns per case. Unbounded agent loops are the most
expensive failure mode there is, and they fail *quietly* — the run just costs
four times what it should.

When a cap is hit, the user decides. That is deliberate.

## 9. Model tiering

Riptide's agents default to Sonnet, with `effort: low` on `plan-verifier`, the
most mechanical of them. Adjust to taste:

- **Planning and structural review** benefit from a stronger model — a bad plan
  costs a whole implementation cycle.
- **Mechanical work** (locating evidence, matching a coverage row, bucketing
  files) does not. Drop the tier or the effort level.
- **Eval judges** should be a stronger tier than the task under test, to soften
  self-preference bias.

Model and effort are per-agent frontmatter, and `model:` / `effort:` also work
per-skill. Change them in your copy; the defaults are a starting point, not a
recommendation for your workload.

## 10. Parallelism buys time, not tokens

Three implementers running concurrently finish sooner and cost the same as
three running in sequence — plus the DAG you had to get right, plus the risk of
a bad ownership split.

Use parallel mode when wall-clock matters and the work genuinely splits by file
ownership. Default to sequential below about four tasks.

---

## What the harness itself costs

```bash
claude plugin details riptide
```

It reports always-on cost — the description lines, the only part resident in
every session — and per-invocation cost for each component. Bodies are paid only
when a skill fires. Hooks cost nothing in context; they run in the harness.

Run this after adding project skills. If always-on creeps past a couple of
thousand tokens, the descriptions have grown past routing into documentation.

## Measuring a run

```
/retro
```

Reports tokens (including subagents, which the parent's usage does not count),
cache-hit rate, tool calls, duration, parallelism, and duplicated file reads —
then appends a row to `docs/retros/ledger.md`.

What to look at:

| Signal | What it usually means |
|---|---|
| Cache-hit below ~70% on a long session | Something volatile is invalidating the prompt prefix early |
| One file read by 3+ actors | Pre-fetch it into the plan or the orchestrator prompt |
| One agent dominating output tokens | Its brief is too broad, or it is retrying |
| Max parallelism of 1 in a parallel run | The DAG had a dependency that was not real |
| A review pass over a diff that then changed | Coverage gate ran too late |

The ledger is the point. One run is an anecdote.
