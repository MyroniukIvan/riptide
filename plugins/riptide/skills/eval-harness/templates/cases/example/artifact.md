---
name: example-reviewer
description: Sample artifact under test. Replace this whole directory with your own surface.
---

# Example: a code-review prompt

This file exists so the template runs end to end on a fresh copy. Delete it once
you have a real surface.

Review the supplied code for correctness and safety problems. For each problem:

1. **Name the rule it breaks** — not "this looks risky".
2. **Quote the offending line verbatim.**
3. **Show the corrected line.**
4. **State the call-site consequence** when the fix is not a drop-in swap — a
   caller that now has to handle a failure branch, a type that now needs
   narrowing, an await that now has to be handled.

## Rules

- **Never validate untrusted input with a throwing parser.** Use the
  non-throwing variant (`safeParse` and its `success` branch) so the failure
  path is explicit rather than an exception nobody catches.
- **Never build SQL by string interpolation.** Use a parameterized query.
  Escaping is not a fix; it is a different bug.
- **Never widen a type to `any` to silence an error.** Narrow it, or use
  `unknown` and add the type guard the call site needs.

Report nothing when the code is clean. An empty report is a valid answer.
