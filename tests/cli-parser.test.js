'use strict';

const { parseArguments, parsePackagePatterns, matchPackages } = require('../lib/cli-parser');

describe('cli-parser.js', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  // Helper to set process.argv
  function setArgs(...args) {
    process.argv = ['node', 'auditer', ...args];
  }

  describe('parseArguments()', () => {
    test('returns all false flags when no args provided', () => {
      setArgs();
      const result = parseArguments();
      expect(result.useExact).toBe(false);
      expect(result.onlyTrivy).toBe(false);
      expect(result.silent).toBe(false);
      expect(result.replaceExact).toBe(false);
      expect(result.upMinor).toBe(false);
      expect(result.upMajor).toBe(false);
      expect(result.assumeYes).toBe(false);
      expect(result.clean).toBe(false);
      expect(result.includeDev).toBe(false);
      expect(result.dryRun).toBe(false);
      expect(result.audit).toBe(false);
      expect(result.filteredArgs).toEqual([]);
    });

    test('detects --exact flag', () => {
      setArgs('--exact');
      expect(parseArguments().useExact).toBe(true);
    });

    test('detects --trivy flag', () => {
      setArgs('--trivy');
      expect(parseArguments().onlyTrivy).toBe(true);
    });

    test('detects --silent flag', () => {
      setArgs('--silent');
      expect(parseArguments().silent).toBe(true);
    });

    test('detects --replace-exact flag', () => {
      setArgs('--replace-exact');
      expect(parseArguments().replaceExact).toBe(true);
    });

    test('detects --up-minor flag', () => {
      setArgs('--up-minor');
      expect(parseArguments().upMinor).toBe(true);
    });

    test('detects --up-major flag', () => {
      setArgs('--up-major');
      expect(parseArguments().upMajor).toBe(true);
    });

    test('detects --yes flag', () => {
      setArgs('--yes');
      expect(parseArguments().assumeYes).toBe(true);
    });

    test('detects -y flag as assumeYes', () => {
      setArgs('-y');
      expect(parseArguments().assumeYes).toBe(true);
    });

    test('detects --force flag as assumeYes', () => {
      setArgs('--force');
      expect(parseArguments().assumeYes).toBe(true);
    });

    test('detects --clean flag', () => {
      setArgs('--clean');
      expect(parseArguments().clean).toBe(true);
    });

    test('detects --include-dev flag', () => {
      setArgs('--include-dev');
      expect(parseArguments().includeDev).toBe(true);
    });

    test('detects --dry-run flag', () => {
      setArgs('--dry-run');
      expect(parseArguments().dryRun).toBe(true);
    });

    test('detects --audit flag', () => {
      setArgs('--audit');
      expect(parseArguments().audit).toBe(true);
    });

    test('filters flags from filteredArgs, keeping package names', () => {
      setArgs('--trivy', 'react', '--silent', 'lodash');
      const { filteredArgs } = parseArguments();
      expect(filteredArgs).toEqual(['react', 'lodash']);
    });

    test('multiple flags can be combined', () => {
      setArgs('--trivy', '--exact', '--silent', '--yes');
      const result = parseArguments();
      expect(result.onlyTrivy).toBe(true);
      expect(result.useExact).toBe(true);
      expect(result.silent).toBe(true);
      expect(result.assumeYes).toBe(true);
    });
  });

  describe('parsePackagePatterns()', () => {
    test('returns empty arrays for no args', () => {
      const result = parsePackagePatterns([]);
      expect(result.explicit).toEqual([]);
      expect(result.regexes).toEqual([]);
    });

    test('adds plain names to explicit', () => {
      const result = parsePackagePatterns(['react', 'lodash']);
      expect(result.explicit).toEqual(['react', 'lodash']);
      expect(result.regexes).toHaveLength(0);
    });

    test('parses /regex/ patterns into RegExp objects', () => {
      const result = parsePackagePatterns(['/^@babel/']);
      expect(result.regexes).toHaveLength(1);
      expect(result.regexes[0]).toBeInstanceOf(RegExp);
      expect(result.regexes[0].test('@babel/core')).toBe(true);
      expect(result.regexes[0].test('react')).toBe(false);
    });

    test('parses regex with flags', () => {
      const result = parsePackagePatterns(['/^eslint/i']);
      expect(result.regexes[0].flags).toContain('i');
    });

    test('mixes explicit names and regex', () => {
      const result = parsePackagePatterns(['react', '/^@babel/']);
      expect(result.explicit).toEqual(['react']);
      expect(result.regexes).toHaveLength(1);
    });

    test('calls process.exit on invalid regex', () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      expect(() => parsePackagePatterns(['/[invalid/'])).toThrow();
      exitSpy.mockRestore();
    });
  });

  describe('matchPackages()', () => {
    const packages = ['react', 'react-dom', '@babel/core', '@babel/preset-env', 'lodash', 'webpack'];

    test('returns empty set if no patterns', () => {
      const result = matchPackages({ explicit: [], regexes: [] }, packages);
      expect(result.size).toBe(0);
    });

    test('returns explicitly named package', () => {
      const result = matchPackages({ explicit: ['react'], regexes: [] }, packages);
      expect(result.has('react')).toBe(true);
      expect(result.size).toBe(1);
    });

    test('returns all packages matching regex', () => {
      const result = matchPackages(
        { explicit: [], regexes: [/^@babel\//] },
        packages
      );
      expect(result.has('@babel/core')).toBe(true);
      expect(result.has('@babel/preset-env')).toBe(true);
      expect(result.size).toBe(2);
    });

    test('combines explicit and regex results', () => {
      const result = matchPackages(
        { explicit: ['lodash'], regexes: [/^react/] },
        packages
      );
      expect(result.has('lodash')).toBe(true);
      expect(result.has('react')).toBe(true);
      expect(result.has('react-dom')).toBe(true);
      expect(result.size).toBe(3);
    });

    test('adds non-existent explicit package to set anyway', () => {
      const result = matchPackages({ explicit: ['nonexistent'], regexes: [] }, packages);
      expect(result.has('nonexistent')).toBe(true);
    });
  });
});
