import { Octokit } from '@octokit/core';
import { TUserConfig } from '../spiffy/user_config_spf';

/**
 * Constructs the GitHub API client used by all freephite commands, or throws
 * with setup instructions if the user has not authed yet. The endpoint is
 * configurable to support GitHub Enterprise (and tests).
 */
export function getOctokit(userConfig: TUserConfig): Octokit {
  const auth = userConfig.getFPAuthToken();
  if (!auth) {
    throw new Error(
      'No GitHub auth token found. Run `gt auth -t <YOUR_GITHUB_TOKEN>`, set GITHUB_TOKEN, or log in with `gh auth login`, then try again.'
    );
  }

  return new Octokit({ auth, baseUrl: userConfig.getGitHubApiUrl() });
}
