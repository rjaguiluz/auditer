'use strict';

jest.mock('fs');

jest.mock('../lib/utils', () => ({
  run: jest.fn(),
  askUser: jest.fn()
}));
jest.mock('../lib/package-manager', () => ({
  readPackageJson: jest.fn(),
  writePackageJson: jest.fn()
}));
jest.mock('../lib/version-utils', () => ({
  stripVersionPrefix: jest.fn((v) => v.replace(/^[\^~>=]/, '')),
  findLatestMinorVersion: jest.fn(),
  getLatestVersionFromNpm: jest.fn()
}));
jest.mock('../lib/state', () => ({
  getChangesTracker: jest.fn(() => ({ versionChanges: [] })),
  getDryRun: jest.fn(() => false)
}));
jest.mock('../lib/i18n', () => ({
  t: (key, params) => {
    if (!params) return key;
    return Object.entries(params).reduce((s, [k, v]) => s.replace(`{{${k}}}`, v), key);
  }
}));

const { run, askUser } = require('../lib/utils');
const { readPackageJson, writePackageJson } = require('../lib/package-manager');
const { stripVersionPrefix, findLatestMinorVersion, getLatestVersionFromNpm } = require('../lib/version-utils');
const { getDryRun } = require('../lib/state');
const { replaceWithExactVersions, updateToMinorVersions, updateToMajorVersions } = require('../lib/version-manager');

describe('version-manager.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stripVersionPrefix.mockImplementation((v) => v.replace(/^[\^~>=]/, ''));
    getDryRun.mockReturnValue(false);
  });

  describe('replaceWithExactVersions()', () => {
    test('removes ^ from production dependencies', async () => {
      readPackageJson.mockReturnValue({
        dependencies: { lodash: '^4.17.21', react: '18.0.0' },
        devDependencies: {}
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await replaceWithExactVersions(new Set(), new Set(['lodash', 'react']), new Set());

      expect(writePackageJson).toHaveBeenCalled();
      expect(run).toHaveBeenCalledWith('npm install');
      consoleSpy.mockRestore();
    });

    test('removes ^ from devDependencies', async () => {
      readPackageJson.mockReturnValue({
        dependencies: {},
        devDependencies: { jest: '^29.0.0' }
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await replaceWithExactVersions(new Set(), new Set(), new Set(['jest']));

      expect(writePackageJson).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('does nothing when no prefixed versions found', async () => {
      readPackageJson.mockReturnValue({
        dependencies: { lodash: '4.17.21' },
        devDependencies: {}
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await replaceWithExactVersions(new Set(), new Set(['lodash']), new Set());

      expect(writePackageJson).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('does not write package.json in dry-run mode', async () => {
      getDryRun.mockReturnValue(true);
      readPackageJson.mockReturnValue({
        dependencies: { lodash: '^4.17.21' },
        devDependencies: {}
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await replaceWithExactVersions(new Set(), new Set(['lodash']), new Set());

      expect(writePackageJson).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('only processes matched packages when set is non-empty', async () => {
      readPackageJson.mockReturnValue({
        dependencies: { lodash: '^4.17.21', react: '^18.0.0' },
        devDependencies: {}
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await replaceWithExactVersions(new Set(['lodash']), new Set(['lodash', 'react']), new Set());

      const writtenPkg = writePackageJson.mock.calls[0][0];
      expect(writtenPkg.dependencies.lodash).toBe('4.17.21');
      expect(writtenPkg.dependencies.react).toBe('^18.0.0'); // untouched
      consoleSpy.mockRestore();
    });
  });

  describe('updateToMinorVersions()', () => {
    test('updates packages that have newer minor versions', async () => {
      readPackageJson.mockReturnValue({
        dependencies: { lodash: '^4.17.15' },
        devDependencies: {}
      });
      findLatestMinorVersion.mockReturnValue('4.17.21');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await updateToMinorVersions(new Set(), new Set(['lodash']), new Set());

      expect(writePackageJson).toHaveBeenCalled();
      expect(run).toHaveBeenCalledWith('npm install');
      consoleSpy.mockRestore();
    });

    test('prints "already at minor" when no update available', async () => {
      readPackageJson.mockReturnValue({
        dependencies: { lodash: '4.17.21' },
        devDependencies: {}
      });
      findLatestMinorVersion.mockReturnValue('4.17.21');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await updateToMinorVersions(new Set(), new Set(['lodash']), new Set());

      expect(writePackageJson).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('updateToMajorVersions()', () => {
    test('cancels when user declines confirmation', async () => {
      askUser.mockResolvedValue('n');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await updateToMajorVersions(new Set(), new Set(), new Set());

      expect(readPackageJson).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('proceeds when user confirms with y', async () => {
      askUser.mockResolvedValue('y');
      readPackageJson.mockReturnValue({
        dependencies: { lodash: '4.17.21' },
        devDependencies: {}
      });
      getLatestVersionFromNpm.mockReturnValue('5.0.0');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await updateToMajorVersions(new Set(), new Set(['lodash']), new Set());

      expect(writePackageJson).toHaveBeenCalled();
      expect(run).toHaveBeenCalledWith('npm install');
      consoleSpy.mockRestore();
    });

    test('accepts blank enter as confirmation', async () => {
      askUser.mockResolvedValue('');
      readPackageJson.mockReturnValue({ dependencies: {}, devDependencies: {} });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await updateToMajorVersions(new Set(), new Set(), new Set());

      expect(readPackageJson).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
