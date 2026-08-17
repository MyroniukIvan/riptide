---
name: insights
description: Append a non-obvious finding to the right INSIGHTS.md - a failure mode that surprised you, a library or tool quirk, a decision made for a reason the code does not show, a recurring error and its fix, or an unresolved question. Use whenever a session uncovers something a future session would not re-derive from the code. Append-only; skips anything obvious.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# insights

Long memory for a codebase. Reads happen automatically — every agent is told to
check the nearest `INSIGHTS.md` before solving something non-obvious. This skill
handles the writes.

## When to fire

When the session uncovered something a future session would **not** re-derive
from the code alone. Each trigger maps to one section:

| Trigger | Section |
|---|---|
| A failure mode that surprised you | **What doesn't work** |
| A pattern or decision that works for a non-obvious reason | **What works** / **Codebase patterns** |
| A library, framework, or tool quirk | **Tool & library notes** |
| An error hit more than once, plus its fix | **Recurring errors & fixes** |
| A long session with a clear outcome worth summarising | **Session notes** |
| A question you could not resolve | **Open questions** |

**Do not fire** for: renames, formatting, anything `git blame` explains, anything
already in a `CLAUDE.md` or `README.md`, transient task state, or a fixed bug
that leaves no durable lesson.

Silence is a valid session outcome. An `INSIGHTS.md` padded with obvious entries
is worse than an empty one, because nobody reads a file that wasted their time
the first three times.

## Where to write

Pick the `INSIGHTS.md` closest to the affected code. Discover the candidates:

```bash
fd -H -g 'INSIGHTS.md' -E node_modules
```

**Exactly one file per entry.** A genuinely cross-cutting finding goes to the
root file; optionally add a one-line pointer in each module it touches.

If no `INSIGHTS.md` exists yet, create one at the repo root from the seven
sections below. If routing is ambiguous, ask once — do not guess.

## Entry format

Insert under the matching heading. Exactly this shape:

```markdown
### <one-line title — a present-tense verb phrase, not a topic noun>
_<YYYY-MM-DD>_ · `<file:line>` (or `repo-wide`)

<2–4 sentences: the failure, decision, or quirk, and what to do about it next
time. Cold-readable — a stranger should know what to do without asking a
follow-up.>
```

Title rule: `Cosine distance returns NaN on un-normalised vectors` ✓.
`pgvector` ✗ — that is a topic, not a finding.

## The bar: would this be obvious from reading the code?

If yes, don't write it.

- ✗ "Promises can be tricky."
  ✓ "`Promise.all` over the ingest pipeline times out past 30 items. Use
  `Promise.allSettled` in batches of 10."

- ✗ "Be careful with local state."
  ✓ "Local component state breaks checkout because cart data is shared across
  three components. Always go through `cartStore`."

If your draft reads like the left column, rewrite it or drop it.

## Hard rules

1. **Append-only.** Read the file, find the heading, insert under it, write
   back. Never overwrite or reorder existing entries.
2. If a section still holds `_None yet._`, replace that placeholder.
3. **One finding per entry.** Don't batch unrelated lessons.
4. **Deduplicate first.** Grep the target section for the strongest keyword in
   your title. A related entry already there gets edited, not duplicated.
5. **Don't silently rewrite someone else's entry.** Correcting a now-wrong fact
   is fine — append `> Updated YYYY-MM-DD: …` below it.
6. **Zero findings → zero writes.** Don't pad. Don't invent.
7. Past roughly 200 entries, split by sub-domain rather than pruning. The value
   is in long memory, not a tidy file.

## The seven sections

`What works` · `What doesn't work` · `Codebase patterns` ·
`Tool & library notes` · `Recurring errors & fixes` · `Session notes` ·
`Open questions`
