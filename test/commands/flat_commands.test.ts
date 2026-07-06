import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { performInTmpDir } from '../../src/lib/utils/perform_in_tmp_dir';
import { BasicScene } from '../lib/scenes/basic_scene';
import { configureTest } from '../lib/utils/configure_test';
import { expectCommits } from '../lib/utils/expect_commits';
import { fakeGitSquashAndMerge } from '../lib/utils/fake_squash_and_merge';

for (const scene of [new BasicScene()]) {
  // eslint-disable-next-line max-lines-per-function
  describe(`(${scene}): flat commands`, function () {
    configureTest(this, scene);

    it('Can create a stack with `create` and navigate with up/down/top/bottom', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      scene.repo.runCliCommand([`bottom`]);
      expect(scene.repo.currentBranchName()).to.equal('a');
      scene.repo.runCliCommand([`up`]);
      expect(scene.repo.currentBranchName()).to.equal('b');
      scene.repo.runCliCommand([`down`]);
      expect(scene.repo.currentBranchName()).to.equal('a');
      scene.repo.runCliCommand([`top`]);
      expect(scene.repo.currentBranchName()).to.equal('b');
    });

    it('Can checkout by name and checkout trunk with --trunk', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);

      scene.repo.runCliCommand([`checkout`, `main`]);
      expect(scene.repo.currentBranchName()).to.equal('main');
      scene.repo.runCliCommand([`checkout`, `a`]);
      expect(scene.repo.currentBranchName()).to.equal('a');
      scene.repo.runCliCommand([`checkout`, `--trunk`]);
      expect(scene.repo.currentBranchName()).to.equal('main');
    });

    it('Can amend with `modify` and add a commit with `modify -c`', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);

      scene.repo.createChange('a1');
      scene.repo.runCliCommand([`modify`, `-a`]);
      expectCommits(scene.repo, 'a');

      scene.repo.createChange('a2');
      scene.repo.runCliCommand([`modify`, `-cam`, `a2`]);
      expectCommits(scene.repo, 'a2, a');

      scene.repo.runCliCommand([`modify`, `-am`, `a3`]);
      expectCommits(scene.repo, 'a3, a');
    });

    it('`modify` restacks descendants', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      scene.repo.checkoutBranch('a');
      scene.repo.createChange('a1', 'a1');
      scene.repo.runCliCommand([`modify`, `-a`]);

      scene.repo.checkoutBranch('b');
      expectCommits(scene.repo, 'b, a');
    });

    it('Can move a branch onto another with `move --onto`', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.checkoutBranch('main');
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      scene.repo.runCliCommand([`move`, `--onto`, `a`]);
      expectCommits(scene.repo, 'b, a, 1');
      expect(scene.repo.runCliCommandAndGetOutput([`parent`])).to.equal('a');
    });

    it('Can restack the current stack with `restack`', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      scene.repo.checkoutBranch('a');
      scene.repo.createChangeAndAmend('a1', 'a1');

      scene.repo.checkoutBranch('b');
      scene.repo.runCliCommand([`restack`]);
      expectCommits(scene.repo, 'b, a, 1');
    });

    it('Can pop the current branch, retaining its changes', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);

      scene.repo.runCliCommand([`pop`]);
      expect(scene.repo.currentBranchName()).to.equal('main');
      expect(scene.repo.getRef('refs/heads/a')).to.equal('');
    });

    it('Can delete a branch with `delete -f`', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.checkoutBranch('main');

      scene.repo.runCliCommand([`delete`, `a`, `-f`]);
      expect(scene.repo.getRef('refs/heads/a')).to.equal('');
    });

    it('Can rename the current branch', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);

      scene.repo.runCliCommand([`rename`, `a2`]);
      expect(scene.repo.currentBranchName()).to.equal('a2');
    });

    it('Can squash the current branch', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('a1', 'a1');
      scene.repo.runCliCommand([`modify`, `-cam`, `a1`]);

      scene.repo.runCliCommand([`squash`, `-n`]);
      expectCommits(scene.repo, 'a');
    });

    it('Can fold a branch into its parent', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      scene.repo.runCliCommand([`fold`, `-k`]);
      expect(scene.repo.currentBranchName()).to.equal('b');
      expectCommits(scene.repo, 'b, a, 1');
    });

    it('Can track and untrack a branch', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createAndCheckoutBranch('feature');
      scene.repo.createChangeAndCommit('f');

      scene.repo.runCliCommand([`track`, `feature`, `-p`, `a`]);
      expect(scene.repo.runCliCommandAndGetOutput([`parent`])).to.equal('a');

      scene.repo.runCliCommand([`untrack`, `feature`, `-f`]);
      expect(
        scene.repo.runCliCommandAndGetOutput([`parent`]).includes('not tracked')
      ).to.be.true;
    });

    it('`trunk`, `children`, and `info` report stack info', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);

      expect(scene.repo.runCliCommandAndGetOutput([`trunk`])).to.equal('main');
      scene.repo.checkoutBranch('main');
      expect(scene.repo.runCliCommandAndGetOutput([`children`])).to.equal('a');
      expect(() => scene.repo.runCliCommand([`info`, `a`])).to.not.throw(Error);
    });

    it('`unlink` is a no-op on branches without PRs', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      expect(
        scene.repo
          .runCliCommandAndGetOutput([`unlink`])
          .includes('no associated PR')
      ).to.be.true;
    });

    it('Can reorder the stack non-interactively via an input file', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      performInTmpDir((dirPath) => {
        const inputPath = path.join(dirPath, 'edits.txt');
        fs.writeFileSync(inputPath, ['a', 'b'].join('\n'));
        scene.repo.runCliCommand([`reorder`, `--input`, inputPath]);
        scene.repo.checkoutBranch('a');
        expectCommits(scene.repo, 'a, b, 1');
      });
    });

    it('Can sync without a remote using --no-pull', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.checkoutBranch('main');
      fakeGitSquashAndMerge(scene.repo, 'a', 'squash');

      scene.repo.runCliCommand([`sync`, `--no-pull`, `-f`]);
      expect(scene.repo.getRef('refs/heads/a')).to.equal('');
    });

    it('Can abort a conflicted restack with `abort`', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      scene.repo.checkoutBranch('a');
      scene.repo.createChangeAndAmend('1');

      scene.repo.checkoutBranch('b');
      expect(() => scene.repo.runCliCommand(['restack', '-q'])).to.throw();
      expect(scene.repo.rebaseInProgress()).to.be.true;

      scene.repo.runCliCommand(['abort', '-f']);
      expect(scene.repo.rebaseInProgress()).to.be.false;
      expect(scene.repo.currentBranchName()).to.equal('b');
    });

    it('`abort` errors when no rebase is in progress', () => {
      expect(() => scene.repo.runCliCommand(['abort', '-f'])).to.throw();
    });

    it('`abort` returns to the branch the conflicted command ran from', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      scene.repo.checkoutBranch('a');
      scene.repo.createChange('1');
      // modify amends `a` and hits a conflict restacking `b`
      expect(() => scene.repo.runCliCommand(['modify', '-a', '-q'])).to.throw();
      expect(scene.repo.rebaseInProgress()).to.be.true;

      // other mutating commands are blocked while the rebase is pending
      expect(() => scene.repo.runCliCommand(['restack', '-q'])).to.throw();

      scene.repo.runCliCommand(['abort', '-f']);
      expect(scene.repo.rebaseInProgress()).to.be.false;
      expect(scene.repo.currentBranchName()).to.equal('a');
    });
  });
}
