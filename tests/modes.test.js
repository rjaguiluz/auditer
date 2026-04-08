'use strict';

// Mock all heavy dependencies
jest.mock('../lib/utils', () => ({
  run: jest.fn(),
  askUser: jest.fn(),
  parsePackageVersion: jest.fn((s) => {
    const i = s.lastIndexOf('@');
    return i <= 0 ? { name: s, version: null } : { name: s.substring(0, i), version: s.substring(i + 1) };
  }),
  safeExecSync: jest.fn()
}));
jest.mock('../lib/package-manager', () => ({
  readPackageJson: jest.fn(() => ({ dependencies: {}, devDependencies: {} })),
  writePackageJson: jest.fn(),
  removeOverridesForPackages: jest.fn()
}));
jest.mock('../lib/dependency-analyzer', () => ({
  getCurrentVersions: jest.fn(() => ({})),
  isDirectDependency: jest.fn(() => false),
  hasMultipleVersions: jest.fn(() => false),
  findRelatedScopedPackages: jest.fn(() => [])
}));
jest.mock('../lib/trivy', () => ({
  runTrivyScan: jest.fn(),
  extractTrivyVulnerabilities: jest.fn()
}));
jest.mock('../lib/package-processor', () => ({
  uninstallPackages: jest.fn(),
  runAuditFix: jest.fn(),
  installPackages: jest.fn()
}));
jest.mock('../lib/vulnerability-fixer', () => ({
  processVulnerabilities: jest.fn()
}));
jest.mock('../lib/state', () => ({
  getChangesTracker: jest.fn(() => ({ directUpdates: [], overrides: [], removed: [], versionChanges: [] }))
}));
jest.mock('../lib/dependency-scanner', () => ({
  scanUsedDependencies: jest.fn(() => new Set(['react'])),
  findUnusedDependencies: jest.fn(() => ({ dependencies: [], devDependencies: [] })),
  uninstallUnusedPackages: jest.fn(() => 0)
}));
jest.mock('../lib/i18n', () => ({
  t: (key, params) => params ? key + ' ' + JSON.stringify(params) : key
}));

const { run, askUser } = require('../lib/utils');
const { runTrivyScan, extractTrivyVulnerabilities } = require('../lib/trivy');
const { getCurrentVersions } = require('../lib/dependency-analyzer');
const { uninstallPackages, runAuditFix, installPackages } = require('../lib/package-processor');
const { processVulnerabilities } = require('../lib/vulnerability-fixer');
const { runTrivyMode, runNormalMode, runCleanMode, runAuditMode, runHuskyMode } = require('../lib/modes');

describe('modes.js', () => {
  let consoleSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ===== runNormalMode =====
  describe('runNormalMode()', () => {
    const deps = new Set(['react', 'lodash']);
    const devDeps = new Set(['jest']);

    test('exits early when matched is empty and processAll=false', async () => {
      await runNormalMode(new Set(), deps, devDeps, false, false);
      expect(uninstallPackages).not.toHaveBeenCalled();
    });

    test('processes all packages when processAll=true', async () => {
      runTrivyScan.mockReturnValue(null); // no second scan
      await runNormalMode(new Set(), deps, devDeps, false, true);
      expect(uninstallPackages).toHaveBeenCalled();
    });

    test('prints warning for package not in deps or devDeps', async () => {
      runTrivyScan.mockReturnValue(null);
      const matched = new Set(['nonexistent-pkg']);
      await runNormalMode(matched, deps, devDeps, false, false);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent-pkg'));
    });

    test('exits when no valid packages after filtering', async () => {
      const matched = new Set(['not-in-package-json']);
      await runNormalMode(matched, deps, devDeps, false, false);
      expect(uninstallPackages).not.toHaveBeenCalled();
    });

    test('reinstalls matched prod packages', async () => {
      runTrivyScan.mockReturnValue(null);
      const matched = new Set(['lodash']);
      await runNormalMode(matched, deps, devDeps, false, false);
      expect(uninstallPackages).toHaveBeenCalledWith(['lodash'], []);
      expect(installPackages).toHaveBeenCalled();
    });

    test('reinstalls matched dev packages', async () => {
      runTrivyScan.mockReturnValue(null);
      const matched = new Set(['jest']);
      await runNormalMode(matched, deps, devDeps, false, false);
      expect(uninstallPackages).toHaveBeenCalledWith([], ['jest']);
    });
  });

  // ===== runTrivyMode =====
  describe('runTrivyMode()', () => {
    const deps = new Set(['lodash']);
    const devDeps = new Set(['jest']);

    test('exits when no vulnerabilities found', async () => {
      runTrivyScan.mockReturnValue({ Results: [] });
      extractTrivyVulnerabilities.mockReturnValue({ all: {}, bySeverity: { CRITICAL: {}, HIGH: {}, MEDIUM: {}, LOW: {} } });

      await runTrivyMode(false, deps, devDeps);

      expect(uninstallPackages).not.toHaveBeenCalled();
    });

    test('processes vulnerabilities when HIGH/CRITICAL found', async () => {
      runTrivyScan
        .mockReturnValueOnce({ Results: [] }) // first scan
        .mockReturnValueOnce(null);            // second scan
      extractTrivyVulnerabilities.mockReturnValue({
        all: { lodash: '4.17.21' },
        bySeverity: {
          CRITICAL: {},
          HIGH: { lodash: '4.17.21' },
          MEDIUM: {},
          LOW: {}
        }
      });
      getCurrentVersions.mockReturnValue({ lodash: '4.17.15' });

      await runTrivyMode(false, deps, devDeps);

      expect(runAuditFix).toHaveBeenCalled();
    });

    test('asks user when only MEDIUM/LOW vulnerabilities', async () => {
      runTrivyScan.mockReturnValueOnce({ Results: [] }).mockReturnValue(null);
      extractTrivyVulnerabilities.mockReturnValue({
        all: { lodash: '4.17.21' },
        bySeverity: {
          CRITICAL: {},
          HIGH: {},
          MEDIUM: { lodash: '4.17.21' },
          LOW: {}
        }
      });
      askUser.mockResolvedValue('n'); // user declines

      await runTrivyMode(false, deps, devDeps);

      expect(askUser).toHaveBeenCalled();
      expect(runAuditFix).not.toHaveBeenCalled();
    });

    test('processes second scan and scoped family updates', async () => {
      runTrivyScan
        .mockReturnValueOnce({ Results: [] }) // first scan
        .mockReturnValueOnce({ Results: [] }); // second scan

      extractTrivyVulnerabilities
        .mockReturnValueOnce({
          all: { '@babel/core': '7.20.0' },
          bySeverity: { CRITICAL: {}, HIGH: { '@babel/core': '7.20.0' }, MEDIUM: {}, LOW: {} }
        })
        .mockReturnValueOnce({
          all: {},
          bySeverity: { CRITICAL: {}, HIGH: {}, MEDIUM: {}, LOW: {} }
        });

      getCurrentVersions.mockReturnValue({ '@babel/core': '7.10.0', '@babel/preset-env': '7.10.0' });
      require('../lib/dependency-analyzer').isDirectDependency.mockReturnValue(true);
      askUser.mockResolvedValue('y'); // answer yes to family updates

      const localDeps = new Set(['lodash', '@babel/core', '@babel/preset-env']);
      await runTrivyMode(false, localDeps, new Set([]));

      expect(runAuditFix).toHaveBeenCalled();
      expect(askUser).toHaveBeenCalled();
      expect(require('../lib/utils').run).toHaveBeenCalledWith(expect.stringContaining('npm uninstall @babel/core @babel/preset-env'));
    });
  });

  // ===== runCleanMode =====
  describe('runCleanMode()', () => {
    const { scanUsedDependencies, findUnusedDependencies, uninstallUnusedPackages } = require('../lib/dependency-scanner');

    test('prints no-unused message when nothing found', async () => {
      findUnusedDependencies.mockReturnValue({ dependencies: [], devDependencies: [] });
      const pkgJson = { dependencies: { react: '^18.0.0' } };

      await runCleanMode(pkgJson, false);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('clean.no_unused'));
    });

    test('lists unused packages and asks for confirmation', async () => {
      findUnusedDependencies.mockReturnValue({ dependencies: ['lodash'], devDependencies: [] });
      askUser.mockResolvedValue('y');
      const pkgJson = { dependencies: { react: '^18.0.0', lodash: '^4.17.21' } };

      await runCleanMode(pkgJson, false);

      expect(uninstallUnusedPackages).toHaveBeenCalled();
    });

    test('does not uninstall when user declines', async () => {
      findUnusedDependencies.mockReturnValue({ dependencies: ['lodash'], devDependencies: [] });
      askUser.mockResolvedValue('n');
      const pkgJson = { dependencies: {} };

      await runCleanMode(pkgJson, false);

      expect(uninstallUnusedPackages).not.toHaveBeenCalled();
    });

    test('includes devDependencies when includeDev=true', async () => {
      findUnusedDependencies.mockReturnValue({ dependencies: [], devDependencies: [] });
      const pkgJson = { devDependencies: {} };

      await runCleanMode(pkgJson, true);

      expect(findUnusedDependencies).toHaveBeenCalledWith(pkgJson, expect.any(Set), true);
    });
  });

  // ===== runAuditMode =====
  describe('runAuditMode()', () => {
    test('prints no-trivy message when scan returns null', async () => {
      runTrivyScan.mockReturnValue(null);

      await runAuditMode();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('audit.no_trivy'));
    });

    test('prints no-vulnerabilities when scan returns empty', async () => {
      runTrivyScan.mockReturnValue({ Results: [] });
      extractTrivyVulnerabilities.mockReturnValue({
        all: {},
        bySeverity: { CRITICAL: {}, HIGH: {}, MEDIUM: {}, LOW: {} }
      });

      await runAuditMode();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('audit.no_vulnerabilities'));
    });

    test('lists vulnerabilities with severity breakdown', async () => {
      runTrivyScan.mockReturnValue({ Results: [] });
      extractTrivyVulnerabilities.mockReturnValue({
        all: { lodash: '4.17.21' },
        bySeverity: {
          CRITICAL: {},
          HIGH: { lodash: '4.17.21' },
          MEDIUM: {},
          LOW: {}
        }
      });
      getCurrentVersions.mockReturnValue({ lodash: '4.17.15' });
      require('../lib/utils').safeExecSync.mockReturnValue(null);

      await runAuditMode();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('audit.vulns_detected'));
    });
  });

  // ===== runHuskyMode =====
  describe('runHuskyMode()', () => {
    let exitSpy;

    beforeEach(() => {
      exitSpy = jest.spyOn(process, 'exit').mockImplementation();
    });

    afterEach(() => {
      exitSpy.mockRestore();
    });

    test('returns gracefully when trivy scan is null', async () => {
      runTrivyScan.mockReturnValue(null);
      await runHuskyMode();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('husky.no_trivy'));
      expect(exitSpy).not.toHaveBeenCalled();
    });

    test('returns gracefully when no vulnerabilities found', async () => {
      runTrivyScan.mockReturnValue({ Results: [] });
      extractTrivyVulnerabilities.mockReturnValue({ all: {} });
      await runHuskyMode();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('husky.no_vulnerabilities'));
      expect(exitSpy).not.toHaveBeenCalled();
    });

    test('exits with 1 when vulnerabilities exist', async () => {
      runTrivyScan.mockReturnValue({ Results: [] });
      extractTrivyVulnerabilities.mockReturnValue({ all: { lodash: '4.17.21' } });
      await runHuskyMode();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('husky.vulns_detected'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});

