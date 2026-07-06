import chalk from 'chalk';
import yargs from 'yargs';
import { ExitFailedError } from '../lib/errors';
import { graphite } from '../lib/runner';

const args = {} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'children';
export const canonical = 'children';
export const description = 'Show the children of the current branch.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) => {
    const currentBranch = context.engine.currentBranch;
    if (!currentBranch) {
      throw new ExitFailedError('No branch checked out.');
    }
    const children = context.engine.getChildren(currentBranch);
    if (children.length === 0) {
      context.splog.info(
        `${chalk.cyan(currentBranch)} has no tracked children.`
      );
      return;
    }
    children.forEach((child) => context.splog.info(child));
  });
