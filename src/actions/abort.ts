import chalk from 'chalk';
import { TContext } from '../lib/context';
import { KilledError, PreconditionsFailedError } from '../lib/errors';
import { clearContinuation } from './persist_continuation';

export async function abortAction(
  opts: { force: boolean },
  context: TContext
): Promise<void> {
  if (!context.engine.rebaseInProgress()) {
    clearContinuation(context);
    throw new PreconditionsFailedError(
      'No rebase in progress; there is nothing to abort.'
    );
  }

  if (!opts.force) {
    if (!context.interactive) {
      throw new PreconditionsFailedError(
        'Use the --force option to abort in non-interactive mode.'
      );
    }
    if (
      !(
        await context.prompts({
          type: 'confirm',
          name: 'value',
          message:
            'Abort the ongoing rebase and any pending Graphite operation?',
          initial: true,
        })
      ).value
    ) {
      throw new KilledError();
    }
  }

  const branchToRestore = context.continueConfig.data.currentBranchOverride;
  context.engine.abortRebase(branchToRestore);
  clearContinuation(context);

  const currentBranch = context.engine.currentBranch;
  context.splog.info(
    currentBranch
      ? `Aborted. Checked out ${chalk.cyan(currentBranch)}.`
      : `Aborted.`
  );
}
