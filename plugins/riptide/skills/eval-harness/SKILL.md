---
name: eval-harness
description: Design and build evals for AI features - golden cases, the three-tier harness (free static gate, deterministic scoring, LLM judge), rubric writing, judge bias mitigation, CI wiring, and trend records. Use when a project ships a prompt, agent, RAG pipeline, classifier, or any LLM-backed behaviour that has no regression detector, or when an existing eval suite needs extending or is passing suspiciously.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# eval-harness

An LLM-backed feature is a component with no type system. A one-word prompt edit
can destroy its behaviour with a green build, a green test suite, and no
warning. An eval harness is the regression detector that gap requires.

This skill holds the design. The `ai-reliability` agent applies it, and a
runnable reference implementation sits in [templates/](templates/README.md).

## The three tiers — cheapest first, always

Cost discipline here is a correctness property, not a preference. An eval suite
that is expensive or slow stops being run, and a suite that is not run is worth
exactly nothing.

### Tier 0 — static gate. No model, no network, zero cost.

Everything checkable without inference:

- Prompt and skill frontmatter present and parseable.
- Referenced files and templates actually exist.
- Declared output schemas parse; examples in the prompt validate against them.
- **Every AI surface has at least one case file.** This is the rule that keeps
  coverage from rotting.
- No model ID hardcoded outside config.

Runs on every PR in under a minute. **The only tier safe to mark required.**

### Tier 1 — deterministic scoring. No judge.

Golden inputs with known-correct outputs, scored by exact match, schema
validation, or required-substring coverage.

Extraction and classification surfaces live here **entirely** — a label either
matches the golden or it doesn't, and paying a judge to tell you so is waste.

For generation surfaces, Tier 1 is the **grounding gate**: a short list of
substrings that must all appear before you pay for a judge. Grounding fails →
judge is skipped → the case fails cheaply and the diagnostic is sharper than a
judge score would have been.

### Tier 2 — LLM judge. Only for what Tier 1 cannot settle.

Binary PASS/FAIL per named practice, evidence required. See
[rubrics.md](rubrics.md) for how to write practices that mean something and how
to keep the judge honest.

### Tier 3 — trace assertions, for agent-shaped surfaces.

Which subagent was dispatched, which skill activated, which files were read, how
many turns it took, whether it terminated. Assert on the **trace**, not the
prose. A content-only eval cannot see whether a skill actually fired — and "the
skill silently stopped triggering" is the single most common harness regression.

## Golden cases

**Source from reality first.** Production logs, saved requests, reported
failures, support tickets. Invented cases test what you imagined; real ones test
what happens. Every production incident becomes a case — that is how the suite
stops being a snapshot and starts being a ratchet.

**Every case must be falsifiable.** A practice that would still pass with the
artifact under test removed is measuring the base model, not your feature.
Write the falsification down next to the practice:

```ts
// Falsifiable: without this rule the model treats it as a style preference
// rather than a type-safety violation.
"flags `payload: any` as a type-safety violation and recommends the
 narrowed alternative, quoting the field verbatim"
```

**Cover the shape of the space,** not just the happy path: typical input, an
edge case, an adversarial input, an empty or malformed input, and — where the
feature must decline — a case where the correct answer is refusal.

**Negative cases matter as much as positive ones.** For a skill or agent, at
least one case where it should *not* activate. A component that fires on
everything is as broken as one that never fires.

## Statistics, because one run is not a measurement

Three tools on top of the tiers, all reading the same append-only
`results/records.jsonl`:

- **Repeat** — run one case N times. The spread is your noise floor. A 5-point
  difference means nothing if the same case varies by 15 across runs.
- **Delta** — diff two labelled repeat runs. This is how you compare prompt v1
  against v2 honestly.
- **Benchmark** — run with and without the artifact under test. The gap is the
  measured lift, and it is the only number that answers "is this prompt earning
  its tokens".

Record every run: case name, tier, score, model, timestamp, git SHA. The trend
is the signal.

## Wiring CI honestly

| Tier | Trigger | Required check? |
|---|---|---|
| 0 static | every PR | **Yes** — free and deterministic |
| 1 deterministic | every PR touching AI surfaces | Only once stable |
| 2 judge | nightly, or on demand | **No** |
| 3 trace | nightly, or on demand | **No** |

Marking a probabilistic gate as required blocks good PRs on noise and trains the
team to bypass gates — after which none of them mean anything. Keep the LLM
tiers advisory until you have weeks of pass-rate history showing they are
stable.

## Running evals cheaply

- Prefer the smallest model that discriminates for the **task under test**, and
  a **stronger** model for the judge.
- Cache aggressively — an unchanged case with an unchanged artifact and an
  unchanged model does not need re-running on every PR.
- Cap turns per case. A runaway agent loop is the most expensive failure mode a
  suite has.
- Where the runtime supports it, run on a subscription rather than per-token
  billing. The reference harness does this by default.

## Building one

Copy [templates/](templates/README.md) into `evals/` and adapt. It is vitest plus
the Claude Agent SDK — deliberately small enough to read in one sitting and hack
on, because you will be editing cases constantly.

Three contracts in there are load-bearing; keep them if you restructure anything:

1. **Record before assert**, in a `finally`. A case that fails must still leave a
   row, or the trend data has survivorship bias built in and every regression
   reads as a gap.
2. **Two task modes.** `isolatedTask` injects the artifact as the system prompt
   and loads no on-disk config — it measures the artifact's *content*.
   `integratedTask` loads the real project harness — the only way to see whether
   a skill actually activates or a subagent actually gets dispatched.
3. **One canonical case body.** Measure → record → assert lives in exactly one
   file so case authors never rewrite it.

## Hard rules

1. **Never weaken a case to make the suite green.** A failing case is
   information. Report it and let a human decide.
2. **Never pay a judge for what a substring settles.**
3. **Grounding gate before judge, every time.**
4. **Binary verdicts with verbatim evidence.** No 1–10 scales.
5. **New AI surface → cases in the same change.** Nobody adds them later.
6. **Report variance, not just a score.** A number you cannot reproduce is not a
   measurement.
7. **A suite that passes 100% on its first run is measuring nothing.** Tighten
   the practices until it can fail.
