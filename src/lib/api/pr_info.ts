import * as t from '@withgraphite/retype';
import { TUserConfig } from '../spiffy/user_config_spf';
import { TRepoParams } from './common_params';
import { Octokit } from '@octokit/core';
import { getOctokit } from './octokit';

const pullRequestInfoResponse = {
  prs: t.array(
    t.shape({
      prNumber: t.number,
      title: t.string,
      body: t.string,
      state: t.literals(['OPEN', 'CLOSED', 'MERGED'] as const),
      reviewDecision: t.literals([
        'CHANGES_REQUESTED',
        'APPROVED',
        'REVIEW_REQUIRED',
        null,
        undefined,
      ] as const),
      headRefName: t.string,
      baseRefName: t.string,
      url: t.string,
      isDraft: t.boolean,
    })
  ),
};

type TBranchNameWithPrNumber = {
  branchName: string;
  prNumber: number | undefined;
};

export type TPRInfoToUpsert = t.UnwrapSchemaMap<
  typeof pullRequestInfoResponse
>['prs'];

type TGraphqlPr = {
  number: number;
  title: string;
  body: string | null;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  url: string;
  isDraft: boolean | null;
  headRefName: string;
  baseRefName: string;
  reviewDecision: 'CHANGES_REQUESTED' | 'APPROVED' | 'REVIEW_REQUIRED' | null;
  headRepositoryOwner: { login: string } | null;
} | null;

const PR_FRAGMENT = `fragment PrInfo on PullRequest { number title body state url isDraft headRefName baseRefName reviewDecision headRepositoryOwner { login } }`;
// Keep documents comfortably under GitHub's GraphQL node and complexity limits.
const CHUNK_SIZE = 80;

/**
 * Fetches PR info for all branches in a handful of batched GraphQL requests
 * (one round trip per CHUNK_SIZE branches) instead of several REST requests
 * per branch. Branches with a known PR number are looked up by number; the
 * rest are matched against open PRs by head branch name.
 */
export async function getPrInfoForBranches(
  branchNamesWithExistingPrInfo: TBranchNameWithPrNumber[],
  params: TRepoParams,
  userConfig: TUserConfig
): Promise<TPRInfoToUpsert> {
  const branchesWithoutPrInfo = new Set<string>();
  const existingPrInfo = new Map<number, string>();

  branchNamesWithExistingPrInfo.forEach((branch) => {
    if (branch?.prNumber === undefined) {
      branchesWithoutPrInfo.add(branch.branchName);
    } else {
      existingPrInfo.set(branch.prNumber, branch.branchName);
    }
  });

  const octokit = getOctokit(userConfig);

  const selections = [
    ...[...existingPrInfo.keys()].map(
      (prNumber, i) => `n${i}: pullRequest(number: ${prNumber}) { ...PrInfo }`
    ),
    ...[...branchesWithoutPrInfo].map(
      (branchName, i) =>
        `h${i}: pullRequests(headRefName: ${JSON.stringify(
          branchName
        )}, states: OPEN, first: 5) { nodes { ...PrInfo } }`
    ),
  ];

  const aliased: Record<string, TGraphqlPr | { nodes: TGraphqlPr[] }> = {};
  for (let i = 0; i < selections.length; i += CHUNK_SIZE) {
    const query = `query ($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${selections
      .slice(i, i + CHUNK_SIZE)
      .join(' ')} } } ${PR_FRAGMENT}`;
    const data = await graphqlAllowPartialResponse(octokit, query, {
      owner: params.repoOwner,
      name: params.repoName,
    });
    Object.assign(aliased, data?.repository ?? {});
  }

  const prs: TPRInfoToUpsert = [];
  for (const response of Object.values(aliased)) {
    const pr =
      response && 'nodes' in response
        ? // headRefName matches PRs from forks too; only associate PRs whose
          // head branch lives in this repo.
          response.nodes.find(
            (node) => node?.headRepositoryOwner?.login === params.repoOwner
          )
        : response;
    if (pr) {
      prs.push({
        prNumber: pr.number,
        title: pr.title,
        body: pr.body ?? '',
        state: pr.state,
        reviewDecision: pr.reviewDecision,
        headRefName: pr.headRefName,
        baseRefName: pr.baseRefName,
        url: pr.url,
        isDraft: pr.isDraft ?? false,
      });
    }
  }

  return prs.filter((pr) => {
    const branchNameIfAssociated = existingPrInfo.get(pr.prNumber);

    const shouldAssociatePrWithBranch =
      !branchNameIfAssociated &&
      pr.state === 'OPEN' &&
      branchesWithoutPrInfo.has(pr.headRefName);

    const shouldUpdateExistingBranch =
      branchNameIfAssociated === pr.headRefName;

    return shouldAssociatePrWithBranch || shouldUpdateExistingBranch;
  });
}

// PR info refresh is best-effort: a missing PR (e.g. a stale PR number)
// surfaces as a GraphQL error alongside partial data, which we use; rate
// limits, outages, and transport failures skip the batch so callers (sync,
// submit validation) proceed with the metadata they already have.
async function graphqlAllowPartialResponse(
  octokit: Octokit,
  query: string,
  variables: { owner: string; name: string }
): Promise<{ repository?: Record<string, never> } | undefined> {
  try {
    return await octokit.graphql(query, variables);
  } catch (err) {
    return err?.name === 'GraphqlResponseError' && err.data
      ? err.data
      : undefined;
  }
}
