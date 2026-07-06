import { runGitCommand } from './runner';

export function getCurrentBranchName(): string | undefined {
  const branchName = runGitCommand({
    args: [`branch`, `--show-current`],
    onError: 'ignore',
    resource: 'getCurrentBranchName',
  });

  return branchName.length > 0 ? branchName : undefined;
}

// The path of another worktree that has the branch checked out, if any.
// Branches checked out in other worktrees cannot be rewritten or deleted.
export function getBranchWorktree(branchName: string): string | undefined {
  const currentWorktree = runGitCommand({
    args: [`rev-parse`, `--show-toplevel`],
    onError: 'ignore',
    resource: 'getBranchWorktree',
  });

  let worktreePath: string | undefined = undefined;
  for (const line of runGitCommand({
    args: [`worktree`, `list`, `--porcelain`],
    onError: 'ignore',
    resource: 'getBranchWorktree',
  }).split('\n')) {
    if (line.startsWith('worktree ')) {
      worktreePath = line.slice('worktree '.length);
    } else if (
      line === `branch refs/heads/${branchName}` &&
      worktreePath &&
      worktreePath !== currentWorktree
    ) {
      return worktreePath;
    }
  }
  return undefined;
}

// The branch most recently checked out before the current one, i.e. `@{-1}`.
export function getPreviousBranchName(): string | undefined {
  const branchName = runGitCommand({
    args: [`rev-parse`, `--abbrev-ref`, `@{-1}`],
    onError: 'ignore',
    resource: 'getPreviousBranchName',
  });

  return branchName.length > 0 && branchName !== '@{-1}'
    ? branchName
    : undefined;
}

export function moveBranch(newName: string): void {
  runGitCommand({
    args: [`branch`, `-m`, newName],
    options: { stdio: 'pipe' },
    onError: 'throw',
    resource: 'moveBranch',
  });
}

export function deleteBranch(branchName: string): void {
  runGitCommand({
    args: [`branch`, `-D`, branchName],
    options: { stdio: 'pipe' },
    onError: 'throw',
    resource: 'deleteBranch',
  });
}

export function switchBranch(
  branch: string,
  opts?: { new?: boolean; detach?: boolean; force?: boolean }
): void {
  runGitCommand({
    args: [
      `switch`,
      ...(opts?.detach ? ['-d'] : []),
      ...(opts?.force ? ['-f'] : []),
      ...(opts?.new ? ['-c'] : []),
      branch,
    ],
    options: { stdio: 'pipe' },
    onError: 'throw',
    resource: 'switchBranch',
  });
}

export function forceCheckoutNewBranch(branchName: string, sha: string): void {
  runGitCommand({
    args: [`switch`, `-C`, branchName, sha],
    options: { stdio: 'pipe' },
    onError: 'throw',
    resource: 'forceCheckoutNewBranch',
  });
}

export function forceCreateBranch(branchName: string, sha: string): void {
  runGitCommand({
    args: [`branch`, `-f`, branchName, sha],
    options: { stdio: 'pipe' },
    onError: 'throw',
    resource: 'forceCreateBranch',
  });
}
