import yargs from 'yargs';
import { commitAmendAction } from '../actions/commit_amend';
import { commitCreateAction } from '../actions/commit_create';
import { editBranchAction } from '../actions/edit_branch';
import { graphite } from '../lib/runner';

const args = {
  all: {
    describe: `Stage all changes before committing.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'a',
  },
  update: {
    describe: `Stage all updates to tracked files before committing.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'u',
  },
  commit: {
    describe: `Create a new commit instead of amending the current commit. If this branch is empty, a new commit is always created.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'c',
  },
  message: {
    type: 'string',
    alias: 'm',
    describe:
      'The message for the new or amended commit. If passed, no editor is opened.',
    demandOption: false,
  },
  edit: {
    type: 'boolean',
    describe:
      'Open an editor to edit the commit message. When creating a new commit, this flag is ignored.',
    demandOption: false,
    default: false,
    alias: 'e',
  },
  patch: {
    describe: `Pick hunks to stage before committing.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'p',
  },
  'interactive-rebase': {
    describe: `Ignore all other flags and start a git interactive rebase on the commits in this branch.`,
    demandOption: false,
    default: false,
    type: 'boolean',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'modify';
export const canonical = 'modify';
export const aliases = ['m'];
export const description =
  'Modify the current branch by amending its commit or creating a new commit. Automatically restacks descendants.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    if (argv['interactive-rebase']) {
      return editBranchAction(context);
    }
    if (argv.update) {
      context.engine.addUpdatedFiles();
    }

    const makeNewCommit =
      argv.commit ||
      context.engine.isBranchEmpty(context.engine.currentBranchPrecondition);

    if (makeNewCommit) {
      commitCreateAction(
        {
          message: argv.message,
          addAll: argv.all,
          patch: argv.patch,
        },
        context
      );
      return;
    }

    commitAmendAction(
      {
        message: argv.message,
        noEdit: argv.message ? false : !argv.edit,
        addAll: argv.all,
        patch: argv.patch,
      },
      context
    );
  });
};
