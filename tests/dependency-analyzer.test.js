'use strict';

// Mock fs and child_process before requiring the module
jest.mock('fs');
jest.mock('child_process', () => ({ execSync: jest.fn() }));

const fs = require('fs');

// Mock dependencies
jest.mock('../lib/utils', () => ({ safeExecSync: jest.fn() }));
jest.mock('../lib/package-manager', () => ({ readPackageJson: jest.fn() }));
jest.mock('../lib/i18n', () => ({ t: (key) => key }));

const { safeExecSync } = require('../lib/utils');
const { readPackageJson } = require('../lib/package-manager');
const {
  getCurrentVersions,
  isDirectDependency,
  hasMultipleVersions,
  findRelatedScopedPackages
} = require('../lib/dependency-analyzer');

describe('dependency-analyzer.js', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getCurrentVersions()', () => {
    test('reads versions from package-lock.json', () => {
      const lockData = {
        packages: {
          'node_modules/lodash': { version: '4.17.21' },
          'node_modules/react': { version: '18.0.0' }
        }
      };
      fs.readFileSync.mockReturnValue(JSON.stringify(lockData));
      const versions = getCurrentVersions();
      expect(versions['lodash']).toBe('4.17.21');
      expect(versions['react']).toBe('18.0.0');
    });

    test('returns empty object when package-lock.json not found', () => {
      fs.readFileSync.mockImplementation(() => { throw new Error('not found'); });
      const versions = getCurrentVersions();
      expect(versions).toEqual({});
    });

    test('handles scoped packages correctly', () => {
      const lockData = {
        packages: {
          'node_modules/@babel/core': { version: '7.22.0' }
        }
      };
      fs.readFileSync.mockReturnValue(JSON.stringify(lockData));
      const versions = getCurrentVersions();
      expect(versions['@babel/core']).toBe('7.22.0');
    });

    test('does not overwrite first occurrence of a package', () => {
      const lockData = {
        packages: {
          'node_modules/pkg': { version: '1.0.0' },
          'node_modules/other/node_modules/pkg': { version: '2.0.0' }
        }
      };
      fs.readFileSync.mockReturnValue(JSON.stringify(lockData));
      const versions = getCurrentVersions();
      expect(versions['pkg']).toBe('1.0.0');
    });
  });

  describe('isDirectDependency()', () => {
    test('returns true when package is in dependencies', () => {
      readPackageJson.mockReturnValue({ dependencies: { lodash: '^4.17.21' } });
      expect(isDirectDependency('lodash')).toBe(true);
    });

    test('returns true when package is in devDependencies', () => {
      readPackageJson.mockReturnValue({ devDependencies: { jest: '^29.0.0' } });
      expect(isDirectDependency('jest')).toBe(true);
    });

    test('falls back to npm list when not in package.json', () => {
      readPackageJson.mockReturnValue({ dependencies: {} });
      safeExecSync.mockReturnValue('my-project\n└── transitive-pkg@1.0.0');
      const result = isDirectDependency('transitive-pkg');
      expect(safeExecSync).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('returns false when npm list does not include package', () => {
      readPackageJson.mockReturnValue({ dependencies: {} });
      safeExecSync.mockReturnValue(null);
      expect(isDirectDependency('unknown-pkg')).toBe(false);
    });
  });

  describe('hasMultipleVersions()', () => {
    test('returns false when npm list returns null', () => {
      safeExecSync.mockReturnValue(null);
      expect(hasMultipleVersions('pkg')).toBe(false);
    });

    test('returns false when package appears only once', () => {
      safeExecSync.mockReturnValue('project\n└── pkg@1.0.0');
      expect(hasMultipleVersions('pkg')).toBe(false);
    });

    test('returns true when package appears multiple times', () => {
      safeExecSync.mockReturnValue(
        'project\n└── pkg@1.0.0\n  └── pkg@2.0.0'
      );
      expect(hasMultipleVersions('pkg')).toBe(true);
    });
  });

  describe('findRelatedScopedPackages()', () => {
    const allPackages = ['@babel/core', '@babel/preset-env', '@babel/runtime', 'react', 'lodash'];

    test('finds related packages in same scope', () => {
      const related = findRelatedScopedPackages('@babel/core', allPackages);
      expect(related).toContain('@babel/preset-env');
      expect(related).toContain('@babel/runtime');
      expect(related).not.toContain('@babel/core'); // excludes self
    });

    test('returns empty array for non-scoped package', () => {
      const related = findRelatedScopedPackages('lodash', allPackages);
      expect(related).toEqual([]);
    });

    test('returns empty array when no related packages exist', () => {
      const related = findRelatedScopedPackages('@nestjs/core', allPackages);
      expect(related).toEqual([]);
    });
  });
});
