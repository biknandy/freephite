import fs from 'fs-extra';
import chalk from 'chalk';
import { TContext } from '../lib/context';
import {
  addPatch,
  amendBranchTipWithPatch,
  applyPatch,
  blameRange,
  buildPatch,
  getStagedDiffForAbsorb,
  getStagedPatchForFiles,
  getUnstagedPatch,
  writeRecoveryPatch,
  TStagedHunk,
} from '../lib/git/absorb';
import { SCOPE } from '../lib/engine/scope_spec';
import {
  ExitFailedError,
  KilledError,
  RebaseConflictError,
} from '../lib/errors';
import { getRepoRootPathPrecondition } from '../lib/preconditions';
import { restackBranches } from './restack';

export async function absorbAction(
  args: { all: boolean; dryRun: boolean; force: boolean; patch: boolean },
  context: TContext
): Promise<void> {
  const currentBranchName = context.engine.currentBranchPrecondition;
  if (context.engine.isTrunk(currentBranchName)) {
    throw new ExitFailedError(
      `Absorb from a stacked branch; ${currentBranchName} is trunk.`
    );
  }

  if (args.patch) {
    if (!context.interactive) {
      throw new ExitFailedError(
        `The --patch option requires interactive mode.`
      );
    }
    addPatch();
  } else if (args.all) {
    context.engine.addUpdatedFiles();
  }

  if (!context.engine.detectStagedChanges()) {
    throw new ExitFailedError(
      `No staged changes to absorb. Stage changes first or use the --all option.`
    );
  }

  const downstackBranches = context.engine
    .getRelativeStack(currentBranchName, SCOPE.DOWNSTACK)
    .filter((branchName) => !context.engine.isTrunk(branchName));

  const commitToBranch = new Map<string, string>();
  downstackBranches.forEach((branchName) =>
    context.engine
      .getAllCommits(branchName, 'SHA')
      .forEach((sha) => commitToBranch.set(sha, branchName))
  );

  const { hunks, unattributableFiles } = getStagedDiffForAbsorb();
  const branchToHunks = new Map<string, TStagedHunk[]>();
  const leftoverHunks: TStagedHunk[] = [];

  hunks.forEach((hunk) => {
    const branchName = attributeHunk(hunk, commitToBranch);
    if (branchName) {
      branchToHunks.set(branchName, [
        ...(branchToHunks.get(branchName) ?? []),
        hunk,
      ]);
    } else {
      leftoverHunks.push(hunk);
    }
  });

  if (branchToHunks.size === 0) {
    context.splog.info(
      `No staged changes could be attributed to a branch in this stack; nothing to absorb.`
    );
    context.splog.tip(
      `Hunks are absorbed into the branch whose commits last modified those lines; new files and changes to lines last modified below this stack stay staged.`
    );
    return;
  }

  const absorbedBranches = downstackBranches.filter((branchName) =>
    branchToHunks.has(branchName)
  );

  context.splog.info(
    chalk.blueBright(`🧽 Staged changes will be absorbed into:`)
  );
  absorbedBranches.forEach((branchName) => {
    const branchHunks = branchToHunks.get(branchName) ?? [];
    context.splog.info(
      `▸ ${chalk.green(branchName)} ${chalk.dim(
        context.engine.getAllCommits(branchName, 'READABLE')[0] ?? ''
      )}`
    );
    branchHunks.forEach((hunk) =>
      context.splog.info(
        `    ${hunk.filePath}${chalk.dim(`:${hunk.changedOldStart}`)}`
      )
    );
  });
  const leftoverCount = leftoverHunks.length + unattributableFiles.length;
  if (leftoverCount > 0) {
    context.splog.info(
      `${leftoverCount} staged change${
        leftoverCount === 1 ? '' : 's'
      } could not be attributed and will stay staged:`
    );
    leftoverHunks.forEach((hunk) =>
      context.splog.info(
        `▸ ${chalk.yellow(hunk.filePath)}${chalk.dim(
          `:${hunk.changedOldStart}`
        )}`
      )
    );
    unattributableFiles.forEach((filePath) =>
      context.splog.info(`▸ ${chalk.yellow(filePath)}`)
    );
  }
  context.splog.newline();

  if (args.dryRun) {
    context.splog.info(chalk.blueBright('✅ Dry run complete.'));
    return;
  }

  if (!args.force) {
    if (!context.interactive) {
      throw new ExitFailedError(
        'Use the --force option to absorb in non-interactive mode.'
      );
    }
    if (
      !(
        await context.prompts({
          type: 'confirm',
          name: 'value',
          message: `Absorb these changes?`,
          initial: true,
        })
      ).value
    ) {
      throw new KilledError();
    }
  }

  const gitDir = getRepoRootPathPrecondition();

  // Amend each target branch's tip in-memory (via a temporary index); the
  // working tree and real index are untouched until all amends succeed. A
  // hunk that does not apply cleanly to its branch's tree (its lines don't
  // commute past the branches above) falls back to staying staged.
  const succeeded: string[] = [];
  absorbedBranches.forEach((branchName) => {
    const branchHunks = branchToHunks.get(branchName) ?? [];
    const patchPath = writeRecoveryPatch(
      gitDir,
      'gt-absorb-hunks.patch',
      buildPatch(branchHunks)
    );
    try {
      amendBranchTipWithPatch(branchName, patchPath);
      succeeded.push(branchName);
      context.splog.info(
        `Absorbed ${branchHunks.length} hunk${
          branchHunks.length === 1 ? '' : 's'
        } into ${chalk.green(branchName)}.`
      );
    } catch {
      leftoverHunks.push(...branchHunks);
      context.splog.warn(
        `Could not absorb into ${chalk.yellow(
          branchName
        )} (the hunks do not apply cleanly to it); they will stay staged.`
      );
    }
    fs.removeSync(patchPath);
  });

  if (succeeded.length === 0) {
    context.splog.info(`Nothing was absorbed; your staged changes are intact.`);
    return;
  }

  // The changes still in the user's index/tree are saved as patch files in
  // the .git dir (also serving as recovery files), the tree is made clean
  // for the restack, and the patches are re-applied at the end.
  leftoverHunks.sort(
    (a, b) => hunks.indexOf(a) - hunks.indexOf(b) // restore diff order
  );
  const leftoverStagedPatch =
    buildPatch(leftoverHunks) +
    (unattributableFiles.length > 0
      ? getStagedPatchForFiles(unattributableFiles)
      : '');
  const unstagedPatch = getUnstagedPatch();
  const leftoverPatchPath = leftoverStagedPatch
    ? writeRecoveryPatch(gitDir, 'gt-absorb-staged.patch', leftoverStagedPatch)
    : undefined;
  const unstagedPatchPath = unstagedPatch
    ? writeRecoveryPatch(gitDir, 'gt-absorb-unstaged.patch', unstagedPatch)
    : undefined;
  const recoveryMessage = [
    ...(leftoverPatchPath
      ? [
          `Your remaining staged changes were saved to ${leftoverPatchPath}; restore them with ${chalk.cyan(
            `gt apply --index ${leftoverPatchPath}`
          )}.`,
        ]
      : []),
    ...(unstagedPatchPath
      ? [
          `Your unstaged changes were saved to ${unstagedPatchPath}; restore them with ${chalk.cyan(
            `gt apply ${unstagedPatchPath}`
          )}.`,
        ]
      : []),
  ];

  // Sync the working tree to the amended tip of the current branch (HEAD's
  // ref may have moved); the absorbed content is part of the branch now.
  context.engine.hardReset();
  context.engine.rebuild();

  try {
    restackBranches(
      context.engine.getRelativeStack(succeeded[0], SCOPE.UPSTACK_EXCLUSIVE),
      context
    );
  } catch (err) {
    if (err instanceof RebaseConflictError && recoveryMessage.length > 0) {
      context.splog.warn(
        `After resolving the conflict and running gt continue, restore your uncommitted changes:`
      );
      recoveryMessage.forEach((line) => context.splog.warn(line));
    }
    throw err;
  }

  try {
    if (leftoverPatchPath) {
      applyPatch(leftoverPatchPath, { index: true });
      fs.removeSync(leftoverPatchPath);
    }
    if (unstagedPatchPath) {
      applyPatch(unstagedPatchPath, {});
      fs.removeSync(unstagedPatchPath);
    }
  } catch (err) {
    context.splog.error(
      `Failed to restore your uncommitted changes automatically.`
    );
    recoveryMessage.forEach((line) => context.splog.warn(line));
    throw err;
  }

  context.splog.newline();
  context.splog.info(
    chalk.blueBright(
      `🎉 Absorbed staged changes into ${succeeded.length} branch${
        succeeded.length === 1 ? '' : 'es'
      }.`
    )
  );
}

/**
 * A hunk is attributed to the branch whose commits last touched all of the
 * lines it modifies. Pure insertions are attributed via the neighboring
 * lines, and only when they agree.
 */
function attributeHunk(
  hunk: TStagedHunk,
  commitToBranch: Map<string, string>
): string | undefined {
  if (hunk.changedOldCount > 0) {
    const blamedShas = blameRange(
      hunk.filePath,
      hunk.changedOldStart,
      hunk.changedOldCount
    );
    if (blamedShas.length === 0) {
      return undefined;
    }
    // Every modified line must belong to the same branch.
    const branches = new Set(
      blamedShas.map((sha) => commitToBranch.get(sha) ?? 'OUTSIDE_STACK')
    );
    const [branchName] = [...branches];
    return branches.size === 1 && branchName !== 'OUTSIDE_STACK'
      ? branchName
      : undefined;
  }

  // Insertions: the surrounding lines must agree on a single branch.
  const neighborShas = [
    ...(hunk.changedOldStart > 0
      ? blameRange(hunk.filePath, hunk.changedOldStart, 1)
      : []),
    ...blameRange(hunk.filePath, hunk.changedOldStart + 1, 1),
  ];
  const neighborBranches = new Set(
    neighborShas.map((sha) => commitToBranch.get(sha))
  );
  const [branchName] = [...neighborBranches];
  return neighborBranches.size === 1 && branchName !== undefined
    ? branchName
    : undefined;
}
