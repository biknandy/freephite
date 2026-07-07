import { expect } from 'chai';
import fs from 'fs-extra';
import nock from 'nock';
import {
  readMetadataRef,
  writeMetadataRef,
} from '../../../src/lib/engine/metadata_ref';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { expectBranches } from '../../lib/utils/expect_branches';
import { expectCommits } from '../../lib/utils/expect_commits';
import { fakeGitSquashAndMerge } from '../../lib/utils/fake_squash_and_merge';

for (const scene of allScenes) {
  // eslint-disable-next-line max-lines-per-function
  describe(`(${scene}): repo sync`, function () {
    configureTest(this, scene);

    beforeEach(() => {
      // Querying this endpoint requires a repo owner and name so we set
      // that here too. Note that these values are meaningless (for now)
      // and just need to exist.

      scene.repo.runCliCommand([`repo`, `owner`, `-s`, `integration_test`]);
      scene.repo.runCliCommand([`repo`, `name`, `-s`, `integration-test-repo`]);
    });

    afterEach(() => {
      nock.restore();
    });

    it('Can delete a single merged branch', async () => {
      scene.repo.createChange('2', 'a');
      scene.repo.runCliCommand([`branch`, `create`, `a`, `-m`, `a`]);

      expectBranches(scene.repo, 'a, main');

      fakeGitSquashAndMerge(scene.repo, 'a', 'squash');
      scene.repo.runCliCommand([`repo`, `owner`]);
      scene.repo.runCliCommand([`repo`, `sync`, `-f`, `--no-pull`]);

      expectBranches(scene.repo, 'main');
    });

    it('Can delete a branch marked as merged', async () => {
      scene.repo.createChange('2', 'a');
      scene.repo.runCliCommand([`branch`, `create`, `a`, `-m`, `a`]);

      expectBranches(scene.repo, 'a, main');

      writeMetadataRef(
        'a',
        { ...readMetadataRef('a', scene.dir), prInfo: { state: 'MERGED' } },
        scene.dir
      );

      scene.repo.runCliCommand([`repo`, `owner`]);
      scene.repo.runCliCommand([`repo`, `sync`, `-f`, `--no-pull`]);

      expectBranches(scene.repo, 'main');
    });

    it('Can delete a branch marked as closed', async () => {
      scene.repo.createChange('2', 'a');
      scene.repo.runCliCommand([`branch`, `create`, `a`, `-m`, `a`]);

      expectBranches(scene.repo, 'a, main');
      writeMetadataRef(
        'a',
        { ...readMetadataRef('a', scene.dir), prInfo: { state: 'CLOSED' } },
        scene.dir
      );

      scene.repo.runCliCommand([`repo`, `owner`]);
      scene.repo.runCliCommand([`repo`, `sync`, `-f`, `--no-pull`]);

      expectBranches(scene.repo, 'main');
    });

    it('Can noop sync if there are no stacks', () => {
      expect(() =>
        scene.repo.runCliCommand([`repo`, `sync`, `-f`, `--no-pull`])
      ).to.not.throw(Error);
    });

    it('Can delete the foundation of a double stack and restack it', async () => {
      scene.repo.createChange('2', 'a');
      scene.repo.runCliCommand([`branch`, `create`, `a`, `-m`, `a`]);

      scene.repo.createChange('3', 'b');
      scene.repo.runCliCommand([`branch`, `create`, `b`, `-m`, `b`]);

      expectBranches(scene.repo, 'a, b, main');

      fakeGitSquashAndMerge(scene.repo, 'a', 'squash');
      scene.repo.runCliCommand([
        `repo`,
        `sync`,
        `-f`,
        `--no-pull`,
        `--restack`,
      ]);

      expectBranches(scene.repo, 'b, main');
      expectCommits(scene.repo, 'squash, 1');

      scene.repo.checkoutBranch('b');
      expectCommits(scene.repo, 'b, squash, 1');
    });

    it('Can delete two branches off a three-stack', async () => {
      scene.repo.createChange('2', 'a');
      scene.repo.runCliCommand([`branch`, `create`, `a`, `-m`, `a`]);

      scene.repo.createChange('3', 'b');
      scene.repo.runCliCommand([`branch`, `create`, `b`, `-m`, `b`]);

      scene.repo.createChange('4', 'c');
      scene.repo.runCliCommand([`branch`, `create`, `c`, `-m`, `c`]);

      expectBranches(scene.repo, 'a, b, c, main');

      fakeGitSquashAndMerge(scene.repo, 'a', 'squash_a');
      fakeGitSquashAndMerge(scene.repo, 'b', 'squash_b');
      scene.repo.runCliCommand([`repo`, `sync`, `-f`, `--no-pull`]);

      expectBranches(scene.repo, 'c, main');
      expectCommits(scene.repo, 'squash_b, squash_a, 1');
    });

    it('Can delete two branches, while syncing inbetween, off a three-stack', async () => {
      scene.repo.createChange('2', 'a');
      scene.repo.runCliCommand([`branch`, `create`, `a`, `-m`, `a`]);

      scene.repo.createChange('3', 'b');
      scene.repo.runCliCommand([`branch`, `create`, `b`, `-m`, `b`]);

      scene.repo.createChange('4', 'c');
      scene.repo.runCliCommand([`branch`, `create`, `c`, `-m`, `c`]);

      expectBranches(scene.repo, 'a, b, c, main');

      fakeGitSquashAndMerge(scene.repo, 'a', 'squash_a');
      scene.repo.runCliCommand([`repo`, `sync`, `-f`, `--no-pull`]);
      fakeGitSquashAndMerge(scene.repo, 'b', 'squash_b');
      scene.repo.runCliCommand([`repo`, `sync`, `-f`, `--no-pull`]);

      expectBranches(scene.repo, 'c, main');
      expectCommits(scene.repo, 'squash_b, squash_a, 1');

      const metadata = fs.readdirSync(
        `${scene.repo.dir}/.git/refs/branch-metadata`
      );

      expect(metadata.includes('a')).to.be.false;
      expect(metadata.includes('b')).to.be.false;
      expect(metadata.includes('c')).to.be.true;
    });

    it('Restacks all branches in the repo, not just the current stack', async () => {
      scene.repo.createChange('2', 'a');
      scene.repo.runCliCommand([`branch`, `create`, `a`, `-m`, `a`]);

      scene.repo.checkoutBranch('main');
      scene.repo.createChange('3', 'b');
      scene.repo.runCliCommand([`branch`, `create`, `b`, `-m`, `b`]);

      // Advance trunk so both independent stacks need a restack.
      scene.repo.checkoutBranch('main');
      scene.repo.createChangeAndCommit('m1', 'm1');

      scene.repo.checkoutBranch('a');
      scene.repo.runCliCommand([`repo`, `sync`, `--no-pull`]);

      // The command returns the user to the branch they started on.
      expect(scene.repo.currentBranchName()).to.equal('a');
      expectCommits(scene.repo, 'a, m1, 1');

      // b is not in a's stack but was restacked too.
      scene.repo.checkoutBranch('b');
      expectCommits(scene.repo, 'b, m1, 1');
    });

    it('Restacks other branches without touching HEAD or the working tree', async () => {
      scene.repo.createChange('2', 'a');
      scene.repo.runCliCommand([`branch`, `create`, `a`, `-m`, `a`]);

      scene.repo.checkoutBranch('main');
      scene.repo.createChange('3', 'b');
      scene.repo.runCliCommand([`branch`, `create`, `b`, `-m`, `b`]);

      // Advance trunk so b (not in the current stack) needs a restack.
      scene.repo.checkoutBranch('main');
      scene.repo.createChangeAndCommit('m1', 'm1');

      const headReflogBefore = scene.repo.runGitCommandAndGetOutput([
        `reflog`,
        `HEAD`,
      ]);

      scene.repo.runCliCommand([`repo`, `sync`, `--no-pull`]);

      // b was restacked in memory (git replay): HEAD never moved, so the
      // working tree was never churned (no direnv/file-watcher triggers).
      const headReflogAfter = scene.repo.runGitCommandAndGetOutput([
        `reflog`,
        `HEAD`,
      ]);
      expect(headReflogAfter).to.equal(headReflogBefore);
      expect(scene.repo.currentBranchName()).to.equal('main');

      scene.repo.checkoutBranch('b');
      expectCommits(scene.repo, 'b, m1, 1');
    });

    it('Restacks a branch that had trunk merged into it (merge workflow)', async () => {
      scene.repo.createChange('2', 'a');
      scene.repo.runCliCommand([`branch`, `create`, `a`, `-m`, `a`]);

      // Trunk advances; the branch takes the update as a merge commit
      // (GitHub "Update branch" style) instead of a rebase.
      scene.repo.checkoutBranch('main');
      scene.repo.createChangeAndCommit('m1', 'm1');
      scene.repo.mergeBranch({ branch: 'a', mergeIn: 'main' });

      // Trunk advances again, so the branch is behind main once more.
      scene.repo.checkoutBranch('main');
      scene.repo.createChangeAndCommit('m2', 'm2');

      scene.repo.checkoutBranch('a');
      scene.repo.runCliCommand([`repo`, `sync`, `--no-pull`]);

      // The branch ends up linear on top of the latest trunk: the merge
      // commit is gone and already-merged trunk commits weren't replayed.
      expectCommits(scene.repo, 'a, m2, m1, 1');
    });
  });
}
