'use strict';

jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

jest.mock('../lib/utils', () => ({
  safeExecSync: jest.fn()
}));

const { execSync } = require('child_process');
const { safeExecSync } = require('../lib/utils');
const { checkTrivyInstalled, runTrivyScan, extractTrivyVulnerabilities } = require('../lib/trivy');

describe('trivy.js', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('checkTrivyInstalled()', () => {
    test('returns true when trivy is found', () => {
      safeExecSync.mockReturnValue('/usr/local/bin/trivy\n');
      expect(checkTrivyInstalled()).toBe(true);
    });

    test('returns false when trivy is not found', () => {
      safeExecSync.mockReturnValue(null);
      expect(checkTrivyInstalled()).toBe(false);
    });
  });

  describe('runTrivyScan()', () => {
    test('returns null when Trivy is not installed', () => {
      safeExecSync.mockReturnValue(null); // trivy not installed
      const result = runTrivyScan();
      expect(result).toBeNull();
    });

    test('returns parsed JSON when scan succeeds', () => {
      safeExecSync.mockReturnValue('/usr/local/bin/trivy\n');
      const mockData = { Results: [] };
      execSync.mockReturnValue(JSON.stringify(mockData));
      const result = runTrivyScan();
      expect(result).toEqual(mockData);
    });

    test('returns parsed JSON from stdout on non-zero exit', () => {
      safeExecSync.mockReturnValue('/usr/local/bin/trivy\n');
      const mockData = { Results: [{ Vulnerabilities: [] }] };
      const err = new Error('exit 1');
      err.stdout = JSON.stringify(mockData);
      execSync.mockImplementation(() => { throw err; });
      const result = runTrivyScan();
      expect(result).toEqual(mockData);
    });

    test('returns null when stdout is also unparseable', () => {
      safeExecSync.mockReturnValue('/usr/local/bin/trivy\n');
      const err = new Error('exit 1');
      err.stdout = 'not-json';
      execSync.mockImplementation(() => { throw err; });
      const result = runTrivyScan();
      expect(result).toBeNull();
    });
  });

  describe('extractTrivyVulnerabilities()', () => {
    test('returns empty result for null input', () => {
      const result = extractTrivyVulnerabilities(null, {});
      expect(result).toEqual({ all: {}, bySeverity: {} });
    });

    test('returns empty result for no Results field', () => {
      const result = extractTrivyVulnerabilities({}, {});
      expect(result).toEqual({ all: {}, bySeverity: {} });
    });

    test('returns empty result when no vulnerabilities', () => {
      const data = { Results: [{ Vulnerabilities: null }] };
      const result = extractTrivyVulnerabilities(data, {});
      expect(result.all).toEqual({});
    });

    test('extracts a basic vulnerability', () => {
      const data = {
        Results: [{
          Vulnerabilities: [{
            PkgName: 'lodash',
            FixedVersion: '4.17.21',
            Severity: 'HIGH'
          }]
        }]
      };
      const currentVersions = { lodash: '4.17.15' };
      const result = extractTrivyVulnerabilities(data, currentVersions);

      expect(result.all['lodash']).toBe('4.17.21');
      expect(result.bySeverity.HIGH['lodash']).toBe('4.17.21');
    });

    test('skips vulnerabilities with no FixedVersion', () => {
      const data = {
        Results: [{
          Vulnerabilities: [{
            PkgName: 'broken-pkg',
            FixedVersion: '',
            Severity: 'CRITICAL'
          }]
        }]
      };
      const result = extractTrivyVulnerabilities(data, {});
      expect(result.all['broken-pkg']).toBeUndefined();
    });

    test('skips FixedVersion "unknown"', () => {
      const data = {
        Results: [{
          Vulnerabilities: [{
            PkgName: 'pkg',
            FixedVersion: 'unknown',
            Severity: 'MEDIUM'
          }]
        }]
      };
      const result = extractTrivyVulnerabilities(data, {});
      expect(result.all['pkg']).toBeUndefined();
    });

    test('parses comma-separated fix versions and picks closest', () => {
      const data = {
        Results: [{
          Vulnerabilities: [{
            PkgName: 'ws',
            FixedVersion: '6.2.3, 7.5.10, 8.18.0',
            Severity: 'HIGH'
          }]
        }]
      };
      const currentVersions = { ws: '7.5.0' };
      const result = extractTrivyVulnerabilities(data, currentVersions);
      // Closest >= 7.5.0 with smallest distance is 7.5.10
      expect(result.all['ws']).toBe('7.5.10');
    });

    test('tracks highest severity when package appears multiple times', () => {
      const data = {
        Results: [{
          Vulnerabilities: [
            { PkgName: 'pkg', FixedVersion: '1.0.1', Severity: 'LOW' },
            { PkgName: 'pkg', FixedVersion: '1.0.1', Severity: 'CRITICAL' }
          ]
        }]
      };
      const result = extractTrivyVulnerabilities(data, { pkg: '1.0.0' });
      expect(result.bySeverity.CRITICAL['pkg']).toBe('1.0.1');
      expect(result.bySeverity.LOW['pkg']).toBeUndefined();
    });

    test('handles multiple Results sections', () => {
      const data = {
        Results: [
          {
            Vulnerabilities: [{ PkgName: 'pkg-a', FixedVersion: '1.1.0', Severity: 'HIGH' }]
          },
          {
            Vulnerabilities: [{ PkgName: 'pkg-b', FixedVersion: '2.1.0', Severity: 'MEDIUM' }]
          }
        ]
      };
      const result = extractTrivyVulnerabilities(data, {});
      expect(result.all['pkg-a']).toBe('1.1.0');
      expect(result.all['pkg-b']).toBe('2.1.0');
    });
  });
});
