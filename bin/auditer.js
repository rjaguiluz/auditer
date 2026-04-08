#!/usr/bin/env node

// ============================================================================
// AUDITER - NPM Package Auditing and Fixing Tool
// ============================================================================

const { setSilentMode, setAssumeYes, setDryRun } = require('../lib/state');
const { displayChangeSummary, die } = require('../lib/utils');
const { readPackageJson } = require('../lib/package-manager');
const { parseArguments, parsePackagePatterns, matchPackages } = require('../lib/cli-parser');
const { runTrivyMode, runNormalMode, runCleanMode, runAuditMode } = require('../lib/modes');
const { replaceWithExactVersions, updateToMinorVersions, updateToMajorVersions } = require('../lib/version-manager');
const { t } = require('../lib/i18n');

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const { useExact, onlyTrivy, silent, replaceExact, upMinor, upMajor, assumeYes, clean, includeDev, dryRun, audit, filteredArgs } = parseArguments();

  setSilentMode(silent);
  setAssumeYes(assumeYes);
  setDryRun(dryRun);

  const pkgJson = readPackageJson();

  const deps = new Set(Object.keys(pkgJson.dependencies || {}));
  const devDeps = new Set(Object.keys(pkgJson.devDependencies || {}));

  const processAll = !filteredArgs.length;

  if (silent) {
    console.log(t('startup.silent_mode'));
  }
  if (assumeYes) {
    console.log(t('startup.assume_yes'));
  }
  if (dryRun) {
    console.log('\n' + '='.repeat(60));
    console.log(t('startup.dryrun_banner'));
    console.log('='.repeat(60));
    console.log(t('startup.dryrun_info1'));
    console.log(t('startup.dryrun_info2') + '\n');
  }

  try {
    // Handle audit mode (read-only vulnerability listing)
    if (audit) {
      await runAuditMode();
      return;
    }

    // Handle clean mode
    if (clean) {
      await runCleanMode(pkgJson, includeDev);
      return;
    }

    // Handle version management modes
    if (replaceExact || upMinor || upMajor) {
      const patterns = parsePackagePatterns(filteredArgs);
      const allNames = [...deps, ...devDeps];
      const matched = matchPackages(patterns, allNames);

      if (replaceExact) {
        console.log(t('startup.mode_replace_exact'));
        if (!processAll) {
          console.log(t('startup.processing_packages', { packages: [...matched].join(', ') }));
        } else {
          console.log(t('startup.processing_all'));
        }
        await replaceWithExactVersions(matched, deps, devDeps);
      } else if (upMinor) {
        console.log(t('startup.mode_up_minor'));
        if (!processAll) {
          console.log(t('startup.processing_packages', { packages: [...matched].join(', ') }));
        } else {
          console.log(t('startup.processing_all'));
        }
        await updateToMinorVersions(matched, deps, devDeps);
      } else if (upMajor) {
        console.log(t('startup.mode_up_major'));
        if (!processAll) {
          console.log(t('startup.processing_packages', { packages: [...matched].join(', ') }));
        } else {
          console.log(t('startup.processing_all'));
        }
        await updateToMajorVersions(matched, deps, devDeps);
      }
    }
    // Handle Trivy mode
    else if (onlyTrivy) {
      if (useExact) {
        console.log(t('startup.mode_exact'));
      }
      console.log(t('startup.mode_trivy'));

      await runTrivyMode(useExact, deps, devDeps);
    }
    // Handle normal mode
    else {
      if (processAll) {
        console.log(t('startup.no_libs'));
      }
      if (useExact) {
        console.log(t('startup.mode_exact'));
      }

      const patterns = parsePackagePatterns(filteredArgs);
      const allNames = [...deps, ...devDeps];
      const matched = matchPackages(patterns, allNames);

      await runNormalMode(matched, deps, devDeps, useExact, processAll);
    }

    displayChangeSummary();

    if (dryRun) {
      console.log('\n' + '='.repeat(60));
      console.log(t('startup.dryrun_complete'));
      console.log('='.repeat(60));
      console.log(t('startup.dryrun_done1'));
      console.log(t('startup.dryrun_done2') + '\n');
    } else {
      console.log(t('startup.done'));
    }
  } catch (err) {
    die(err.message || String(err));
  }
}

// Run main
main().catch(err => {
  die(err.message || String(err));
});
