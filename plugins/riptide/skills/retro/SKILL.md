---
name: retro
description: Retrospective of a multi-agent run - computes token, tool-call, duration and parallelism metrics from the session journals including nested subagents (whose usage the parent does not count), turns them into concrete cost and workflow recommendations, and appends a trend row to docs/retros/ledger.md. Manual only; never hook-fired.
disable-model-invocation: true
argument-hint: "[session-id] [--shallow]"
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# retro

An `/impl` run is a multi-agent workflow. This tells you how it actually went —
where the tokens went, what was read three times, what ran serially that
shouldn't have.

This is the instrument behind every cost decision in `docs/COST.md`. Optimising
without it is guesswork.

## 1. Find the journals

The project transcript directory is `~/.claude/projects/<slug>/`, where `<slug>`
is the session's working directory with `/` replaced by `-`.

- **Session journal**: `<dir>/<session-uuid>.jsonl`. With no session named, take
  the most recently modified `.jsonl` — that is the current session. Say which
  one you picked.
- **Subagent journals** (deep mode, the default):
  `<dir>/<session-uuid>/subagents/agent-<id>.jsonl` plus `agent-<id>.meta.json`.

The parent's `usage` does **not** include subagent tokens. An in-context estimate
undercounts a parallel run by most of its actual cost, which is exactly the cost
you are trying to see. `--shallow` skips them and the report must say so.

## 2. Compute by script, never by eye

Journals are megabytes. Never read them into context. Write a small Node script
to the scratchpad and run it with `node`. It must:

1. **Deduplicate usage by message uuid.** Streaming writes the same assistant
   message — and its `usage` block — several times. Keep one usage per message
   uuid (the last occurrence). Skip this and every token number is inflated
   several-fold, which is worse than having no numbers.
2. Per actor (main session + each `agent-*.jsonl`):
   - `input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
     `cache_read_input_tokens`, summed over deduplicated messages;
   - **cache-hit rate** = `cache_read / (input + cache_creation + cache_read)`;
   - tool-call counts by tool name (count `tool_use` blocks);
   - duration = last timestamp − first timestamp.
3. **Parallelism**: build `[start, end]` intervals per subagent from its
   `meta.json` or journal bounds. Report the maximum number simultaneously live,
   and the serial stretches where nothing overlapped.
4. **Duplicated reads**: group `tool_use` inputs by `file_path` across all
   actors. Any file read by three or more actors is a pre-fetch candidate.
5. Print one compact markdown/JSON summary. That summary is the only thing that
   enters your context.

## 3. Turn numbers into actions

Answer concretely:

- **Where the tokens went.** Which actor burned the most output tokens, and why —
  retries, a long file, a loop that ran twice.
- **What was duplicated.** A file read by four subagents should have been in the
  plan or the orchestrator prompt once. Name the file.
- **What ran serially that could not have.** A wave of one, a dependency in the
  DAG that wasn't real, a barrier that waited on the slowest of five.
- **What was wasted.** Denied tools, malformed subagent output that forced a
  re-run, a review pass over a diff that then changed.
- **Cache-hit rate.** Below ~70% on a long session usually means the prompt
  prefix is being invalidated — most often by something volatile injected early.

Every recommendation names a specific artifact and a specific change: tighten
*this* agent's brief, pre-fetch *this* file into the plan, merge *these* two
buckets, drop the concurrency cap to 2. "Be more efficient" is not a
recommendation and should not appear.

## 4. Append one ledger row

Append to `docs/retros/ledger.md`, creating it with this header if absent:

```markdown
# Retro ledger

One row per analysed run. The trend is the signal; a single row is noise.

| Date | Run | Agents | In / Out / CacheRead | Cache-hit | Tool-calls | Duration | Max ∥ | Top recommendation |
|---|---|---|---|---|---|---|---|---|
```

One row per invocation, values from §2, and the single highest-leverage action
from §3.

## 5. Report

- Which journals were analysed (paths, deep or shallow).
- Metrics per actor, plus totals.
- The parallelism picture.
- Findings → recommendations, each actionable.
- The ledger row appended.

## Hard rules

1. **Manual only.** Never wire this to a hook. It runs when a run is worth
   dissecting, not after every turn.
2. **Journals are read-only.** The only writes are `docs/retros/ledger.md` and
   scratchpad files.
3. **Deep mode is the default.** Subagent tokens are the entire point; a shallow
   run must be labelled an undercount.
4. **Deduplicate by message uuid before summing.**
5. **Script-based aggregation.** Never paste raw JSONL into context — doing so
   in a skill about cost would be self-refuting.
6. One run per invocation, one ledger row per run.
