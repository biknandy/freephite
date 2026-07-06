import { runGitCommand } from './runner';

export function addAll(): void {
  runGitCommand({
    args: ['add', '--all'],
    onError: 'throw',
    resource: 'addAll',
  });
}

export function addUpdatedFiles(): void {
  runGitCommand({
    args: ['add', '--update'],
    onError: 'throw',
    resource: 'addUpdatedFiles',
  });
}
