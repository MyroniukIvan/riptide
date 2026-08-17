---
name: plan
description: Turn requirements into an executable Implementation Plan at docs/plans/<slug>.md via the planner agent, choosing parallel or sequential execution up front and relaying the planner's clarifying questions. Use before /impl.
disable-model-invocation: true
argument-hint: "[feature description, spec path, or issue URL]"
allowed-tools: Read, Grep, Glob, Bash, Agent, AskUserQuestion, Skill
---

# plan

Thin orchestrator around the `planner` agent. It exists because two decisions
must be made in the main session, where `AskUserQuestion` works: **is the
requirement clear enough to plan**, and **parallel or sequential**.

## 0. Preflight

- No argument → ask what to plan.
- Requirements are thin or hand-wavy → run `/grill` first and offer to. A plan
  built on an unresolved decision is re-planned later at full cost; ten minutes
  of interview is the cheapest step in the whole workflow.

## 1. Resolve the input

The argument is one of: a feature description, a path to a spec, or an issue
URL. For an issue URL, fetch it (`gh issue view`, `gh pr view`) and pass the
body. For a spec path, pass the path — the planner reads it.

## 2. Choose the execution mode — state it, don't make the planner ask

Decide from the shape of the work, and tell the planner:

**Sequential** — one agent, ordered steps. Default. Correct when the work is
under roughly four tasks, when tasks share files, or when later tasks depend on
what earlier ones discover.

**Parallel** — N concurrent implementers over disjoint owned paths. Only worth
it when the work genuinely splits by file ownership: separate packages, separate
modules, a backend slice and a frontend slice. Parallelism buys wall-clock, not
tokens — it costs a DAG that has to be right, and a bad ownership split corrupts
a shared tree.

If it is genuinely close, ask via `AskUserQuestion` with a recommendation.

## 3. Dispatch

Launch the `planner` agent with: the requirements, the chosen execution mode,
the target plan path, and any constraints the user stated.

## 4. Relay, don't answer

The planner cannot ask the user anything — it stops and returns questions as its
final message. When it does:

1. Put those questions to the user via `AskUserQuestion`.
2. Re-invoke the planner with the answers appended to the original prompt.
3. Never answer on the user's behalf. The planner stopped precisely because two
   readings produce different plans; picking one silently is how the wrong thing
   gets built at full speed.

Same for proposed improvements: surface them, get a yes or no, pass it back.

## 5. Sanity-check the plan before handing it on

Read the produced plan and check, mechanically:

- [ ] Every requirement ID appears in at least one task.
- [ ] Parallel mode: owned paths are pairwise disjoint, and the DAG is acyclic.
- [ ] Every name on a task's `Skills` line resolves to a real skill.
- [ ] Every task has a verify command that exists in `package.json` scripts.
- [ ] Acceptance criteria are measurable — a command, a file, an observable
      behaviour. Not "works correctly".

A failure here is a **plan defect**: send it back to the planner with the
specific problem. Do not repair it yourself — the planner owns that file, and a
hand-patched plan diverges from what the planner would produce next time.

## 6. Report

Plan path, mode, task count, DAG width, and the exact next command:
`/impl docs/plans/<slug>.md`.
