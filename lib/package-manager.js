const fs = require('fs');
const { die } = require('./utils');
const { getChangesTracker } = require('./state');

// ============================================================================
// PACKAGE.JSON OPERATIONS
// ============================================================================

function readPackageJson() {
  try {
    return JSON.parse(fs.readFileSync('package.json', 'utf8'));
  } catch (err) {
    die('No se pudo leer package.json en el directorio actual. Ejecuta el comando desde la raíz del proyecto.');
  }
}

function writePackageJson(pkg) {
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}

function removeOverridesForPackages(packages) {
  if (packages.length === 0) return;
  
  const pkg = readPackageJson();
  if (!pkg.overrides) return;
  
  const CHANGES_TRACKER = getChangesTracker();
  let overridesRemoved = false;
  for (const pkgName of packages) {
    if (pkg.overrides[pkgName]) {
      console.log(`🗑️  Removiendo override existente para ${pkgName} (será reinstalado)`);
      CHANGES_TRACKER.removed.push(pkgName);
      delete pkg.overrides[pkgName];
      overridesRemoved = true;
    }
  }
  
  if (overridesRemoved) {
    writePackageJson(pkg);
  }
}

function updateDirectDepsToMatchOverrides(overrides) {
  const pkg = readPackageJson();
  let directDepsUpdated = false;
  
  for (const [pkgName, version] of Object.entries(overrides)) {
    if (pkg.dependencies?.[pkgName]) {
      console.log(`  🔄 Actualizando dependencies[${pkgName}]: ${pkg.dependencies[pkgName]} → ${version}`);
      pkg.dependencies[pkgName] = version;
      directDepsUpdated = true;
    }
    if (pkg.devDependencies?.[pkgName]) {
      console.log(`  🔄 Actualizando devDependencies[${pkgName}]: ${pkg.devDependencies[pkgName]} → ${version}`);
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
