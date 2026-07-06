import chalk from 'chalk';
import { TContext } from '../../lib/context';
import { SCOPE } from '../../lib/engine/scope_spec';
import { uncommittedTrackedChangesPrecondition } from '../../lib/preconditions';
import { restackBranches } from '../restack';
import { syncPrInfo } from '../sync_pr_info';
import { cleanBranches } from './clean_branches';

export async function syncAction(
  opts: {
    pull: boolean;
    delete: boolean;
    showDeleteProgress: boolean;
    restack: boolean;
  },
  context: TContext
): Promise<void> {
  uncommittedTrackedChangesPrecondition();

  const originalBranchName = context.engine.currentBranch;

  if (opts.pull) {
    pullTrunk(context);
    context.splog.tip('You can skip pulling trunk with the `--no-pull` flag.');
  }

  await syncBranchesWithRemote(context);

  await syncPrInfo(
    context.engine.allBranchNames.filter((branchName) =>
      context.engine.isBranchTracked(branchName)
    ),
    context
  );

  if (opts.delete) {
    context.splog.info(
      `🧹 Checking if any branches have been merged/closed and can be deleted...`
    );
    await cleanBranches(
      { showDeleteProgress: opts.showDeleteProgress },
      context
    );
    context.splog.tip(
      'You can skip deleting branches with the `--no-delete` flag.'
    );
  }

  if (opts.restack) {
    const conflictedBranches = restackBranches(
      context.engine.getRelativeStack(
        context.engine.trunk,
        SCOPE.UPSTACK_EXCLUSIVE
      ),
      context,
      { skipConflicts: true }
    );

    if (conflictedBranches.length > 0) {
      context.splog.newline();
      context.splog.info(`All branches restacked cleanly, except for:`);
      conflictedBranches.forEach((branchName) =>
        context.splog.info(`▸ ${chalk.yellow(branchName)}`)
      );
      context.splog.info(
        `You can fix these conflicts with ${chalk.cyan(
          `gt checkout <branch> && gt restack`
        )}.`
      );
    }
  } else {
    context.splog.tip(
      'Try the `--restack` flag to automatically restack your branches.'
    );
  }

  // Restacking (and deletion of the checked-out branch) can move HEAD;
  // return to where the user started if it still exists.
  if (
    originalBranchName &&
    context.engine.currentBranch !== originalBranchName &&
    context.engine.branchExists(originalBranchName)
  ) {
    context.engine.checkoutBranch(originalBranchName);
  }
}

export function pullTrunk(context: TContext): void {
  context.splog.info(
    `🌲 Pulling ${chalk.cyan(context.engine.trunk)} from remote...`
  );
  const pullResult = context.engine.pullTrunk();
  if (pullResult !== 'PULL_CONFLICT') {
    context.splog.info(
      pullResult === 'PULL_UNNEEDED'
        ? `${chalk.green(context.engine.trunk)} is up to date.`
        : `${chalk.green(context.engine.trunk)} fast-forwarded to ${chalk.gray(
            context.engine.getRevision(context.engine.trunk)
          )}.`
    );
    return;
  }

  // Remote trunk is the source of truth: if local trunk cannot be
  // fast-forwarded, overwrite it with the remote version (matching the
  // behavior of the Graphite CLI). Local-only trunk commits stay reachable
  // via the reflog and `gt undo`.
  context.splog.warn(
    `${chalk.blueBright(
      context.engine.trunk
    )} could not be fast-forwarded; overwriting with the version from remote.`
  );
  context.engine.resetTrunkToRemote();
  context.splog.info(
    `${chalk.green(context.engine.trunk)} set to ${chalk.gray(
      context.engine.getRevision(context.engine.trunk)
    )}.`
  );
}

// Fast-forward local branches whose remote counterpart has new commits
// (e.g. a bot or teammate pushed to the PR). Diverged branches are left
// alone: that's the normal state after a local restack/amend that hasn't
// been submitted yet.
async function syncBranchesWithRemote(context: TContext): Promise<void> {
  const branchNames = context.engine.allBranchNames.filter(
    (branchName) =>
      !context.engine.isTrunk(branchName) &&
      context.engine.isBranchTracked(branchName)
  );
  if (branchNames.length === 0) {
    return;
  }

  await context.engine.populateRemoteShas();
  branchNames.forEach((branchName) => {
    try {
      const result = context.engine.syncBranchWithRemote(branchName);
      if (result === 'FAST_FORWARDED') {
        context.splog.info(
          `${chalk.green(branchName)} fast-forwarded to match remote.`
        );
      } else {
        context.splog.debug(`${result}: ${branchName}`);
      }
    } catch (err) {
      context.splog.warn(
        `Could not sync ${chalk.yellow(branchName)} from remote: ${
          err.message ?? err
        }`
      );
    }
  });
}
