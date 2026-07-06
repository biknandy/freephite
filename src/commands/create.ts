import yargs from 'yargs';
import { createBranchAction } from '../actions/create_branch';
import { graphite } from '../lib/runner';

const args = {
  name: {
    type: 'string',
    positional: true,
    demandOption: false,
    optional: true,
    describe: 'The name of the new branch.',
    hidden: true,
  },
  message: {
    describe: `Specify a commit message.`,
    demandOption: false,
    type: 'string',
    alias: 'm',
  },
  all: {
    describe: `Stage all unstaged changes before creating the branch, including untracked files.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'a',
  },
  update: {
    describe: `Stage all updates to tracked files before creating the branch.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'u',
  },
  patch: {
    describe: `Pick hunks to stage before committing.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'p',
  },
  insert: {
    describe: `Insert this branch between the current branch and its children.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'i',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const aliases = ['c'];
export const command = 'create [name]';
export const canonical = 'create';
export const description =
  'Create a new branch stacked on top of the current branch and commit staged changes. If no branch name is specified but a commit message is passed, generate a branch name from the commit message.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    if (argv.update) {
      context.engine.addUpdatedFiles();
    }
    await createBranchAction(
      {
        branchName: argv.name,
        message: argv.message,
        all: argv.all,
        insert: argv.insert,
        patch: argv.patch,
      },
      context
    );
  });
};
