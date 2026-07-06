import yargs from 'yargs';
import { deleteBranchAction } from '../actions/delete_branch';
import { interactiveBranchSelection } from '../actions/log';
import { ExitFailedError } from '../lib/errors';
import { graphite } from '../lib/runner';

const args = {
  name: {
    type: 'string',
    positional: true,
    demandOption: false,
    optional: true,
    describe:
      'The name of the branch to delete. If not provided, opens an interactive selector.',
    hidden: true,
  },
  force: {
    describe: `Delete the branch even if it is not merged or closed.`,
    demandOption: false,
    type: 'boolean',
    alias: 'f',
    default: false,
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const aliases = ['dl'];
export const command = 'delete [name]';
export const canonical = 'delete';
export const description =
  "Delete a branch and its corresponding Graphite metadata. Children are restacked onto the deleted branch's parent.";
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) => {
    const branchName =
      argv.name ??
      (context.interactive
        ? await interactiveBranchSelection(
            {
              message: 'Select a branch to delete (autocomplete or arrow keys)',
              omitCurrentBranch: true,
            },
            context
          )
        : undefined);
    if (!branchName) {
      throw new ExitFailedError(
        'Must specify a branch to delete in non-interactive mode.'
      );
    }
    await deleteBranchAction({ branchName, force: argv.force }, context);
  });
