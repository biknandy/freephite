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

    const stored = context.userConfig.getStoredFPAuthToken();
    if (stored) {
      context.splog.info(
        `Auth token is set (${stored.slice(0, 4)}...${stored.slice(-4)}).`
      );
      return;
    }

    const ambient = context.userConfig.getFPAuthToken();
    context.splog.info(
      ambient
        ? `No auth token stored, but found ambient GitHub credentials (${ambient.slice(
            0,
            4
          )}...${ambient.slice(-4)}) via GITHUB_TOKEN/GH_TOKEN or the gh CLI.`
        : 'No auth token found. Run `gt auth -t <YOUR_GITHUB_TOKEN>`, set GITHUB_TOKEN, or log in with `gh auth login`.'
    );
  });
};
