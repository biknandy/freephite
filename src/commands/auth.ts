import chalk from 'chalk';
import yargs from 'yargs';
import { graphiteWithoutRepo } from '../lib/runner';

const args = {
  token: {
    type: 'string',
    alias: 't',
    describe:
      'GitHub auth token. Get one from: https://github.com/settings/tokens (needs `repo` scope).',
    demandOption: false,
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'auth';
export const description =
  'Add your GitHub auth token so the CLI can create and update your PRs on GitHub.';
export const builder = args;
export const canonical = 'auth';

export const handler = async (argv: argsT): Promise<void> => {
  return graphiteWithoutRepo(argv, canonical, async (context) => {
    if (argv.token) {
      context.userConfig.update((data) => (data.fpAuthToken = argv.token));
      context.splog.info(
        chalk.green(`🔐 Saved auth token to "${context.userConfig.path}"`)
      );
      return;
    }

    const existing = context.userConfig.getFPAuthToken();
    context.splog.info(
      existing
        ? `Auth token is set (${existing.slice(0, 4)}...${existing.slice(-4)}).`
        : 'No auth token set. Run `gt auth -t <YOUR_GITHUB_TOKEN>` to set one.'
    );
  });
};
