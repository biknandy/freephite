import yargs from 'yargs';
import { getAction } from '../actions/sync/get';
import { graphite } from '../lib/runner';

const args = {
  branch: {
    describe: `Branch to get from remote. Defaults to the current branch.`,
    demandOption: false,
    type: 'string',
    positional: true,
    hidden: true,
  },
  force: {
    describe: 'Overwrite all fetched branches with remote source of truth.',
    demandOption: false,
    type: 'boolean',
    default: false,
    alias: 'f',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'get [branch]';
export const canonical = 'get';
export const description =
  'Get the latest changes to a branch and its downstack from remote, prompting to resolve any conflicts.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    getAction({ branchName: argv.branch, force: argv.force }, context)
  );
