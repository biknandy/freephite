import yargs from 'yargs';
import { mergeAction } from '../actions/merge';
import { graphite } from '../lib/runner';

const args = {
  confirm: {
    describe: `Ask for confirmation before merging branches.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'c',
  },
  'dry-run': {
    describe: `Report the PRs that would be merged and terminate. No branches are merged.`,
    demandOption: false,
    default: false,
    type: 'boolean',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'merge';
export const canonical = 'merge';
export const description =
  'Merge the pull requests associated with all branches from trunk to the current branch via GitHub, from the bottom of the stack up.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    mergeAction({ dryRun: argv['dry-run'], confirm: argv.confirm }, context)
  );
