import open from 'open';
import yargs from 'yargs';
import { graphiteWithoutRepo } from '../lib/runner';
const args = {} as const;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

const CHANGELOG_URL = 'https://github.com/biknandy/freephite/commits/main';
export const command = 'changelog';
export const canonical = 'changelog';
export const description = 'Show the changelog.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphiteWithoutRepo(argv, canonical, async () => void open(CHANGELOG_URL));
