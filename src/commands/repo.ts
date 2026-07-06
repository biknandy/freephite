import { Argv } from 'yargs';

export const aliases = ['r'];
export const command = 'repo <command>';
export const desc = false;

export const builder = function (yargs: Argv): Argv {
  return yargs
    .commandDir('repo-commands', {
      extensions: ['js'],
    })
    .strict()
    .demandCommand();
};
