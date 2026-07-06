import { expect } from 'chai';
import { BasicScene } from '../lib/scenes/basic_scene';
import { configureTest } from '../lib/utils/configure_test';

for (const scene of [new BasicScene()]) {
  describe(`(${scene}): command shortcuts`, function () {
    configureTest(this, scene);

    it("Can run the legacy 'bd' shortcut command", () => {
      scene.repo.runCliCommand([`branch`, `create`, `a`, `-m`, `a`]);
      scene.repo.runCliCommand([`branch`, `create`, `b`, `-m`, `b`]);
      expect(() => scene.repo.runCliCommand(['bd'])).to.not.throw(Error);
      expect(scene.repo.currentBranchName()).to.equal('a');
    });

    it("Can run the legacy 'bco' shortcut command", () => {
      scene.repo.runCliCommand([`branch`, `create`, `a`, `-m`, `a`]);
      scene.repo.checkoutBranch('main');
      expect(() => scene.repo.runCliCommand(['bco', 'a'])).to.not.throw(Error);
      expect(scene.repo.currentBranchName()).to.equal('a');
    });

    it("Can run the legacy 'ca' shortcut command", () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('2');
      expect(() => scene.repo.runCliCommand(['ca', '-a', '-n'])).to.not.throw(
        Error
      );
    });

    it("Can run the modern 'ls' and 'll' shortcuts", () => {
      expect(() => scene.repo.runCliCommand(['ls'])).to.not.throw(Error);
      expect(() => scene.repo.runCliCommand(['ll'])).to.not.throw(Error);
    });

    it('Modern one-letter aliases resolve to flat commands', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`c`, `a`, `-m`, `a`]);
      expect(scene.repo.currentBranchName()).to.equal('a');

      scene.repo.runCliCommand([`d`]);
      expect(scene.repo.currentBranchName()).to.equal('main');

      scene.repo.runCliCommand([`u`]);
      expect(scene.repo.currentBranchName()).to.equal('a');

      scene.repo.runCliCommand([`b`]);
      expect(scene.repo.currentBranchName()).to.equal('a');

      scene.repo.checkoutBranch('main');
      scene.repo.runCliCommand([`t`]);
      expect(scene.repo.currentBranchName()).to.equal('a');

      scene.repo.runCliCommand([`co`, `main`]);
      expect(scene.repo.currentBranchName()).to.equal('main');
    });
  });
}
