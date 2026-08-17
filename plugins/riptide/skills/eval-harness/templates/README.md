# evals — reference harness

Vitest plus the Claude Agent SDK. Small enough to read in one sitting and hack
on, which is the point: you will be editing cases constantly, so the code sits
in front of you rather than inside `node_modules`.

Runs on the **Claude Code subscription** by default — `ANTHROPIC_API_KEY` is
stripped from the spawned process, so calls use your login rather than
per-token billing. Set `EVAL_USE_API_KEY=1` to opt into the API key instead.

## Install

Copy this directory to `evals/` at your repo root, then:

```bash
cd evals && npm install
```

## Run

```bash
npm run gate       # tier 0 — static, free, the one CI requires
npm run eval       # everything
npm run eval:one -- cases/my-surface
npm run repeat -- "case name" 5        # noise floor
npm run bench -- "case name"           # with vs without the artifact
```

## Layout

```
src/config.ts    knobs, all env-overridable
src/run.ts       runtime → Result (text + trace + usage)
src/tasks.ts     isolated vs integrated task modes
src/scorers.ts   patternMatch (free) + llmJudge (binary, evidence-backed)
src/record.ts    append-only results/records.jsonl
src/case.ts      the one canonical measure → record → assert body
cases/           your cases — one directory per AI surface
static-gate.mjs  tier 0
```

## Writing a case

`cases/<surface>/<surface>.cases.ts` holds the data:

```ts
import type { QualityCase } from "../../src/index.js";

export const cases: QualityCase[] = [
  {
    name: "flags unvalidated request body and names the fix",
    prompt: FIXTURE,
    // Cheap gate: all of these must appear before the judge is paid for.
    grounding: ["safeParse", "result.success"],
    practices: [
      // Falsifiable: without the artifact under test, a model suggests
      // try/catch around parse() rather than switching to safeParse().
      "flags `schema.parse(body)` as unsafe for request bodies and recommends `safeParse()`, showing the `result.success` branch",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
];
```

`cases/<surface>/<surface>.eval.ts` wires it up:

```ts
import { describeSuite, runQualityCases } from "../../src/index.js";
import { cases } from "./example.cases.js";

describeSuite("quality", "my-surface", () =>
  runQualityCases("path/to/artifact-under-test.md", cases),
);
```

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `EVAL_MODEL` | `claude-haiku-4-5` | model under test |
| `EVAL_JUDGE_MODEL` | `claude-sonnet-5` | judge — keep it a stronger tier |
| `EVAL_THRESHOLD` | `0.6` | default judge score gate |
| `EVAL_MAX_TURNS` | `12` | per-case turn cap |
| `EVAL_USE_API_KEY` | unset | `1` to bill per token instead of the subscription |
| `EVAL_RECORDS` | `results/records.jsonl` | trend log |
| `EVAL_VERBOSE` | unset | `1` to print traces and verdicts |

## CI

Wire `npm run gate` as a **required** check. Leave the LLM tiers advisory until
weeks of pass-rate history show they are stable — a probabilistic required check
blocks good PRs on noise and teaches the team to bypass gates.
