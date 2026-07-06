import semver from 'semver';
import { version as currentVersion } from '../../package.json';
import { TContextLite } from '../lib/context';
import { messageConfigFactory } from '../lib/spiffy/upgrade_message_spf';
import { fetchLatestVersion } from '../lib/utils/latest_version';
import { spawnDetached } from '../lib/utils/spawn';

const msInDay = 24 * 60 * 60 * 1000;

// Shell-completion commands whose stdout is piped into config files (an
// upgrade notice appended to their output would corrupt the result), plus
// `upgrade` itself, which reports version status authoritatively.
const UPGRADE_MESSAGE_EXCLUDED_COMMANDS = new Set([
  'fish',
  'completion',
  'upgrade',
]);

export function checkForUpgradeInBackground(context: TContextLite): void {
  if (process.env.GRAPHITE_DISABLE_UPGRADE_PROMPT) {
    return;
  }

  const now = Date.now();
  const lastCheckedMs = context.messageConfig.data.lastCheckedMs;

  // rate limit checking for updates to once per day
  if (lastCheckedMs === undefined || now - lastCheckedMs > msInDay) {
    // do our potential write before we kick off the child process so that we
    // don't incur a possible race condition with the write
    context.messageConfig.update((data) => (data.lastCheckedMs = now));

    spawnDetached(__filename);
  }
}

export function printUpgradeMessage(context: TContextLite): void {
  if (process.env.GRAPHITE_DISABLE_UPGRADE_PROMPT) {
    return;
  }

  const message = context.messageConfig.data.message;
  if (!message) {
    return;
  }

  if (
    !semver.valid(message.cliVersion) ||
    !semver.gt(message.cliVersion, currentVersion)
  ) {
    // The user has already upgraded to (or past) the advertised version.
    context.messageConfig.update((data) => (data.message = undefined));
    return;
  }

  context.splog.message(message.contents);
}

export { UPGRADE_MESSAGE_EXCLUDED_COMMANDS };

async function checkForUpgrade(): Promise<void> {
  const latestVersion = await fetchLatestVersion();
  const messageConfig = messageConfigFactory.load();
  messageConfig.update((data) => {
    data.message =
      latestVersion && semver.gt(latestVersion, currentVersion)
        ? {
            contents: `A new version of freephite is available: ${currentVersion} → ${latestVersion}. Run \`gt upgrade\` to update.`,
            cliVersion: latestVersion,
          }
        : undefined;
  });
}

if (process.argv[1] === __filename) {
  void checkForUpgrade();
}
