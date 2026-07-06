import { getPrInfoForBranches, TPRInfoToUpsert } from '../lib/api/pr_info';
import { TContext } from '../lib/context';
import { TEngine } from '../lib/engine/engine';

export async function syncPrInfo(
  branchNames: string[],
  context: TContext
): Promise<TPRInfoToUpsert> {
  if (context.userConfig.getFPAuthToken() === undefined) {
    return [];
  }

  // PR info refresh is best-effort: an unreachable API or a remote that
  // isn't a GitHub repo shouldn't fail the command using it.
  let upsertInfo: TPRInfoToUpsert;
  try {
    upsertInfo = await getPrInfoForBranches(
      branchNames.map((branchName) => ({
        branchName,
        prNumber: context.engine.getPrInfo(branchName)?.number,
      })),
      {
        repoName: context.repoConfig.getRepoName(),
        repoOwner: context.repoConfig.getRepoOwner(),
      },
      context.userConfig
    );
  } catch (err) {
    context.splog.debug(`Failed to fetch PR info: ${err}`);
    return [];
  }

  upsertPrInfoForBranches(upsertInfo, context.engine);

  return upsertInfo;
}

export function upsertPrInfoForBranches(
  prInfoToUpsert: TPRInfoToUpsert,
  engine: TEngine
): void {
  prInfoToUpsert.forEach((pr) => {
    const prInfo = {
      number: pr.prNumber,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      reviewDecision: pr.reviewDecision ?? undefined,
      base: pr.baseRefName,
      url: pr.url,
      isDraft: pr.isDraft,
    };
    // Skip the metadata ref write (two git subprocesses) when nothing changed.
    const existing = engine.getPrInfo(pr.headRefName);
    if (
      existing &&
      Object.entries(prInfo).every(
        ([key, value]) => existing[key as keyof typeof prInfo] === value
      )
    ) {
      return;
    }
    engine.upsertPrInfo(pr.headRefName, prInfo);
  });
}
