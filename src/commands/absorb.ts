import yargs from 'yargs';
import { absorbAction } from '../actions/absorb';
import { graphite } from '../lib/runner';

const args = {
  all: {
    describe: `Stage all unstaged changes before absorbing, excluding untracked files.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'a',
  },
  'dry-run': {
    describe: `Print which branches the staged hunks would be absorbed into, without absorbing them.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'd',
  },
  force: {
    describe: `Do not prompt for confirmation; absorb the hunks immediately.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'f',
  },
  patch: {
    describe: `Pick hunks to stage before absorbing.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'p',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'absorb';
export const canonical = 'absorb';
export const description =
  'Amend staged changes into the relevant branches in the current stack: each hunk is absorbed into the branch whose commits last modified those lines, and the stack is restacked.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    absorbAction(
      {
        all: argv.all,
        dryRun: argv['dry-run'],
        force: argv.force,
        patch: argv.patch,
      },
      context
    )
  );
