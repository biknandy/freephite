import yargs from 'yargs';
import { restackBranches } from '../actions/restack';
import { SCOPE } from '../lib/engine/scope_spec';
import { graphite } from '../lib/runner';

const args = {
  branch: {
    describe:
      'Which branch to run this command from. Defaults to the current branch.',
    demandOption: false,
    type: 'string',
  },
  upstack: {
    describe: `Only restack this branch and its descendants.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'u',
  },
  downstack: {
    describe: `Only restack this branch and its ancestors.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'd',
  },
  only: {
    describe: `Only restack this branch.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'o',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'restack';
export const canonical = 'restack';
export const description =
  'Ensure each branch in the current stack is based on its parent, rebasing if necessary.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) => {
    const scope = argv.only
      ? SCOPE.BRANCH
      : argv.upstack
      ? SCOPE.UPSTACK
      : argv.downstack
      ? SCOPE.DOWNSTACK
      : SCOPE.STACK;
    return restackBranches(
      context.engine.getRelativeStack(
        argv.branch ?? context.engine.currentBranchPrecondition,
        scope
      ),
      context
    );
  });
