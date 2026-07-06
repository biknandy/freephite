import { CommandFailedError, runGitCommand } from './runner';

// Fetches only the given branch (updating its remote-tracking ref) in a
// single round trip, without touching the working tree or FETCH_HEAD.
export function fetchBranchAndPrune(remote: string, branchName: string): void {
  runGitCommand({
    args: [
      `fetch`,
      `--prune`,
      `--no-write-fetch-head`,
      remote,
      `+refs/heads/${branchName}:refs/remotes/${remote}/${branchName}`,
    ],
    options: { stdio: 'pipe' },
    onError: 'throw',
    resource: 'fetchBranchAndPrune',
  });
}

/**
 * Returns OK if the currently checked out branch was fast-forwarded to sha.
 * Returns CONFLICT if it could not be fast-forwarded
 */
export function mergeFastForward(sha: string): 'OK' | 'CONFLICT' {
  try {
    runGitCommand({
      args: [`merge`, `--ff-only`, sha],
      options: { stdio: 'pipe' },
      onError: 'throw',
      resource: 'mergeFastForward',
    });
    return 'OK';
  } catch (e: unknown) {
    // Only divergence is a CONFLICT; other failures (e.g. an untracked file
    // that would be overwritten) must propagate rather than tempt callers
    // into a hard reset.
    if (
      e instanceof CommandFailedError &&
      e.message.includes('fatal: Not possible to fast-forward, aborting.')
    ) {
      return 'CONFLICT';
    }
    throw e;
  }
}
