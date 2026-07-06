import yargs from 'yargs';
import { undoAction } from '../actions/undo';
import { graphite } from '../lib/runner';

const args = {
  force: {
    describe: `Do not prompt for confirmation; undo the most recent command immediately.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'f',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'undo';
export const canonical = 'undo';
export const description =
  'Undo the most recent Graphite mutation, restoring all branches and metadata to their prior state. Running it again redoes the change.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    undoAction({ force: argv.force }, context)
  );
