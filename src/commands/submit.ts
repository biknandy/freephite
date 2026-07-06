import yargs from 'yargs';
import { submitAction } from '../actions/submit/submit_action';
import { SCOPE } from '../lib/engine/scope_spec';
import { graphite } from '../lib/runner';
import { args as sharedArgs } from './shared-commands/submit';

const args = {
  ...sharedArgs,
  select: {
    describe: sharedArgs.select.describe,
    type: 'boolean',
    default: false,
  },
  stack: {
    describe: `Submit descendants of the current branch in addition to its ancestors.`,
    type: 'boolean',
    default: false,
    alias: 's',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'submit';
export const canonical = 'submit';
export const description =
  'Idempotently force push all branches from trunk to the current branch to GitHub, creating or updating distinct pull requests for each. Use --stack to also submit descendants of the current branch.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> => {
  await graphite(argv, canonical, async (context) => {
    await submitAction(
      {
        scope: argv.stack ? SCOPE.STACK : SCOPE.DOWNSTACK,
        editPRFieldsInline: !argv['no-edit'] && argv.edit,
        draft: argv.draft,
        publish: argv.publish,
        dryRun: argv['dry-run'],
        updateOnly: argv['update-only'],
        reviewers: argv.reviewers,
        confirm: argv.confirm,
        forcePush: argv.force,
        select: argv.select,
        always: argv.always,
        branch: argv.branch,
        mergeWhenReady: argv['merge-when-ready'],
      },
      context
    );
  });
};
