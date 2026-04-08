const fs = require('fs');
const { die } = require('./utils');
const { getChangesTracker, getDryRun } = require('./state');

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
  if (getDryRun()) {
    console.log('\n  🎭 [DRY-RUN] Se modificaría package.json');
    if (pkg.overrides && Object.keys(pkg.overrides).length > 0) {
      console.log('  🎭 [DRY-RUN] Overrides que se aplicarían:');
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
        console.log(`  🎭 [DRY-RUN] Se removería override para ${pkgName}`);
      } else {
        console.log(`🗑️  Removiendo override existente para ${pkgName} (será reinstalado)`);
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
  
  if (directDepsUpdated && !getDryRun()) {
    writePackageJson(pkg);
  }
  
  return directDepsUpdated;
}

module.exports = {
  readPackageJson,
  writePackageJson,
  removeOverridesForPackages,
  updateDirectDepsToMatchOverrides
};
