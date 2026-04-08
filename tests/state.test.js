'use strict';

const {
  setSilentMode, getSilentMode,
  setAssumeYes, getAssumeYes,
  setDryRun, getDryRun,
  getChangesTracker, resetChangesTracker
} = require('../lib/state');

describe('state.js', () => {
  beforeEach(() => {
    // Reset to defaults before each test
    setSilentMode(false);
    setAssumeYes(false);
    setDryRun(false);
    resetChangesTracker();
  });

  describe('SILENT_MODE', () => {
    test('defaults to false', () => {
      expect(getSilentMode()).toBe(false);
    });

    test('can be set to true', () => {
      setSilentMode(true);
      expect(getSilentMode()).toBe(true);
    });

    test('can be toggled back to false', () => {
      setSilentMode(true);
      setSilentMode(false);
      expect(getSilentMode()).toBe(false);
    });
  });

  describe('ASSUME_YES', () => {
    test('defaults to false', () => {
      expect(getAssumeYes()).toBe(false);
    });

    test('can be set to true', () => {
      setAssumeYes(true);
      expect(getAssumeYes()).toBe(true);
    });
  });

  describe('DRY_RUN', () => {
    test('defaults to false', () => {
      expect(getDryRun()).toBe(false);
    });

    test('can be set to true', () => {
      setDryRun(true);
      expect(getDryRun()).toBe(true);
    });
  });

  describe('CHANGES_TRACKER', () => {
    test('starts with empty arrays', () => {
      const tracker = getChangesTracker();
      expect(tracker.directUpdates).toEqual([]);
      expect(tracker.overrides).toEqual([]);
      expect(tracker.removed).toEqual([]);
      expect(tracker.versionChanges).toEqual([]);
    });

    test('mutations persist across getChangesTracker calls', () => {
      const tracker = getChangesTracker();
      tracker.directUpdates.push({ name: 'lodash', from: '4.0.0', to: '4.1.0', type: 'prod' });

      const tracker2 = getChangesTracker();
      expect(tracker2.directUpdates).toHaveLength(1);
      expect(tracker2.directUpdates[0].name).toBe('lodash');
    });

    test('resetChangesTracker clears all arrays', () => {
      const tracker = getChangesTracker();
      tracker.directUpdates.push({ name: 'lodash' });
      tracker.overrides.push({ name: 'ws' });
      tracker.removed.push('old-pkg');
      tracker.versionChanges.push({ name: 'react' });

      resetChangesTracker();

      const reset = getChangesTracker();
      expect(reset.directUpdates).toEqual([]);
      expect(reset.overrides).toEqual([]);
      expect(reset.removed).toEqual([]);
      expect(reset.versionChanges).toEqual([]);
    });
  });
});
