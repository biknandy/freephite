import yargs from 'yargs';
import { renameCurrentBranch } from '../actions/rename_branch';
import { ExitFailedError } from '../lib/errors';
import { graphite } from '../lib/runner';

const args = {
  name: {
    describe: `The new name for the current branch.`,
    demandOption: false,
    type: 'string',
    positional: true,
    hidden: true,
  },
  force: {
    describe: `Allow renaming a branch that is already associated with an open GitHub pull request.`,
    demandOption: false,
    type: 'boolean',
    alias: 'f',
    default: false,
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'rename [name]';
export const canonical = 'rename';
export const aliases = ['rn'];
export const description =
  'Rename a branch and update metadata referencing it. If no branch name is supplied, you will be prompted for a new branch name. Note that this removes any associated GitHub pull request.';
export const builder = args;

export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    if (!argv.name && !context.interactive) {
      throw new ExitFailedError(
        `Please supply a new branch name when in non-interactive mode`
      );
    }
    await renameCurrentBranch(
      { newBranchName: argv.name, force: argv.force },
      context
    );
  });
};
