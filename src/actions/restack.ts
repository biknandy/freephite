import chalk from 'chalk';
import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import { BlockedDuringRebaseError, RebaseConflictError } from '../lib/errors';
import { assertUnreachable } from '../lib/utils/assert_unreachable';
import { persistContinuation } from './persist_continuation';
import { printConflictStatus } from './print_conflict_status';

/**
 * By default, a rebase conflict pauses the command: state is persisted and a
 * RebaseConflictError is thrown so the user can `gt continue`.
 *
 * With `skipConflicts` (used by `gt sync` to sweep the whole repo, matching
 * the behavior of the Graphite CLI), a conflicting rebase is aborted instead;
 * the branch and its upstack are skipped and returned to the caller for
 * reporting, and the sweep moves on to the remaining branches.
 */
export function restackBranches(
  branchNames: string[],
  context: TContext,
  opts?: { skipConflicts?: boolean }
): string[] {
  if (context.engine.rebaseInProgress()) {
    throw new BlockedDuringRebaseError();
  }
  context.splog.debug(
    branchNames.reduce((acc, curr) => `${acc}\n${curr}`, 'RESTACKING:')
  );
  const conflictedBranches: string[] = [];
  while (branchNames.length > 0) {
    const branchName = branchNames.shift() as string;

    if (context.engine.isTrunk(branchName)) {
      context.splog.info(
        `${chalk.cyan(branchName)} does not need to be restacked.`
      );
      continue;
    }

    const result = context.engine.restackBranch(branchName);
    context.splog.debug(`${result}: ${branchName}`);
    switch (result.result) {
      case 'REBASE_DONE':
        context.splog.info(
          `Restacked ${chalk.green(branchName)} on ${chalk.cyan(
            context.engine.getParentPrecondition(branchName)
          )}.`
        );
        continue;

      case 'REBASE_CONFLICT':
        if (opts?.skipConflicts) {
          context.engine.abortRebase(branchName);
          conflictedBranches.push(branchName);
          // A branch's upstack can't be restacked if the branch itself
          // wasn't; drop those from the queue as well.
          const upstack = new Set(
            context.engine.getRelativeStack(branchName, SCOPE.UPSTACK)
          );
          for (let i = branchNames.length - 1; i >= 0; i--) {
            if (upstack.has(branchNames[i])) {
              branchNames.splice(i, 1);
            }
          }
          continue;
        }
        persistContinuation(
          {
            branchesToRestack: branchNames,
            rebasedBranchBase: result.rebasedBranchBase,
          },
          context
        );
        printConflictStatus(
          `Hit conflict restacking ${chalk.yellow(branchName)} on ${chalk.cyan(
            context.engine.getParentPrecondition(branchName)
          )}.`,
          context
        );
        throw new RebaseConflictError();

      case 'REBASE_UNNEEDED':
        if (!opts?.skipConflicts) {
          context.splog.info(
            `${chalk.cyan(
              branchName
            )} does not need to be restacked${` on ${chalk.cyan(
              context.engine.getParentPrecondition(branchName)
            )}`}.`
          );
        }
        continue;

      default:
        assertUnreachable(result);
    }
  }
  return conflictedBranches;
}
