# Riptide

An AI-ready engineering harness that drops into any project.

Five agents, twelve skills, three guardrail hooks — a plan → implement → verify
→ review → ship pipeline for TypeScript and JavaScript projects, with an eval
harness for AI features and cost control by default.

```
/grill  →  /plan  →  /impl  →  /ship  →  /retro
```

No setup step. Run the built-in `/init` if the repo has no `CLAUDE.md`, add a
`## Contracts` section, and start.

- **[docs/WORKFLOW.md](docs/WORKFLOW.md)** — the pipeline, step by step
- **[docs/ADOPTING.md](docs/ADOPTING.md)** — install, first hour, making it yours
- **[docs/COST.md](docs/COST.md)** — what makes it cheap, and how to measure it

## Install

Riptide is **internal** — it lives in a private repo and is visible only to
people who can already read it. There is no public listing.

```bash
claude plugin marketplace add <org>/riptide   # your private repo
claude plugin install riptide@riptide
```

Prefer files you can edit? `./install.sh /path/to/your-repo` copies everything
into `.claude/` instead. For org-wide rollout — per-repo prompt, MDM-managed
settings, or the admin console — see [docs/ADOPTING.md](docs/ADOPTING.md).

## Where it gets its facts

Nothing is generated ahead of time and nothing is re-derived by guesswork:

| Need | Source |
|---|---|
| Verify commands | `package.json` `scripts`, taken verbatim |
| Package manager | the lockfile |
| Test conventions | the existing test files next to the code being changed |
| Contracts | `CLAUDE.md` `## Contracts`, `docs/ARCHITECTURE.md`, `docs/adr/` |
| Known traps | the nearest `INSIGHTS.md` |
| Which skills apply to a path | each project skill's own `paths:` frontmatter |

That last row is how you specialise the harness: write a skill for your
conventions, scope it with `paths:`, and `/plan` and `/ship` start consulting it
automatically. See `skill-forge`.

## What's in it

**Agents**

You never invoke these — `/plan`, `/impl`, and `/ship` spawn them and throw
their context away, which is why your session stays cheap.

| | Writes? | Role |
|---|---|---|
| `planner` | plan file | Requirements → tasks, owned paths, DAG, verify commands |
| `implementer` | its owned paths | One task, run to a green verify command |
| `reviewer` | no | Structure: layering, boundaries, coupling |
| `ai-reliability` | eval harness | Find the AI surfaces, build the regression detector |
| `plan-verifier` | no | Coverage matrix — only on large or parallel plans |

Broad codebase search uses Claude Code's built-in `Explore` agent rather than a
Riptide copy of it.

**Skills**

Workflow — `plan` · `impl` · `ship` · `retro` · `handoff`
Discipline — `grill` · `diagnose` · `tdd` · `untangle` · `insights` ·
`skill-forge` · `eval-harness`

**Hooks**

- `guard` — blocks the handful of commands that destroy work with no undo
  (`reset --hard`, force push, `clean -fd`, volume wipes, history rewrites).
  Narrow on purpose: a guardrail that fires on ordinary commands gets disabled.
- `ship-gate` — `gh pr create` requires a `/ship` PASS. Honours a cached verdict
  so the retry goes straight through. `git push` is untouched.
- `capture-insights` — one prompt per session, and only when the tree is dirty,
  to record anything a future session would not re-derive.

## When AI is part of the product

A prompt edit can destroy behaviour with a green build, a green test suite, and
no warning. An LLM feature is a component with no type system.

```
@riptide:ai-reliability
```

It enumerates the AI surfaces, writes falsifiable golden cases, and builds a
three-tier harness:

- **Tier 0** — static gate. No model, no network, zero cost. Every surface must
  have a case file. This is the only tier safe to mark as a required CI check.
- **Tier 1** — deterministic scoring. Extraction and classification live here
  entirely; for generation it is the grounding gate that runs *before* you pay
  for a judge.
- **Tier 2** — LLM judge. Binary PASS/FAIL per practice, PASS only with a
  verbatim quote as evidence. No 1–10 scales.
- **Tier 3** — trace assertions: did the skill actually fire, did the subagent
  actually get dispatched. A content-only suite cannot see that.

A runnable reference implementation ships with the skill. It runs on the Claude
Code subscription by default rather than per-token billing.

## Cost

Cost discipline here is structural, not a list of tips:

- Discovery happens **once**, not every session.
- `CLAUDE.md` stays a pointer map; procedures live in skills that load only when
  used.
- Build output is denied at the permission layer, so it can never enter context.
- Heavy reading happens in subagents whose context is discarded.
- Reviewers get **diff fragments**, not whole files.
- Free tier before paid: cached verdicts, deterministic gates, and a downgrade
  for anything CI already catches.
- Every loop is capped. Unbounded agent loops fail quietly and expensively.

`/retro` measures it — including subagent tokens, which the parent session's
usage does not count — and appends a row to a trend ledger.

Measure the harness itself with `claude plugin details riptide` — it reports
always-on and per-invocation token cost for every component. Only the
description lines are resident; bodies are paid when a skill actually fires.

## Notes

The code-smell baseline in `reviewer` follows Fowler, *Refactoring*, ch. 3.
Component formats and invocation semantics follow the
[Claude Code documentation](https://code.claude.com/docs/en/skills).

Internal. Not licensed for distribution outside the organisation.
