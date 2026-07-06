import yargs from 'yargs';
import { syncAction } from '../../actions/sync/sync';
import { graphite } from '../../lib/runner';

const args = {
  pull: {
    describe: `Pull the trunk branch from remote.`,
    demandOption: false,
    default: true,
    type: 'boolean',
    alias: 'p',
  },
  delete: {
    describe: `Delete branches which have been merged.`,
    demandOption: false,
    default: true,
    type: 'boolean',
    alias: 'd',
  },
  'show-delete-progress': {
    describe: `Show progress through merged branches.`,
    demandOption: false,
    default: false,
    type: 'boolean',
  },
  force: {
    describe: `Deprecated (no-op): sync no longer prompts for confirmation.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'f',
    hidden: true,
  },
  restack: {
    describe: `Restack any branches that can be restacked without conflicts.`,
    demandOption: false,
    default: true,
    type: 'boolean',
    alias: 'r',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'sync';
export const canonical = 'repo sync';
export const aliases = ['s'];
export const description =
  'Pull the trunk branch from remote and delete any branches that have been merged. If trunk cannot be fast-forwarded to match remote, overwrites trunk with the remote version.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    await syncAction(
      {
        pull: argv.pull,
        delete: argv.delete,
        showDeleteProgress: argv['show-delete-progress'],
        restack: argv.restack,
      },
      context
    );
  });
};
