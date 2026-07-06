import yargs from 'yargs';
import { syncAction } from '../actions/sync/sync';
import { graphite } from '../lib/runner';

const args = {
  force: {
    describe: `Deprecated (no-op): sync no longer prompts for confirmation.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'f',
    hidden: true,
  },
  'delete-all': {
    describe: `Deprecated (no-op): merged and closed branches are always deleted. Skip with --no-delete.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'd',
    hidden: true,
  },
  delete: {
    describe: `Delete branches for PRs that have been merged or closed. Skip with --no-delete.`,
    demandOption: false,
    default: true,
    type: 'boolean',
  },
  restack: {
    describe: `Restack any branches that can be restacked without conflicts. Skip with --no-restack.`,
    demandOption: false,
    default: true,
    type: 'boolean',
  },
  pull: {
    describe: `Pull the trunk branch from remote. Skip with --no-pull.`,
    demandOption: false,
    default: true,
    type: 'boolean',
    hidden: true,
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'sync';
export const canonical = 'sync';
export const description =
  'Pull the trunk branch from remote, fast-forward local branches that have new commits on remote, delete any branches whose PRs have been merged or closed, and restack all branches that can be restacked without conflicts. If trunk cannot be fast-forwarded, it is overwritten with the remote version.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    await syncAction(
      {
        pull: argv.pull,
        delete: argv.delete,
        showDeleteProgress: false,
        restack: argv.restack,
      },
      context
    );
  });
};
