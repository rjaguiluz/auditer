const { run, askUser } = require('./utils');
const { readPackageJson, writePackageJson } = require('./package-manager');
const { stripVersionPrefix, findLatestMinorVersion, getLatestVersionFromNpm } = require('./version-utils');
const { getChangesTracker, getDryRun } = require('./state');
const { t } = require('./i18n');

// ============================================================================
// VERSION MANAGEMENT MODES
// ============================================================================

async function replaceWithExactVersions(matched, deps, devDeps) {
  console.log(t('version.replace_exact_header'));

  const pkg = readPackageJson();
  const CHANGES_TRACKER = getChangesTracker();
  let hasChanges = false;

  if (pkg.dependencies) {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      if (matched.size === 0 || matched.has(name)) {
        const cleanVersion = stripVersionPrefix(version);
        if (cleanVersion !== version) {
          console.log(t('version.change_prod', { name, from: version, to: cleanVersion }));
          pkg.dependencies[name] = cleanVersion;
          CHANGES_TRACKER.versionChanges.push({ name, from: version, to: cleanVersion, type: 'prod' });
          hasChanges = true;
        }
      }
    }
  }

  if (pkg.devDependencies) {
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      if (matched.size === 0 || matched.has(name)) {
        const cleanVersion = stripVersionPrefix(version);
        if (cleanVersion !== version) {
          console.log(t('version.change_dev', { name, from: version, to: cleanVersion }));
          pkg.devDependencies[name] = cleanVersion;
          CHANGES_TRACKER.versionChanges.push({ name, from: version, to: cleanVersion, type: 'dev' });
          hasChanges = true;
        }
      }
    }
  }

  if (hasChanges) {
    if (!getDryRun()) {
      writePackageJson(pkg);
    }
    console.log(t('version.pkg_json_updated'));
    run('npm install');
  } else {
    console.log(t('version.no_prefixes'));
  }
}

async function updateToMinorVersions(matched, deps, devDeps) {
  console.log(t('version.up_minor_header'));

  const pkg = readPackageJson();
  const CHANGES_TRACKER = getChangesTracker();
  let hasChanges = false;
  const packagesToUpdate = [];

  if (pkg.dependencies) {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      if (matched.size === 0 || matched.has(name)) {
        packagesToUpdate.push({ name, version, type: 'prod' });
      }
    }
  }

  if (pkg.devDependencies) {
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      if (matched.size === 0 || matched.has(name)) {
        packagesToUpdate.push({ name, version, type: 'dev' });
      }
    }
  }

  console.log(t('version.querying_npm', { count: packagesToUpdate.length }));

  for (const { name, version, type } of packagesToUpdate) {
    const cleanVersion = stripVersionPrefix(version);
    const latestMinor = findLatestMinorVersion(name, cleanVersion);

    if (latestMinor && latestMinor !== cleanVersion) {
      console.log(t('version.up_change', { name, from: version, to: latestMinor, type }));

      if (type === 'prod') {
        pkg.dependencies[name] = latestMinor;
      } else {
        pkg.devDependencies[name] = latestMinor;
      }

      CHANGES_TRACKER.versionChanges.push({ name, from: version, to: latestMinor, type });
      hasChanges = true;
    } else if (latestMinor === cleanVersion) {
      console.log(t('version.already_at_minor', { name, version: cleanVersion }));
    }
  }

  if (hasChanges) {
    if (!getDryRun()) {
      writePackageJson(pkg);
    }
    console.log(t('version.pkg_json_updated'));
    run('npm install');
  } else {
    console.log(t('version.all_at_minor'));
  }
}

async function updateToMajorVersions(matched, deps, devDeps) {
  console.log(t('version.up_major_header'));
  console.log(t('version.up_major_warning'));

  const answer = await askUser(t('version.up_major_question'));
  if (answer !== 'y' && answer !== 'yes' && answer !== '') {
    console.log(t('version.up_major_cancelled'));
    return;
  }

  console.log(t('version.up_major_header2'));

  const pkg = readPackageJson();
  const CHANGES_TRACKER = getChangesTracker();
  let hasChanges = false;
  const packagesToUpdate = [];

  if (pkg.dependencies) {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      if (matched.size === 0 || matched.has(name)) {
        packagesToUpdate.push({ name, version, type: 'prod' });
      }
    }
  }

  if (pkg.devDependencies) {
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      if (matched.size === 0 || matched.has(name)) {
        packagesToUpdate.push({ name, version, type: 'dev' });
      }
    }
  }

  console.log(t('version.querying_npm', { count: packagesToUpdate.length }));

  for (const { name, version, type } of packagesToUpdate) {
    const cleanVersion = stripVersionPrefix(version);
    const latestVersion = getLatestVersionFromNpm(name, 'latest');

    if (latestVersion && latestVersion !== cleanVersion) {
      console.log(t('version.up_change', { name, from: version, to: latestVersion, type }));

      if (type === 'prod') {
        pkg.dependencies[name] = latestVersion;
      } else {
        pkg.devDependencies[name] = latestVersion;
      }

      CHANGES_TRACKER.versionChanges.push({ name, from: version, to: latestVersion, type });
      hasChanges = true;
    } else if (latestVersion === cleanVersion) {
      console.log(t('version.already_at_latest', { name, version: cleanVersion }));
    }
  }

  if (hasChanges) {
    if (!getDryRun()) {
      writePackageJson(pkg);
    }
    console.log(t('version.pkg_json_updated'));
    run('npm install');
    if (!getDryRun()) {
      console.log(t('version.verify_app'));
      console.log(t('version.check_changelog'));
    }
  } else {
    console.log(t('version.all_at_latest'));
  }
}

module.exports = {
  replaceWithExactVersions,
  updateToMinorVersions,
  updateToMajorVersions
};
