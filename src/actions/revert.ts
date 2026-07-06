import chalk from 'chalk';
import { TContext } from '../lib/context';
import { ExitFailedError } from '../lib/errors';
import { uncommittedTrackedChangesPrecondition } from '../lib/preconditions';

export async function revertAction(
  args: { sha: string; edit: boolean },
  context: TContext
): Promise<void> {
  uncommittedTrackedChangesPrecondition();

  const sha = context.engine.resolveCommitish(args.sha);
  if (!sha) {
    throw new ExitFailedError(`Could not resolve commit ${args.sha}.`);
  }
  if (!context.engine.isAncestorOfTrunk(sha)) {
    throw new ExitFailedError(
      `Commit ${chalk.yellow(sha.slice(0, 8))} is not in the history of ${
        context.engine.trunk
      }; gt revert only reverts commits on the trunk branch.`
    );
  }

  const subject = context.engine.getCommitSubject(sha);
  const branchName = `revert-${sha.slice(0, 8)}`;
  if (context.engine.branchExists(branchName)) {
    throw new ExitFailedError(
      `Branch ${chalk.yellow(branchName)} already exists.`
    );
  }

  const previousBranch = context.engine.currentBranch;
  context.engine.checkoutBranch(context.engine.trunk);
  context.engine.checkoutNewBranch(branchName);

  try {
    context.engine.revertNoCommit(sha);
    context.engine.commit({
      message: `Revert "${subject}"\n\nThis reverts commit ${sha}.`,
      noEdit: !args.edit,
      edit: args.edit,
    });
  } catch (err) {
    context.engine.revertAbort();
    context.engine.deleteBranch(branchName);
    if (previousBranch && context.engine.branchExists(previousBranch)) {
      context.engine.checkoutBranch(previousBranch);
    }
    throw new ExitFailedError(
      `Could not cleanly revert ${chalk.yellow(
        sha.slice(0, 8)
      )}; it may conflict with more recent changes on ${context.engine.trunk}.`
    );
  }

  context.splog.info(
    `Created ${chalk.green(branchName)} reverting ${chalk.yellow(
      sha.slice(0, 8)
    )} ${chalk.dim(subject)}.`
  );
  context.splog.tip(`Run gt submit to open a PR for this revert.`);
}
