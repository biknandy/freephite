# freephite

A fast, GitHub-native fork of the [Graphite CLI](https://graphite.com/docs/graphite-cli).
It keeps the stacked-PR workflow (`gt create`, `gt sync`, `gt submit`, ...) but talks
**directly to GitHub** via the REST API - no Graphite account, no Graphite servers, no
per-command network round trips.

Installs three identical binaries: `gt`, `fp`, and `freephite`.

## Installation

```sh
git clone https://github.com/biknandy/freephite
cd freephite
npm install
npm run build
npm link       # installs `gt`, `fp`, and `freephite` on your PATH
```

Requires Node.js >= 18.

## Setup

If the machine already has GitHub credentials — a `GITHUB_TOKEN` / `GH_TOKEN`
env var, or a logged-in `gh` CLI — freephite picks them up automatically and
no auth step is needed. Otherwise:

```sh
# Get a GitHub access token from https://github.com/settings/tokens
# (classic token with `repo` scope)
gt auth -t <YOUR_GITHUB_ACCESS_TOKEN>
```

Then, inside a repo:

```sh
gt init
```

## Everyday commands

The command surface matches the modern Graphite CLI
([command reference](https://graphite.com/docs/command-reference)):

| Task | Command | Short |
| --- | --- | --- |
| Create a branch, stage all, commit | `gt create --all --message "msg"` | `gt c -am "msg"` |
| Amend staged changes into current branch | `gt modify --all` | `gt m -a` |
| Add a new commit to current branch | `gt modify --commit --all -m "msg"` | `gt m -cam "msg"` |
| Absorb staged fixes into the stack's branches | `gt absorb` | |
| Push PRs for current branch + downstack | `gt submit` | |
| Push PRs for the whole stack | `gt submit --stack` | `gt ss` |
| Merge the PRs from trunk to current branch | `gt merge` | |
| Pull trunk, delete merged branches, restack | `gt sync` | |
| Undo the last gt mutation (run again to redo) | `gt undo` | |
| Revert a trunk commit on a new branch | `gt revert <sha>` | |
| Switch branches | `gt checkout` (`gt co -` for previous) | `gt co` |
| Move up/down the stack | `gt up` / `gt down` / `gt top` / `gt bottom` | `gt u` / `gt d` / `gt t` / `gt b` |
| View your stacks | `gt log` / `gt log short` / `gt log long` | `gt ls` / `gt ll` |
| Rebase branch onto a new parent | `gt move --onto <branch>` | |
| Restack branches onto their parents | `gt restack` | |
| Fold branch into parent | `gt fold` | |
| Delete branch, keep working-tree changes | `gt pop` | |
| Reorder branches below current | `gt reorder` | |
| Split branch | `gt split` | `gt sp` |
| Squash branch to one commit | `gt squash` | `gt sq` |
| Delete a branch | `gt delete` | `gt dl` |
| Rename a branch | `gt rename` | `gt rn` |
| Track / untrack a git branch | `gt track` / `gt untrack` | `gt tr` / `gt ut` |
| Branch info / relationships | `gt info` / `gt parent` / `gt children` / `gt trunk` | `gt i` |
| Fetch a stack from remote | `gt get [branch]` | |
| Resolve conflicts | `gt continue` / `gt abort` | |
| Open the PR page on GitHub | `gt pr [branch]` | |
| Disassociate a PR from a branch | `gt unlink [branch]` | |

Common git commands (`gt status`, `gt add`, `gt rebase`, `gt stash`, ...) pass through
to git directly.

The legacy noun-verb surface from graphite-cli v0.x (`gt branch create`, `gt stack
submit`, `gt repo sync`, ...) and its shortcuts (`bc`, `bco`, `ca`, `sr`, `ss`, `dsg`,
`rs`, ...) still work - they are just hidden from `--help`.

### Notes on parity with the paid Graphite CLI

- `gt merge` merges the stack's PRs bottom-up **via the GitHub API** (no merge
  queue): it retargets each PR to trunk, waits for mergeability, merges with the
  repo's preferred method, and restacks + pushes the branches above in between.
- `gt undo` restores branches and stack metadata from a snapshot taken before
  each mutating command; running it again redoes the change.
- `gt absorb` attributes each staged hunk to the branch whose commits last
  modified those lines (via blame), amends it in, and restacks; unattributable
  hunks stay staged.
- GitHub Enterprise works by pointing the CLI at your API endpoint:
  `GT_GITHUB_API_URL=https://github.example.com/api/v3` (env var), or persist it
  in `~/.graphite_user_config` under `githubApiUrl`.

Not supported: `gt freeze`/`gt unfreeze`, `gt aliases`, `gt dash` (opens
Graphite's web app), and the `--ai` flags.

## How PR submission works

`gt submit` force-pushes (with lease) each branch in scope and then creates or
updates one GitHub PR per branch via the REST API, wiring PR base branches to
match the stack. It also:

- creates PRs as drafts by default in non-interactive mode (`--draft` / `--publish`
  control this, including flipping draft state on existing PRs),
- requests reviewers passed via `--reviewers`,
- maintains a stack-overview comment on every PR in the stack.

## Develop

```sh
npm install
npm run build    # lint + tsc + assets into dist/
npm test         # build + mocha suite

# Run your local build
node ./dist/src/index.js
```

## Publish

```sh
npm publish
```
