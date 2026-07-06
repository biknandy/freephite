import * as t from '@withgraphite/retype';
import { spiffy } from './spiffy';

/**
 * Before each mutating command, we record a snapshot of every local branch
 * ref and its Graphite metadata blob. `gt undo` restores the most recent
 * snapshot whose state differs from the current state of the repo.
 *
 * Metadata blobs are referenced by sha; the blobs stay alive in the object
 * database well past the useful undo window (git only prunes unreachable
 * objects after weeks).
 */
const schema = t.shape({
  snapshots: t.optional(
    t.array(
      t.shape({
        command: t.string,
        timestampMs: t.number,
        currentBranchName: t.optional(t.string),
        branches: t.array(
          t.shape({
            name: t.string,
            revision: t.string,
            metadata: t.optional(t.string),
          })
        ),
      })
    )
  ),
});

export type TUndoSnapshot = Required<
  t.TypeOf<typeof schema>
>['snapshots'][number];

const MAX_SNAPSHOTS = 20;

export const undoSnapshotsConfigFactory = spiffy({
  schema,
  defaultLocations: [
    {
      relativePath: '.graphite_undo_snapshots',
      relativeTo: 'REPO',
    },
  ],
  initialize: () => {
    return {};
  },
  helperFunctions: (data, update) => {
    return {
      push: (snapshot: TUndoSnapshot) => {
        update((d) => {
          d.snapshots = [...(d.snapshots ?? []), snapshot].slice(
            -MAX_SNAPSHOTS
          );
        });
      },
    } as const;
  },
  options: { removeIfInvalid: true },
});

export type TUndoSnapshotsConfig = ReturnType<
  typeof undoSnapshotsConfigFactory.load
>;
