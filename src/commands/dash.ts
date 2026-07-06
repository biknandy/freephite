import yargs from 'yargs';

export const command = 'dash <command>';
export const desc = false;
export const builder = function (yargs: yargs.Argv): yargs.Argv {
  return yargs
    .commandDir('dash-commands', {
      extensions: ['js'],
    })
    .strict();
};
