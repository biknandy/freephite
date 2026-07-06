import yargs from 'yargs';
import { revertAction } from '../actions/revert';
import { graphite } from '../lib/runner';

const args = {
  sha: {
    describe: `The trunk commit to revert.`,
    demandOption: true,
    type: 'string',
    positional: true,
  },
  edit: {
    describe: `Edit the commit message of the revert commit.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'e',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'revert <sha>';
export const canonical = 'revert';
export const description =
  'Create a new branch that reverts a commit on the trunk branch, so the revert can be submitted as a pull request.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    revertAction({ sha: argv.sha, edit: argv.edit }, context)
  );
