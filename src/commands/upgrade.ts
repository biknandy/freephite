import chalk from 'chalk';
import { spawnSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';
import yargs from 'yargs';
import { version as currentVersion } from '../../package.json';
import { ExitFailedError, PreconditionsFailedError } from '../lib/errors';
import { graphiteWithoutRepo } from '../lib/runner';
import { TContextLite } from '../lib/context';
import { fetchLatestVersion } from '../lib/utils/latest_version';

const args = {
  check: {
    describe: `Report whether a newer version is available without installing it. Exits 0 if up to date, 1 if an update is available.`,
    demandOption: false,
    type: 'boolean',
    default: false,
  },
} as const;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'upgrade';
export const canonical = 'upgrade';
export const aliases = ['update'];
export const description =
  'Update the freephite CLI to the latest version from GitHub.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphiteWithoutRepo(argv, canonical, async (context) =>
    argv.check ? checkAction(context) : upgradeAction(context)
  );

async function checkAction(context: TContextLite): Promise<void> {
  const latestVersion = await fetchLatestVersion();
  if (!latestVersion) {
    throw new ExitFailedError(
      `Could not determine the latest version. Is GitHub reachable?`
    );
  }
  if (semver.gt(latestVersion, currentVersion)) {
    context.splog.info(
      `A new version of freephite is available: ${chalk.cyan(
        currentVersion
      )} → ${chalk.cyan(latestVersion)}`
    );
    context.splog.info(`Run ${chalk.cyan(`gt upgrade`)} to update.`);
    process.exitCode = 1;
  } else {
    context.splog.info(
      `freephite is up to date (${chalk.cyan(currentVersion)}).`
    );
  }
}

async function upgradeAction(context: TContextLite): Promise<void> {
  const installRoot = getInstallRoot();
  if (!installRoot) {
    throw new PreconditionsFailedError(
      [
        `Could not locate the freephite source checkout for this installation.`,
        `Update manually by pulling the repo and rebuilding:`,
        chalk.cyan(
          `  git pull && npm install && npm run build   # in your freephite clone`
        ),
      ].join('\n')
    );
  }

  context.splog.info(
    `Updating freephite (${chalk.cyan(currentVersion)}) in ${chalk.cyan(
      installRoot
    )}...`
  );
  context.splog.newline();

  const packageManager = fs.existsSync(path.join(installRoot, 'pnpm-lock.yaml'))
    ? 'pnpm'
    : 'npm';
  const steps: [string, string[]][] = [
    ['git', ['pull', '--ff-only']],
    [packageManager, ['install']],
    [packageManager, ['run', 'build']],
  ];
  for (const [cmd, cmdArgs] of steps) {
    runStep({ context, cwd: installRoot, cmd, cmdArgs });
  }

  // The advertised version has been installed; clear any cached notice.
  context.messageConfig.update((data) => (data.message = undefined));

  const newVersion = (
    fs.readJSONSync(path.join(installRoot, 'package.json')) as {
      version: string;
    }
  ).version;
  context.splog.newline();
  context.splog.info(
    newVersion === currentVersion
      ? `freephite is up to date (${chalk.cyan(currentVersion)}).`
      : `Updated freephite: ${chalk.cyan(currentVersion)} → ${chalk.cyan(
          newVersion
        )}`
  );
}

// This file is compiled to <installRoot>/dist/src/commands/upgrade.js; walk up
// to find the source checkout. Fails (returns undefined) for standalone `pkg`
// binaries, which can't self-update this way.
function getInstallRoot(): string | undefined {
  const root = path.resolve(__dirname, '..', '..', '..');
  try {
    const packageJson = fs.readJSONSync(path.join(root, 'package.json')) as {
      name?: string;
    };
    return packageJson.name?.includes('freephite') &&
      fs.existsSync(path.join(root, '.git'))
      ? root
      : undefined;
  } catch {
    return undefined;
  }
}

function runStep({
  context,
  cwd,
  cmd,
  cmdArgs,
}: {
  context: TContextLite;
  cwd: string;
  cmd: string;
  cmdArgs: string[];
}): void {
  context.splog.info(chalk.dim(`$ ${cmd} ${cmdArgs.join(' ')}`));
  const result = spawnSync(cmd, cmdArgs, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new ExitFailedError(
      `\`${cmd} ${cmdArgs.join(
        ' '
      )}\` failed. Resolve the issue in ${cwd} and rerun ${chalk.cyan(
        `gt upgrade`
      )}.`
    );
  }
}
