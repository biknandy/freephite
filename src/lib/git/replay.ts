import semver from 'semver';
import { CommandFailedError, runGitCommand } from './runner';

/**
 * `git replay` (git >= 2.44) rebases a branch entirely in memory and prints
 * ref updates to stdout - no checkout, no working-tree writes. This keeps
 * repo-wide restacks (`gt sync`) from churning the working tree, which is
 * both much faster in large repos and avoids retriggering file watchers
 * (direnv, dev servers) on every sync.
 */

let replayAvailable: boolean | undefined = undefined;

function isReplayAvailable(): boolean {
  if (replayAvailable === undefined) {
    const versionOutput = runGitCommand({
      args: [`version`],
      onError: 'ignore',
      resource: 'gitVersion',
    });
    const match = versionOutput.match(/(\d+\.\d+\.\d+)/);
    replayAvailable = !!match && semver.gte(match[1], '2.44.0');
  }
  return replayAvailable;
}

export function replayOnto(args: {
  onto: string;
  from: string;
  branchName: string;
}):
  | 'REPLAY_DONE'
  // The replayed commits don't apply cleanly; a real rebase would conflict.
  | 'REPLAY_CONFLICT'
  // Replay can't handle this range (e.g. it contains merge commits) or this
  // git doesn't have replay; a real rebase may still succeed.
  | 'REPLAY_UNSUPPORTED' {
  if (!isReplayAvailable()) {
    return 'REPLAY_UNSUPPORTED';
  }

  let refUpdates;
  try {
    refUpdates = runGitCommand({
      args: [`replay`, `--onto`, args.onto, `${args.from}..${args.branchName}`],
      options: { stdio: 'pipe' },
      onError: 'throw',
      resource: 'replayOnto',
    });
  } catch (e) {
    // Conflicts exit 1; unsupported ranges (merge commits) exit 128.
    return e instanceof CommandFailedError && e.message.includes('exit code 1:')
      ? 'REPLAY_CONFLICT'
      : 'REPLAY_UNSUPPORTED';
  }

  // An empty range (branch has no commits of its own) produces no ref
  // updates; let the real rebase machinery handle that edge.
  if (!refUpdates) {
    return 'REPLAY_UNSUPPORTED';
  }

  // stdout is `update refs/heads/<branch> <new-sha> <old-sha>` - applying it
  // via update-ref --stdin is atomic per ref and compare-and-swaps on the
  // old sha, so a concurrent move of the branch fails loudly instead of
  // being silently overwritten. update-ref requires LF-terminated lines,
  // and the runner trims trailing whitespace, so restore the newline.
  runGitCommand({
    args: [`update-ref`, `--stdin`],
    options: { input: `${refUpdates}\n`, stdio: 'pipe' },
    onError: 'throw',
    resource: 'replayUpdateRef',
  });
  return 'REPLAY_DONE';
}
