import yargs from 'yargs';
import { syncAction } from '../actions/sync/sync';
import { graphite } from '../lib/runner';

const args = {
  force: {
    describe: `Don't prompt for confirmation before overwriting or deleting a branch.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'f',
  },
  'delete-all': {
    describe: `Delete all merged or closed branches without prompting.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'd',
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
  'Pull the trunk branch from remote, prompt to delete any branches for PRs that have been merged or closed, and restack. If trunk cannot be fast-forwarded, prompts to overwrite trunk with the remote version.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    await syncAction(
      {
        pull: argv.pull,
        force: argv.force,
        delete: true,
        showDeleteProgress: false,
        restack: argv.restack,
        forceDelete: argv['delete-all'],
      },
      context
    );
  });
};
