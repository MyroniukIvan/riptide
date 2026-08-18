---
name: diagnose
description: Disciplined diagnosis loop for hard bugs and performance regressions - build a tight feedback loop, reproduce and minimise, generate ranked falsifiable hypotheses, instrument one variable at a time, fix with a regression test, then clean up. Use when something is broken, throwing, failing, flaky, or slow and the cause is not obvious.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# diagnose

A discipline for hard bugs. Skip a phase only with an explicit reason.

## Phase 1 — Build a feedback loop

**This is the skill.** Everything after it is mechanical. With a tight pass/fail
signal that goes red on *this* bug, you will find the cause — bisection,
hypothesis testing, and instrumentation all just consume that signal. Without
one, no amount of reading code will save you.

Spend disproportionate effort here. Be aggressive and creative.

### Ways to build one, roughly in order

1. **A failing test** at whatever seam reaches the bug.
2. **A curl or HTTP script** against a running dev server.
3. **A CLI invocation** with a fixture input, diffed against known-good output.
4. **A headless browser script** driving the UI, asserting on DOM, console, or
   network.
5. **Replay a captured trace** — save a real request, payload, or event log and
   replay it through the code path in isolation.
6. **A throwaway harness** — the minimum subset of the system that exercises the
   path with one function call.
7. **A property or fuzz loop** — for "sometimes wrong", run a thousand inputs
   and look for the shape of the failure.
8. **A bisection harness** — if it appeared between two known states, automate
   "boot at X, check, repeat" so `git bisect run` can consume it.
9. **A differential loop** — same input through two versions or two configs,
   diff the outputs.

### Tighten it

Treat the loop as a product. Once you have one:

- **Faster** — cache setup, skip unrelated init, narrow the scope.
- **Sharper** — assert the specific symptom, not "didn't crash".
- **More deterministic** — pin the clock, seed the RNG, isolate the filesystem,
  freeze the network.

A 30-second flaky loop is barely better than none. A 2-second deterministic one
is a superpower.

### Non-deterministic bugs

The goal is not a clean repro, it is a **higher reproduction rate**. Loop the
trigger 100×, parallelise, add stress, narrow timing windows, inject sleeps. A
50% flake is debuggable; a 1% flake is not. Keep raising the rate until it is.

### If you genuinely cannot build one

Stop and say so. List what you tried, then ask for: access to an environment
that reproduces it, a captured artifact (HAR, log dump, core dump, screen
recording with timestamps), or permission to add temporary instrumentation in
the environment where it happens.

**Do not proceed to hypothesising without a loop.**

### Completion criterion

Phase 1 is done when you can name **one command** you have **already run at
least once** — paste the invocation and its output — that is:

- [ ] **Red-capable** — drives the actual bug path and asserts the user's *exact*
      symptom. Not "runs without erroring".
- [ ] **Deterministic** — same verdict every run (or a pinned high rate).
- [ ] **Fast** — seconds.
- [ ] **Unattended** — you can run it without a human.

If you catch yourself reading code to build a theory before this command exists,
stop. Jumping to a hypothesis is the exact failure this skill prevents.

## Phase 2 — Reproduce, then minimise

Run the loop. Watch it go red. Confirm:

- [ ] It reproduces the failure **the user described**, not a different one
      nearby. Wrong bug, wrong fix.
- [ ] It reproduces across multiple runs.
- [ ] You captured the exact symptom, so later phases can prove the fix
      addressed it.

Then **shrink** to the smallest scenario still red. Cut inputs, callers, config,
data, and steps **one at a time**, re-running after each cut.

Done when every remaining element is load-bearing — removing any one turns it
green. This shrinks the hypothesis space in Phase 3 and becomes the regression
test in Phase 5.

## Phase 3 — Hypothesise

Generate **3–5 ranked hypotheses before testing any of them.** Generating one at
a time anchors you on the first plausible idea.

Each must be **falsifiable** — state the prediction:

> "If X is the cause, then changing Y makes the bug disappear."

If you cannot state the prediction, it is a vibe. Sharpen it or drop it.

**Show the ranked list to the user before testing.** They often re-rank it
instantly ("we deployed a change to #3 yesterday") or have already ruled one
out. Cheap checkpoint, large saving. Don't block on it if they're away.

## Phase 4 — Instrument

Every probe maps to a specific prediction from Phase 3. **Change one variable at
a time.**

1. **Debugger or REPL** if the environment supports it. One breakpoint beats ten
   logs.
2. **Targeted logs** at the boundaries that distinguish the hypotheses.
3. Never "log everything and grep".

**Tag every debug log** with a unique prefix — `[DBG-a4f2]` — so cleanup is one
grep. Untagged logs survive forever; tagged ones die.

**Performance regressions:** logs are usually the wrong tool. Establish a
baseline measurement (timing harness, profiler, query plan), then bisect.
Measure first, fix second.

## Phase 5 — Fix, with a regression test

Write the regression test **before** the fix — but only if a **correct seam**
exists. A correct seam exercises the real bug pattern as it occurs at the call
site. A test at a seam too shallow to replicate the chain that triggered the bug
gives false confidence and is worse than none.

**If no correct seam exists, that is itself the finding.** Record it: the
architecture is preventing this bug from being locked down.

Otherwise:

1. Turn the minimised repro into a failing test at that seam.
2. Watch it fail.
3. Apply the fix.
4. Watch it pass.
5. Re-run the Phase 1 loop against the **original, un-minimised** scenario.

## Phase 6 — Clean up and record

Before declaring done:

- [ ] The original repro no longer reproduces (re-run the Phase 1 loop).
- [ ] The regression test passes, or the absence of a seam is documented.
- [ ] All `[DBG-…]` instrumentation removed (grep the prefix).
- [ ] Throwaway harnesses deleted or moved somewhere clearly marked.
- [ ] The hypothesis that turned out correct is stated in the commit message.

Finally: **what would have prevented this?** If the answer is architectural — no
test seam, tangled callers, hidden coupling — say so now, after the fix, when
you know more than you did at the start.
