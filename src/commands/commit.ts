import { Argv } from 'yargs';

export const command = 'commit <command>';
export const desc = false;

export const builder = function (yargs: Argv): Argv {
  return yargs
    .commandDir('commit-commands', {
      extensions: ['js'],
    })
    .strict()
    .demandCommand();
};
