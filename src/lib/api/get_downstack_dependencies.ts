import { Octokit } from '@octokit/core';
import { TContext } from '../context';

/**
 * Computes the downstack (trunk-exclusive, ordered bottom to top) for a
 * branch by walking parent metadata for locally tracked branches and the
 * GitHub PR base chain for branches that only exist on the remote.
 */
export async function getDownstackDependencies(
  args: { branchName: string; trunkName: string },
  context: TContext
): Promise<string[]> {
  const auth = context.userConfig.getFPAuthToken();
  const octokit = auth ? new Octokit({ auth }) : undefined;
  const owner = context.repoConfig.getRepoOwner();
  const repo = context.repoConfig.getRepoName();

  const downstack: string[] = [];
  const seen = new Set<string>();
  let branchName: string | undefined = args.branchName;

  while (branchName && branchName !== args.trunkName && !seen.has(branchName)) {
    seen.add(branchName);
    downstack.unshift(branchName);

    if (
      context.engine.branchExists(branchName) &&
      context.engine.isBranchTracked(branchName)
    ) {
      branchName = context.engine.getParent(branchName);
      continue;
    }

    if (!octokit) {
      context.splog.debug(
        `No auth token; assuming ${branchName} is based on trunk.`
      );
      break;
    }

    const response = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner,
      repo,
      head: `${owner}:${branchName}`,
      state: 'open',
      per_page: 1,
      headers: { 'X-GitHub-Api-Version': '2022-11-28' },
    });
    branchName = response.data[0]?.base.ref;
  }

  return downstack;
}
