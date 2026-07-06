import open from 'open';
import yargs from 'yargs';
import { ExitFailedError } from '../lib/errors';
import { graphite } from '../lib/runner';

const args = {
  branch: {
    describe: `A branch name or PR number to open.`,
    demandOption: false,
    positional: true,
    type: 'string',
    hidden: true,
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'pr [branch]';
export const canonical = 'pr';
export const description =
  "Opens the GitHub pull request page for a branch or PR number. If no branch is passed, the current branch's PR is opened.";
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) => {
    const owner = context.repoConfig.getRepoOwner();
    const repo = context.repoConfig.getRepoName();

    if (argv.branch && /^\d+$/.test(argv.branch)) {
      return void open(
        `https://github.com/${owner}/${repo}/pull/${argv.branch}`
      );
    }

    const branchName = argv.branch ?? context.engine.currentBranchPrecondition;
    const prInfo = context.engine.getPrInfo(branchName);
    const url =
      prInfo?.url ??
      (prInfo?.number
        ? `https://github.com/${owner}/${repo}/pull/${prInfo.number}`
        : undefined);

    if (!url) {
      throw new ExitFailedError(
        `No PR associated with ${branchName}; you can open one with \`gt submit\`.`
      );
    }
    return void open(url);
  });
