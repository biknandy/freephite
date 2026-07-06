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

```sh
# Get a GitHub access token from https://github.com/settings/tokens
# (classic token with `repo` scope)
gt auth -t <YOUR_GITHUB_ACCESS_TOKEN>

# Then, inside a repo:
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
| Push PRs for current branch + downstack | `gt submit` | |
| Push PRs for the whole stack | `gt submit --stack` | `gt ss` |
| Pull trunk, delete merged branches, restack | `gt sync` | |
| Switch branches | `gt checkout` | `gt co` |
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

### Not supported (Graphite-server features)

`gt merge` (merge queue), `gt undo`, `gt absorb`, `gt freeze`/`gt unfreeze`,
`gt aliases`, `gt dash` (opens Graphite's web app), and the `--ai` flags.

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
