'use strict';

jest.mock('child_process', () => ({ execSync: jest.fn() }));
jest.mock('../lib/utils', () => ({ run: jest.fn() }));
jest.mock('../lib/i18n', () => ({
  t: (key) => key
}));

const { execSync } = require('child_process');
const { run } = require('../lib/utils');
const { uninstallPackages, runAuditFix, installPackages } = require('../lib/package-processor');

describe('package-processor.js', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('uninstallPackages()', () => {
    test('calls run with uninstall command for prod packages', () => {
      uninstallPackages(['lodash', 'react'], []);
      expect(run).toHaveBeenCalledWith('npm uninstall lodash react');
    });

    test('calls run with --save-dev for dev packages', () => {
      uninstallPackages([], ['jest', 'typescript']);
      expect(run).toHaveBeenCalledWith('npm uninstall --save-dev jest typescript');
    });

    test('does nothing when both lists are empty', () => {
      uninstallPackages([], []);
      expect(run).not.toHaveBeenCalled();
    });

    test('runs both commands when both lists have packages', () => {
      uninstallPackages(['react'], ['jest']);
      expect(run).toHaveBeenCalledTimes(2);
    });
  });

  describe('runAuditFix()', () => {
    test('calls run with npm audit fix', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      runAuditFix();
      expect(run).toHaveBeenCalledWith('npm audit fix');
      consoleSpy.mockRestore();
    });

    test('continues even when npm audit fix throws', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      run.mockImplementationOnce(() => { throw new Error('audit failed'); });
      expect(() => runAuditFix()).not.toThrow();
      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe('installPackages()', () => {
    test('installs prod packages', () => {
      installPackages(['react', 'lodash'], [], '');
      expect(run).toHaveBeenCalledWith('npm install react lodash');
    });

    test('installs dev packages with --save-dev', () => {
      installPackages([], ['jest'], '');
      expect(run).toHaveBeenCalledWith('npm install --save-dev jest');
    });

    test('passes --save-exact flag when useExact is set', () => {
      installPackages(['react'], [], ' --save-exact');
      expect(run).toHaveBeenCalledWith('npm install --save-exact react');
    });

    test('does nothing when both lists are empty', () => {
      installPackages([], [], '');
      expect(run).not.toHaveBeenCalled();
    });
  });
});
