import yargs from 'yargs';
import { showBranchInfo } from '../actions/show_branch';
import { graphite } from '../lib/runner';

const args = {
  branch: {
    describe: `The branch to show info for. Defaults to the current branch.`,
    demandOption: false,
    positional: true,
    type: 'string',
    hidden: true,
  },
  patch: {
    describe: `Show the changes made by each commit.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'p',
  },
  diff: {
    describe: `Show the diff between this branch and its parent. Takes precedence over patch.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'd',
  },
  body: {
    describe: `Show the PR body, if it exists.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'b',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'info [branch]';
export const canonical = 'info';
export const aliases = ['i'];
export const description = 'Display information about a branch.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    await showBranchInfo(
      argv.branch ?? context.engine.currentBranchPrecondition,
      { patch: argv.patch, diff: argv.diff, body: argv.body },
      context
    );
  });
};
