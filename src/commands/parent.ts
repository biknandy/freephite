import chalk from 'chalk';
import yargs from 'yargs';
import { ExitFailedError } from '../lib/errors';
import { graphite } from '../lib/runner';

const args = {} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'parent';
export const canonical = 'parent';
export const description = 'Show the parent of the current branch.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) => {
    const currentBranch = context.engine.currentBranch;
    if (!currentBranch) {
      throw new ExitFailedError('No branch checked out.');
    }
    if (context.engine.isTrunk(currentBranch)) {
      context.splog.info(
        `${chalk.cyan(currentBranch)} is the trunk branch; it has no parent.`
      );
      return;
    }
    if (!context.engine.isBranchTracked(currentBranch)) {
      context.splog.info(
        `${chalk.cyan(
          currentBranch
        )} is not tracked by Graphite; run \`gt track\` to set its parent.`
      );
      return;
    }
    context.splog.info(context.engine.getParentPrecondition(currentBranch));
  });
