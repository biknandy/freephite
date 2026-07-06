import yargs from 'yargs';
import chalk from 'chalk';
import { version } from '../../package.json';
import { init } from '../actions/init';
import { refreshPRInfoInBackground } from '../background_tasks/fetch_pr_info';
import {
  initContext,
  initContextLite,
  TContext,
  TContextLite,
} from './context';
import { getCacheLock, TCacheLock } from './engine/cache_lock';
import {
  BadTrunkOperationError,
  ConcurrentExecutionError,
  DetachedError,
  ExitFailedError,
  KilledError,
  PreconditionsFailedError,
  RebaseConflictError,
  UntrackedBranchError,
} from './errors';
import { composeGit } from './git/git';
import { TGlobalArguments } from './global_arguments';
import { tracer } from './utils/tracer';
import { CommandFailedError, CommandKilledError } from './git/runner';
import { getBranchNamesAndRevisions } from './git/sorted_branch_names';
import { getMetadataRefList } from './engine/metadata_ref';
import { undoSnapshotsConfigFactory } from './spiffy/undo_snapshots_spf';

export async function graphite(
  args: yargs.Arguments & TGlobalArguments,
  canonicalName: string,
  handler: (context: TContext) => Promise<void>
): Promise<void> {
  return graphiteInternal(args, canonicalName, {
    repo: true as const,
    run: handler,
  });
}

export async function graphiteWithoutRepo(
  args: yargs.Arguments & TGlobalArguments,
  canonicalName: string,
  handler: (context: TContextLite) => Promise<void>
): Promise<void> {
  return graphiteInternal(args, canonicalName, {
    repo: false as const,
    run: handler,
  });
}

async function graphiteInternal(
  args: yargs.Arguments & TGlobalArguments,
  canonicalName: string,
  handler: TGraphiteCommandHandler
): Promise<void> {
  const handlerMaybeWithCacheLock = handler.repo
    ? {
        ...handler,
        cacheLock: getCacheLock(),
      }
    : { ...handler, cacheLock: undefined };

  process.on('SIGINT', (): never => {
    handlerMaybeWithCacheLock.cacheLock?.release();
    // End all current traces abruptly.
    tracer.allSpans.forEach((s) => s.end(undefined, new KilledError()));
    // eslint-disable-next-line no-restricted-syntax
    process.exit(1);
  });
  const git = composeGit();
  const contextLite = initContextLite({
    ...args,
    userEmail: git.getUserEmail(),
  });

  try {
    await tracer.span(
      {
        name: 'command',
        resource: canonicalName,
        meta: {
          user: contextLite.userEmail ?? 'NotFound',
          version: version,
          gtInteractive: process.env.GRAPHITE_INTERACTIVE ? 'true' : 'false',
          processArgv: process.argv.join(' '),
        },
      },
      async () => {
        if (!handlerMaybeWithCacheLock.repo) {
          await handlerMaybeWithCacheLock.run(contextLite);
          return;
        }

        const context = initContext(contextLite, git, args);
        return await graphiteHelper(
          canonicalName,
          handlerMaybeWithCacheLock,
          context
        );
      }
    );
  } catch (err) {
    handleGraphiteError(err, contextLite);
    contextLite.splog.debug(err.stack);
    // print errors when debugging tests
    if (process.env.DEBUG) {
      process.stdout.write(err.stack.toString());
    }
    process.exitCode = 1;
  }
}

// Commands that are safe to run while a Graphite command is suspended on a
// rebase conflict: the commands that resolve the conflict, plus read-only
// commands that don't mutate branches or metadata.
const PENDING_CONTINUATION_SAFE_COMMANDS = new Set([
  'continue',
  'abort',
  'log',
  'log short',
  'log long',
  'info',
  'branch info',
  'children',
  'parent',
  'trunk',
  'repo name',
  'repo owner',
  'repo trunk',
  'repo remote',
  'repo pr-templates',
  'docs',
  'dash',
  'dash pr',
  'pr',
  'auth',
  'auth-fp',
  'dev cache',
  'dev meta',
  'user branch-date',
  'user branch-prefix',
  'user branch-replacement',
  'user editor',
  'user pager',
  'user restack-date',
  'user submit-body',
  'user tips',
]);

// Commands whose effects on local branches and metadata can be undone with
// `gt undo`. A snapshot of all branch refs and metadata is taken before the
// command runs. (`continue` is intentionally absent: the interrupted command
// already snapshotted the state it started from.)
const UNDO_CAPTURED_COMMANDS = new Set([
  'absorb',
  'branch create',
  'branch delete',
  'branch edit',
  'branch fold',
  'branch rename',
  'branch restack',
  'branch split',
  'branch squash',
  'branch track',
  'branch unbranch',
  'branch untrack',
  'commit amend',
  'commit create',
  'create',
  'delete',
  'downstack edit',
  'downstack get',
  'downstack restack',
  'downstack track',
  'fold',
  'get',
  'modify',
  'move',
  'pop',
  'rename',
  'reorder',
  'repo sync',
  'restack',
  'revert',
  'split',
  'squash',
  'stack restack',
  'sync',
  'track',
  'untrack',
  'upstack onto',
  'upstack restack',
]);

function captureUndoSnapshot(context: TContext, canonicalName: string): void {
  try {
    if (
      !UNDO_CAPTURED_COMMANDS.has(canonicalName) ||
      context.engine.rebaseInProgress()
    ) {
      return;
    }
    const metadata = getMetadataRefList();
    undoSnapshotsConfigFactory.load().push({
      command: canonicalName,
      timestampMs: Date.now(),
      currentBranchName: context.engine.currentBranch,
      branches: Object.entries(getBranchNamesAndRevisions()).map(
        ([name, revision]) => ({
          name,
          revision,
          metadata: metadata[name],
        })
      ),
    });
  } catch (err) {
    // Undo bookkeeping must never break the command itself.
    context.splog.debug(`Failed to capture undo snapshot: ${err}`);
  }
}

function hasPendingContinuation(context: TContext): boolean {
  const data = context.continueConfig.data;
  return (
    context.engine.rebaseInProgress() ||
    (data.branchesToRestack?.length ?? 0) > 0 ||
    (data.branchesToSync?.length ?? 0) > 0 ||
    data.rebasedBranchBase !== undefined
  );
}

// eslint-disable-next-line max-params
async function graphiteHelper(
  canonicalName: string,
  handler: TGraphiteCommandHandlerWithCacheLock,
  context: TContext
): Promise<{
  cacheBefore: string;
  cacheAfter: string;
}> {
  const cacheBefore = context.engine.debug;

  try {
    refreshPRInfoInBackground(context);

    if (
      !PENDING_CONTINUATION_SAFE_COMMANDS.has(canonicalName) &&
      hasPendingContinuation(context)
    ) {
      throw new PreconditionsFailedError(
        [
          `A Graphite command is still in progress (interrupted by a rebase conflict).`,
          `Complete it with ${chalk.cyan(
            'gt continue'
          )} or cancel it with ${chalk.cyan(
            'gt abort'
          )} before running other commands.`,
        ].join('\n')
      );
    }

    if (
      !['repo init', 'init'].includes(canonicalName) &&
      !context.repoConfig.graphiteInitialized()
    ) {
      context.splog.info(
        `Graphite has not been initialized, attempting to setup now...`
      );
      context.splog.newline();
      await init({}, context);
    }

    captureUndoSnapshot(context, canonicalName);
    await handler.run(context);
  } catch (err) {
    if (
      err.constructor === DetachedError &&
      context.engine.rebaseInProgress()
    ) {
      throw new DetachedError(
        `Did you mean to run ${chalk.cyan(`gt continue`)} or ${chalk.cyan(
          `gt abort`
        )}?`
      );
    }
    throw err;
  } finally {
    try {
      context.engine.persist();
    } catch (persistError) {
      context.engine.clear();
      context.splog.debug(`Failed to persist Graphite cache`);
    }
    handler.cacheLock.release();
  }

  return { cacheBefore, cacheAfter: context.engine.debug };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleGraphiteError(err: any, context: TContextLite): void {
  switch (err.constructor) {
    case CommandKilledError:
    case KilledError: // the user doesn't need a message if they ended gt
    case RebaseConflictError: // we've already logged a message
      // pass
      return;

    case UntrackedBranchError:
    case BadTrunkOperationError:
    case ExitFailedError:
    case ConcurrentExecutionError:
    case PreconditionsFailedError:
    case CommandFailedError:
    default:
      context.splog.error(err.message);
      return;
  }
}

// typescript is fun!
type TGraphiteCommandHandler =
  | { repo: true; run: (context: TContext) => Promise<void> }
  | {
      repo: false;
      run: (contextLite: TContextLite) => Promise<void>;
    };
type TGraphiteCommandHandlerWithCacheLock = {
  run: (context: TContext) => Promise<void>;
  cacheLock: TCacheLock;
};
