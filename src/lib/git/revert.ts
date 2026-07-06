import { runGitCommand } from './runner';

export function revertNoCommit(sha: string): void {
  runGitCommand({
    args: [`revert`, `--no-commit`, sha],
    options: { stdio: 'pipe' },
    onError: 'throw',
    resource: 'revertNoCommit',
  });
}

export function revertAbort(): void {
  runGitCommand({
    args: [`revert`, `--abort`],
    options: { stdio: 'pipe' },
    onError: 'ignore',
    resource: 'revertAbort',
  });
}

export function getCommitSubject(ref: string): string {
  return runGitCommand({
    args: [`log`, `--format=%s`, `-n`, `1`, ref],
    onError: 'ignore',
    resource: 'getCommitSubject',
  });
}
