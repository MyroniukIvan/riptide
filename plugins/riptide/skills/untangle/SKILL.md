---
name: untangle
description: Resolve an in-progress git merge or rebase conflict hunk by hunk, tracing each side to its original intent before choosing. Use when a merge or rebase has stopped with conflicts, or the user asks to resolve conflicts.
allowed-tools: Read, Grep, Glob, Bash, Edit
---

# untangle

Conflict markers hide a question the diff cannot answer: *why* did each side
make its change? Resolving on shape alone — keeping the longer hunk, keeping
"ours" — silently discards intent.

## 1. See the state

```bash
git status
git log --oneline --left-right --merge
git diff --name-only --diff-filter=U
```

Know which operation you are in (merge or rebase), what its stated goal is, and
which files conflict. In a rebase, "ours" and "theirs" are **inverted** relative
to a merge — confirm which side is which before you touch anything.

## 2. Find the primary source for each side

For every conflicting hunk, find out why each change was made:

```bash
git log -1 --format='%H %s%n%b' <sha>
git blame -L <start>,<end> <side>:<file>
```

Read the commit messages. Follow any issue or PR reference. If the intent is
still unclear after that, ask — resolving a hunk you don't understand is how a
bug gets introduced with no trace of who introduced it.

## 3. Resolve hunk by hunk

- **Preserve both intents** wherever they are compatible. Most conflicts are
  textual, not semantic.
- Where they genuinely conflict, pick the one matching the **stated goal of this
  merge**, and note the trade-off in the commit message.
- **Never invent new behaviour** in a conflict resolution. A resolution that
  contains logic neither side wrote is a change nobody reviewed.
- Remove every marker. Grep for `<<<<<<<`, `=======`, `>>>>>>>` before you
  continue.

## 4. Run the project's checks

Take them from `package.json` `scripts` — typecheck, then tests, then format. A merge that compiles is not a merge that works — the interesting
breakage is where two independently-correct changes meet.

Fix what the merge broke. Not what was already broken.

## 5. Finish it

Stage everything and complete the operation (`git merge --continue` /
`git rebase --continue`). In a rebase, keep going until every commit is
replayed.

**Never `--abort`.** By the time you are here the analysis is done; aborting
throws it away and the next attempt starts from zero. If the resolution turns
out to be genuinely wrong, that is a follow-up commit — the history stays
honest.
