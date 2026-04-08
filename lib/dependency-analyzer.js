const fs = require('fs');
const { safeExecSync } = require('./utils');
const { readPackageJson } = require('./package-manager');
const { t } = require('./i18n');

// ============================================================================
// DEPENDENCY ANALYSIS
// ============================================================================

function getCurrentVersions() {
  try {
    const lockData = fs.readFileSync('package-lock.json', 'utf8');
    const lock = JSON.parse(lockData);
    const versions = {};

    if (lock.packages) {
      for (const [path, info] of Object.entries(lock.packages)) {
        if (!path) continue;
        const pkgName = path.replace(/^node_modules\//, '').split('/node_modules/').pop();
        if (info.version && !versions[pkgName]) {
          versions[pkgName] = info.version;
        }
      }
    }

    return versions;
  } catch (e) {
    console.warn(t('analyzer.lock_read_error'));
    return {};
  }
}

function isDirectDependency(packageName) {
  // First check: Is it in package.json?
  try {
    const pkg = readPackageJson();
    if (pkg.dependencies?.[packageName] || pkg.devDependencies?.[packageName]) {
      return true;
    }
  } catch (e) {
    // If we can't read package.json, fall back to npm list
  }

  // Second check: npm list --depth=0 (for peer dependencies and edge cases)
  const result = safeExecSync(`npm list ${packageName} --depth=0 2>/dev/null`);
  return result ? result.includes(packageName) : false;
}

function hasMultipleVersions(packageName) {
  const result = safeExecSync(`npm list ${packageName} 2>/dev/null`);
  if (!result) return false;

  const lines = result.split('\n').filter(line => line.includes(packageName));
  return lines.length > 1;
}

function getScopedPackageScope(packageName) {
  if (packageName.startsWith('@')) {
    const parts = packageName.split('/');
    if (parts.length >= 2) {
      return parts[0];
    }
  }
  return null;
}

function findRelatedScopedPackages(packageName, allPackages) {
  const scope = getScopedPackageScope(packageName);
  if (!scope) return [];

  return allPackages.filter(pkg =>
    pkg.startsWith(scope + '/') && pkg !== packageName
  );
}

module.exports = {
  getCurrentVersions,
  isDirectDependency,
  hasMultipleVersions,
  getScopedPackageScope,
  findRelatedScopedPackages
};
