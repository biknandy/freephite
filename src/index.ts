#!/usr/bin/env node
/* eslint-disable no-console */

import chalk from 'chalk';
import tmp from 'tmp';
import yargs from 'yargs';
import { globalArgumentsOptions } from './lib/global_arguments';
import { getYargsInput } from './lib/pre-yargs/preprocess_command';

// this line gets rid of warnings about "experimental fetch API" for our users
// while still showing us warnings when we test with DEBUG=1
if (!process.env.DEBUG) {
  process.removeAllListeners('warning');
}

// https://www.npmjs.com/package/tmp#graceful-cleanup
tmp.setGracefulCleanup();

process.on('uncaughtException', (err) => {
  console.log(chalk.redBright(`UNCAUGHT EXCEPTION: ${err.message}`));
  console.log(chalk.redBright(`UNCAUGHT EXCEPTION: ${err.stack}`));
  // eslint-disable-next-line no-restricted-syntax
  process.exit(1);
});

void yargs(getYargsInput())
  .scriptName('gt')
  .commandDir('commands')
  .help()
  .usage(
    'Freephite (gt/fp) is a fork of the Graphite CLI that talks directly to GitHub - no Graphite account needed - and makes working with stacked changes fast & intuitive.\n\nhttps://github.com/biknandy/freephite'
  )
  .options(globalArgumentsOptions)
  .global(Object.keys(globalArgumentsOptions))
  .strict()
  .demandCommand().argv;
