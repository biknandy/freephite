import { expect } from 'chai';
import { BasicScene } from '../lib/scenes/basic_scene';
import { configureTest } from '../lib/utils/configure_test';
import { expectCommits } from '../lib/utils/expect_commits';

for (const scene of [new BasicScene()]) {
  // eslint-disable-next-line max-lines-per-function
  describe(`(${scene}): undo, absorb, revert, checkout -, conflict guard`, function () {
    configureTest(this, scene);

    it('Can undo a branch delete and redo it', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.checkoutBranch('main');
      scene.repo.runCliCommand([`delete`, `a`, `--force`]);
      expect(scene.repo.getRef('refs/heads/a')).to.not.match(/[0-9a-f]{40}/);

      scene.repo.runCliCommand([`undo`, `--force`]);
      expect(scene.repo.getRef('refs/heads/a')).to.match(/[0-9a-f]{40}/);
      // metadata is restored too: the branch is still tracked with parent main
      scene.repo.checkoutBranch('a');
      expect(scene.repo.runCliCommandAndGetOutput([`parent`])).to.equal(
        'main'
      );

      // undo again acts as redo
      scene.repo.checkoutBranch('main');
      scene.repo.runCliCommand([`undo`, `--force`]);
      expect(scene.repo.getRef('refs/heads/a')).to.not.match(/[0-9a-f]{40}/);
    });

    it('Can undo a sync that deleted a merged branch', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      const branchRevision = scene.repo.getRef('refs/heads/a');

      scene.repo.checkoutBranch('main');
      scene.repo.mergeBranch({ branch: 'main', mergeIn: 'a' });
      // Advance trunk past the merge so the branch is strictly behind it.
      scene.repo.createChangeAndCommit('2');
      scene.repo.runCliCommand([`sync`, `-f`, `--no-pull`, `--no-interactive`]);
      expect(scene.repo.getRef('refs/heads/a')).to.not.match(/[0-9a-f]{40}/);

      scene.repo.runCliCommand([`undo`, `--force`]);
      expect(scene.repo.getRef('refs/heads/a')).to.equal(branchRevision);
    });

    it('Can absorb staged changes into the branches that own them', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      // Stage edits to both branches' files from the top of the stack.
      scene.repo.createChange('a-fixed', 'a');
      scene.repo.createChange('b-fixed', 'b');
      scene.repo.runCliCommand([`absorb`, `--force`]);

      // Each fix landed in the branch that owns the file, with no new commits.
      expectCommits(scene.repo, 'b, a, 1');
      scene.repo.checkoutBranch('a');
      expect(scene.repo.getFileContents('a_test.txt')).to.equal('a-fixed');
      scene.repo.checkoutBranch('b');
      expect(scene.repo.getFileContents('a_test.txt')).to.equal('a-fixed');
      expect(scene.repo.getFileContents('b_test.txt')).to.equal('b-fixed');
      // Nothing left staged.
      expect(scene.repo.runGitCommandAndGetOutput([`status`, `--short`])).to
        .be.empty;
    });

    it('Absorb leaves unattributable changes staged', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);

      scene.repo.createChange('a-fixed', 'a');
      scene.repo.createChange('new content', 'unrelated-new-file');
      scene.repo.runCliCommand([`absorb`, `--force`]);

      expect(scene.repo.getFileContents('a_test.txt')).to.equal('a-fixed');
      expect(
        scene.repo.runGitCommandAndGetOutput([`status`, `--short`])
      ).to.contain('unrelated-new-file');
    });

    it('Absorb preserves staged deletions and files with non-ASCII names', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('naïve-content', 'naïve');
      scene.repo.runCliCommand([`modify`, `-a`, `-m`, `a2`]);

      // Stage: an attributable fix, an edit to the unicode-named file, and
      // a file deletion.
      scene.repo.createChange('a-fixed', 'a');
      scene.repo.createChange('naïve-fixed', 'naïve');
      scene.repo.runGitCommand([`rm`, `--cached`, `1_test.txt`]);
      scene.repo.runCliCommand([`absorb`, `--force`]);

      // Attributable hunks (including the unicode path) were absorbed...
      expect(scene.repo.getFileContents('a_test.txt')).to.equal('a-fixed');
      expect(scene.repo.getFileContents('naïve_test.txt')).to.equal(
        'naïve-fixed'
      );
      // ...and the deletion survived, still staged.
      expect(
        scene.repo.runGitCommandAndGetOutput([
          `diff`,
          `--cached`,
          `--name-status`,
        ])
      ).to.contain('D\t1_test.txt');
    });

    it('Can undo a rename across a slash boundary', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `feat`, `-m`, `a`]);
      scene.repo.runCliCommand([`rename`, `feat/sub`]);
      expect(scene.repo.currentBranchName()).to.equal('feat/sub');

      scene.repo.runCliCommand([`undo`, `--force`]);
      expect(scene.repo.currentBranchName()).to.equal('feat');
      expect(scene.repo.getRef('refs/heads/feat/sub')).to.not.match(
        /[0-9a-f]{40}/
      );
    });

    it('Absorb --dry-run reports the plan without changing anything', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      const branchRevision = scene.repo.getRef('refs/heads/a');

      scene.repo.createChange('a-fixed', 'a');
      const output = scene.repo.runCliCommandAndGetOutput([
        `absorb`,
        `--dry-run`,
      ]);
      expect(output).to.contain('a_test.txt');
      expect(scene.repo.getRef('refs/heads/a')).to.equal(branchRevision);
      expect(
        scene.repo.runGitCommandAndGetOutput([`status`, `--short`])
      ).to.contain('a_test.txt');
    });

    it('Can revert a trunk commit onto a new tracked branch', () => {
      const trunkSha = scene.repo.getRef('refs/heads/main');
      scene.repo.runCliCommand([`revert`, trunkSha]);

      const branchName = `revert-${trunkSha.slice(0, 8)}`;
      expect(scene.repo.currentBranchName()).to.equal(branchName);
      expect(scene.repo.runCliCommandAndGetOutput([`parent`])).to.equal(
        'main'
      );
      expect(
        scene.repo.listCurrentBranchCommitMessages()[0]
      ).to.contain('Revert');
    });

    it('Cannot revert a commit that is not on trunk', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      const branchSha = scene.repo.getRef('refs/heads/a');
      expect(() =>
        scene.repo.runCliCommand([`revert`, branchSha])
      ).to.throw();
    });

    it('Can checkout the previous branch with `checkout -`', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.runCliCommand([`checkout`, `main`]);
      scene.repo.runCliCommand([`checkout`, `-`]);
      expect(scene.repo.currentBranchName()).to.equal('a');
      scene.repo.runCliCommand([`checkout`, `-`]);
      expect(scene.repo.currentBranchName()).to.equal('main');
    });

    it('Blocks mutating commands while a rebase conflict is pending', () => {
      scene.repo.createChange('a', 'shared');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'shared');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      scene.repo.checkoutBranch('a');
      scene.repo.createChange('a-conflicts-with-b', 'shared');
      expect(() => scene.repo.runCliCommand([`modify`, `-a`])).to.throw();
      expect(scene.repo.rebaseInProgress()).to.be.true;

      // Mutating commands are blocked...
      expect(() =>
        scene.repo.runCliCommand([`create`, `nope`, `-m`, `nope`])
      ).to.throw();
      expect(() => scene.repo.runCliCommand([`untrack`, `b`])).to.throw();
      expect(() =>
        scene.repo.runCliCommand([`sync`, `--no-interactive`])
      ).to.throw();
      // ...read-only commands and abort still work.
      scene.repo.runCliCommand([`log`, `short`]);
      scene.repo.runCliCommand([`abort`, `--force`]);
      expect(scene.repo.rebaseInProgress()).to.be.false;
    });

    it('Shows children in branch info', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      const output = scene.repo.runCliCommandAndGetOutput([`info`, `a`]);
      expect(output).to.contain('Children');
      expect(output).to.contain('▸ b');
    });

    it('`config` works as an alias for user configuration', () => {
      scene.repo.runCliCommand([`config`, `tips`, `--enable`]);
      expect(
        scene.repo.runCliCommandAndGetOutput([`config`, `tips`])
      ).to.contain('tips enabled');
    });
  });
}
