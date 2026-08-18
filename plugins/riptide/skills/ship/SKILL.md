---
name: ship
description: "Pre-PR gate. Routes the current diff through the project's per-bucket skills in parallel read-only subagents, runs cross-cutting checks the buckets cannot see, aggregates findings by severity, caches the verdict by diff hash, and blocks `gh pr create` on any CRITICAL. Triggers: 'ship it', 'self review', 'pre-PR check', 'review my changes before the PR', or automatically via the PreToolUse hook on `gh pr create`."
argument-hint: "[--staged] [--strict] [--no-cache]"
allowed-tools: Read, Grep, Glob, Bash, Agent, Skill
---

# ship

The last gate before a PR exists. It splits the working diff into buckets,
reviews each in its own throwaway context, and turns the result into one
blocking verdict.

Not a substitute for a human review, and not the same as a post-PR review pass.
This one runs locally, costs a few cents, and catches the things you already
know are traps.

## When it fires

- **Manually** — "ship it", "self review", "pre-PR check", "review my changes".
- **By hook** — the `PreToolUse` hook on `gh pr create` returns a block that
  re-prompts for this skill. See [gate.md](gate.md) for the protocol, draft
  mode, and the bypass.

Do **not** fire when: the branch is the default branch, the diff is empty, or
the diff is docs-only. Report `skipped` and exit 0.

## Procedure

### 1. Scope the diff

```bash
base=$(git merge-base HEAD "$(git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo origin/main)")
files=$(git diff --name-only --diff-filter=ACMR "$base"...HEAD)
diff_full=$(git diff --no-color "$base"...HEAD)
```

Empty `files` → PASS, "no changes to review".
`--staged` → use `git diff --cached` for both.

### 2. Cache lookup

```bash
hash=$(printf '%s' "$diff_full" | shasum -a 256 | awk '{print $1}')
cache=.claude/cache/ship/$hash.json
```

A cache file that exists and is under 24 h old → print it with a `[cached]`
footer and exit with its verdict. `--no-cache` skips this.

Hash `printf '%s'` of the captured diff, not a direct pipe: command substitution
already stripped the trailing newline, and the hook computes the key the same
way. A mismatch here means the hook never sees your PASS and the gate dead-loops.

### 3. Bucket the files

Walk this table in order. A file may land in several buckets; skip empty ones.

| Bucket | Matches | Focus |
|---|---|---|
| **UI** | `**/*.tsx`, `**/*.jsx`, `**/*.css`, `**/*.module.*` | Rendering correctness, state that should be derived, effects that should not exist, accessibility of new interactive elements, anything user-controlled reaching the DOM |
| **Server** | `**/api/**`, `**/routes/**`, `**/server/**`, `**/handlers/**`, `**/*.route.ts`, `app/**/route.ts` | Validation at the edge, authz on every path, error shape, anything reaching a query or the filesystem from request data |
| **Data** | `**/db/**`, `**/schema/**`, `**/models/**`, `**/*repository*`, `**/migrations/**` | Query construction, migration reversibility, indexes on new lookups, nullability changes against existing rows |
| **Shared logic** | remaining `**/*.ts`, `**/*.js`, `**/*.mjs` | Correctness on edge inputs, error handling, dead branches, boundaries crossed |
| **Tests** | `**/*.test.*`, `**/*.spec.*`, `**/e2e/**`, `**/__tests__/**` | Tests that cannot fail, tautological assertions, implementation coupling, convention drift from their neighbours |
| **AI surfaces** | `**/prompts/**`, `**/*.prompt.*`, `.claude/**` | Whether the change has an eval case; see the `eval-harness` skill |
| **Config / CI** | `**/package.json`, `**/*.config.*`, `.github/**`, `Dockerfile*` | Structural validity, a dependency added without a lockfile update, a secret in a workflow |
| **Docs** | `**/*.md`, `docs/**` | Skip. Report `bucket: docs, skipped: true` |

**Project skills route themselves.** Any skill under `.claude/skills/` whose
`paths:` frontmatter matches a file in a bucket gets named in that bucket's
subagent prompt. That is how a project teaches this gate its own rules — write
the skill, scope it with `paths:`, and it starts being consulted. See
`skill-forge`.

To override the table wholesale, create `.claude/riptide/buckets.md` with the
same columns; if it exists, use it instead.

### 4. Dispatch parallel subagents

One `Explore` subagent per non-empty bucket. **All dispatches in a single
message**, in waves of 3.

Each subagent gets:

1. **Diff fragments, not whole files** — `git diff --no-color "$base"...HEAD --
   <file>` per file. Whole files are the single largest waste in this skill;
   the subagent only reviews changed regions.
2. **A file budget** — over 20 files in a bucket, keep the 20 largest diffs and
   record the rest under `files_skipped_budget`. Never silently truncate.
3. The **skill names** to consult — it loads them itself.
4. The **finding contract** and **severity definitions** below, verbatim.
5. A **tooling-parity hint**: anything typecheck / lint / the test suite would
   already catch gets `tool_would_catch: true` and is downgraded to INFO.

Prompt template at the end of this file.

### 5. Cross-cutting pass

Run these in the main session against the diff file list — no single bucket can
see them. Add the project's own recurring mistakes to `CLAUDE.md` under
`## Contracts` and check those too.

| Check | Severity |
|---|---|
| An exported type or schema changed without its consumers updated in the same diff | HIGH |
| A new DB column or model field with no paired migration file | CRITICAL |
| A new external input path (route handler, server action, queue consumer, webhook) with no validation at the edge | CRITICAL |
| A new `process.env.X` read with no entry in `.env.example` | MEDIUM |
| A dependency added to a `package.json` with no lockfile change in the same diff | HIGH |
| A generated or build-output file committed (`dist/`, `.next/`, `*.tsbuildinfo`) | HIGH |
| A secret-shaped literal (long base64, `sk-`, `-----BEGIN`) added anywhere | CRITICAL |
| A new test file whose name or location does not match its neighbours | HIGH |
| `any`, `as unknown as`, or `@ts-expect-error` added without a comment explaining why | MEDIUM |

### 6. Aggregate

Parse each bucket report against the contract. Valid → merge. Invalid → mark the
bucket **incomplete** with the parse error.

Post-process, in this order:

1. `tool_would_catch: true` → severity becomes INFO.
2. **Inline suppressions** — scan the offending file's diff region for
   `ship: allow <SEVERITY> <RULE> — reason: <text>`. Match → set
   `suppressed_by: "inline"`. A suppression with no `— reason:` leaves the
   finding intact **and** adds a LOW `ship/suppress-without-reason`.
3. **Ignore file** — `.ship-ignore` at the repo root, a YAML list. Every entry
   needs `rule`, `file`, `reason`, `expires`. Missing `expires` → entry rejected
   plus a LOW finding. Past `expires` → original severity kept, summary prefixed
   `[expired ignore]`.
4. `--strict` → HIGH becomes blocking too (verdict only, severity unchanged).

**Any bucket incomplete → verdict is `BLOCK — incomplete review`**, whatever the
counts say. A subagent that failed silently is indistinguishable from a clean
bucket, and treating it as clean is how this gate stops meaning anything.

### 7. Persist and rule

Write the markdown report to `.claude/cache/ship/latest.md` and the machine
artifact to `.claude/cache/ship/<hash>.json` — the top-level `verdict` key
first, so the hook's first-match parse reads the verdict and not one echoed
inside a finding.

| Condition | Verdict | Exit |
|---|---|---|
| Any bucket incomplete | `BLOCK — incomplete review` | 2 |
| `--draft` and criticals > 0 | `WARN — draft mode` | 0 |
| criticals > 0 (or highs > 0 under `--strict`) | `BLOCK — N critical, M high` | 2 |
| otherwise | `PASS — N high, M medium, K low` | 0 |

## Severity

- **CRITICAL** — blocks. A security defect (injection, secret in source, an
  auth or tenancy check bypassed), a violation of a contract the project
  documents, a guaranteed runtime failure on a normal path, a broken migration,
  or a test-file convention break that will fail CI.
- **HIGH** — a strong best-practice violation with a real consequence:
  unvalidated external input, a boundary crossed, an error path that swallows.
- **MEDIUM** — structural or organisational: misplaced file, premature
  abstraction, dead code, undocumented env var.
- **LOW** — nit, observation, suppression follow-up.
- **INFO** — auto-downgrade from `tool_would_catch`. Reported, never blocking.

## Finding contract

Subagents return exactly one fenced `json` block:

```json
{
  "bucket": "api",
  "consulted_skills": ["security", "typescript-expert"],
  "files_reviewed": ["services/api/src/routes/invoice.ts"],
  "files_skipped_budget": [],
  "findings": [
    {
      "severity": "CRITICAL",
      "rule": "security/unvalidated-input",
      "file": "services/api/src/routes/invoice.ts",
      "lines": [42, 44],
      "summary": "Request body reaches the repository without validation.",
      "evidence_snippet": "+ const body = await req.json()\n+ return repo.create(body)",
      "suggested_fix": "Validate against the route's declared schema before line 44; reject on failure.",
      "tool_would_catch": false
    }
  ]
}
```

A valid finding is **specific** (file + line range), **evidence-backed** (a
verbatim snippet from the diff), and **actionable** (the fix says what to change,
not "consider refactoring"). A vague finding earns its own LOW
`ship/vague-finding` at aggregation.

An empty `findings` array is a valid and common answer. Padding is worse than
silence: a gate that always finds something gets ignored.

## Suppression

Inline, on or above the offending line:

```
ship: allow CRITICAL security/unvalidated-input — reason: internal cron caller, not an external surface
```

Regex: `ship:\s*allow\s+(\w+)\s+([\w\-/.]+)\s+—\s+reason:\s*(.+)`

Or `.ship-ignore` at the repo root:

```yaml
- rule: security/unvalidated-input
  file: services/legacy/src/import.ts
  reason: ported as-is; rewrite tracked in PROJ-412
  expires: 2026-10-31
```

All four fields required. An ignore without an expiry is a permanent hole, so it
is rejected.

## Subagent prompt template

```
Review a diff fragment for the **<BUCKET>** bucket of this repository.

## Skills you MUST consult (load them yourself)
<SKILL_LIST>

## Severity definitions
<paste the Severity section verbatim>

## Output contract
Return ONE fenced ```json``` block matching this shape:
<paste the Finding contract verbatim>

Hard rules:
- Every finding: file path + line range + a verbatim evidence_snippet from the
  diff + an actionable suggested_fix.
- "consider refactoring" / "this could be improved" is not a finding.
- Anything typecheck, lint, or the test suite already catches → tool_would_catch: true.
- An empty findings array is a valid answer. Do not pad.
- Review only the changed regions shown. Do not open the whole file unless a
  finding genuinely requires the surrounding context.

## Files (diff fragments)
### <file>
```diff
<git diff --no-color $base...HEAD -- $file>
```

## Budget
<N> files in this bucket; top 20 shown. Skipped: <SKIPPED_LIST>.
```

## Report format

```markdown
# ship — <branch> → <base>

**Verdict:** BLOCK — 2 critical, 1 high
**Diff:** 14 files · base `a1b2c3d` · head `e4f5g6h`

## Critical (2)
### `security/unvalidated-input` · `services/api/src/routes/invoice.ts:42-44`
Request body reaches the repository without validation.
```ts
+ const body = await req.json()
+ return repo.create(body)
```
**Fix:** Validate against the route's declared schema before line 44.

## High (1)
…

## Medium / Low / Info
<counts only; full list in .claude/cache/ship/<hash>.json>

---
buckets: api, ui, data · skipped: docs · duration: 41s · cached: false
```

## Flags

- `--staged` — review `git diff --cached` instead of the branch diff.
- `--strict` — HIGH blocks too.
- `--no-cache` — skip the cache lookup.
