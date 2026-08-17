---
name: grill
description: Interview the user about a plan, design, or decision until every branch of the decision tree is resolved. Use before planning or building anything non-trivial, when requirements are thin, when several approaches are plausible, or on any 'grill me', 'stress-test this', 'align first' request.
allowed-tools: Read, Grep, Glob, Bash, WebSearch, AskUserQuestion
---

# grill

The most common failure in software is not bad code — it is building the wrong
thing quickly. An agent that starts from a thin prompt fills the gaps with its
own assumptions and produces something that looks finished and is wrong.

This is the cheapest step in the whole workflow. Ten minutes here routinely
saves a full re-plan and re-implement.

## The loop

Interview the user about every aspect of this until you reach a shared
understanding. Treat it as a **decision tree**: each answer opens the decisions
that hang off it. Walk one branch at a time and resolve dependencies before
moving on.

**One question at a time.** Wait for the answer before asking the next. A batch
of five questions is bewildering and gets a batch of shallow answers.

**Attach your recommended answer to every question.** "Which of these?" makes
the user do all the work. "I'd go with B because X — agree?" gives them
something to push against, and disagreement is where the real requirement
surfaces.

**Look up facts; ask only about decisions.** If it is discoverable from the
filesystem, the git history, the tests, or the web — go and find it. Never spend
a question on something you could have grepped. The user's time is for the
things only they know: intent, priorities, constraints, what "done" means to
them.

**Do not start building.** Not a scaffold, not a draft, not "just the types".
The output of this skill is a shared understanding, and touching code before you
have one anchors the conversation to whatever you already wrote.

## What to push on

Aim questions where the cost of a wrong assumption is highest:

- **The actual goal** behind the stated request — the request is usually a
  proposed solution to an unstated problem.
- **Scope edges** — what is explicitly *not* in this change.
- **Failure behaviour** — what should happen when the input is bad, the
  dependency is down, the operation is retried.
- **Existing patterns** — is there something in this repo that already does
  this, and should this match it or deliberately differ?
- **Reversibility** — is this a decision that is expensive to change later? Push
  hard on those and let the cheap ones go.
- **Who else is affected** — other packages, other teams, existing data, live
  clients.

## Finishing

Stop when the remaining questions no longer change what gets built. Then
summarise the shared understanding — decisions made, scope, non-goals, open
items you both agreed to defer — and confirm it before anything else happens.

Hand off to `/plan` with that summary.
