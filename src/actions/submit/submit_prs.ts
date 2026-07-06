import * as t from '@withgraphite/retype';
import chalk from 'chalk';
import { TContext } from '../../lib/context';
import { ExitFailedError } from '../../lib/errors';
import { Unpacked } from '../../lib/utils/ts_helpers';

import { Octokit } from '@octokit/core';
import { getOctokit } from '../../lib/api/octokit';

const submitPullRequestsParams = {
  authToken: t.optional(t.string),
  repoOwner: t.string,
  repoName: t.string,
  trunkBranchName: t.optional(t.string),
  mergeWhenReady: t.optional(t.boolean),
  prs: t.array(
    t.unionMany([
      t.shape({
        action: t.literals(['create'] as const),
        head: t.string,
        headSha: t.optional(t.string),
        base: t.string,
        baseSha: t.optional(t.string),
        title: t.string,
        body: t.optional(t.string),
        draft: t.optional(t.boolean),
        reviewers: t.optional(t.array(t.string)),
      }),
      t.shape({
        action: t.literals(['update'] as const),
        head: t.string,
        headSha: t.optional(t.string),
        base: t.string,
        baseSha: t.optional(t.string),
        title: t.optional(t.string),
        body: t.optional(t.string),
        prNumber: t.number,
        draft: t.optional(t.boolean),
        reviewers: t.optional(t.array(t.string)),
      }),
    ])
  ),
};

const submitPullRequestResponse = {
  prs: t.array(
    t.unionMany([
      t.shape({
        head: t.string,
        prNumber: t.number,
        prURL: t.string,
        status: t.literals(['updated', 'created'] as const),
      }),
      t.shape({
        head: t.string,
        error: t.string,
        status: t.literals(['error'] as const),
      }),
    ])
  ),
};

export type TPRSubmissionInfo = t.UnwrapSchemaMap<
  typeof submitPullRequestsParams
>['prs'];

type TSubmittedPRRequest = Unpacked<TPRSubmissionInfo>;

type TSubmittedPRResponse = Unpacked<
  t.UnwrapSchemaMap<typeof submitPullRequestResponse>['prs']
>;

type TSubmittedPR = {
  request: TSubmittedPRRequest;
  response: TSubmittedPRResponse;
};

export async function submitPullRequest(
  args: { submissionInfo: TPRSubmissionInfo },
  context: TContext
): Promise<void> {
  const pr = (
    await requestServerToSubmitPRs({
      submissionInfo: args.submissionInfo,
      context,
    })
  )[0];

  if (pr.response.status === 'error') {
    throw new ExitFailedError(
      `Failed to submit PR for ${pr.response.head}: ${parseSubmitError(
        pr.response.error
      )}`
    );
  }

  context.engine.upsertPrInfo(pr.response.head, {
    number: pr.response.prNumber,
    url: pr.response.prURL,
    base: pr.request.base,
    state: 'OPEN', // We know this is not closed or merged because submit succeeded
    ...(pr.request.action === 'create'
      ? {
          title: pr.request.title,
          body: pr.request.body,
          reviewDecision: 'REVIEW_REQUIRED', // Because we just opened this PR
        }
      : {}),
    ...(pr.request.draft !== undefined ? { isDraft: pr.request.draft } : {}),
  });
  context.splog.info(
    `${chalk.green(pr.response.head)}: ${pr.response.prURL} (${{
      updated: chalk.yellow,
      created: chalk.green,
    }[pr.response.status](pr.response.status)})`
  );
}

function parseSubmitError(error: string): string {
  try {
    return JSON.parse(error)?.response?.data?.message ?? error;
  } catch {
    return error;
  }
}

// This endpoint is plural for legacy reasons.
// Leaving the function plural in case we want to revert.
async function requestServerToSubmitPRs({
  submissionInfo,
  context,
}: {
  submissionInfo: TPRSubmissionInfo;
  context: TContext;
}): Promise<TSubmittedPR[]> {
  const octokit = getOctokit(context.userConfig);

  const owner = context.repoConfig.getRepoOwner();
  const repo = context.repoConfig.getRepoName();

  const prs = [];
  for (const info of submissionInfo) {
    if (info.action === 'create') {
      const response = await createPrOrAdoptExisting(
        { octokit, owner, repo, info },
        context
      );
      await requestReviewers(
        { octokit, owner, repo, prNumber: response.data.number, info },
        context
      );
      prs.push(response);
    }

    if (info.action === 'update') {
      const response = await octokit.request(
        `PATCH /repos/{owner}/{repo}/pulls/{pull_number}`,
        {
          owner,
          repo,
          pull_number: info.prNumber,
          title: info.title,
          body: info.body,
          base: info.base,
          headers: { 'X-GitHub-Api-Version': '2022-11-28' },
        }
      );
      await syncDraftState({ octokit, info, response: response.data }, context);
      await requestReviewers(
        { octokit, owner, repo, prNumber: info.prNumber, info },
        context
      );
      prs.push(response);
    }
  }

  const requests: { [head: string]: TSubmittedPRRequest } = {};
  submissionInfo.forEach((prRequest) => {
    requests[prRequest.head] = prRequest;
  });

  return prs.map((prResponse) => {
    const request = requests[prResponse.data.head.ref];
    return {
      request,
      response: {
        head: prResponse.data.head.ref,
        status: request.action === 'create' ? 'created' : 'updated',
        prNumber: prResponse.data.number,
        prURL: prResponse.data.html_url,
      },
    };
  });
}

// GitHub rejects PR creation with a 422 when an open PR already exists for
// the head branch (e.g. it was opened on github.com or local metadata was
// lost). Recover by adopting that PR and updating it instead.
async function createPrOrAdoptExisting(
  args: {
    octokit: Octokit;
    owner: string;
    repo: string;
    info: TSubmittedPRRequest & { action: 'create' };
  },
  context: TContext
) {
  const { octokit, owner, repo, info } = args;
  try {
    return await octokit.request(`POST /repos/{owner}/{repo}/pulls`, {
      owner,
      repo,
      title: info.title,
      body: info.body,
      head: info.head,
      base: info.base,
      draft: info.draft,
      headers: { 'X-GitHub-Api-Version': '2022-11-28' },
    });
  } catch (err) {
    if (
      err?.status !== 422 ||
      !String(err?.message).includes('already exists')
    ) {
      throw err;
    }
    const existing = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner,
      repo,
      head: `${owner}:${info.head}`,
      state: 'open',
      per_page: 1,
      headers: { 'X-GitHub-Api-Version': '2022-11-28' },
    });
    const pr = existing.data[0];
    if (!pr) {
      throw err;
    }
    context.splog.warn(
      `A PR for ${info.head} already exists (#${pr.number}); updating it instead.`
    );
    return await octokit.request(
      `PATCH /repos/{owner}/{repo}/pulls/{pull_number}`,
      {
        owner,
        repo,
        pull_number: pr.number,
        title: info.title,
        body: info.body,
        base: info.base,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' },
      }
    );
  }
}

async function requestReviewers(
  args: {
    octokit: Octokit;
    owner: string;
    repo: string;
    prNumber: number;
    info: TSubmittedPRRequest;
  },
  context: TContext
): Promise<void> {
  const reviewers = 'reviewers' in args.info ? args.info.reviewers : undefined;
  if (!reviewers?.length) {
    return;
  }
  try {
    await args.octokit.request(
      'POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers',
      {
        owner: args.owner,
        repo: args.repo,
        pull_number: args.prNumber,
        reviewers,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' },
      }
    );
  } catch (err) {
    context.splog.warn(
      `Failed to request reviewers for ${args.info.head}: ${parseSubmitError(
        err.message ?? String(err)
      )}`
    );
  }
}

// The REST PATCH endpoint cannot toggle draft state; GitHub only exposes
// these transitions via GraphQL mutations.
async function syncDraftState(
  args: {
    octokit: Octokit;
    info: TSubmittedPRRequest & { action: 'update' };
    response: { node_id: string; draft?: boolean };
  },
  context: TContext
): Promise<void> {
  const targetDraft = args.info.draft;
  if (targetDraft === undefined || args.response.draft === targetDraft) {
    return;
  }
  try {
    await args.octokit.graphql(
      targetDraft
        ? `mutation ($id: ID!) { convertPullRequestToDraft(input: { pullRequestId: $id }) { clientMutationId } }`
        : `mutation ($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { clientMutationId } }`,
      { id: args.response.node_id }
    );
  } catch (err) {
    context.splog.warn(
      `Failed to ${
        targetDraft ? 'convert to draft' : 'mark ready for review'
      }: ${parseSubmitError(err.message ?? String(err))}`
    );
  }
}
