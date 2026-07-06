import chalk from 'chalk';
import { TContext } from '../lib/context';
import {
  deleteBranch,
  forceCreateBranch,
  getBranchWorktree,
  switchBranch,
} from '../lib/git/branch_ops';
import { getShaOrThrow } from '../lib/git/get_sha';
import { getBranchNamesAndRevisions } from '../lib/git/sorted_branch_names';
import {
  deleteMetadataRef,
  getMetadataRefList,
  setMetadataRefFromBlob,
} from '../lib/engine/metadata_ref';
import { ExitFailedError, KilledError } from '../lib/errors';
import { uncommittedTrackedChangesPrecondition } from '../lib/preconditions';
import {
  TUndoSnapshot,
  undoSnapshotsConfigFactory,
} from '../lib/spiffy/undo_snapshots_spf';

export async function undoAction(
  args: { force: boolean },
  context: TContext
): Promise<void> {
  uncommittedTrackedChangesPrecondition();

  const undoConfig = undoSnapshotsConfigFactory.load();
  const snapshots = [...(undoConfig.data.snapshots ?? [])];
  const currentBranches = getBranchNamesAndRevisions();
  const currentMetadata = getMetadataRefList();

  // Skip snapshots that match the current state (commands that ended up
  // not mutating anything, or that were already undone).
  let snapshot: TUndoSnapshot | undefined = undefined;
  while (snapshots.length > 0) {
    const candidate = snapshots[snapshots.length - 1];
    if (snapshotMatchesState(candidate, currentBranches, currentMetadata)) {
      snapshots.pop();
      continue;
    }
    snapshot = candidate;
    break;
  }

  if (!snapshot) {
    undoConfig.update((data) => (data.snapshots = snapshots));
    context.splog.info(`Nothing to undo.`);
    return;
  }

  context.splog.info(
    `Undoing ${chalk.cyan(`gt ${snapshot.command}`)} (run ${describeAge(
      snapshot.timestampMs
    )}):`
  );
  describeChanges(snapshot, currentBranches, currentMetadata).forEach((line) =>
    context.splog.info(line)
  );
  context.splog.newline();

  if (!args.force) {
    if (!context.interactive) {
      throw new ExitFailedError(
        'Use the --force option to undo in non-interactive mode.'
      );
    }
    if (
      !(
        await context.prompts({
          type: 'confirm',
          name: 'value',
          message: `Restore the repo to its state from before ${chalk.cyan(
            `gt ${snapshot.command}`
          )}?`,
          initial: true,
        })
      ).value
    ) {
      throw new KilledError();
    }
  }

  // Record the pre-undo state so that running `gt undo` again acts as redo.
  const redoSnapshot: TUndoSnapshot = {
    command: 'undo',
    timestampMs: Date.now(),
    currentBranchName: context.engine.currentBranch,
    branches: Object.entries(currentBranches).map(([name, revision]) => ({
      name,
      revision,
      metadata: currentMetadata[name],
    })),
  };

  const snapshotBranchNames = new Set(snapshot.branches.map((b) => b.name));
  const branchesToDelete = Object.keys(currentBranches).filter(
    (branchName) => !snapshotBranchNames.has(branchName)
  );
  const branchesToRewrite = snapshot.branches.filter(
    (branch) => currentBranches[branch.name] !== branch.revision
  );

  // Branches checked out in other worktrees can't be rewritten or deleted;
  // fail before touching anything rather than restoring only part of the
  // snapshot.
  const blockedBranch = [
    ...branchesToDelete,
    ...branchesToRewrite.map((branch) => branch.name),
  ].find((branchName) => getBranchWorktree(branchName));
  if (blockedBranch) {
    throw new ExitFailedError(
      `Cannot undo: ${chalk.yellow(
        blockedBranch
      )} is checked out in another worktree (${getBranchWorktree(
        blockedBranch
      )}).`
    );
  }

  // Detach HEAD so that every branch ref (including the current one) can be
  // rewritten or deleted.
  switchBranch(getShaOrThrow('HEAD'), { detach: true });

  // Delete before restoring: a rename like `feat` -> `feat/sub` would
  // otherwise hit a directory/file ref conflict when recreating `feat`.
  branchesToDelete.forEach((branchName) => {
    deleteBranch(branchName);
    if (currentMetadata[branchName]) {
      deleteMetadataRef(branchName);
    }
  });
  branchesToRewrite.forEach((branch) =>
    forceCreateBranch(branch.name, branch.revision)
  );
  snapshot.branches.forEach((branch) => {
    if (branch.metadata) {
      if (currentMetadata[branch.name] !== branch.metadata) {
        setMetadataRefFromBlob(branch.name, branch.metadata);
      }
    } else if (currentMetadata[branch.name]) {
      deleteMetadataRef(branch.name);
    }
  });

  const branchToCheckout =
    snapshot.currentBranchName &&
    snapshotBranchNames.has(snapshot.currentBranchName)
      ? snapshot.currentBranchName
      : context.engine.trunk;
  switchBranch(branchToCheckout);
  context.engine.rebuild();

  undoConfig.update(
    (data) => (data.snapshots = [...snapshots.slice(0, -1), redoSnapshot])
  );

  context.splog.info(`Restored. Checked out ${chalk.cyan(branchToCheckout)}.`);
  context.splog.tip(`Run gt undo again to redo.`);
}

function snapshotMatchesState(
  snapshot: TUndoSnapshot,
  branches: Record<string, string>,
  metadata: Record<string, string>
): boolean {
  return (
    snapshot.branches.length === Object.keys(branches).length &&
    snapshot.branches.every(
      (branch) =>
        branches[branch.name] === branch.revision &&
        metadata[branch.name] === branch.metadata
    )
  );
}

function describeChanges(
  snapshot: TUndoSnapshot,
  currentBranches: Record<string, string>,
  currentMetadata: Record<string, string>
): string[] {
  const lines: string[] = [];
  const snapshotByName = new Map(snapshot.branches.map((b) => [b.name, b]));

  snapshot.branches.forEach((branch) => {
    if (!(branch.name in currentBranches)) {
      lines.push(`▸ ${chalk.green(branch.name)} will be restored`);
    } else if (currentBranches[branch.name] !== branch.revision) {
      lines.push(
        `▸ ${chalk.cyan(branch.name)} will be reset to ${chalk.gray(
          branch.revision.slice(0, 8)
        )}`
      );
    } else if (currentMetadata[branch.name] !== branch.metadata) {
      lines.push(`▸ ${chalk.cyan(branch.name)} metadata will be restored`);
    }
  });
  Object.keys(currentBranches)
    .filter((branchName) => !snapshotByName.has(branchName))
    .forEach((branchName) =>
      lines.push(`▸ ${chalk.red(branchName)} will be deleted`)
    );

  return lines;
}

function describeAge(timestampMs: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestampMs) / 1000));
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'} ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
