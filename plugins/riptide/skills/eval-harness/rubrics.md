# Writing rubrics an LLM judge can apply honestly

A judge is a measuring instrument. An uncalibrated instrument produces numbers
that look like data and are not.

## The judge contract

```
You are a strict, blind evaluator. Given an OUTPUT and a list of PRACTICES,
judge each practice independently.

Rules:
  1. Exactly PASS or FAIL per practice. No scales, no partial credit.
  2. PASS only when a direct verbatim quote from the OUTPUT is evidence the
     practice was met. A keyword is not evidence.
  3. Reply with ONLY minified JSON:
     {"results":[{"practice":"<text>","passed":true,"evidence":"<verbatim quote>"}]}
```

Three properties make this work, and dropping any one of them breaks it:

- **Blind** — the judge sees the output, never which version produced it, never
  which side is the "new" one.
- **Binary** — no scale. A 1–10 score compresses toward the middle, drifts
  between runs, and cannot be audited. PASS/FAIL can.
- **Verbatim evidence** — a PASS with no quote is a vibe. Requiring the quote
  makes the judge's reasoning checkable by a human in seconds, and catches the
  common failure where the judge passes a practice the output never addressed.

Score is `passed / total`. That is the whole aggregation.

## Writing a practice

A practice is one falsifiable claim about the output.

**Bad:** "The response is high quality and helpful."
Unfalsifiable. It will pass for any fluent answer.

**Bad:** "The response mentions validation."
Keyword matching. Cheaper and more reliable as a Tier 1 substring.

**Good:** "The response flags `webhookSchema.parse(body)` as unsafe for request
bodies and recommends `safeParse()`, showing the `result.success` branch needed
to handle failure without throwing."
Specific, quotable, and it fails if the artifact under test is removed.

Checklist for each practice:

- [ ] Names a **specific** thing in the output, not a quality adjective.
- [ ] A human can decide PASS/FAIL from the quoted evidence alone.
- [ ] It would **fail** without the artifact under test. Write that
      falsification in a comment next to it.
- [ ] It is not better handled as a Tier 1 substring.
- [ ] It tests one thing. Two claims joined by "and" are two practices — unless
      the conjunction *is* the requirement, which should be obvious from the
      wording.

Three to six practices per case. Beyond that you are writing a specification,
and the judge starts satisficing across them.

## Known biases, and what actually helps

| Bias | What it looks like | Mitigation that works |
|---|---|---|
| **Self-preference** | Judge favours output from its own model family | Judge from a different family, or at minimum a stronger tier. On a shared subscription families overlap — so lean on the structural mitigations below |
| **Verbosity** | Longer output scores higher regardless of content | Verbatim evidence requirement: length cannot manufacture a quote that is not there |
| **Position** | In A/B comparison, one slot wins more often | Never A/B in one call. Judge each output independently, blind |
| **Leniency** | Almost everything passes | Binary verdicts, plus at least one case you *know* should fail. If it passes, the rubric is broken, not the feature |
| **Rubric drift** | Pass rate moves and the code did not | Version the practices. A rubric edit is a change to the instrument — record it and re-baseline |

## Calibrate before you trust it

Once, at the start, and again after any rubric edit:

1. Take ~20 outputs — a mix you expect to pass and to fail.
2. Grade them yourself, PASS/FAIL, per practice.
3. Run the judge on the same set.
4. Measure agreement.

Below roughly 80% agreement, the rubric is the problem, not the judge. The
disagreements tell you exactly which practice is ambiguous — that is the whole
value of the exercise.

Keep the graded set. It is the regression test for the judge itself.

## Anti-patterns

- **Judging with the model under test, unblinded.** Guarantees a flattering
  number.
- **A scale.** "Rate 1–10" produces 7 for everything.
- **Editing the rubric until the suite is green.** That is fitting the
  instrument to the result. If a practice is genuinely wrong, fix it and
  re-baseline explicitly, in its own change, with the reason recorded.
- **One run as a verdict.** Repeat, report the spread.
- **A judge where a substring would do.** Slower, dearer, noisier.
