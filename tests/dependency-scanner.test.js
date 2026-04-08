'use strict';

const path = require('path');

// Mock fs and child_process before any requires
jest.mock('fs');
jest.mock('child_process', () => ({ execSync: jest.fn() }));
jest.mock('../lib/i18n', () => ({
  t: (key, params) => {
    let result = key;
    if (params) Object.entries(params).forEach(([k, v]) => { result = result.replace(`{{${k}}}`, v); });
    return result;
  }
}));

const fs = require('fs');
const { execSync } = require('child_process');

// Re-require after mocks
const {
  scanUsedDependencies,
  findUnusedDependencies,
  uninstallUnusedPackages
} = require('../lib/dependency-scanner');

// We test normalizePackageName indirectly via scanUsedDependencies
// but expose it for direct testing by pulling the internal logic

describe('dependency-scanner.js', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('scanUsedDependencies()', () => {
    test('extracts and normalizes packages from js/ts files', () => {
      fs.readdirSync.mockImplementation((dir) => {
        if (dir === 'root') return ['src', 'package.json', 'node_modules'];
        if (dir === 'root/src') return ['index.js', 'utils.ts'];
        return [];
      });
      
      fs.statSync.mockImplementation((p) => ({
        isDirectory: () => p === 'root/src' || p === 'root/node_modules' || p === 'root',
        isFile: () => p.endsWith('.js') || p.endsWith('.ts') || p.endsWith('.json')
      }));

      fs.readFileSync.mockImplementation((p) => {
        if (p === 'root/src/index.js') {
          return "import { get } from 'lodash';\nrequire('axios');\nimport('@babel/core/lib');";
        }
        if (p === 'root/src/utils.ts') {
          return "import fs from 'fs';\nimport local from './local';";
        }
        return '';
      });

      const used = scanUsedDependencies('root');
      expect(used.has('lodash')).toBe(true);
      expect(used.has('axios')).toBe(true);
      expect(used.has('@babel/core')).toBe(true);
      
      // built-ins and relative paths should be ignored
      expect(used.has('fs')).toBe(false); 
      expect(used.has('local')).toBe(false); 
    });

    test('handles directory access errors gracefully', () => {
      fs.readdirSync.mockImplementation(() => { throw new Error('EACCES'); });
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const used = scanUsedDependencies('root');
      expect(used.size).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('handles file reading errors gracefully', () => {
      fs.readdirSync.mockReturnValue(['index.js']);
      fs.statSync.mockReturnValue({ isDirectory: () => false, isFile: () => true });
      fs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const used = scanUsedDependencies('root');
      expect(used.size).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('findUnusedDependencies()', () => {
    const pkgJson = {
      dependencies: {
        lodash: '^4.17.21',
        react: '^18.0.0',
        '@types/node': '^18.0.0' // should be excluded
      },
      devDependencies: {
        jest: '^29.0.0',
        typescript: '^5.0.0'
      }
    };

    test('returns unused production deps not found in used set', () => {
      const usedPackages = new Set(['react']); // lodash not used
      const result = findUnusedDependencies(pkgJson, usedPackages);
      expect(result.dependencies).toContain('lodash');
      expect(result.dependencies).not.toContain('react');
    });

    test('excludes @types/* packages from analysis', () => {
      const usedPackages = new Set();
      const result = findUnusedDependencies(pkgJson, usedPackages);
      expect(result.dependencies).not.toContain('@types/node');
    });

    test('does not check devDependencies by default', () => {
      const usedPackages = new Set();
      const result = findUnusedDependencies(pkgJson, usedPackages);
      expect(result.devDependencies).toEqual([]);
    });

    test('checks devDependencies when checkDevDeps=true', () => {
      const usedPackages = new Set(['jest']); // typescript not used
      const result = findUnusedDependencies(pkgJson, usedPackages, true);
      expect(result.devDependencies).toContain('typescript');
      expect(result.devDependencies).not.toContain('jest');
    });

    test('returns all deps as unused when usedPackages is empty', () => {
      const usedPackages = new Set();
      const result = findUnusedDependencies(pkgJson, usedPackages);
      expect(result.dependencies).toContain('lodash');
      expect(result.dependencies).toContain('react');
    });

    test('handles missing dependencies section', () => {
      const result = findUnusedDependencies({}, new Set());
      expect(result.dependencies).toEqual([]);
      expect(result.devDependencies).toEqual([]);
    });
  });

  describe('uninstallUnusedPackages()', () => {
    test('calls npm uninstall for production packages', () => {
      const removed = uninstallUnusedPackages(['lodash', 'moment'], []);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('npm uninstall lodash moment'),
        expect.any(Object)
      );
      expect(removed).toBe(2);
    });

    test('calls npm uninstall for dev packages', () => {
      const removed = uninstallUnusedPackages([], ['jest', 'typescript']);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('npm uninstall jest typescript'),
        expect.any(Object)
      );
      expect(removed).toBe(2);
    });

    test('does nothing when both lists are empty', () => {
      const removed = uninstallUnusedPackages([], []);
      expect(execSync).not.toHaveBeenCalled();
      expect(removed).toBe(0);
    });

    test('handles uninstall errors gracefully', () => {
      execSync.mockImplementation(() => { throw new Error('npm error'); });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const removed = uninstallUnusedPackages(['lodash'], []);
      expect(removed).toBe(0); // didn't succeed
      consoleSpy.mockRestore();
    });

    test('returns total removed count for both prod and dev', () => {
      execSync.mockImplementation(() => {}); // reset to success
      const removed = uninstallUnusedPackages(['a', 'b'], ['c']);
      expect(removed).toBe(3);
    });
  });
});
