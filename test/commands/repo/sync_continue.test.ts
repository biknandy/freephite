import { expect } from 'chai';
import nock from 'nock';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { expectBranches } from '../../lib/utils/expect_branches';
import { fakeGitSquashAndMerge } from '../../lib/utils/fake_squash_and_merge';

for (const scene of allScenes) {
  // eslint-disable-next-line max-lines-per-function
  describe(`(${scene}): repo sync with conflicts`, function () {
    configureTest(this, scene);

    beforeEach(() => {
      // Querying this endpoint requires a repo owner and name so we set
      // that here too. Note that these values are meaningless (for now)
      // and just need to exist.
      scene.repo.runCliCommandAndGetOutput([
        `repo`,
        `owner`,
        `-s`,
        `integration_test`,
      ]);
      scene.repo.runCliCommandAndGetOutput([
        `repo`,
        `name`,
        `-s`,
        `integration_test`,
      ]);
    });

    afterEach(() => {
      nock.restore();
    });

    it('Skips a conflicting branch during sync and can restack it after', async () => {
      scene.repo.checkoutBranch('main');
      scene.repo.createChange('a', 'file_with_no_merge_conflict_a');
      scene.repo.runCliCommand([`branch`, `create`, `a`, `-m`, `a`]);

      scene.repo.checkoutBranch('main');
      scene.repo.createChange('b', 'file_with_no_merge_conflict_b');
      scene.repo.runCliCommand([`branch`, `create`, `b`, `-m`, `b`]);

      scene.repo.createChange('c', 'file_with_merge_conflict');
      scene.repo.runCliCommand([`branch`, `create`, `c`, `-m`, `c`]);

      scene.repo.checkoutBranch('main');
      scene.repo.createChange('d', 'file_with_merge_conflict');
      scene.repo.runCliCommand([`branch`, `create`, `d`, `-m`, `d`]);

      scene.repo.checkoutBranch('main');
      scene.repo.createChange('e', 'file_with_no_merge_conflict_e');
      scene.repo.runCliCommand([`branch`, `create`, `e`, `-m`, `e`]);

      expectBranches(scene.repo, 'a, b, c, d, e, main');

      // Squashing all but branch (c) which will have a merge conflict when
      // it's rebased onto trunk.
      fakeGitSquashAndMerge(scene.repo, 'a', 'squash');
      fakeGitSquashAndMerge(scene.repo, 'b', 'squash');
      fakeGitSquashAndMerge(scene.repo, 'd', 'squash');
      fakeGitSquashAndMerge(scene.repo, 'e', 'squash');

      // Sync must not stop on the conflict: it skips c and reports it.
      const output = scene.repo.runCliCommandAndGetOutput([
        `repo`,
        `sync`,
        `--no-pull`,
        `--restack`,
      ]);
      expect(output).to.include('except for');
      expect(output).to.include('c');
      expect(scene.repo.rebaseInProgress()).to.be.false;
      expectBranches(scene.repo, 'c, main');

      // The skipped branch can then be restacked, hitting the conflict.
      scene.repo.checkoutBranch('c');
      expect(() =>
        scene.repo.runCliCommand([`branch`, `restack`])
      ).to.throw();
      expect(scene.repo.rebaseInProgress()).to.be.true;

      scene.repo.resolveMergeConflicts();
      scene.repo.markMergeConflictsAsResolved();
      scene.repo.runCliCommand(['continue']);

      expectBranches(scene.repo, 'c, main');
      expect(scene.repo.rebaseInProgress()).to.be.false;
    });

    it('Skips multiple conflicting branches during a single sync', () => {
      scene.repo.checkoutBranch('main');
      scene.repo.createChange('a', 'file_with_no_merge_conflict_a');
      scene.repo.runCliCommand([`branch`, `create`, `a`, `-m`, `a`]);

      scene.repo.checkoutBranch('main');
      scene.repo.createChange('b', 'file_with_no_merge_conflict_b');
      scene.repo.runCliCommand([`branch`, `create`, `b`, `-m`, `b`]);

      scene.repo.createChange('c', 'file_with_merge_conflict_1');
      scene.repo.runCliCommand([`branch`, `create`, `c`, `-m`, `c`]);

      scene.repo.createChange('d', 'file_with_merge_conflict_2');
      scene.repo.runCliCommand([`branch`, `create`, `d`, `-m`, `d`]);

      scene.repo.checkoutBranch('main');
      scene.repo.createChange('e', 'file_with_merge_conflict_1');
      scene.repo.runCliCommand([`branch`, `create`, `e`, `-m`, `e`]);

      scene.repo.checkoutBranch('main');
      scene.repo.createChange('f', 'file_with_merge_conflict_2');
      scene.repo.runCliCommand([`branch`, `create`, `f`, `-m`, `f`]);

      expectBranches(scene.repo, 'a, b, c, d, e, f, main');

      fakeGitSquashAndMerge(scene.repo, 'a', 'squash');
      fakeGitSquashAndMerge(scene.repo, 'b', 'squash');
      fakeGitSquashAndMerge(scene.repo, 'e', 'squash');
      fakeGitSquashAndMerge(scene.repo, 'f', 'squash');

      const output = scene.repo.runCliCommandAndGetOutput([
        `repo`,
        `sync`,
        `--no-pull`,
        `--restack`,
      ]);
      expect(output).to.include('except for');
      expect(scene.repo.rebaseInProgress()).to.be.false;
      expectBranches(scene.repo, 'c, d, main');

      // Both skipped branches can be restacked individually afterwards.
      for (const branchName of ['c', 'd']) {
        scene.repo.checkoutBranch(branchName);
        expect(() =>
          scene.repo.runCliCommand([`branch`, `restack`])
        ).to.throw();
        expect(scene.repo.rebaseInProgress()).to.be.true;
        scene.repo.resolveMergeConflicts();
        scene.repo.markMergeConflictsAsResolved();
        scene.repo.runCliCommand(['continue']);
        expect(scene.repo.rebaseInProgress()).to.be.false;
      }

      expectBranches(scene.repo, 'c, d, main');
    });
  });
}
