---
name: impl
description: Execute an Implementation Plan end to end in the main session - feature branch, implementer waves per the DAG, a coverage gate, a capped gap-fix loop, structural review with a capped fix loop, then hand off to /ship. Use to run a plan produced by /plan.
disable-model-invocation: true
argument-hint: "[docs/plans/<slug>.md]"
allowed-tools: Read, Grep, Glob, Bash, Edit, Agent, Skill, AskUserQuestion
---

# impl

Executes one plan. Runs in the **main session** deliberately: only here does
`AskUserQuestion` work, and only here do the PR hooks fire predictably. Do not
wrap this pipeline in a subagent.

```
plan → branch → implementer waves (DAG, cap 3) → coverage gate (FIRST)
     → gap-fix loop (≤2) → reviewer → arch-fix loop (≤3) → /ship
```

## 0. Preflight

1. **Find the plan.** Named argument, else infer from the branch name, else the
   most recent file in `docs/plans/`. Still ambiguous → ask once.
2. **Read it fully.** Extract: execution mode, the requirements table, tasks
   with owned paths + Skills lines + DAG edges, per-task verify commands,
   test intents.
3. **Branch gate.** `git branch --show-current`. On the default branch, create
   `feat/<plan-slug>` before anything else. Implementers run in the launch
   branch and the ship gate refuses to run on the default branch.
4. **Sanity-check the DAG** (parallel mode): owned paths pairwise disjoint, no
   cycles, every name on a task's Skills line resolves. A violation is a **plan
   defect** — stop and send the user back to `/plan`. Never improvise ownership;
   that is how two agents corrupt one file.

## 1. Implementation

**Parallel mode** — topologically sort into waves. A wave is every task whose
dependencies are complete.

- Launch each wave's implementers **in a single message**, capped at **3
  concurrent**. A larger wave runs in batches of 3.
- Each implementer prompt carries, verbatim from the plan: task ID and text,
  owned paths, the Skills line, acceptance criteria, red flags, and the exact
  verify command. Also name the paths **other** tasks own, so "stop and report"
  beats improvisation.
- Between waves, read each report for: files changed inside owned paths, verify
  command green, handoff notes.

**Sequential mode** — one implementer per step, in order, same prompt contract.
The verify/review tail below is identical.

### When a task fails or stops

1. Do **not** launch its dependents.
2. Let the current wave drain.
3. Show the user the failing report and ask via `AskUserQuestion`: **retry**
   with an amended prompt / **re-plan** (back to `/plan` with the failure as
   input) / **abort**.
4. Never reassign a failed task's owned paths to another instance.

## 2. Coverage gate — and it goes first

Confirm every requirement actually landed **before** any structural review. A
coverage gap means a follow-up change is coming, so anything reviewed before
that gets reviewed twice — while a structural review of an incomplete diff
produces findings that evaporate on the next commit.

**How you check scales with the plan:**

| Plan | Method |
|---|---|
| **≤ 4 requirements, sequential** | Inline. Read the branch diff and map each requirement ID to a `path:line` yourself. A subagent round-trip to confirm what a three-file diff already shows is a paid step with no information in it. |
| **> 4 requirements, or parallel mode, or the plan traces to a spec** | Spawn the `plan-verifier` agent with the plan path and the pre-tests flag. Locating evidence across many requirements is grep-heavy work that belongs in a context you throw away. |

The rubric is the same either way: **COVERED** (evidence located), **PARTIAL**
(name the missing part), **MISSING** (name what you searched for), **DEFERRED**
(test evidence only, in pre-tests mode). Evidence is a `path:line`, a test name,
or a migration file — never an assertion. An unlocated criterion is MISSING, not
"probably fine". Every requirement row appears in the report; silence on a row
reads as coverage.

- `DEFERRED` rows are **not** gaps. Route them to the manual checklist in §4.
- **Gap-fix loop, capped at 2.** For MISSING/PARTIAL rows, spawn follow-up
  implementer tasks scoped to the gap (owned paths = the affected files), then
  re-check **the gap rows only**. After 2 iterations with gaps remaining, stop
  and ask: accept the gaps as descoped, or re-plan.

The cap is the point, and neither the inline check nor `plan-verifier` proposes
fixes — naming the gap is the whole job, so the loop cannot thrash.

## 3. Structural review + fix loop

Launch the `reviewer` agent scoped to the branch diff against the base branch.

On **REQUEST CHANGES**, run the **arch-fix loop, capped at 3**:

1. Spawn **one** implementer whose task is exactly the CRITICAL and WARNING
   findings — quote each verbatim (smell, `path:line`, fix direction). Its owned
   paths must include any test file whose imports break when code moves. Its
   done condition is the touched package's **existing** verify command, green.
2. Re-invoke `reviewer` on the updated diff.
3. APPROVE → exit. Still REQUEST CHANGES → next iteration with the **remaining**
   findings only.

After 3 iterations without APPROVE, stop and ask: accept the remaining findings
(record them verbatim in the final report), keep fixing manually, or abort.

Loop discipline: never send the same findings to two parallel fixers; never let
a fix iteration touch paths outside the findings' files plus their broken test
imports; count an iteration even when the reviewer surfaces *new* findings
caused by a fix.

## 4. Final re-check + manual checklist

Re-check **previously-gapped rows only** once both loops settle.

Collect into a **manual checklist** in the final report — never silently drop
any of these:

- all `DEFERRED` test-evidence rows, plus the plan's `## Test intents`;
- runtime acceptance criteria ("the page loads", "the job completes");
- anything needing an environment you do not have.

If the project has a TDD convention and the intents are worth authoring now,
offer `/tdd` on the specific seams rather than writing tests blind.

## 5. Terminal duties

1. If the plan traces to a spec and coverage is ALL COVERED (modulo accepted
   descopes; DEFERRED does not block), flip the spec's status and update any
   index entry that references it. A stale index is the standard failure here.
2. Hand off: tell the user to run `/ship`. Do not open the PR yourself unless
   they ask — and if you do, the ship gate fires on `gh pr create` anyway.

## Output contract

- **Plan / branch / mode.**
- **Waves** — task → files changed, verify command, green?
- **Coverage** — verdict per run, gap-loop iterations used, accepted descopes.
- **Structure** — verdict, fix-loop iterations, fixes applied with re-green
  evidence, accepted residual findings quoted verbatim.
- **Manual checklist** — deferred intents, runtime criteria.
- **Next** — `/ship`.

## Hard rules

1. **Never run on the default branch** — branch first.
2. **Concurrency cap 3**, launched in a single message.
3. **Coverage before structure**, always.
4. **Gap-fix loop caps at 2; arch-fix loop caps at 3.** Then the user decides.
5. **A failed task never fails silently** — §1 failure protocol, user decides.
6. **No ownership improvisation.** Plan defects go back to `/plan`.
7. **One plan per invocation.** Finish or abort before starting another.
