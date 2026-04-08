'use strict';

jest.mock('child_process', () => ({ execSync: jest.fn() }));
jest.mock('../lib/state', () => ({
  getSilentMode: jest.fn(() => false),
  getAssumeYes: jest.fn(() => false),
  getDryRun: jest.fn(() => false),
  getChangesTracker: jest.fn(() => ({
    directUpdates: [],
    overrides: [],
    removed: [],
    versionChanges: []
  }))
}));
jest.mock('../lib/i18n', () => ({
  t: (key, params) => {
    if (!params) return key;
    return Object.entries(params).reduce((s, [k, v]) => s.replace(`{{${k}}}`, v), key);
  }
}));

const { execSync } = require('child_process');
const { getSilentMode, getDryRun, getAssumeYes } = require('../lib/state');
const { run, die, displayChangeSummary, safeExecSync, parsePackageVersion } = require('../lib/utils');

describe('utils.js', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('run()', () => {
    test('executes command in normal mode', () => {
      getSilentMode.mockReturnValue(false);
      getDryRun.mockReturnValue(false);
      run('npm install');
      expect(execSync).toHaveBeenCalledWith('npm install', expect.any(Object));
    });

    test('does not execute in dry-run mode', () => {
      getDryRun.mockReturnValue(true);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      run('npm install');
      expect(execSync).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('uses stdio:pipe in silent mode', () => {
      getSilentMode.mockReturnValue(true);
      getDryRun.mockReturnValue(false);
      run('npm install');
      expect(execSync).toHaveBeenCalledWith('npm install', { stdio: 'pipe' });
    });

    test('propagates execSync errors', () => {
      getSilentMode.mockReturnValue(false);
      getDryRun.mockReturnValue(false);
      execSync.mockImplementation(() => { throw new Error('npm error'); });
      expect(() => run('npm install')).toThrow('npm error');
    });
  });

  describe('die()', () => {
    test('calls process.exit with error message', () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      expect(() => die('fatal error')).toThrow('exit');
      exitSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe('safeExecSync()', () => {
    test('returns command output on success', () => {
      execSync.mockReturnValue('output');
      const result = safeExecSync('which node');
      expect(result).toBe('output');
    });

    test('returns null on failure', () => {
      execSync.mockImplementation(() => { throw new Error('not found'); });
      const result = safeExecSync('which nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('parsePackageVersion()', () => {
    test('parses package@version', () => {
      expect(parsePackageVersion('lodash@4.17.21')).toEqual({ name: 'lodash', version: '4.17.21' });
    });

    test('parses scoped package@version', () => {
      expect(parsePackageVersion('@babel/core@7.22.0')).toEqual({ name: '@babel/core', version: '7.22.0' });
    });

    test('returns null version when no @ found', () => {
      expect(parsePackageVersion('lodash')).toEqual({ name: 'lodash', version: null });
    });
  });

  describe('displayChangeSummary()', () => {
    test('prints no-changes message when tracker is empty', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      displayChangeSummary();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('summary.no_changes'));
      consoleSpy.mockRestore();
    });

    test('prints version changes when tracker has entries', () => {
      const tracker = require('../lib/state').getChangesTracker();
      tracker.versionChanges.push({ name: 'lodash', from: '4.17.15', to: '4.17.21', type: 'prod' });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      displayChangeSummary();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
      tracker.versionChanges.length = 0; // cleanup
    });
  });
});
