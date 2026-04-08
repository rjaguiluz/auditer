'use strict';

jest.mock('fs');
jest.mock('../lib/utils', () => ({ die: jest.fn((msg) => { throw new Error(msg); }) }));
jest.mock('../lib/state', () => ({
  getChangesTracker: jest.fn(() => ({ removed: [] })),
  getDryRun: jest.fn(() => false)
}));
jest.mock('../lib/i18n', () => ({ t: (key, params) => {
  let result = key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(`{{${k}}}`, v);
    }
  }
  return result;
}}));

const fs = require('fs');
const { getDryRun, getChangesTracker } = require('../lib/state');
const { readPackageJson, writePackageJson, removeOverridesForPackages, updateDirectDepsToMatchOverrides } = require('../lib/package-manager');

describe('package-manager.js', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('readPackageJson()', () => {
    test('reads and parses package.json', () => {
      const pkg = { name: 'my-app', dependencies: { lodash: '^4.17.21' } };
      fs.readFileSync.mockReturnValue(JSON.stringify(pkg));
      const result = readPackageJson();
      expect(result).toEqual(pkg);
    });

    test('calls die() when file cannot be read', () => {
      fs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
      expect(() => readPackageJson()).toThrow();
    });
  });

  describe('writePackageJson()', () => {
    test('writes formatted JSON to package.json', () => {
      getDryRun.mockReturnValue(false);
      const pkg = { name: 'my-app', dependencies: {} };
      writePackageJson(pkg);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'package.json',
        JSON.stringify(pkg, null, 2) + '\n'
      );
    });

    test('does NOT write in dry-run mode', () => {
      getDryRun.mockReturnValue(true);
      writePackageJson({ overrides: {} });
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('shows overrides in dry-run mode when overrides present', () => {
      getDryRun.mockReturnValue(true);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      writePackageJson({ overrides: { lodash: '4.17.21' } });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('removeOverridesForPackages()', () => {
    test('does nothing for empty packages list', () => {
      removeOverridesForPackages([]);
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    test('does nothing when package.json has no overrides', () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({ dependencies: {} }));
      removeOverridesForPackages(['lodash']);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('removes override for specified package in non-dry-run', () => {
      getDryRun.mockReturnValue(false);
      getChangesTracker.mockReturnValue({ removed: [] });
      const pkg = { overrides: { lodash: '4.17.21', ws: '8.0.0' } };
      fs.readFileSync.mockReturnValue(JSON.stringify(pkg));

      removeOverridesForPackages(['lodash']);

      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(written.overrides.lodash).toBeUndefined();
      expect(written.overrides.ws).toBe('8.0.0');
    });

    test('logs dry-run message without modifying file', () => {
      getDryRun.mockReturnValue(true);
      getChangesTracker.mockReturnValue({ removed: [] });
      const pkg = { overrides: { lodash: '4.17.21' } };
      fs.readFileSync.mockReturnValue(JSON.stringify(pkg));
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      removeOverridesForPackages(['lodash']);

      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('updateDirectDepsToMatchOverrides()', () => {
    test('updates dependencies when overrides match', () => {
      getDryRun.mockReturnValue(false);
      const pkg = { dependencies: { lodash: '^4.17.15' }, devDependencies: {} };
      fs.readFileSync.mockReturnValue(JSON.stringify(pkg));

      const result = updateDirectDepsToMatchOverrides({ lodash: '4.17.21' });
      expect(result).toBe(true);
    });

    test('does not write file in dry-run mode', () => {
      getDryRun.mockReturnValue(true);
      const pkg = { dependencies: { lodash: '^4.17.15' } };
      fs.readFileSync.mockReturnValue(JSON.stringify(pkg));

      updateDirectDepsToMatchOverrides({ lodash: '4.17.21' });
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('returns false when no deps match overrides', () => {
      getDryRun.mockReturnValue(false);
      const pkg = { dependencies: { react: '^18.0.0' } };
      fs.readFileSync.mockReturnValue(JSON.stringify(pkg));

      const result = updateDirectDepsToMatchOverrides({ lodash: '4.17.21' });
      expect(result).toBe(false);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });
});
