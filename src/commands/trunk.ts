import yargs from 'yargs';
import { graphite } from '../lib/runner';

const args = {} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'trunk';
export const canonical = 'trunk';
export const description = 'Show the trunk branch of the current repo.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) => {
    context.splog.info(context.engine.trunk);
  });
