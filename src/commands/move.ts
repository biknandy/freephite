import chalk from 'chalk';
import yargs from 'yargs';
import { currentBranchOnto } from '../actions/current_branch_onto';
import { interactiveBranchSelection } from '../actions/log';
import { graphite } from '../lib/runner';

const args = {
  onto: {
    describe: `Branch to move the current branch onto.`,
    demandOption: false,
    type: 'string',
    alias: 'o',
  },
  source: {
    describe: `Branch to move (defaults to the current branch).`,
    demandOption: false,
    type: 'string',
    alias: 's',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'move';
export const canonical = 'move';
export const description =
  'Rebase the current branch onto the target branch and restack all of its descendants. If no branch is passed in, opens an interactive selector.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    const originalBranch = argv.source
      ? context.engine.currentBranch
      : undefined;
    argv.source && context.engine.checkoutBranch(argv.source);

    const dest =
      argv.onto ??
      (await interactiveBranchSelection(
        {
          message: `Choose a new base for ${chalk.yellow(
            context.engine.currentBranchPrecondition
          )} (autocomplete or arrow keys)`,
          omitCurrentBranch: true,
        },
        context
      ));

    currentBranchOnto(dest, context);

    originalBranch && context.engine.checkoutBranch(originalBranch);
  });
};
