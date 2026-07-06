import semver from 'semver';

// Freephite isn't published to a package registry; the source of truth for
// the latest version is package.json on the main branch of the GitHub repo.
const REMOTE_PACKAGE_JSON_URL =
  'https://raw.githubusercontent.com/biknandy/freephite/main/package.json';

export async function fetchLatestVersion(): Promise<string | undefined> {
  try {
    const response = await fetch(REMOTE_PACKAGE_JSON_URL, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return undefined;
    }
    const remotePackageJson = (await response.json()) as { version?: string };
    return semver.valid(remotePackageJson.version) ?? undefined;
  } catch {
    return undefined;
  }
}
