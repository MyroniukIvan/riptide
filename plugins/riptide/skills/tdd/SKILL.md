---
name: tdd
description: Test-driven development - the red/green loop plus the rules that make the tests worth keeping - what a good test is, which seam to test at, the anti-patterns, and vertical slicing. Use when building a feature or fixing a bug test-first, when the user mentions red-green-refactor, or when writing tests for existing behaviour.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# tdd

TDD is the red → green loop. This is the reference that makes that loop produce
tests worth keeping. Every section applies on every cycle — consult them during,
not after.

Before writing anything, open two or three existing test files near the code you
are changing. Copy their location, filename pattern, setup style, and what they
mock. A test that is correct but conventionally wrong is a maintenance problem
for everyone else, and the convention is never written down as reliably as it is
demonstrated.

## What a good test is

A test verifies **behaviour through a public interface**, not implementation.
The code underneath can change entirely; the test shouldn't. A good test reads
like a specification — "user can check out with a valid cart" tells you exactly
what capability exists — and survives refactors because it never cared about
internal structure.

## Seams — where tests go

A **seam** is the public boundary you test at: the interface where you can
observe behaviour without reaching inside.

**Only test at pre-agreed seams.** Before writing anything, write down the seams
under test and confirm them. You cannot test everything, and agreeing the seams
up front is how the effort lands on critical paths and complex logic instead of
being spread evenly over every edge case.

Ask: what is the public interface here, and which seams should we test?

## Anti-patterns

- **Implementation-coupled** — mocks internal collaborators, tests private
  methods, or asserts through a side channel (querying the database instead of
  reading through the interface). The tell: it breaks on a refactor where
  behaviour did not change.
- **Tautological** — the assertion recomputes the expected value the same way
  the code does (`expect(add(a,b)).toBe(a+b)`, a snapshot derived by hand from
  the same logic, a constant asserted equal to itself). It passes by
  construction and can never disagree with the code. Expected values come from
  an **independent** source: a known-good literal, a worked example, the spec.
- **Horizontal slicing** — all the tests first, then all the implementation.
  Bulk tests verify *imagined* behaviour: you end up testing the shape of things
  rather than what a user can do, the tests go insensitive to real change, and
  you commit to a test structure before you understand the implementation.
- **Over-mocked** — so much is faked that the test only proves the mocks were
  configured. Prefer a real dependency wherever it is fast and deterministic;
  mock at the boundary you don't own.
- **Assertion-free** — the test runs the code and asserts nothing meaningful
  ("did not throw"). It goes green forever.

## Rules of the loop

- **Red before green.** Write the failing test first. Watch it fail *for the
  right reason* — a test that fails because of a typo in the import proves
  nothing. Then write only enough code to pass it.
- **One vertical slice at a time.** One seam, one test, one minimal
  implementation, then repeat. Each test is a tracer bullet: it responds to what
  the last cycle taught you.
- **No speculative tests.** Don't anticipate the next three tests or add
  features no test demands.
- **Refactoring is not part of the loop.** It belongs after green, as its own
  step, with the tests as the safety net.

## Working from a plan's test intents

`/impl` produces a list of test intents rather than tests. To turn one into a
cycle: name the seam, confirm it, write the smallest failing test that expresses
the intent, then implement. An intent that has no correct seam is a finding
about the architecture — report it rather than testing at the wrong level.
