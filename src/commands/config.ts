import { Argv } from 'yargs';

export const command = 'config <command>';
export const desc =
  'Configure the Graphite CLI. Run `gt config --help` to see the available settings.';
export const aliases = ['user'];

export const builder = function (yargs: Argv): Argv {
  return yargs
    .commandDir('user-commands', {
      extensions: ['js'],
    })
    .strict()
    .demandCommand();
};
