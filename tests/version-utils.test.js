'use strict';

const {
  parseVersion,
  compareVersions,
  calculateVersionDistance,
  chooseClosestVersion,
  stripVersionPrefix,
  findLatestMinorVersion
} = require('../lib/version-utils');

// Mock safeExecSync since getLatestVersionFromNpm and findLatestMinorVersion call npm
jest.mock('../lib/utils', () => ({
  safeExecSync: jest.fn()
}));

const { safeExecSync } = require('../lib/utils');

describe('version-utils.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseVersion()', () => {
    test('parses standard semver', () => {
      expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    });

    test('strips ^ prefix', () => {
      expect(parseVersion('^1.2.3')).toEqual([1, 2, 3]);
    });

    test('strips ~ prefix', () => {
      expect(parseVersion('~1.2.3')).toEqual([1, 2, 3]);
    });

    test('handles major-only version', () => {
      expect(parseVersion('2')).toEqual([2]);
    });

    test('handles two-part version', () => {
      expect(parseVersion('1.5')).toEqual([1, 5]);
    });
  });

  describe('compareVersions()', () => {
    test('returns 0 for equal versions', () => {
      expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    });

    test('returns 1 when first is greater (patch)', () => {
      expect(compareVersions('1.2.4', '1.2.3')).toBe(1);
    });

    test('returns -1 when first is smaller (patch)', () => {
      expect(compareVersions('1.2.2', '1.2.3')).toBe(-1);
    });

    test('returns 1 when first is greater (minor)', () => {
      expect(compareVersions('1.3.0', '1.2.9')).toBe(1);
    });

    test('returns 1 when first is greater (major)', () => {
      expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    });

    test('handles different length versions', () => {
      expect(compareVersions('1.2', '1.2.0')).toBe(0);
      expect(compareVersions('1.2.1', '1.2')).toBe(1);
    });

    test('handles undefined/null gracefully using 0.0.0 fallback', () => {
      expect(compareVersions(null, '1.0.0')).toBe(-1);
      expect(compareVersions('1.0.0', null)).toBe(1);
    });
  });

  describe('calculateVersionDistance()', () => {
    test('returns 0 for identical versions', () => {
      expect(calculateVersionDistance('1.2.3', '1.2.3')).toBe(0);
    });

    test('patch difference scores 1', () => {
      expect(calculateVersionDistance('1.2.3', '1.2.4')).toBe(1);
    });

    test('minor difference scores 100', () => {
      expect(calculateVersionDistance('1.2.3', '1.3.3')).toBe(100);
    });

    test('major difference scores 1000', () => {
      expect(calculateVersionDistance('1.2.3', '2.2.3')).toBe(1000);
    });

    test('combined differences accumulate', () => {
      // major + minor + patch
      expect(calculateVersionDistance('1.2.3', '2.3.4')).toBe(1101);
    });
  });

  describe('chooseClosestVersion()', () => {
    test('returns null for empty array', () => {
      expect(chooseClosestVersion('1.0.0', [])).toBeNull();
      expect(chooseClosestVersion('1.0.0', null)).toBeNull();
    });

    test('returns lowest version when no current version', () => {
      const result = chooseClosestVersion(null, ['2.0.0', '1.0.0', '1.5.0']);
      expect(result).toBe('1.0.0');
    });

    test('returns undefined when no current version and array has one element', () => {
      const result = chooseClosestVersion(undefined, ['3.0.0']);
      expect(result).toBe('3.0.0');
    });

    test('chooses patch update over minor', () => {
      const result = chooseClosestVersion('4.17.15', ['4.17.21', '4.18.0', '5.0.0']);
      expect(result).toBe('4.17.21');
    });

    test('chooses minor when no patch available', () => {
      const result = chooseClosestVersion('4.17.15', ['4.18.0', '5.0.0']);
      expect(result).toBe('4.18.0');
    });

    test('returns highest when all versions are lower than current', () => {
      const result = chooseClosestVersion('5.0.0', ['1.0.0', '2.0.0', '3.0.0']);
      expect(result).toBe('3.0.0');
    });

    test('does not mutate the original array', () => {
      const versions = ['4.17.21', '4.18.0', '5.0.0'];
      const original = [...versions];
      chooseClosestVersion('4.17.15', versions);
      expect(versions).toEqual(original);
    });

    test('returns the single version in a one-element array', () => {
      expect(chooseClosestVersion('1.0.0', ['2.0.0'])).toBe('2.0.0');
    });
  });

  describe('stripVersionPrefix()', () => {
    test('removes ^ prefix', () => {
      expect(stripVersionPrefix('^1.2.3')).toBe('1.2.3');
    });

    test('removes ~ prefix', () => {
      expect(stripVersionPrefix('~1.2.3')).toBe('1.2.3');
    });

    test('removes >= prefix', () => {
      expect(stripVersionPrefix('>=1.2.3')).toBe('1.2.3');
    });

    test('leaves plain version unchanged', () => {
      expect(stripVersionPrefix('1.2.3')).toBe('1.2.3');
    });

    test('removes > prefix', () => {
      expect(stripVersionPrefix('>1.0.0')).toBe('1.0.0');
    });
  });

  describe('findLatestMinorVersion()', () => {
    test('returns latest minor compatible version for same major', () => {
      safeExecSync.mockReturnValue('["4.17.15","4.17.20","4.17.21","5.0.0"]');
      const result = findLatestMinorVersion('lodash', '4.17.15');
      expect(result).toBe('4.17.21');
    });

    test('excludes versions with different major', () => {
      safeExecSync.mockReturnValue('["1.0.0","1.5.0","2.0.0"]');
      const result = findLatestMinorVersion('some-pkg', '1.0.0');
      expect(result).toBe('1.5.0');
    });

    test('returns null when npm call fails', () => {
      safeExecSync.mockReturnValue(null);
      const result = findLatestMinorVersion('some-pkg', '1.0.0');
      expect(result).toBeNull();
    });

    test('returns null when no compatible minor found', () => {
      safeExecSync.mockReturnValue('[]');
      const result = findLatestMinorVersion('some-pkg', '1.0.0');
      expect(result).toBeNull();
    });

    test('does not mutate versions array', () => {
      safeExecSync.mockReturnValue('["1.0.0","1.2.0","1.1.0"]');
      // If it mutated the array, the order would change and we'd get wrong result
      const result = findLatestMinorVersion('pkg', '1.0.0');
      expect(result).toBe('1.2.0');
    });
  });
});
