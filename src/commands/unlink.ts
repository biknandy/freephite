import chalk from 'chalk';
import yargs from 'yargs';
import { graphite } from '../lib/runner';

const args = {
  branch: {
    describe: `The branch to unlink. Defaults to the current branch.`,
    demandOption: false,
    positional: true,
    type: 'string',
    hidden: true,
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'unlink [branch]';
export const canonical = 'unlink';
export const description =
  'Unlink the PR currently associated with a branch. The PR itself is not modified on GitHub.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) => {
    const branchName = argv.branch ?? context.engine.currentBranchPrecondition;
    if (!context.engine.getPrInfo(branchName)?.number) {
      context.splog.info(`${chalk.cyan(branchName)} has no associated PR.`);
      return;
    }
    context.engine.clearPrInfo(branchName);
    context.splog.info(
      `Unlinked ${chalk.cyan(branchName)} from its associated PR.`
    );
  });
