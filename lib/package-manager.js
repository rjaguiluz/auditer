const fs = require('fs');
const { die } = require('./utils');
const { getChangesTracker, getDryRun } = require('./state');
const { t } = require('./i18n');

// ============================================================================
// PACKAGE.JSON OPERATIONS
// ============================================================================

function readPackageJson() {
  try {
    return JSON.parse(fs.readFileSync('package.json', 'utf8'));
  } catch (err) {
    die(t('pkg_manager.read_error'));
  }
}

function writePackageJson(pkg) {
  if (getDryRun()) {
    console.log(t('pkg_manager.dryrun_would_modify'));
    if (pkg.overrides && Object.keys(pkg.overrides).length > 0) {
      console.log(t('pkg_manager.dryrun_overrides_header'));
      for (const [name, version] of Object.entries(pkg.overrides)) {
        console.log(`       ${name}: ${version}`);
      }
    }
    return;
  }

  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}

function removeOverridesForPackages(packages) {
  if (packages.length === 0) return;

  const pkg = readPackageJson();
  if (!pkg.overrides) return;

  const CHANGES_TRACKER = getChangesTracker();
  let overridesToRemove = [];

  for (const pkgName of packages) {
    if (pkg.overrides[pkgName]) {
      if (getDryRun()) {
        console.log(t('pkg_manager.dryrun_remove_override', { pkg: pkgName }));
      } else {
        console.log(t('pkg_manager.removing_override', { pkg: pkgName }));
      }
      CHANGES_TRACKER.removed.push(pkgName);
      overridesToRemove.push(pkgName);
      if (!getDryRun()) {
        delete pkg.overrides[pkgName];
      }
    }
  }

  if (overridesToRemove.length > 0 && !getDryRun()) {
    writePackageJson(pkg);
  }
}

function updateDirectDepsToMatchOverrides(pkg, overrides) {
  let directDepsUpdated = false;

  for (const [pkgName, version] of Object.entries(overrides)) {
    if (pkg.dependencies?.[pkgName]) {
      console.log(t('pkg_manager.updating_dep', { pkg: pkgName, from: pkg.dependencies[pkgName], to: version }));
      pkg.dependencies[pkgName] = version;
      directDepsUpdated = true;
    }
    if (pkg.devDependencies?.[pkgName]) {
      console.log(t('pkg_manager.updating_dev_dep', { pkg: pkgName, from: pkg.devDependencies[pkgName], to: version }));
      pkg.devDependencies[pkgName] = version;
      directDepsUpdated = true;
    }
  }

  return directDepsUpdated;
}

module.exports = {
  readPackageJson,
  writePackageJson,
  removeOverridesForPackages,
  updateDirectDepsToMatchOverrides
};
