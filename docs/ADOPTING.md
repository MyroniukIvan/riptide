# Adopting Riptide

Riptide is **internal**. It is distributed from a private repository and is
visible only to people who can already read that repository — there is no public
listing and nothing is published to a registry. Access is exactly your git
access; revoke someone's repo access and their next marketplace refresh fails.

Two ways in. They differ in one thing: who owns the files.

| | Plugin | Copy-in |
|---|---|---|
| Files live in | the plugin cache | your repo, at `.claude/` |
| Updates | `/plugin marketplace update` | you re-copy |
| Editing | read-only | yours to hack |
| Best for | standardising the org on one version | a repo that needs its own variant |

Start with the plugin. Switch to copy-in when you find yourself wanting to edit
a skill — that is a real signal, not a failure.

---

## 1. Host it privately

Push this repository to a **private** repo your org owns:

```bash
gh repo create <org>/riptide --private --source . --push
```

Nothing else is needed to make it private. A marketplace is just a git repo with
a `.claude-plugin/marketplace.json`; if the repo is private, so is the
marketplace.

## 2. Individual install

```bash
claude plugin marketplace add <org>/riptide
claude plugin install riptide@riptide
```

Or inside Claude Code: `/plugin marketplace add <org>/riptide`, then
`/plugin install riptide@riptide`.

That is the whole install — there is no setup command.

Skills namespace as `/riptide:plan`, `/riptide:impl`, and so on; the bare
`/plan` also works when nothing else claims the name. Agents appear as
`@riptide:planner`.

### Private-repo authentication

Claude Code uses your **existing git credentials** — no separate token to
manage.

- **HTTPS** works through your credential helper (`gh auth login`, macOS
  Keychain, `git-credential-store`).
- **SSH** works if the host is in `known_hosts` and the key is loaded in
  `ssh-agent`. Claude Code suppresses interactive SSH prompts, so a passphrase
  that is not already unlocked will just fail rather than ask.
- A GitHub `owner/repo` source clones over **SSH by default**. Set
  `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` to use HTTPS instead.

**One sharp edge worth knowing.** Background auto-updates disable git credential
helpers for their `git pull`, so an HTTPS private marketplace cannot
authenticate in the background; Claude Code falls back to a full re-clone, which
can time out. Two settings make this predictable:

```bash
# keep the working clone when a background pull fails, instead of re-cloning
export CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1

# let the re-clone fall back to your stored credentials without prompting
gh auth setup-git
```

SSH remotes are not affected — a key in `ssh-agent` authenticates background
pulls the same as manual ones. **Prefer SSH for a private marketplace.**

Setting `GITHUB_TOKEN` alone does nothing here; tokens only take effect through
a configured credential helper.

## 3. Org-wide rollout

Three levels, weakest to strongest. Pick one.

### Per-repository — the team gets prompted

Add to the repo's `.claude/settings.json`. Anyone who trusts the folder is
offered the install:

```json
{
  "extraKnownMarketplaces": {
    "riptide": {
      "source": {
        "source": "github",
        "repo": "<org>/riptide"
      }
    }
  },
  "enabledPlugins": {
    "riptide@riptide": true
  }
}
```

Checked into the repo, so everyone who clones it lands on the same version.
Bump it in one place and the whole team moves together.

### Org-managed — nobody has to discover it

In [managed settings](https://code.claude.com/docs/en/settings), which users
cannot override:

| Platform | Path |
|---|---|
| macOS | `/Library/Application Support/ClaudeCode/managed-settings.json` |
| Linux / WSL | `/etc/claude-code/managed-settings.json` |
| Windows | `C:\Program Files\ClaudeCode\managed-settings.json` |

```json
{
  "extraKnownMarketplaces": {
    "riptide": {
      "source": { "source": "github", "repo": "<org>/riptide" }
    }
  },
  "enabledPlugins": { "riptide@riptide": true },
  "strictKnownMarketplaces": true
}
```

`strictKnownMarketplaces` turns the list into an **allowlist**: engineers get
Riptide automatically and cannot add outside marketplaces. Drop it if you only
want to distribute, not to restrict.

Deploy the file with your MDM.

### Admin console — if you are on Teams or Enterprise

Your org's Claude admin settings can connect a GitHub repo as an org
marketplace, with a per-plugin preference of *Installed by default* / *Available
for install* / *Required* / *Not available*, and per-group overrides. This is
the least-effort path when it is available to you: no MDM, no per-repo settings,
and access follows the org rather than the git remote.

### Containers and CI

Pre-populate the plugin cache at image build time so nothing clones at runtime:

```bash
CLAUDE_CODE_PLUGIN_CACHE_DIR=/opt/claude-seed claude plugin marketplace add <org>/riptide
CLAUDE_CODE_PLUGIN_CACHE_DIR=/opt/claude-seed claude plugin install riptide@riptide
```

Then set `CLAUDE_CODE_PLUGIN_SEED_DIR=/opt/claude-seed` in the image.

In CI, run `gh auth setup-git` with a token that can read the marketplace repo
first — the default workflow token only reaches the workflow's own repository.

---

## Copy-in install

```bash
./install.sh /path/to/your-repo
```

Copies `agents/`, `skills/`, and `hooks/` into `<repo>/.claude/`, and merges
`templates/settings.json` into `<repo>/.claude/settings.json` (creating it if
absent, never clobbering existing keys).

Skills are invoked unprefixed: `/plan`, `/impl`, `/ship`.

Re-running `install.sh` overwrites the Riptide files it owns and leaves
everything else alone — so keep your project's own skills in
`.claude/skills/<your-name>/`, and if you fork a Riptide skill, rename it.

---

## First hour

1. If the repo has no `CLAUDE.md`, run the built-in **`/init`**. It writes the
   description, the commands, and the layout — Riptide does not duplicate that.
2. Add a **`## Contracts`** section to `CLAUDE.md` (see
   [templates/CLAUDE.md](../templates/CLAUDE.md)). Two or three enforceable
   rules beat a long aspirational list — these are exactly what `reviewer`
   enforces, so an unenforceable one just produces noise.
3. Merge the deny rules from [templates/settings.json](../templates/settings.json)
   into `.claude/settings.json`. `install.sh` does this for you; plugin users
   paste it once. This is the single biggest token saving available.
4. Run `/plan` on something small and real, and **read the plan** before
   `/impl`. This is where you find out whether the verify commands it picked out
   of `package.json` are the ones you actually use.
5. Run `/ship` on a branch you were about to open anyway. Compare its findings
   to what a reviewer would really say, and close the gap with step 6.
6. If the project ships an LLM feature: `@riptide:ai-reliability`.

## Making it yours

Riptide ships the workflow; your project supplies the domain knowledge, through
two things:

- **`INSIGHTS.md`** — accumulates what this codebase has already cost you.
  `/ship` promotes any finding matching an entry to CRITICAL, so a trap only
  gets past you once.
- **`skill-forge`** — write project skills for your conventions and your
  recurring review comments. Scope each one with `paths:` in its frontmatter and
  `/plan` and `/ship` start consulting it automatically; there is no registry to
  update.

A review comment you have left three times is a missing skill. That is the loop.

## Removing it

Plugin: `claude plugin uninstall riptide@riptide`.

Copy-in: delete `.claude/agents`, `.claude/skills` (the Riptide ones),
`.claude/hooks`, and the Riptide blocks in `.claude/settings.json`.

`INSIGHTS.md` is worth keeping either way — those are your project's notes, not
Riptide's.
