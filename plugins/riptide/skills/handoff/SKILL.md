---
name: handoff
description: Compact the current conversation into a handoff document so a fresh session can continue the work without re-deriving anything. Use when context is running out, when switching machines or people, or when parking work to resume later.
disable-model-invocation: true
argument-hint: "[what the next session will focus on]"
allowed-tools: Read, Grep, Glob, Bash, Write
---

# handoff

Write a document that lets a fresh agent pick this up cold.

Save it to the OS temporary directory, not the workspace — a handoff is
session state, not a project artifact, and committing it puts noise in the
repository forever. If the user wants it kept, they will say so.

## What goes in

```markdown
# Handoff: <one-line subject>
_<YYYY-MM-DD>_ · branch `<branch>` · base `<base>`

## Goal
<what we are trying to achieve, in the user's terms>

## State
<what is done, what is in progress, what is untouched>

## Where things live
<paths and URLs — the plan, the spec, the issue, the PR, the failing test>

## Decisions already made
<each with its reason — this is the part a fresh session cannot re-derive and
will otherwise re-litigate>

## Open questions
<unresolved items, and who or what resolves each>

## Next step
<the single concrete next action, with the exact command if there is one>

## Suggested skills
<which skills the next session should invoke, and when>
```

## Rules

1. **Reference, don't duplicate.** Anything already captured in a spec, plan,
   ADR, issue, commit, or diff gets a path or URL, not a copy. A handoff that
   restates the plan goes stale the moment the plan changes.
2. **Decisions and their reasons are the payload.** State is recoverable from
   git; reasoning is not.
3. **Redact.** No API keys, tokens, passwords, or personal data — the file lands
   outside the repo's protections.
4. **One concrete next step.** "Continue the work" is not a handoff.
5. If the user passed an argument, treat it as what the next session will focus
   on and slant the document toward that.
