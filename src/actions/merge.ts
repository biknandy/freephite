import { Octokit } from '@octokit/core';
import chalk from 'chalk';
import { getOctokit } from '../lib/api/octokit';
import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import { ExitFailedError, KilledError } from '../lib/errors';
import { uncommittedTrackedChangesPrecondition } from '../lib/preconditions';
import { restackBranches } from './restack';
import { syncPrInfo } from './sync_pr_info';

const MERGEABILITY_POLL_MS = 1500;
const MERGEABILITY_TIMEOUT_MS = 30000;

export async function mergeAction(
  args: { dryRun: boolean; confirm: boolean },
  context: TContext
): Promise<void> {
  uncommittedTrackedChangesPrecondition();

  const octokit = getOctokit(context.userConfig);
  const owner = context.repoConfig.getRepoOwner();
  const repo = context.repoConfig.getRepoName();

  const populateRemoteShasPromise = context.engine.populateRemoteShas();
  const branchNames = context.engine
    .getRelativeStack(context.engine.currentBranchPrecondition, SCOPE.DOWNSTACK)
    .filter((branchName) => !context.engine.isTrunk(branchName));

  if (branchNames.length === 0) {
    throw new ExitFailedError(`No branches to merge.`);
  }

  context.splog.info(
    chalk.blueBright(`🌐 Checking the state of PRs on GitHub...`)
  );
  await syncPrInfo(branchNames, context);

  const alreadyMerged = branchNames.filter(
    (branchName) => context.engine.getPrInfo(branchName)?.state === 'MERGED'
  );
  const branchesToMerge = branchNames.filter(
    (branchName) => context.engine.getPrInfo(branchName)?.state !== 'MERGED'
  );
  alreadyMerged.forEach((branchName) =>
    context.splog.info(
      `${chalk.dim(branchName)} ${chalk.dim('(already merged, skipping)')}`
    )
  );

  const missingPrBranch = branchesToMerge.find(
    (branchName) =>
      context.engine.getPrInfo(branchName)?.number === undefined ||
      context.engine.getPrInfo(branchName)?.state !== 'OPEN'
  );
  if (missingPrBranch) {
    throw new ExitFailedError(
      `${chalk.yellow(
        missingPrBranch
      )} does not have an open PR; submit the stack with ${chalk.cyan(
        'gt submit'
      )} before merging.`
    );
  }

  const draftPrBranch = branchesToMerge.find(
    (branchName) => context.engine.getPrInfo(branchName)?.isDraft
  );
  if (draftPrBranch) {
    const prInfo = context.engine.getPrInfo(draftPrBranch);
    throw new ExitFailedError(
      `PR #${prInfo?.number} (${chalk.yellow(
        draftPrBranch
      )}) is a draft; mark it ready for review (e.g. ${chalk.cyan(
        'gt submit --publish'
      )}) before merging.`
    );
  }

  if (branchesToMerge.length === 0) {
    context.splog.info(`🆗 All PRs in this stack are already merged.`);
    context.splog.tip(
      `Run gt sync to pull trunk and clean up merged branches.`
    );
    return;
  }

  await populateRemoteShasPromise;
  const outOfSyncBranches = branchesToMerge.filter(
    (branchName) => !context.engine.branchMatchesRemote(branchName)
  );

  context.splog.info(
    chalk.blueBright(
      `🚂 The following PRs will be merged into ${chalk.cyan(
        context.engine.trunk
      )}, from the bottom of the stack up:`
    )
  );
  branchesToMerge.forEach((branchName) => {
    const prInfo = context.engine.getPrInfo(branchName);
    context.splog.info(
      `▸ ${chalk.green(branchName)} PR #${prInfo?.number} ${chalk.dim(
        prInfo?.title ?? ''
      )}${
        outOfSyncBranches.includes(branchName)
          ? chalk.yellow(' (differs from remote!)')
          : ''
      }`
    );
  });

  if (args.dryRun) {
    context.splog.info(chalk.blueBright('✅ Dry run complete.'));
    return;
  }

  if (args.confirm || outOfSyncBranches.length > 0) {
    if (outOfSyncBranches.length > 0) {
      context.splog.warn(
        `Some local branches differ from their remote counterparts; GitHub will merge the ${chalk.bold(
          'remote'
        )} versions. Run ${chalk.cyan(
          'gt submit'
        )} first to push local changes.`
      );
    }
    if (!context.interactive) {
      throw new ExitFailedError(
        `Cannot prompt for confirmation in non-interactive mode.`
      );
    }
    if (
      !(
        await context.prompts({
          type: 'confirm',
          name: 'value',
          message: `Merge ${branchesToMerge.length} PR${
            branchesToMerge.length > 1 ? 's' : ''
          } into ${context.engine.trunk}?`,
          initial: true,
        })
      ).value
    ) {
      throw new KilledError();
    }
  }

  const mergeMethod = await getMergeMethod({ octokit, owner, repo });

  for (const [index, branchName] of branchesToMerge.entries()) {
    const prNumber = context.engine.getPrInfo(branchName)?.number;
    if (!prNumber) {
      throw new ExitFailedError(`No PR number for ${branchName}.`);
    }

    // Point the PR at trunk (the original base has been merged away).
    const prBase = context.engine.getPrInfo(branchName)?.base;
    if (prBase !== context.engine.trunk) {
      await octokit.request('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner,
        repo,
        pull_number: prNumber,
        base: context.engine.trunk,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' },
      });
      context.engine.upsertPrInfo(branchName, { base: context.engine.trunk });
    }

    await waitForMergeability({ octokit, owner, repo, prNumber, branchName });

    await octokit.request(
      'PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge',
      {
        owner,
        repo,
        pull_number: prNumber,
        merge_method: mergeMethod,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' },
      }
    );
    context.engine.upsertPrInfo(branchName, { state: 'MERGED' });
    context.splog.info(
      `${chalk.green(branchName)}: PR #${prNumber} merged (${mergeMethod}).`
    );

    // Rebase the branches above onto the new trunk and push them so the next
    // PR's diff only contains its own changes.
    const remaining = branchesToMerge.slice(index + 1);
    if (remaining.length > 0) {
      if (context.engine.pullTrunk() === 'PULL_CONFLICT') {
        throw new ExitFailedError(
          [
            `Local ${chalk.yellow(
              context.engine.trunk
            )} has diverged from remote and cannot be fast-forwarded.`,
            `The PRs merged so far remain merged. Reconcile trunk with ${chalk.cyan(
              'gt sync'
            )}, then re-run ${chalk.cyan('gt merge')}.`,
          ].join('\n')
        );
      }
      context.engine.setParent(remaining[0], context.engine.trunk);
      restackBranches(
        context.engine.getRelativeStack(remaining[0], SCOPE.UPSTACK),
        context
      );
      context.engine.pushBranch(remaining[0], false);
    }
  }

  context.splog.newline();
  context.splog.info(
    chalk.blueBright(
      `🎉 Merged ${branchesToMerge.length} PR${
        branchesToMerge.length > 1 ? 's' : ''
      } into ${context.engine.trunk}.`
    )
  );
  context.splog.info(
    `Run ${chalk.cyan(
      'gt sync'
    )} to pull trunk and clean up the merged branches.`
  );
}

async function getMergeMethod(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
}): Promise<'squash' | 'merge' | 'rebase'> {
  const response = await args.octokit.request('GET /repos/{owner}/{repo}', {
    owner: args.owner,
    repo: args.repo,
    headers: { 'X-GitHub-Api-Version': '2022-11-28' },
  });
  return response.data.allow_squash_merge
    ? 'squash'
    : response.data.allow_merge_commit
    ? 'merge'
    : 'rebase';
}

async function waitForMergeability(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  prNumber: number;
  branchName: string;
}): Promise<void> {
  const deadline = Date.now() + MERGEABILITY_TIMEOUT_MS;
  let state = 'unknown';
  while (Date.now() < deadline) {
    const response = await args.octokit.request(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}',
      {
        owner: args.owner,
        repo: args.repo,
        pull_number: args.prNumber,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' },
      }
    );
    state = response.data.mergeable_state;
    if (['clean', 'unstable', 'has_hooks'].includes(state)) {
      return;
    }
    if (['dirty', 'blocked', 'draft'].includes(state)) {
      break;
    }
    // 'unknown' or 'behind': GitHub is still computing mergeability.
    await new Promise((resolve) => setTimeout(resolve, MERGEABILITY_POLL_MS));
  }
  throw new ExitFailedError(
    [
      `PR #${args.prNumber} (${chalk.yellow(
        args.branchName
      )}) is not mergeable (state: ${state}).`,
      state === 'dirty'
        ? `It conflicts with its base; restack and resubmit before merging.`
        : `Check that required reviews and status checks have passed on GitHub.`,
      `Any PRs lower in the stack that were already merged remain merged; re-run ${chalk.cyan(
        'gt merge'
      )} once this is resolved.`,
    ].join('\n')
  );
}
