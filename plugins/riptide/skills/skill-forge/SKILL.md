---
name: skill-forge
description: Write, edit, and lint agent skills so they behave predictably - description as a router, progressive disclosure, invocation control, and a zero-cost static gate that checks every SKILL.md in the repo. Use when creating a new skill, fixing one that does not trigger or drifts, or converting a repeated instruction into a skill.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# skill-forge

A skill exists to wrangle determinism out of a stochastic system.
**Predictability** — the agent taking the same *process* every run, not
producing identical output — is the root virtue. Every rule here serves it.

This is also how Riptide adapts to a project it has never seen: the harness
ships the workflow, the project adds its own skills for its own stack.

## When something should become a skill

- You have pasted the same instructions, checklist, or procedure more than
  twice.
- A section of `CLAUDE.md` has grown from a *fact* into a *procedure*.
- A discipline needs to be available but is only relevant sometimes.

`CLAUDE.md` content is billed on every single turn. A skill's body loads only
when it is used. Moving a 900-token procedure out of `CLAUDE.md` and into a
skill is a straight saving on every request for the life of the project.

**Do not** create a skill for a one-off, for something already enforced by
tooling, or for knowledge the model already reliably has.

## The description is a router, not a job title

The description is the **only** part of a skill in context until it fires. It
has one job: make the agent load the skill at the right moment and not at any
other.

- Lead with **what it does**, then **when to use it**, with concrete triggers:
  "Use when the user asks to…, mentions…, or after…".
- Name the artifacts and phrases that should fire it. Vague descriptions produce
  vague triggering, which is indistinguishable from a broken skill.
- Say what it is **not** for when a neighbouring skill exists — collisions
  between two plausible skills are the most common failure.
- Description plus `when_to_use` is truncated at 1,536 characters in the
  listing. Put the key case first.

## Invocation control — decide it deliberately

| Kind | Frontmatter | Description is written for |
|---|---|---|
| **Model-invoked** (default) | omit `disable-model-invocation` | the **model** — rich triggers, "use when…" |
| **User-invoked** | `disable-model-invocation: true` | a **human** browsing `/` — one plain line, no trigger list |
| **Background knowledge** | `user-invocable: false` | the model; hidden from the `/` menu |

The test for model-invoked: *could the agent usefully reach for this on its
own?* Reusability is the reason to extract a skill, not the test for who may
invoke it.

An orchestrating skill (a workflow you type) may invoke discipline skills. It
should never invoke another orchestrator — that is how two workflows end up
half-running.

## Progressive disclosure

`SKILL.md` holds the process. Long reference material goes in sibling files the
skill points to, loaded only when that branch is reached.

```
my-skill/
├── SKILL.md          # the process — keep it under ~500 lines
├── reference.md      # detail, loaded on demand
└── scripts/check.mjs # deterministic work, run rather than reasoned about
```

Reach for a script whenever the work is mechanical. A script that always
produces the same answer costs nothing and never drifts; asking a model to do it
costs tokens every time and occasionally gets it wrong.

## Writing the body

- **Imperative and specific.** "Run `X`, then check `Y`" beats "consider
  verifying".
- **Say why for anything counter-intuitive.** A rule with no reason gets
  optimised away by the next reader — model or human.
- **Give the output contract explicitly** when the skill produces a structured
  result. Show the shape.
- **Hard rules as a numbered list** at the end — the things that must hold even
  when the rest is skimmed.
- **No personas.** "You are a senior engineer" adds tokens and changes nothing;
  what changes behaviour is a concrete process and a concrete output contract.
- **No restating the model's general knowledge.** Only what is specific to this
  project, this tool, or this discipline.

## Path-scoped activation

A skill relevant only to part of a repo takes `paths:` in frontmatter — it then
auto-loads only when the working files match. This keeps a monorepo's skill
listing from costing every session the descriptions of skills for packages it
will never touch.

## Lint before you commit

```bash
node "${CLAUDE_SKILL_DIR}/scripts/lint-skills.mjs" .claude/skills
```

Zero tokens, zero network. It checks every `SKILL.md` under `.claude/skills/`
for: frontmatter present and parseable, `description` present and long enough to
route on, name matching the directory, at least two headings, body length within
useful bounds, no broken relative links, and no persona opener.

Wire it into CI as a required check. It is free, deterministic, and catches the
regressions that otherwise surface as "the agent stopped doing that thing".

## Evaluate anything that matters

A lint gate proves a skill is well-formed, not that it works. A skill whose
behaviour matters — one that gates a merge, or that a workflow depends on — also
needs behavioural cases. See the `eval-harness` skill.

## Hard rules

1. **One skill, one job.** A skill that does three things triggers wrongly for
   all three.
2. **The description carries the triggers.** No amount of body quality rescues a
   description the agent cannot route on.
3. **Reference files over a long SKILL.md.** Past ~500 lines, split.
4. **Scripts over prose for deterministic work.**
5. **Lint passes before commit.**
6. **No personas, no filler, no restating general knowledge.**

---
*Frontmatter fields and invocation semantics follow the
[Claude Code skills documentation](https://code.claude.com/docs/en/skills).*
